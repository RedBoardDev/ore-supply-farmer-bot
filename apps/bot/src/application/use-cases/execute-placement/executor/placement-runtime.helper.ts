import type { RoundHandler } from '@osb/bot/application/use-cases';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { LatencyServicePort, LatencyStoragePort } from '@osb/bot/domain/services/ports/latency.port';
import type { SlotCache } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import { RoundId } from '@osb/domain';
import { SLOT_DURATION_MS } from '@osb/domain/value-objects/slot.vo';
import type { Connection, PublicKey } from '@solana/web3.js';

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

    // Verify miner is actually checkpointed before proceeding
    // This prevents deploy from failing with "Miner has not checkpointed"
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      // Get authority address from container
      const container = getGlobalContainer();
      const authorityKey = container.resolve<PublicKey>('AuthorityPublicKey');
      const authorityAddress = authorityKey.toBase58();

      // Re-fetch miner to verify checkpoint
      const miner = await this.blockchain.getMiner(authorityAddress);
      if (miner && miner.checkpointId === miner.roundId) {
        this.logger.debug(`Round ${roundId}: Miner checkpoint verified (${checkpointDuration}ms + ${attempts * 500}ms wait)`);
        return true;
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.logger.warn(`Round ${roundId}: Miner checkpoint not verified after ${attempts} attempts`);
    return false;
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
