import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { BudgetInfo } from '@osb/bot/domain/types/budget-info';
import type { PreparedPlacement } from '@osb/bot/domain/types/prepared-placement';
import type { QueuedPlacement } from '@osb/bot/domain/types/round';
import type { RoundStreamManager } from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import { SLOT_DURATION_MS } from '@osb/bot/infrastructure/constants';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { ConfigSchema } from '@osb/config';
import type { TransactionInstruction } from '@solana/web3.js';

export class PlacementQueueBuilder {
  constructor(
    private readonly config: ConfigSchema,
    private readonly roundStreamManager: RoundStreamManager,
    private readonly logger: LoggerPort,
  ) {}

  async build(params: {
    roundId: bigint;
    endSlot: number;
    prepared: PreparedPlacement[];
    streamHealthy: boolean;
    guardMs: number;
    safetyMs: number;
    buildInstructions: (decision: PlacementDecision) => Promise<TransactionInstruction[]>;
    getBudget: (endSlot: number) => Promise<BudgetInfo | null>;
  }): Promise<QueuedPlacement[]> {
    const { endSlot, prepared, streamHealthy, guardMs, safetyMs, buildInstructions, getBudget } = params;

    const placementsToExecute: QueuedPlacement[] = [];
    const placedSquares = new Set<number>();
    const minEvThreshold = this.config.strategy.minEvRatio ?? Number.NEGATIVE_INFINITY;

    for (let i = 0; i < prepared.length; i += 1) {
      const preparedPlacement = prepared[i];
      if (!preparedPlacement) {
        continue;
      }

      let currentDecision = preparedPlacement.decision;
      let currentInstructions = preparedPlacement.instructions;

      if (streamHealthy) {
        let streamDecision = this.roundStreamManager.consumeDecision();
        while (streamDecision && placedSquares.has(streamDecision.squareIndex)) {
          this.logger.debug(`Skipping duplicate square #${streamDecision.squareIndex + 1} from stream`);
          streamDecision = this.roundStreamManager.consumeDecision();
        }

        if (streamDecision && streamDecision.evRatio > minEvThreshold) {
          currentDecision = streamDecision;
          try {
            currentInstructions = await buildInstructions(streamDecision);
          } catch (error) {
            this.logger.error(`Failed to build instructions for stream decision: ${(error as Error).message}`);
            break;
          }
        }
      }

      if (placedSquares.has(currentDecision.squareIndex)) {
        this.logger.debug(`Skipping placement for square #${currentDecision.squareIndex + 1} (already queued)`);
        continue;
      }

      const placementsRemaining = placementsToExecute.length + 1;
      const queueingOverhead = Math.min(
        this.config.timing.queueOverheadMaxMs,
        placementsRemaining * this.config.timing.queueOverheadFactor,
      );
      const requiredMs = guardMs + queueingOverhead + safetyMs;
      const budget = await getBudget(endSlot);

      if (!budget || budget.remainingTimeMs <= requiredMs) {
        const remainingSlots = budget ? budget.remainingSlots : 0;
        const remainingMs = budget ? budget.remainingTimeMs : 0;
        this.logger.warn(
          `❌ WINDOW CLOSED ❌ - Cannot queue placement (remaining ${remainingSlots} slot(s) ≈ ${remainingMs.toFixed(
            0,
          )}ms, need ${(requiredMs / SLOT_DURATION_MS).toFixed(2)} slot(s) ≈ ${requiredMs.toFixed(0)}ms).`,
        );
        break;
      }

      this.logger.debug(
        `Placement budget ok: remaining=${budget.remainingSlots} slot(s) (~${budget.remainingTimeMs.toFixed(
          0,
        )}ms) for ${placementsRemaining} placement(s) needing ~${requiredMs.toFixed(0)}ms`,
      );
      this.logger.info(
        `  → Queueing ${Number(currentDecision.amountLamports) / 1e9} SOL on square #${currentDecision.squareIndex + 1} (${budget.remainingSlots} slots left, EV=${currentDecision.evRatio.toFixed(3)})`,
      );

      placementsToExecute.push({
        placement: { decision: currentDecision, instructions: currentInstructions },
        budget,
      });
      placedSquares.add(currentDecision.squareIndex);
    }

    return placementsToExecute;
  }
}
