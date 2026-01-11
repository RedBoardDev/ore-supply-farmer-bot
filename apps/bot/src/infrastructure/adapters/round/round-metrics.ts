import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { RoundMetrics } from '@osb/bot/domain/types/round';
import { ORE_ATOMS_PER_ORE } from '@osb/bot/infrastructure/constants';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { Miner } from '@osb/domain';
import { LAMPORTS_PER_SOL, type PublicKey } from '@solana/web3.js';
import type { DiscordNotifier } from '../notification/discord-notifier.interface';

export interface RoundMetricsManager {
  setBaseline(rewardsSol: bigint): void;
  handleClaimedRewards(amountLamports: bigint): void;
  recordPlacement(roundId: bigint, stakeLamports: bigint, squareIndex: number): void;
  setPriceQuote(roundId: bigint, priceQuote: PriceQuote | null): void;
  finalizeRounds(currentBoardRound: bigint): Promise<void>;
}

const log = createChildLogger('round-metrics');

export class RoundMetricsManagerAdapter implements RoundMetricsManager {
  private readonly roundMetrics = new Map<bigint, RoundMetrics>();
  private lastRewardsSol: bigint = 0n;
  private lastRewardsOre: bigint = 0n;
  private rewardsBaselineInitialised = false;
  private lossStreak = 0;
  private readonly container = getGlobalContainer();

  constructor(
    private readonly discordNotifier: DiscordNotifier | null,
    private readonly pricePort: PricePort | null,
  ) {}

  setBaseline(rewardsSol: bigint): void {
    this.lastRewardsSol = rewardsSol;
    this.rewardsBaselineInitialised = true;
  }

  /**
   * Handle claimed rewards - update lastRewardsSol for accurate PnL calculation.
   * Called when rewards are claimed to subtract from the baseline.
   */
  handleClaimedRewards(amountLamports: bigint): void {
    if (!this.rewardsBaselineInitialised) {
      return;
    }
    if (amountLamports <= 0n) {
      return;
    }
    this.lastRewardsSol = this.lastRewardsSol > amountLamports ? this.lastRewardsSol - amountLamports : 0n;
  }

  recordPlacement(roundId: bigint, stakeLamports: bigint, squareIndex: number): void {
    if (!this.discordNotifier) return;

    let metrics = this.roundMetrics.get(roundId);
    if (!metrics) {
      metrics = {
        totalStakeLamports: 0n,
        squares: new Set<number>(),
        evaluated: false,
        placements: 0,
        priceQuote: null,
      };
      this.roundMetrics.set(roundId, metrics);
    }

    metrics.totalStakeLamports += stakeLamports;
    metrics.squares.add(squareIndex);
    metrics.placements += 1;
  }

  setPriceQuote(roundId: bigint, priceQuote: PriceQuote | null): void {
    if (!this.discordNotifier || !priceQuote) return;

    let metrics = this.roundMetrics.get(roundId);
    if (!metrics) {
      metrics = {
        totalStakeLamports: 0n,
        squares: new Set<number>(),
        evaluated: false,
        placements: 0,
        priceQuote: null,
      };
      this.roundMetrics.set(roundId, metrics);
    }

    metrics.priceQuote = priceQuote;
  }

  async finalizeRounds(currentBoardRound: bigint): Promise<void> {
    if (!this.discordNotifier || this.roundMetrics.size === 0) return;

    try {
      const authorityKey = this.container.resolve<PublicKey>('AuthorityPublicKey');
      const blockchain = this.container.resolve<BlockchainPort>('BlockchainPort');
      const miner: Miner | null = await blockchain.getMiner(authorityKey.toBase58());

      if (!miner) return;

      if (!this.rewardsBaselineInitialised) {
        this.lastRewardsSol = miner.rewardsSol;
        this.lastRewardsOre = miner.rewardsOre ?? 0n;
        this.rewardsBaselineInitialised = true;
        return;
      }

      for (const [roundId, metrics] of this.roundMetrics) {
        if (metrics.evaluated || roundId >= currentBoardRound) continue;
        if (miner.checkpointId < roundId) continue;

        await this.evaluateRoundOutcome(roundId, metrics, miner);
        break;
      }
    } catch (error) {
      log.debug(`Unable to finalize rounds: ${(error as Error).message}`);
    }
  }

  private async evaluateRoundOutcome(roundId: bigint, metrics: RoundMetrics, snapshot: Miner): Promise<void> {
    const deltaSol = snapshot.rewardsSol - this.lastRewardsSol;
    const deltaOre = snapshot.rewardsOre - this.lastRewardsOre;

    this.lastRewardsSol = snapshot.rewardsSol;
    this.lastRewardsOre = snapshot.rewardsOre ?? 0n;

    metrics.evaluated = true;
    this.roundMetrics.delete(roundId);

    if (!this.discordNotifier) return;

    if (metrics.totalStakeLamports <= 0n) {
      this.lossStreak = 0;
      return;
    }

    const squareCount = metrics.squares.size;

    if (deltaSol > 0n || deltaOre > 0n) {
      const lossesBeforeWin = this.lossStreak;
      this.lossStreak = 0;
      const pnlLamports = deltaSol - metrics.totalStakeLamports;

      const priceQuote = metrics.priceQuote ?? this.pricePort?.getPrice() ?? null;
      const orePriceInSol = priceQuote ? priceQuote.solPerOre : null;
      const oreValueLamports = this.computeOreValueLamports(deltaOre, orePriceInSol);
      const realPnlLamports = oreValueLamports !== null ? pnlLamports + oreValueLamports : pnlLamports;

      await this.discordNotifier.sendWin({
        roundId,
        winningSolLamports: deltaSol,
        winningOreAtoms: deltaOre,
        stakeLamports: metrics.totalStakeLamports,
        pnlLamports,
        realPnlLamports,
        squareCount,
        lossesBeforeWin,
      });
    } else {
      this.lossStreak += 1;
      if (this.lossStreak % 5 === 0) {
        await this.discordNotifier.sendLoss({
          roundId,
          stakeLamports: metrics.totalStakeLamports,
          squareCount,
          lossStreak: this.lossStreak,
        });
      }
    }
  }

  private computeOreValueLamports(atoms: bigint, orePriceInSol: number | null): bigint | null {
    if (orePriceInSol === null || !Number.isFinite(orePriceInSol) || orePriceInSol <= 0) {
      return null;
    }
    const lamportsPerOre = Math.round(orePriceInSol * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamportsPerOre) || lamportsPerOre <= 0) {
      return null;
    }
    return (atoms * BigInt(lamportsPerOre)) / ORE_ATOMS_PER_ORE;
  }
}
