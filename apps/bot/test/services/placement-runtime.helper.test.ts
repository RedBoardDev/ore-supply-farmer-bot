import { PlacementRuntimeHelper } from '@osb/bot/application/use-cases/execute-placement/executor/placement-runtime.helper';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type {
  LatencyRecord,
  LatencyServicePort,
  LatencyStoragePort,
} from '@osb/bot/domain/services/ports/latency.port';
import type { SlotCache } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import type { RoundId } from '@osb/domain';
import type { Board } from '@osb/domain/aggregates/board.aggregate';
import type { SolanaAddress } from '@osb/domain/aggregates/miner.aggregate';
import { SLOT_DURATION_MS } from '@osb/domain/value-objects/slot.vo';
import type { Connection } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';
import { FakeLogger } from '../fakes/logger.fake';

class FakeRoundHandler {
  async ensureCheckpoint(_blockchain: BlockchainPort, _roundId: RoundId): Promise<boolean> {
    return true;
  }
}

class FakeBlockchain implements BlockchainPort {
  async getBoard(): Promise<null> {
    return null;
  }
  async getRound(_roundId: RoundId): Promise<null> {
    return null;
  }
  async getMiner(_authority: SolanaAddress): Promise<null> {
    return null;
  }
  async getBalance(_publicKey: SolanaAddress): Promise<bigint> {
    return 0n;
  }
  async onBoardChange(_callback: (board: Board) => void): Promise<number> {
    return 0;
  }
  async onSlotChange(_callback: (slot: bigint) => void): Promise<number> {
    return 0;
  }
  async unsubscribeBoard(_subscriptionId: number): Promise<void> {}
  async unsubscribeSlot(_subscriptionId: number): Promise<void> {}
  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    return { blockhash: 'test', lastValidBlockHeight: 0n };
  }
}

class FakeSlotCache implements SlotCache {
  private slot: number;
  private running: boolean;

  constructor(slot: number, running: boolean) {
    this.slot = slot;
    this.running = running;
  }

  getSlot(): number {
    return this.slot;
  }
  getSlotSync(): number {
    return this.slot;
  }
  start(): void {}
  stop(): void {}
  isRunning(): boolean {
    return this.running;
  }
}

class FakeLatencyService implements LatencyServicePort {
  record(): void {}
  getSnapshot() {
    return { prepMs: 0, execPerPlacementMs: 0, prepP95Ms: null, execP95Ms: null, initialized: false };
  }
  estimateSlots(): number {
    return 1;
  }
  restoreFromHistory(): void {}
}

class FakeLatencyStorage implements LatencyStoragePort {
  async load(): Promise<LatencyRecord[]> {
    return [];
  }
  enqueue(): void {}
  async flush(): Promise<void> {}
}

describe('PlacementRuntimeHelper', () => {
  it('uses slot cache when running', async () => {
    const connection = { getSlot: vi.fn() } as unknown as Connection;
    const helper = new PlacementRuntimeHelper(
      new FakeRoundHandler(),
      new FakeBlockchain(),
      new FakeSlotCache(100, true),
      connection,
      new FakeLatencyService(),
      new FakeLatencyStorage(),
      new FakeLogger(),
    );

    const budget = await helper.getPlacementTimeBudget(105);

    expect(budget).not.toBeNull();
    expect(budget?.remainingSlots).toBe(5);
    expect(budget?.remainingTimeMs).toBe(5 * SLOT_DURATION_MS);
    expect(connection.getSlot).not.toHaveBeenCalled();
  });

  it('falls back to RPC when cache is not running', async () => {
    const connection = { getSlot: vi.fn().mockResolvedValue(90) } as unknown as Connection;
    const helper = new PlacementRuntimeHelper(
      new FakeRoundHandler(),
      new FakeBlockchain(),
      new FakeSlotCache(0, false),
      connection,
      new FakeLatencyService(),
      new FakeLatencyStorage(),
      new FakeLogger(),
    );

    const budget = await helper.getPlacementTimeBudget(95);

    expect(budget).not.toBeNull();
    expect(budget?.remainingSlots).toBe(5);
    expect(connection.getSlot).toHaveBeenCalledTimes(1);
  });
});
