/**
 * Placement Strategy
 *
 * Mining cost evaluation and placement refresh logic.
 */

import type { LatencyService, LatencySnapshot } from '@osb/bot/domain/services/latency.service';
import type { MiningCostResult, MiningCostStrategyPort } from '@osb/bot/domain/services/mining-cost-strategy.service';
import type { EvStrategyServicePort, PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import { SLOT_DURATION_MS } from '@osb/bot/infrastructure/constants';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { ConfigSchema } from '@osb/config';
import type { Miner } from '@osb/domain';
import { OrePrice, type Round } from '@osb/domain';

export class PlacementStrategy {
  private readonly container = getGlobalContainer();

  constructor(
    private readonly config: ConfigSchema,
    private readonly logger: LoggerPort,
  ) {}

  isMiningCostStrategyEnabled(): boolean {
    return this.config.miningCost.enabled === true;
  }

  async evaluateMiningCost(
    roundId: bigint,
    _miner: Miner | null,
    _priceQuote: PriceQuote | null,
  ): Promise<MiningCostResult | null> {
    if (!this.isMiningCostStrategyEnabled()) {
      return null;
    }

    try {
      // Use the domain MiningCostStrategy service
      const miningCostStrategy = this.container.resolve<MiningCostStrategyPort>('MiningCostStrategy');
      const result = await miningCostStrategy.evaluate({ roundId });

      this.logger.debug(
        `Mining cost evaluation: decision=${result.decision}, evPercent=${result.evPercent?.toFixed(2) ?? 'n/a'}%, avg=${result.averageEvPercent?.toFixed(2) ?? 'n/a'}%`,
      );

      return {
        decision: result.decision,
        evPercent: result.evPercent,
        averageEvPercent: result.averageEvPercent,
      };
    } catch (error) {
      this.logger.warn(`Mining cost evaluation failed: ${(error as Error).message}`);
      return { decision: 'SKIP', evPercent: null, averageEvPercent: null };
    }
  }

  refreshPendingPlacements(
    decisions: PlacementDecision[],
    round: Round,
    miner: Miner,
    priceQuote: PriceQuote,
    executedExposureLamports: bigint,
  ): PlacementDecision[] {
    if (decisions.length === 0) {
      return [];
    }
    const evStrategy = this.container.resolve<EvStrategyServicePort>('EvStrategyService');
    const minEvThreshold = this.config.strategy.minEvRatio ?? Number.NEGATIVE_INFINITY;

    let orePrice: OrePrice | null = null;
    try {
      orePrice = OrePrice.create(priceQuote.solPerOre, priceQuote.netSolPerOre, priceQuote.fetchedAt);
    } catch {
      orePrice = null;
    }

    const refreshed: PlacementDecision[] = [];
    for (const decision of decisions) {
      const recalculated = evStrategy.recalculateEv({
        squareIndex: decision.squareIndex,
        stakeLamports: decision.amountLamports,
        round,
        miner,
        orePrice,
        executedExposureLamports,
      });

      if (recalculated) {
        const previousEv = decision.evRatio;
        decision.evRatio = recalculated.evRatio;
        decision.othersStakeLamports = recalculated.othersStakeLamports;
        const delta = recalculated.evRatio - previousEv;
        if (Math.abs(delta) > 0.002) {
          this.logger.debug(
            `Revalidated square #${decision.squareIndex + 1}: EV ${previousEv.toFixed(3)} → ${recalculated.evRatio.toFixed(3)} (Δ=${delta.toFixed(3)})`,
          );
        }
      }

      if (decision.evRatio <= minEvThreshold) {
        this.logger.debug(
          `Skipping square #${decision.squareIndex + 1} after revalidation (EV=${decision.evRatio.toFixed(3)})`,
        );
        continue;
      }

      refreshed.push(decision);
    }

    refreshed.sort((a, b) => b.evRatio - a.evRatio);
    return refreshed;
  }

  getLatencySnapshot(latencyService: LatencyService): LatencySnapshot {
    return latencyService.getSnapshot();
  }

  getExecGuardMs(snapshot: LatencySnapshot, logger?: LoggerPort): number {
    const execAvg =
      Number.isFinite(snapshot.execPerPlacementMs) && snapshot.execPerPlacementMs > 0
        ? snapshot.execPerPlacementMs
        : 120;
    const execP95 =
      Number.isFinite(snapshot.execP95Ms ?? NaN) && (snapshot.execP95Ms ?? 0) > 0
        ? (snapshot.execP95Ms as number)
        : execAvg;
    // Use P95 directly as it better represents parallel execution where slowest tx matters
    const guard = execP95;
    const clamped = Math.min(Math.max(guard, 30), 200);

    if (logger) {
      logger.debug(
        `Exec guard stats → avg=${execAvg.toFixed(1)}ms, p95=${execP95.toFixed(1)}ms, guard=${guard.toFixed(1)}ms, clamped=${clamped.toFixed(1)}ms`,
      );
    }
    return clamped;
  }

  calculatePlacementSafetyMs(snapshot: LatencySnapshot, lastRefreshDurationMs: number, logger?: LoggerPort): number {
    const execAvg =
      Number.isFinite(snapshot.execPerPlacementMs) && snapshot.execPerPlacementMs > 0
        ? snapshot.execPerPlacementMs
        : 60;
    const execP95 =
      Number.isFinite(snapshot.execP95Ms ?? NaN) && (snapshot.execP95Ms ?? 0) > 0
        ? (snapshot.execP95Ms as number)
        : execAvg;
    const prepAvg = Number.isFinite(snapshot.prepMs) && snapshot.prepMs > 0 ? snapshot.prepMs : 80;
    const prepP95 =
      Number.isFinite(snapshot.prepP95Ms ?? NaN) && (snapshot.prepP95Ms ?? 0) > 0
        ? (snapshot.prepP95Ms as number)
        : prepAvg;

    // Base safety: minimum 1 slot (400ms) to ensure ORE protocol buffer
    // BUT: if refresh was very fast (<60ms), reduce to 200ms to allow placements with 1 slot remaining
    const refreshWasVeryFast = lastRefreshDurationMs < 60;
    const baseSafety = refreshWasVeryFast ? 200 : SLOT_DURATION_MS;

    // Variance penalty: account for latency spikes (max 30ms)
    const varianceMs = Math.max(execP95 - execAvg, prepP95 - prepAvg, 0);
    const variancePenalty = Math.min(varianceMs, 30);

    // Refresh penalty: if refresh was slow, add penalty (max 20ms)
    const refreshPenalty = refreshWasVeryFast ? 0 : Math.min(Math.max(0, lastRefreshDurationMs - 60), 20);

    // Total safety: base + variance + refresh
    // - Fast refresh (<60ms): 200 + 30 + 0 = 230ms max (allows placement with 1 slot = 400ms)
    // - Slow refresh (≥60ms): 400 + 30 + 20 = 450ms max (requires 2 slots = 800ms)
    const safety = baseSafety + variancePenalty + refreshPenalty;
    const result = Math.min(safety, refreshWasVeryFast ? 230 : 450);

    if (logger) {
      logger.debug(
        `Safety calculation: refreshFast=${refreshWasVeryFast}, base=${baseSafety}ms, variance=${variancePenalty}ms, refreshPenalty=${refreshPenalty}ms, result=${result}ms`,
      );
    }

    return result;
  }
}
