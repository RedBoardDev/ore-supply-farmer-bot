import type { BoardAccount } from '@osb/bot/application/decoders';
import type { RoundHandler } from '@osb/bot/application/use-cases';
import type { PlacementPrefetcher } from '@osb/bot/application/use-cases/execute-placement/prefetcher/placement-prefetcher';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { LatencyServicePort, LatencySnapshot } from '@osb/bot/domain/services/ports/latency.port';
import type { PricePort } from '@osb/bot/domain/services/ports/price.port';
import type { RoundState } from '@osb/bot/domain/types/round';
import type { SlotCache } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import type { RoundStreamManager } from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import type { BoardWatcher } from '@osb/bot/infrastructure/adapters/watch/board-watcher.adapter';
import { MAX_LOOP_SLEEP_MS, MIN_LOOP_SLEEP_MS, SLOT_DURATION_MS } from '@osb/bot/infrastructure/constants';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { ConfigSchema } from '@osb/config';
import { RoundId } from '@osb/domain';
import type { Connection, PublicKey } from '@solana/web3.js';
import type { AttemptPlacement } from '../use-cases/execute-placement/executor/attempt-placement';
import { sleep } from './sleep.utils';

interface BoardContext {
  account: BoardAccount;
  roundId: bigint;
  endSlot: number;
}

const log = createChildLogger('run-loop');

const CLAIM_GUARD_TIMEOUT_MS = 250;

export class RunLoop {
  private currentRoundId: bigint | null = null;
  private lastPlanPlacements: number | null = null;
  private readonly container = getGlobalContainer();
  private stopRequested = false;
  private readonly connection: Connection;
  private attemptPlacementRef: AttemptPlacement | null = null;
  private readonly slotCache: SlotCache | null = null;
  private claimInFlight: Promise<bigint> | null = null;
  private lastKnownSlot = 0;

  constructor(
    private readonly config: ConfigSchema,
    private readonly blockchain: BlockchainPort,
    private readonly boardWatcher: BoardWatcher,
    private readonly roundStreamManager: RoundStreamManager,
    private readonly placementPrefetcher: PlacementPrefetcher,
    private readonly roundHandler: RoundHandler,
    private readonly state: RoundState,
    private readonly getLatencySnapshot: () => LatencySnapshot,
    private readonly onNewRound: (roundId: bigint, endSlot: number) => Promise<void>,
    private readonly onAttemptPlacement: (roundId: bigint, endSlot: number, board: BoardAccount) => Promise<boolean>,
    private readonly onFinalizeRounds: (currentRound: bigint) => Promise<void>,
    attemptPlacement?: AttemptPlacement,
  ) {
    this.connection = this.container.resolve<Connection>('SolanaConnection');
    this.attemptPlacementRef = attemptPlacement ?? null;
    try {
      this.slotCache = this.container.resolve<SlotCache>('SlotCache');
    } catch {
      this.slotCache = null;
    }
  }

