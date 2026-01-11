import { decodeRoundAccount, type MinerAccount, type RoundAccount } from '@osb/bot/application/decoders';
import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { RoundStreamContext } from '@osb/bot/domain/types/round';
import { deriveRoundPda } from '@osb/bot/infrastructure/constants';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { AccountInfo, Commitment, Connection } from '@solana/web3.js';

export interface RoundStreamManager {
  start(context: RoundStreamContext): void;
  updateContext(updates: Partial<RoundStreamContext>): void;
  getRound(): RoundAccount | null;
  peekTopDecision(): PlacementDecision | null;
  getAllDecisions(): PlacementDecision[];
  consumeDecision(): PlacementDecision | null;
  getCacheAge(): number;
  getStats(): { totalUpdates: number; missedUpdates: number; cacheAgeMs: number; isActive: boolean };
  getLastRefreshDurationMs(): number;
  isHealthy(): boolean;
  refreshIfStale(maxAgeMs?: number): Promise<boolean>;
  forceRefresh(): Promise<boolean>;
  stop(): Promise<void>;
  clearDecisions(): void;
}

const log = createChildLogger('round-stream-manager');

interface RoundStreamManagerOptions {
  connection: Connection;
  commitment: Commitment;
  strategyPlanner: {
    buildPlan(context: {
      round: RoundAccount;
      miner: MinerAccount;
      walletBalanceLamports: bigint;
      priceQuote: PriceQuote;
      maxPlacements: number;
    }): PlacementDecision[];
  };
}

export class RoundStreamManagerAdapter implements RoundStreamManager {
  private subscriptionId: number | null = null;
  private currentRoundId: bigint | null = null;
  private roundCache: RoundAccount | null = null;
  private evCache: PlacementDecision[] = [];
  private context: RoundStreamContext | null = null;
  private lastUpdateSlot = 0;
  private lastUpdateTime = 0;
  private isActive = false;
  private fetchInProgress = false;
  private missedUpdates = 0;
  private totalUpdates = 0;
  private lastRefreshDurationMs = 0;

  constructor(private readonly options: RoundStreamManagerOptions) {}

  start(context: RoundStreamContext): void {
    if (this.isActive && this.currentRoundId === context.roundId) {
      this.context = context;
      this.recalculateEv();
      return;
    }

    void this.stop();

    this.context = context;
    this.currentRoundId = context.roundId;
    this.isActive = true;
    this.missedUpdates = 0;
    this.totalUpdates = 0;

    const roundPda = deriveRoundPda(context.roundId);

    try {
      const commitment: Commitment = this.options.commitment;
      this.subscriptionId = this.options.connection.onAccountChange(
        roundPda,
        (accountInfo: AccountInfo<Buffer>, ctx) => {
          this.handleAccountUpdate(accountInfo, ctx.slot);
        },
        commitment,
      );

      log.debug(
        `Round ${context.roundId.toString()}: WebSocket subscribed (id=${this.subscriptionId}, commitment=${commitment})`,
      );
    } catch (error) {
      log.error(`Round ${context.roundId.toString()}: Failed to subscribe to WebSocket: ${(error as Error).message}`);
      this.isActive = false;
      return;
    }

    void this.fetchRoundDirect(context.roundId).then((initialFetch) => {
      if (!initialFetch) {
        log.warn(`Round ${context.roundId.toString()}: Failed to fetch initial Round account`);
        return;
      }

      this.roundCache = initialFetch.data;
      this.lastUpdateSlot = initialFetch.slot;
      this.lastUpdateTime = Date.now();
      this.recalculateEv();

      log.debug(
        `Round ${context.roundId.toString()}: Initial Round data fetched and EV calculated (${this.evCache.length} decisions)`,
      );
    });
  }

