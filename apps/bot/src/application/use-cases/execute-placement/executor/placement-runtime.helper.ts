import type { RoundHandler } from '@osb/bot/application/use-cases';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { LatencyServicePort, LatencyStoragePort } from '@osb/bot/domain/services/ports/latency.port';
import type { SlotCache } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import { RoundId } from '@osb/domain';
import { SLOT_DURATION_MS } from '@osb/domain/value-objects/slot.vo';
import type { Connection } from '@solana/web3.js';

export class PlacementRuntimeHelper {
  constructor(
    private readonly roundHandler: RoundHandler,
    private readonly blockchain: BlockchainPort,
    private readonly slotCache: SlotCache | null,
    private readonly connection: Connection,
    private readonly latencyService: LatencyServicePort,
    private readonly latencyStorage: LatencyStoragePort,
    private readonly logger: LoggerPort,
  ) {}

  async ensureCheckpoint(roundId: bigint): Promise<boolean> {
    const checkpointStart = Date.now();
    const checkpointReady = await this.roundHandler.ensureCheckpoint(this.blockchain, RoundId.create(roundId));
    const checkpointDuration = Date.now() - checkpointStart;

    if (!checkpointReady) {
      this.logger.warn('Skipping placement: miner account not initialized or checkpoint pending');
      return false;
    }

    if (checkpointDuration > 100) {
      this.logger.warn(
        `Round ${roundId}: Checkpoint ensure took ${checkpointDuration}ms (expected <100ms with proactive checkpoint)`,
      );
    } else if (checkpointDuration > 0) {
      this.logger.debug(`Round ${roundId}: Checkpoint ready (${checkpointDuration}ms)`);
    }

    return true;
  }

  async getCurrentSlot(): Promise<number> {
    if (this.slotCache?.isRunning()) {
      return this.slotCache.getSlot();
    }
    try {
      return await this.connection.getSlot();
    } catch {
      return 0;
    }
  }

  async getPlacementTimeBudget(endSlot: number): Promise<{ remainingSlots: number; remainingTimeMs: number } | null> {
    const currentSlot = await this.getCurrentSlot();
    const remainingSlots = endSlot - currentSlot;
    const remainingTimeMs = remainingSlots * SLOT_DURATION_MS;
    if (remainingSlots <= 0 || remainingTimeMs <= 0) return null;
    return { remainingSlots, remainingTimeMs };
  }

  recordLatency(roundId: bigint, placementCount: number, prepMs: number, executionMs: number): void {
    try {
      this.latencyService.record(placementCount, prepMs, executionMs);
      this.latencyStorage.enqueue({ roundId, prepMs, executionMs, placementCount, timestamp: Date.now() });
    } catch (error) {
      this.logger.debug(`Failed to record latency: ${(error as Error).message}`);
    }
  }
}