  async start(): Promise<void> {
    while (!this.stopRequested) {
      try {
        const board = await this.getBoard();
        if (!board) {
          await sleep(200);
          continue;
        }

        const roundId = board.roundId;

        if (this.currentRoundId === null || roundId !== this.currentRoundId) {
          await this.handleRoundTransition(roundId, board.endSlot);
        }

        const currentSlot = await this.getCurrentSlot();
        const remainingSlots = board.endSlot - currentSlot;

        const placementThreshold = this.getPlacementThreshold();
        const attemptThreshold = this.getAttemptThreshold(placementThreshold);
        const snapshot = this.getLatencySnapshot();
        const expectedPlacements = this.getExpectedPlacementCount();

        if (this.state.autoTriggerLoggedForRound !== roundId) {
          this.state.autoTriggerLoggedForRound = roundId;
          log.debug(
            `Auto trigger estimate: threshold=${placementThreshold} slot(s) for ~${expectedPlacements} placement(s), prep≈${snapshot.prepMs.toFixed(0)}ms (p95≈${(snapshot.prepP95Ms ?? snapshot.prepMs).toFixed(0)}ms), exec≈${snapshot.execPerPlacementMs.toFixed(0)}ms/placement (p95≈${(snapshot.execP95Ms ?? snapshot.execPerPlacementMs).toFixed(0)}ms), overhead≈${this.config.timing.overheadMs}ms, parallelismFactor=${this.config.timing.parallelismFactor}`,
          );
        }

        // Proactive refresh: keep cache fresh as we approach placement window
        const streamStats = this.roundStreamManager.getStats();
        if (streamStats.isActive && streamStats.totalUpdates > 0 && remainingSlots > attemptThreshold) {
          if (streamStats.cacheAgeMs > 50) {
            void this.roundStreamManager.refreshIfStale(50);
          } else if (remainingSlots <= attemptThreshold + 2 && streamStats.cacheAgeMs > 30) {
            void this.roundStreamManager.refreshIfStale(30);
          }
        }

        // Proactive price refresh: 20 slots before placement window
        if (
          this.state.priceRefreshedForRound !== roundId &&
          remainingSlots <= placementThreshold + 20 &&
          remainingSlots > placementThreshold
        ) {
          this.state.priceRefreshedForRound = roundId;
          log.info(`Round ${roundId}: Proactive price refresh (${remainingSlots} slots remaining)`);
          void this.refreshPrice().catch((error) => {
            log.debug(`Price refresh failed: ${(error as Error).message}`);
          });
        }

        // Proactive checkpoint: 10 slots before placement window - DISABLED TEMPORARILY
        // if (
        //   this.state.checkpointTriggeredForRound !== roundId &&
        //   remainingSlots <= placementThreshold + 10 &&
        //   remainingSlots > placementThreshold
        // ) {
        //   this.state.checkpointTriggeredForRound = roundId;
        //   log.info(`Round ${roundId}: Proactive checkpoint (${remainingSlots} slots remaining)`);
        //   void this.roundHandler.ensureCheckpoint(this.blockchain, RoundId.create(roundId)).catch((error) => {
        //     log.debug(`Proactive checkpoint failed: ${(error as Error).message}`);
        //   });
        // }

        // Start Round stream early (10-12 slots before placement)
        if (
          remainingSlots <= placementThreshold + 12 &&
          remainingSlots > placementThreshold &&
          !this.roundStreamManager.isHealthy()
        ) {
          log.debug(`Round ${roundId}: Starting Round WebSocket stream (${remainingSlots} slots remaining)`);
          // Trigger async stream start with context fetch
          void this.startRoundStreamEarly(roundId);
        }

        if (
          remainingSlots <= 0 &&
          this.state.placedRoundId === roundId &&
          this.state.roundEndLoggedForRound !== roundId
        ) {
          this.state.roundEndLoggedForRound = roundId;
          const timing = this.attemptPlacementRef?.getPlacementTiming(roundId) ?? null;
          if (timing) {
            const totalFlowDuration = timing.endTime - timing.startTime;
            const slotsFinishedBefore = board.endSlot - timing.endSlot;
            const timeBeforeEnd = Math.round(slotsFinishedBefore * SLOT_DURATION_MS);

            log.info(
              `Round ${roundId}: ENDED - Deployment window closed at slot ${await this.getCurrentSlot()} (endSlot=${board.endSlot})`,
            );
            log.info(
              `Round ${roundId}: Flow stats - Total duration: ${totalFlowDuration}ms, Finished ${slotsFinishedBefore} slots (${timeBeforeEnd}ms) before round end`,
            );
          } else {
            log.info(`Round ${roundId}: ENDED`);
          }
        }

        if (remainingSlots <= attemptThreshold + this.config.timing.prepSlotsAhead) {
          void this.roundHandler.ensureCheckpoint(this.blockchain, RoundId.create(roundId)).catch((error) => {
            log.debug(`Prefetch checkpoint failed: ${(error as Error).message}`);
          });
          this.placementPrefetcher.request(roundId);
        }

        if (this.shouldAttemptPlacement(roundId, remainingSlots, attemptThreshold)) {
          await this.awaitClaimIfNeeded(remainingSlots, attemptThreshold);
          const placed = await this.onAttemptPlacement(roundId, board.endSlot, board.account);
          if (placed) {
            this.state.placedRoundId = roundId;
          }
          // Update lastPlanPlacements from AttemptPlacement for auto-trigger adjustment
          if (this.attemptPlacementRef) {
            const placements = this.attemptPlacementRef.getLastPlanPlacements();
            if (placements !== null && placements !== undefined) {
              this.lastPlanPlacements = placements;
            }
          }
        }

        await this.onFinalizeRounds(roundId);

        const sleepMs = this.computeSleepMs(remainingSlots, attemptThreshold);
        await sleep(sleepMs);
      } catch (error) {
        log.warn(`Loop iteration failed: ${(error as Error).message}`);
        await sleep(500);
      }
    }
  }