  updateContext(updates: Partial<RoundStreamContext>): void {
    if (!this.context) {
      return;
    }

    let needsRecalc = false;

    if (updates.miner !== undefined) {
      this.context.miner = updates.miner;
      needsRecalc = true;
    }

    if (updates.walletBalanceLamports !== undefined) {
      this.context.walletBalanceLamports = updates.walletBalanceLamports;
      needsRecalc = true;
    }

    if (updates.priceQuote !== undefined) {
      this.context.priceQuote = updates.priceQuote;
      needsRecalc = true;
    }

    if (updates.maxPlacements !== undefined) {
      this.context.maxPlacements = updates.maxPlacements;
      needsRecalc = true;
    }

    if (needsRecalc) {
      this.recalculateEv();
    }
  }

  private handleAccountUpdate(accountInfo: AccountInfo<Buffer>, slot: number): void {
    if (!this.isActive || !this.context) {
      return;
    }

    try {
      const round = decodeRoundAccount(accountInfo.data);

      if (round.id !== this.context.roundId) {
        log.warn(
          `Round ${this.context.roundId.toString()}: WebSocket update has mismatched roundId=${round.id.toString()}`,
        );
        return;
      }

      if (slot < this.lastUpdateSlot) {
        log.debug(
          `Round ${this.context.roundId.toString()}: Ignoring stale WebSocket update (slot ${slot} < ${this.lastUpdateSlot})`,
        );
        this.missedUpdates++;
        return;
      }

      const hasChanges = this.detectChanges(round);

      this.roundCache = round;
      this.lastUpdateSlot = slot;
      this.lastUpdateTime = Date.now();
      this.totalUpdates++;

      if (hasChanges) {
        this.recalculateEv();
        log.debug(
          `Round ${this.context.roundId.toString()}: WebSocket update at slot ${slot} (changes detected, EV recalculated, top EV=${this.evCache[0]?.evRatio.toFixed(3) ?? 'N/A'})`,
        );
      } else {
        log.debug(
          `Round ${this.context.roundId.toString()}: WebSocket update at slot ${slot} (no changes in deployed amounts)`,
        );
      }
    } catch (error) {
      log.error(
        `Round ${this.context.roundId.toString()}: Failed to decode WebSocket update: ${(error as Error).message}`,
      );
    }
  }

  private detectChanges(newRound: RoundAccount): boolean {
    if (!this.roundCache) {
      return true;
    }

    for (let i = 0; i < 25; i++) {
      if (newRound.deployed[i] !== this.roundCache.deployed[i]) {
        return true;
      }
    }

    return false;
  }

  private recalculateEv(): void {
    if (!this.roundCache || !this.context) {
      this.evCache = [];
      return;
    }

    const plan = this.options.strategyPlanner.buildPlan({
      round: this.roundCache,
      miner: this.context.miner,
      walletBalanceLamports: this.context.walletBalanceLamports,
      priceQuote: this.context.priceQuote,
      maxPlacements: this.context.maxPlacements,
    });

    this.evCache = plan;
  }

  getRound(): RoundAccount | null {
    return this.roundCache ? { ...this.roundCache, deployed: [...this.roundCache.deployed] } : null;
  }

  peekTopDecision(): PlacementDecision | null {
    return this.evCache[0] ?? null;
  }

  getAllDecisions(): PlacementDecision[] {
    return [...this.evCache];
  }

  consumeDecision(): PlacementDecision | null {
    if (this.evCache.length === 0) {
      return null;
    }

    return this.evCache.shift() ?? null;
  }

  getCacheAge(): number {
    if (this.lastUpdateTime === 0) {
      return Number.POSITIVE_INFINITY;
    }
    return Date.now() - this.lastUpdateTime;
  }

  getStats(): { totalUpdates: number; missedUpdates: number; cacheAgeMs: number; isActive: boolean } {
    return {
      totalUpdates: this.totalUpdates,
      missedUpdates: this.missedUpdates,
      cacheAgeMs: this.getCacheAge(),
      isActive: this.isActive,
    };
  }

  getLastRefreshDurationMs(): number {
    return this.lastRefreshDurationMs;
  }

  isHealthy(): boolean {
    if (!this.isActive) {
      return false;
    }

    const ageMs = this.getCacheAge();
    return ageMs < 2000;
  }

