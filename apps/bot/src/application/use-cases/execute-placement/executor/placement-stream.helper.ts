import type { MinerAccount } from '@osb/bot/application/decoders';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { RoundMetricsManager } from '@osb/bot/infrastructure/adapters/round/round-metrics';
import type { RoundStreamManager } from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import { STREAM_FRESHNESS_LIMIT_MS } from '@osb/bot/infrastructure/constants';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { Connection, PublicKey } from '@solana/web3.js';

export interface StreamPreparationResult {
  streamHealthy: boolean;
  stats: ReturnType<RoundStreamManager['getStats']>;
  freshOk: boolean;
}

export class PlacementStreamHelper {
  constructor(
    private readonly roundStreamManager: RoundStreamManager,
    private readonly blockchain: BlockchainPort,
    private readonly pricePort: PricePort,
    private readonly authorityPublicKey: PublicKey,
    private readonly connection: Connection,
    private readonly maxPlacements: number,
    private readonly logger: LoggerPort,
    private readonly roundMetricsManager?: RoundMetricsManager | null,
  ) {}

  async prepare(roundId: bigint): Promise<StreamPreparationResult> {
    let streamHealthy = this.roundStreamManager.isHealthy();
    let stats = this.roundStreamManager.getStats();

    if (stats.cacheAgeMs > 50) {
      if (stats.cacheAgeMs > STREAM_FRESHNESS_LIMIT_MS) {
        await this.roundStreamManager.forceRefresh();
        stats = this.roundStreamManager.getStats();
      } else {
        const refreshed = await this.roundStreamManager.refreshIfStale(50);
        if (!refreshed) {
          await this.roundStreamManager.forceRefresh();
        }
        stats = this.roundStreamManager.getStats();
      }
    }

    if (stats.cacheAgeMs > STREAM_FRESHNESS_LIMIT_MS || !streamHealthy) {
      streamHealthy = false;
      if (stats.isActive) {
        this.logger.warn(`Round ${roundId}: Stream cache stale (${stats.cacheAgeMs.toFixed(0)}ms)`);
        await this.roundStreamManager.stop();
        this.startRoundStream(roundId);
      }
    }

    let freshOk = true;
    if (streamHealthy) {
      freshOk = await this.ensureFreshRoundData(roundId, 50);
      if (freshOk) {
        const snapshotAge = this.roundStreamManager.getCacheAge();
        const lastRefreshDuration = this.roundStreamManager.getLastRefreshDurationMs();
        this.logger.debug(
          `Round ${roundId}: Stream snapshot age=${snapshotAge.toFixed(0)}ms, last refresh ${lastRefreshDuration.toFixed(0)}ms`,
        );
      }
    }

    return { streamHealthy, stats, freshOk };
  }

  async resolvePriceQuote(roundId: bigint): Promise<PriceQuote | null> {
    const priceQuote = this.pricePort.getPrice();
    if (!priceQuote) {
      this.logger.warn(`Round ${roundId}: Price quote unavailable; unable to evaluate EV`);
      return null;
    }

    this.roundMetricsManager?.setPriceQuote(roundId, priceQuote);
    return priceQuote;
  }

  startRoundStream(roundId: bigint): void {
    void (async () => {
      try {
        const [miner, balanceRaw] = await Promise.all([
          this.blockchain.getMiner(this.authorityPublicKey.toBase58()),
          this.connection.getBalance(this.authorityPublicKey, 'confirmed'),
        ]);

        if (!miner) {
          this.logger.warn(`Round ${roundId}: Cannot start stream, miner unavailable`);
          return;
        }

        const priceQuote = await this.resolvePriceQuote(roundId);
        if (!priceQuote) {
          this.logger.warn(`Round ${roundId}: Cannot start stream, price unavailable`);
          return;
        }

        const minerAccount: MinerAccount = {
          authority: this.authorityPublicKey,
          deployed: [...miner.deployed],
          rewardsSol: miner.rewardsSol,
          rewardsOre: 0n,
          refinedOre: 0n,
          checkpointFee: 0n,
          checkpointId: miner.checkpointId,
          roundId: miner.roundId,
        };

        this.roundStreamManager.start({
          roundId,
          miner: minerAccount,
          walletBalanceLamports: BigInt(balanceRaw),
          priceQuote,
          maxPlacements: this.maxPlacements,
        });

        this.logger.info(`Round ${roundId}: Round stream started`);
      } catch (error) {
        this.logger.error(`Round ${roundId}: Failed to start stream: ${(error as Error).message}`);
      }
    })();
  }

  private async ensureFreshRoundData(_roundId: bigint, maxAgeMs: number): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let ageMs = this.roundStreamManager.getCacheAge();
      if (ageMs <= maxAgeMs) {
        return true;
      }

      if (attempt === 0) {
        await this.roundStreamManager.refreshIfStale(maxAgeMs);
      } else {
        await this.roundStreamManager.forceRefresh();
      }

      await new Promise((resolve) => setTimeout(resolve, 15));
      ageMs = this.roundStreamManager.getCacheAge();
      if (ageMs <= maxAgeMs) {
        return true;
      }
    }
    return this.roundStreamManager.getCacheAge() <= maxAgeMs;
  }
}