  stop(): void {
    this.stopRequested = true;
  }

  private async getBoard(): Promise<BoardContext | null> {
    const snapshot = this.boardWatcher.getBoardSnapshot();
    if (snapshot?.data) {
      return {
        account: snapshot.data,
        roundId: snapshot.data.roundId,
        endSlot: Number(snapshot.data.endSlot),
      };
    }

    const board = await this.blockchain.getBoard();
    if (!board) return null;

    const account: BoardAccount = {
      roundId: board.roundId.value,
      startSlot: board.startSlot.value,
      endSlot: board.endSlot.value,
      epochId: board.epochId,
    };

    return {
      account,
      roundId: account.roundId,
      endSlot: Number(account.endSlot),
    };
  }

  private async getCurrentSlot(): Promise<number> {
    if (this.slotCache) {
      const cachedSlot = this.slotCache.isRunning() ? this.slotCache.getSlot() : this.slotCache.getSlotSync();
      if (cachedSlot > 0) {
        this.lastKnownSlot = cachedSlot;
        return cachedSlot;
      }
    }

    try {
      const slot = await this.connection.getSlot();
      if (slot > 0) {
        this.lastKnownSlot = slot;
        return slot;
      }
    } catch {
      // fall through to lastKnownSlot
    }

    if (this.lastKnownSlot > 0) {
      log.debug(`Slot RPC unavailable; falling back to last known slot ${this.lastKnownSlot}`);
      return this.lastKnownSlot;
    }

    return 0;
  }

  private async handleRoundTransition(roundId: bigint, endSlot: number): Promise<void> {
    if (this.currentRoundId !== null) {
      log.info('--- New Round ---');
    }

    this.currentRoundId = roundId;
    this.state.placedRoundId = null;
    this.state.priceRefreshedForRound = null;
    this.state.checkpointTriggeredForRound = null;
    this.state.roundEndLoggedForRound = null;

    this.placementPrefetcher.clear();
    await this.roundStreamManager.stop();

    try {
      const transactionBuilder = this.container.resolve<TransactionBuilder>('TransactionBuilder');
      transactionBuilder.clearConfigCache();
      void transactionBuilder
        .getEntropyVar(this.connection)
        .then((entropyVar) => {
          log.debug(`Round ${roundId}: Entropy var refreshed (${entropyVar.toBase58()})`);
        })
        .catch((error) => {
          log.debug(`Round ${roundId}: Entropy var refresh failed: ${(error as Error).message}`);
        });
    } catch (error) {
      log.debug(`Round ${roundId}: Unable to refresh entropy var: ${(error as Error).message}`);
    }

    if (!this.claimInFlight) {
      this.claimInFlight = this.roundHandler
        .checkAndClaim(this.blockchain)
        .then((claimed) => {
          if (claimed > 0n) {
            log.info(`Round ${roundId}: Claimed ${Number(claimed) / 1e9} SOL`);
          }
          return claimed;
        })
        .catch((error) => {
          log.debug(`Claim check failed: ${(error as Error).message}`);
          return 0n;
        })
        .finally(() => {
          this.claimInFlight = null;
        });
    } else {
      log.debug('Claim already in flight; skipping new claim attempt.');
    }

    await this.onNewRound(roundId, endSlot);
  }