  async refreshIfStale(maxAgeMs = 500): Promise<boolean> {
    if (!this.isActive || !this.context || this.fetchInProgress) {
      return false;
    }

    const contextSnapshot = this.context;
    if (!contextSnapshot) {
      return false;
    }
    const roundId = contextSnapshot.roundId;

    const ageMs = this.getCacheAge();
    if (ageMs < maxAgeMs) {
      return false;
    }

    log.debug(`Round ${roundId.toString()}: Cache stale (${ageMs}ms), forcing HTTP refresh`);

    this.fetchInProgress = true;
    const refreshStart = Date.now();
    try {
      const fetched = await this.fetchRoundDirect(roundId);
      if (!fetched) {
        return false;
      }

      if (!this.context || this.context.roundId !== roundId) {
        return false;
      }

      const hasChanges = this.detectChanges(fetched.data);
      this.roundCache = fetched.data;
      this.lastUpdateSlot = fetched.slot;
      this.lastUpdateTime = Date.now();
      this.lastRefreshDurationMs = Date.now() - refreshStart;

      if (hasChanges) {
        this.recalculateEv();
        log.debug(`Round ${roundId.toString()}: HTTP refresh complete (changes detected, EV recalculated)`);
      }

      return true;
    } catch (error) {
      const label = this.context?.roundId ?? roundId;
      log.error(`Round ${label.toString()}: HTTP refresh failed: ${(error as Error).message}`);
      return false;
    } finally {
      this.fetchInProgress = false;
    }
  }

  async forceRefresh(): Promise<boolean> {
    if (!this.isActive || !this.context || this.fetchInProgress) {
      return false;
    }
    const roundId = this.context.roundId;
    const refreshStart = Date.now();
    this.fetchInProgress = true;
    try {
      const fetched = await this.fetchRoundDirect(roundId);
      if (!fetched) {
        return false;
      }
      if (!this.context || this.context.roundId !== roundId) {
        return false;
      }

      const hasChanges = this.detectChanges(fetched.data);
      this.roundCache = fetched.data;
      this.lastUpdateSlot = fetched.slot;
      this.lastUpdateTime = Date.now();
      this.lastRefreshDurationMs = Date.now() - refreshStart;

      if (hasChanges) {
        this.recalculateEv();
        log.debug(`Round ${roundId.toString()}: Force refresh complete (changes detected, EV recalculated)`);
      }

      return true;
    } catch (error) {
      log.error(`Round ${roundId.toString()}: Force refresh failed: ${(error as Error).message}`);
      return false;
    } finally {
      this.fetchInProgress = false;
    }
  }

  private async fetchRoundDirect(roundId: bigint): Promise<{ data: RoundAccount; slot: number } | null> {
    try {
      const roundAddress = deriveRoundPda(roundId);
      const accountInfo = await this.options.connection.getAccountInfoAndContext(roundAddress, this.options.commitment);
      if (!accountInfo.value) {
        return null;
      }
      const data = decodeRoundAccount(accountInfo.value.data as Buffer);
      return { data, slot: accountInfo.context.slot };
    } catch (error) {
      log.error(`Failed to fetch Round ${roundId.toString()}: ${(error as Error).message}`);
      return null;
    }
  }

  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      try {
        await this.options.connection.removeAccountChangeListener(this.subscriptionId);
        log.debug(
          `Round ${this.currentRoundId?.toString() ?? 'unknown'}: WebSocket unsubscribed (id=${this.subscriptionId})`,
        );
      } catch (error) {
        log.warn(`Failed to unsubscribe WebSocket (id=${this.subscriptionId}): ${(error as Error).message}`);
      }
      this.subscriptionId = null;
    }

    this.isActive = false;
    this.currentRoundId = null;
    this.roundCache = null;
    this.evCache = [];
    this.context = null;
    this.lastUpdateSlot = 0;
    this.lastUpdateTime = 0;
    this.fetchInProgress = false;
    this.lastRefreshDurationMs = 0;
  }

  clearDecisions(): void {
    this.evCache = [];
  }
}
