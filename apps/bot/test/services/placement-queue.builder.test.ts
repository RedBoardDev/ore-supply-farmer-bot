import { PlacementQueueBuilder } from '@osb/bot/application/use-cases/execute-placement/executor/placement-queue.builder';
import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { BudgetInfo } from '@osb/bot/domain/types/budget-info';
import type { PreparedPlacement } from '@osb/bot/domain/types/prepared-placement';
import { describe, expect, it, vi } from 'vitest';
import { buildConfig } from '../builders/config.builder';
import { FakeLogger } from '../fakes/logger.fake';
import { FakeRoundStreamManager } from '../fakes/round-stream-manager.fake';

function buildDecision(params: Partial<PlacementDecision> & { squareIndex: number }): PlacementDecision {
  return {
    squareIndex: params.squareIndex,
    amountLamports: params.amountLamports ?? 1_000_000_000n,
    evRatio: params.evRatio ?? 1.2,
    othersStakeLamports: params.othersStakeLamports ?? 0n,
  };
}

function buildPrepared(decision: PlacementDecision): PreparedPlacement {
  return {
    decision,
    instructions: [],
  };
}

describe('PlacementQueueBuilder', () => {
  it('prefers stream decision when healthy and above min EV', async () => {
    const config = buildConfig({ strategy: { minEvRatio: 1.0 } });
    const stream = new FakeRoundStreamManager([buildDecision({ squareIndex: 4, evRatio: 1.5 })]);
    const logger = new FakeLogger();
    const builder = new PlacementQueueBuilder(config, stream, logger);

    const buildInstructions = vi.fn(async () => []);
    const getBudget = vi.fn(async (): Promise<BudgetInfo> => ({ remainingSlots: 5, remainingTimeMs: 4000 }));

    const result = await builder.build({
      roundId: 1n,
      endSlot: 100,
      prepared: [buildPrepared(buildDecision({ squareIndex: 0, evRatio: 1.1 }))],
      streamHealthy: true,
      guardMs: 20,
      safetyMs: 20,
      buildInstructions,
      getBudget,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.placement.decision.squareIndex).toBe(4);
    expect(buildInstructions).toHaveBeenCalledTimes(1);
  });

  it('falls back to prepared decision when stream EV below threshold', async () => {
    const config = buildConfig({ strategy: { minEvRatio: 1.1 } });
    const stream = new FakeRoundStreamManager([buildDecision({ squareIndex: 7, evRatio: 0.5 })]);
    const logger = new FakeLogger();
    const builder = new PlacementQueueBuilder(config, stream, logger);

    const result = await builder.build({
      roundId: 1n,
      endSlot: 100,
      prepared: [buildPrepared(buildDecision({ squareIndex: 2, evRatio: 1.2 }))],
      streamHealthy: true,
      guardMs: 20,
      safetyMs: 20,
      buildInstructions: async () => [],
      getBudget: async () => ({ remainingSlots: 5, remainingTimeMs: 4000 }),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.placement.decision.squareIndex).toBe(2);
  });

  it('stops queueing when time budget is exhausted', async () => {
    const config = buildConfig({
      timing: { queueOverheadMaxMs: 30, queueOverheadFactor: 8 },
      strategy: { minEvRatio: 0.5 },
    });
    const stream = new FakeRoundStreamManager();
    const logger = new FakeLogger();
    const builder = new PlacementQueueBuilder(config, stream, logger);

    const budgets: BudgetInfo[] = [
      { remainingSlots: 3, remainingTimeMs: 300 },
      { remainingSlots: 1, remainingTimeMs: 50 },
    ];

    const getBudget = vi.fn(async () => budgets.shift() ?? null);

    const result = await builder.build({
      roundId: 1n,
      endSlot: 100,
      prepared: [
        buildPrepared(buildDecision({ squareIndex: 1, evRatio: 1.4 })),
        buildPrepared(buildDecision({ squareIndex: 3, evRatio: 1.3 })),
      ],
      streamHealthy: false,
      guardMs: 40,
      safetyMs: 40,
      buildInstructions: async () => [],
      getBudget,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.placement.decision.squareIndex).toBe(1);
  });
});