  private getPlacementThreshold(): number {
    const expectedPlacements = this.getExpectedPlacementCount();
    const latencyService = this.container.resolve<LatencyServicePort>('LatencyService');
    return latencyService.estimateSlots({
      expectedPlacements,
      minSlots: this.config.timing.minSlots,
      maxSlots: this.config.timing.maxSlots,
      safetySlots: this.config.timing.safetySlots,
      overheadPerPlacementMs: this.config.timing.overheadMs,
      parallelismFactor: this.config.timing.parallelismFactor,
    });
  }

  private getAttemptThreshold(baseThreshold: number): number {
    const safetySlots = this.config.timing.safetySlots;
    const maxThreshold = this.config.timing.maxSlots;
    const minThreshold = this.config.timing.minSlots;
    const withLead = Math.min(maxThreshold, baseThreshold + safetySlots);
    return Math.max(minThreshold, withLead);
  }

  private getExpectedPlacementCount(): number {
    if (this.lastPlanPlacements && this.lastPlanPlacements > 0) {
      return Math.min(this.lastPlanPlacements, this.config.strategy.maxPlacementsPerRound);
    }
    return this.config.strategy.maxPlacementsPerRound;
  }

  private computeSleepMs(remainingSlots: number, threshold: number): number {
    if (remainingSlots <= 0) return MIN_LOOP_SLEEP_MS;
    const target = Math.max(threshold, 1);
    if (remainingSlots <= target) return MIN_LOOP_SLEEP_MS;
    const slotsUntilTarget = remainingSlots - target;
    const estimatedMs = slotsUntilTarget * SLOT_DURATION_MS;
    return Math.max(MIN_LOOP_SLEEP_MS, Math.min(estimatedMs, MAX_LOOP_SLEEP_MS));
  }

  private shouldAttemptPlacement(roundId: bigint, remainingSlots: number, threshold: number): boolean {
    if (this.state.placedRoundId === roundId) return false;
    if (remainingSlots <= 0) return false;
    return remainingSlots <= threshold;
  }

  private async refreshPrice(): Promise<void> {
    const pricePort = this.container.resolve<PricePort>('PricePort');
    await pricePort.refresh();
  }

  private async awaitClaimIfNeeded(remainingSlots: number, attemptThreshold: number): Promise<void> {
    if (!this.claimInFlight) return;
    if (remainingSlots > attemptThreshold) return;

    const waitStart = Date.now();
    await Promise.race([this.claimInFlight.catch(() => 0n), sleep(CLAIM_GUARD_TIMEOUT_MS)]);
    const waitedMs = Date.now() - waitStart;
    if (waitedMs > 0) {
      log.debug(`Claim in flight; waited ${waitedMs}ms before placement`);
    }
  }

  private async startRoundStreamEarly(roundId: bigint): Promise<void> {
    try {
      const authorityKey = this.container.resolve<PublicKey>('AuthorityPublicKey');

      // Fetch context in parallel
      const [miner, balanceRaw, pricePort] = await Promise.all([
        this.blockchain.getMiner(authorityKey.toBase58()),
        this.connection.getBalance(authorityKey),
        this.container.resolve<PricePort>('PricePort'),
      ]);

      if (!miner) {
        log.debug(`Round ${roundId}: Cannot start stream early, miner unavailable`);
        return;
      }

      const priceQuote = pricePort.getPrice();
      if (!priceQuote) {
        log.debug(`Round ${roundId}: Cannot start stream early, price unavailable`);
        return;
      }

      // Convert domain Miner to MinerAccount
      const minerAccount = {
        authority: authorityKey,
        deployed: [...miner.deployed],
        rewardsSol: miner.rewardsSol,
        rewardsOre: 0n,
        refinedOre: 0n,
        checkpointFee: 0n,
        checkpointId: miner.checkpointId,
        roundId: miner.roundId,
      };

      this.roundStreamManager.start({
        roundId,
        miner: minerAccount,
        walletBalanceLamports: BigInt(balanceRaw),
        priceQuote,
        maxPlacements: this.config.strategy.maxPlacementsPerRound,
      });

      log.debug(`Round ${roundId}: Round stream started early`);
    } catch (error) {
      log.debug(`Round ${roundId}: Failed to start stream early: ${(error as Error).message}`);
    }
  }
}
