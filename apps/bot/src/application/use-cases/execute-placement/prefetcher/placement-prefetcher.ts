import {
  decodeMinerAccount,
  decodeRoundAccount,
  type MinerAccount,
  type RoundAccount,
} from '@osb/bot/application/decoders';
import { deriveMinerPda, deriveRoundPda } from '@osb/bot/infrastructure/constants';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { Commitment, Connection, PublicKey } from '@solana/web3.js';

interface PlacementContext {
  round: { data: RoundAccount; slot: number };
  miner: MinerAccount | null;
  balanceLamports: bigint;
  fetchedAt: number;
}

export interface PlacementPrefetcher {
  request(roundId: bigint): void;
  consume(roundId: bigint): PlacementContext | null;
  clear(): void;
}

interface PlacementPrefetcherOptions {
  connection: Connection;
  commitment: Commitment;
  authorityPublicKey?: PublicKey;
  ensureCheckpoint?: (roundId: bigint) => Promise<boolean>;
}

const log = createChildLogger('placement-prefetcher');

const MAX_AGE_MS = 1500;

export class PlacementPrefetcherAdapter implements PlacementPrefetcher {
  private pendingRoundId: bigint | null = null;
  private inflight: Promise<PlacementContext> | null = null;
  private cached: Map<bigint, PlacementContext> = new Map();
  private readonly ensureCheckpoint?: (roundId: bigint) => Promise<boolean>;

  constructor(private readonly options: PlacementPrefetcherOptions) {
    this.ensureCheckpoint = options.ensureCheckpoint;
  }

  request(roundId: bigint): void {
    if (this.inflight && this.pendingRoundId === roundId) {
      return;
    }
    this.pendingRoundId = roundId;
    this.inflight = this.fetchContext(roundId)
      .then((context) => {
        this.cached.set(roundId, context);
        this.inflight = null;
        return context;
      })
      .catch((error) => {
        log.warn(`Failed to prefetch placement context for round ${roundId.toString()}: ${(error as Error).message}`);
        this.inflight = null;
        return null;
      }) as Promise<PlacementContext>;
  }

  consume(roundId: bigint): PlacementContext | null {
    const context = this.cached.get(roundId);
    if (!context) {
      return null;
    }

    const age = Date.now() - context.fetchedAt;
    if (age > MAX_AGE_MS) {
      log.debug(`Prefetched context for round ${roundId.toString()} is stale (${age}ms), skipping`);
      this.cached.delete(roundId);
      return null;
    }

    this.cached.delete(roundId);
    return context;
  }

  clear(): void {
    this.cached.clear();
    this.pendingRoundId = null;
    this.inflight = null;
  }

  private async fetchContext(roundId: bigint): Promise<PlacementContext> {
    if (this.ensureCheckpoint) {
      const checkpointReady = await this.ensureCheckpoint(roundId);
      if (!checkpointReady) {
        throw new Error('Checkpoint not ready for prefetched context');
      }
    }

    const roundAddress = deriveRoundPda(roundId);
    const roundInfo = await this.options.connection.getAccountInfoAndContext(roundAddress, this.options.commitment);
    if (!roundInfo.value) {
      throw new Error(`Round ${roundId.toString()} account not found`);
    }

    const round = decodeRoundAccount(roundInfo.value.data as Buffer);

    // Fetch miner and balance if authority is available
    let miner: MinerAccount | null = null;
    let balanceLamports = 0n;

    if (this.options.authorityPublicKey) {
      try {
        const minerAddress = deriveMinerPda(this.options.authorityPublicKey);
        const [minerInfo, balanceInfo] = await Promise.all([
          this.options.connection.getAccountInfoAndContext(minerAddress, this.options.commitment),
          this.options.connection.getBalance(this.options.authorityPublicKey, this.options.commitment),
        ]);

        if (minerInfo.value) {
          miner = decodeMinerAccount(minerInfo.value.data as Buffer);
        }
        balanceLamports = BigInt(balanceInfo);
      } catch (error) {
        log.debug(`Failed to prefetch miner/balance: ${(error as Error).message}`);
      }
    }

    return {
      round: {
        data: round,
        slot: roundInfo.context.slot,
      },
      miner,
      balanceLamports,
      fetchedAt: Date.now(),
    };
  }
}
