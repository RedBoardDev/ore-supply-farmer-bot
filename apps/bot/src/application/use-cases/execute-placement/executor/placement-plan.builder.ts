import type { EvStrategyServicePort, PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { PlacementContext } from './placement-context.provider';

export interface PlanBuildResult {
  plan: PlacementDecision[];
  planningMs: number;
  bestEvRatio: number | null;
}

export class PlacementPlanBuilder {
  constructor(
    private readonly evStrategy: EvStrategyServicePort,
    private readonly logger: LoggerPort,
  ) {}

  build(context: PlacementContext): PlanBuildResult {
    const planningStart = Date.now();

    const plan = this.evStrategy.calculateDecisions(
      null,
      context.round,
      context.miner,
      context.priceQuote.solPerOre,
      context.priceQuote.netSolPerOre,
      context.balanceLamports,
    );

    const planningMs = Date.now() - planningStart;
    const bestEvRatio = this.evStrategy.getLastBestEvRatio();

    if (plan.length === 0) {
      this.logger.debug('Strategy planner did not find any profitable placements for this round.');
    }

    return { plan, planningMs, bestEvRatio };
  }
}
