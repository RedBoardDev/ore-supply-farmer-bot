import type { MinerAccount, RoundAccount } from '@osb/bot/application/decoders';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { RoundMetricsManager } from '@osb/bot/infrastructure/adapters/round/round-metrics';
import { STREAM_FRESHNESS_LIMIT_MS } from '@osb/bot/infrastructure/constants';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import { Miner, Round, RoundId } from '@osb/domain';
import type { PublicKey } from '@solana/web3.js';
import type { PlacementPrefetcher } from '../prefetcher/placement-prefetcher';

export interface PlacementContext {
  round: Round;
  miner: Miner;
  balanceLamports: bigint;
  priceQuote: PriceQuote;
}

export interface PlacementContextResult {
  context: PlacementContext;
  prepTimeMs: number;
}

export class PlacementContextProvider {
  constructor(
    private readonly blockchain: BlockchainPort,
    private readonly placementPrefetcher: PlacementPrefetcher,
    private readonly pricePort: PricePort,
    private readonly authorityPublicKey: PublicKey,
    private readonly logger: LoggerPort,
    private readonly roundMetricsManager?: RoundMetricsManager | null,
  ) {}

  async getContext(roundId: bigint, placementStart: number): Promise<PlacementContextResult | null> {
    try {
      const prefetched = this.placementPrefetcher.consume(roundId);
      const context = await this.resolveContext(roundId, prefetched);
      if (!context) {
        return null;
      }

      const priceQuote = await this.resolvePriceQuote(roundId);
      if (!priceQuote) {
        return null;
      }

      this.roundMetricsManager?.setPriceQuote(roundId, priceQuote);

      return {
        context: {
          round: context.round,
          miner: context.miner,
          balanceLamports: context.balanceLamports,
          priceQuote,
        },
        prepTimeMs: Date.now() - placementStart,
      };
    } catch (error) {
      this.logger.warn(`Round ${roundId}: Failed to build placement context: ${(error as Error).message}`);
      return null;
    }
  }

  private async resolveContext(
    roundId: bigint,
    prefetched: ReturnType<PlacementPrefetcher['consume']>,
  ): Promise<{ round: Round; miner: Miner; balanceLamports: bigint } | null> {
    if (prefetched) {
      const age = Date.now() - prefetched.fetchedAt;
      const round = this.toDomainRound(roundId, prefetched.round.data);
      const miner = prefetched.miner ? this.toDomainMiner(prefetched.miner) : null;
      const balanceLamports = prefetched.balanceLamports;

      if (age <= STREAM_FRESHNESS_LIMIT_MS && miner) {
        this.logger.debug(`Round ${roundId}: Using prefetched data (${age}ms old, stream unavailable)`);
        return { round, miner, balanceLamports };
      }

      this.logger.debug(`Round ${roundId}: Discarding prefetched data (${age}ms old${miner ? '' : ', miner missing'})`);
    }

    return this.fetchDirectContext(roundId);
  }

  private async fetchDirectContext(
    roundId: bigint,
  ): Promise<{ round: Round; miner: Miner; balanceLamports: bigint } | null> {
    const fetchStart = Date.now();
    const authority = this.authorityPublicKey.toBase58();
    const [round, miner, balanceLamports] = await Promise.all([
      this.blockchain.getRound(RoundId.create(roundId)),
      this.blockchain.getMiner(authority),
      this.blockchain.getBalance(authority),
    ]);

    const fetchDuration = Date.now() - fetchStart;
    this.logger.debug(`Round ${roundId}: Fetched data directly (${fetchDuration}ms, stream unavailable)`);

    if (!round) {
      this.logger.warn('Round snapshot unavailable; skipping round');
      return null;
    }

    if (!miner) {
      this.logger.warn('Miner snapshot unavailable; skipping round');
      return null;
    }

    return { round, miner, balanceLamports };
  }

  private async resolvePriceQuote(roundId: bigint): Promise<PriceQuote | null> {
    const priceQuote = this.pricePort.getPrice();
    if (!priceQuote) {
      this.logger.warn(`Round ${roundId}: Price quote unavailable; unable to evaluate EV`);
      return null;
    }

    return priceQuote;
  }

  private toDomainRound(roundId: bigint, round: RoundAccount): Round {
    return Round.create(RoundId.create(roundId), round.deployed, round.motherlode, round.expiresAt);
  }

  private toDomainMiner(miner: MinerAccount): Miner {
    return Miner.create(
      miner.authority.toBase58(),
      miner.deployed,
      miner.rewardsSol,
      miner.rewardsOre,
      miner.checkpointId,
      miner.roundId,
    );
  }
}
