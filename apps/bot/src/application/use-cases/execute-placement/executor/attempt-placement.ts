import type { BoardAccount } from '@osb/bot/application/decoders';
import type { RoundHandler } from '@osb/bot/application/use-cases';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { EvStrategyServicePort, PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { LatencyServicePort, LatencyStoragePort } from '@osb/bot/domain/services/ports/latency.port';
import type { PricePort, PriceQuote } from '@osb/bot/domain/services/ports/price.port';
import type { BlockhashCache } from '@osb/bot/infrastructure/adapters/blockchain/blockhash-cache.adapter';
import type { InstructionCache } from '@osb/bot/infrastructure/adapters/cache/instruction-cache.adapter';
import type { SlotCache } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import type { RoundMetricsManager } from '@osb/bot/infrastructure/adapters/round/round-metrics';
import type { RoundStreamManager } from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import type { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import { INSTRUCTION_CACHE_LIMIT, STREAM_FRESHNESS_LIMIT_MS } from '@osb/bot/infrastructure/constants';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { ConfigSchema } from '@osb/config';
import { SLOT_DURATION_MS } from '@osb/domain/value-objects/slot.vo';
import type { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { PlacementPrefetcher } from '../prefetcher/placement-prefetcher';
import { PlacementStrategy } from '../strategy/placement-strategy';
import { PlacementContextProvider } from './placement-context.provider';
import { PlacementExecutor } from './placement-executor';
import { PlacementInstructionsBuilder } from './placement-instructions.builder';
import { PlacementPlanBuilder } from './placement-plan.builder';
import { PlacementQueueBuilder } from './placement-queue.builder';
import { PlacementRuntimeHelper } from './placement-runtime.helper';
import { PlacementStreamHelper } from './placement-stream.helper';

const log = createChildLogger('attempt-placement');

export class AttemptPlacement {
  private placementStartTime: number | null = null;
  private placementEndTime: number | null = null;
  private placementEndSlot: number | null = null;
  private placementRoundId: bigint | null = null;
  private lastPlanPlacements: number | null = null;
  private readonly container = getGlobalContainer();
  private readonly connection: Connection;
  private readonly strategy: PlacementStrategy;
  private readonly slotCache: SlotCache | null = null;
  private readonly authorityPublicKey: PublicKey;
  private readonly roundMetricsManager: RoundMetricsManager | null = null;
  private readonly contextProvider: PlacementContextProvider;
  private readonly planBuilder: PlacementPlanBuilder;
  private readonly instructionsBuilder: PlacementInstructionsBuilder;
  private readonly queueBuilder: PlacementQueueBuilder;
  private readonly executor: PlacementExecutor;
  private readonly streamHelper: PlacementStreamHelper;
  private readonly runtimeHelper: PlacementRuntimeHelper;

  constructor(
    private readonly config: ConfigSchema,
    private readonly blockchain: BlockchainPort,
    private readonly roundHandler: RoundHandler,
    private readonly roundStreamManager: RoundStreamManager,
    private readonly placementPrefetcher: PlacementPrefetcher,
    private readonly instructionCache: InstructionCache,
    private readonly blockhashCache: BlockhashCache,
    roundMetricsManager?: RoundMetricsManager,
    slotCache?: SlotCache,
  ) {
    this.connection = this.container.resolve<Connection>('SolanaConnection');
    this.strategy = new PlacementStrategy(this.config, log);
    this.authorityPublicKey = this.container.resolve<PublicKey>('AuthorityPublicKey');

    try {
      this.roundMetricsManager =
        roundMetricsManager ?? this.container.resolve<RoundMetricsManager>('RoundMetricsManager');
    } catch {
      this.roundMetricsManager = null;
    }

    try {
      this.slotCache = slotCache ?? this.container.resolve<SlotCache>('SlotCache');
    } catch {
      this.slotCache = null;
    }

    const evStrategy = this.container.resolve<EvStrategyServicePort>('EvStrategyService');
    const transactionBuilder = this.container.resolve<TransactionBuilder>('TransactionBuilder');
    const transactionSender = this.container.resolve<TransactionSender>('TransactionSender');
    const authorityKeypair = this.container.resolve<Keypair>('AuthorityKeypair');
    const latencyService = this.container.resolve<LatencyServicePort>('LatencyService');
    const latencyStorage = this.container.resolve<LatencyStoragePort>('LatencyStoragePort');
    const pricePort = this.container.resolve<PricePort>('PricePort');

    this.contextProvider = new PlacementContextProvider(
      this.blockchain,
      this.placementPrefetcher,
      pricePort,
      this.authorityPublicKey,
      log,
      this.roundMetricsManager,
    );
    this.planBuilder = new PlacementPlanBuilder(evStrategy, log);
    this.instructionsBuilder = new PlacementInstructionsBuilder(
      this.config,
      this.instructionCache,
      transactionBuilder,
      this.authorityPublicKey,
      this.connection,
      log,
    );
    this.queueBuilder = new PlacementQueueBuilder(this.config, this.roundStreamManager, log);
    this.executor = new PlacementExecutor(
      transactionBuilder,
      transactionSender,
      this.blockhashCache,
      this.connection,
      authorityKeypair,
      log,
      this.roundMetricsManager,
    );
    this.streamHelper = new PlacementStreamHelper(
      this.roundStreamManager,
      this.blockchain,
      pricePort,
      this.authorityPublicKey,
      this.connection,
      this.config.strategy.maxPlacementsPerRound,
      log,
      this.roundMetricsManager,
    );
    this.runtimeHelper = new PlacementRuntimeHelper(
      this.roundHandler,
      this.blockchain,
      this.slotCache,
      this.connection,
      latencyService,
      latencyStorage,
      log,
    );
  }

  async execute(expectedRoundId: bigint, endSlot: number, boardSnapshot?: BoardAccount): Promise<boolean> {
    const placementStart = Date.now();
    this.placementStartTime = placementStart;
    this.placementEndTime = null;
    this.placementEndSlot = null;
    this.placementRoundId = expectedRoundId;
    log.info(`Round ${expectedRoundId}: Placement window triggered`);

    if (boardSnapshot && boardSnapshot.roundId !== expectedRoundId) {
      log.debug(
        `Round changed before placement (expected ${expectedRoundId.toString()}, observed ${boardSnapshot.roundId.toString()})`,
      );
      return false;
    }

    if (!this.config.fastMode) {
      const board = await this.blockchain.getBoard();
      if (!board) {
        log.debug(`Round ${expectedRoundId}: Unable to fetch board for revalidation`);
        return false;
      }
      if (board.roundId.value !== expectedRoundId) {
        log.debug(
          `Round changed before placement (expected ${expectedRoundId.toString()}, observed ${board.roundId.value.toString()})`,
        );
        return false;
      }
    }

    const checkpointReady = await this.runtimeHelper.ensureCheckpoint(expectedRoundId);
    if (!checkpointReady) {
      log.warn('Skipping placement: checkpoint not ready');
      return false;
    }

    const streamPreparation = await this.streamHelper.prepare(expectedRoundId);
    if (streamPreparation.streamHealthy && !streamPreparation.freshOk) {
      log.warn(`Round ${expectedRoundId}: Unable to obtain fresh stream snapshot; skipping`);
      return false;
    }

    let plan: PlacementDecision[] = [];
    let preparationTotal = 0;
    let planningDuration = 0;
    let bestEvRatio: number | null = null;
    let priceQuote: PriceQuote | null = null;

    if (streamPreparation.streamHealthy && streamPreparation.stats.cacheAgeMs <= STREAM_FRESHNESS_LIMIT_MS) {
      plan = this.roundStreamManager.getAllDecisions();
      preparationTotal = Date.now() - placementStart;

      priceQuote = await this.streamHelper.resolvePriceQuote(expectedRoundId);
      if (!priceQuote) {
        return false;
      }

      log.info(
        `Round ${expectedRoundId}: Using stream data (age=${streamPreparation.stats.cacheAgeMs.toFixed(0)}ms, ${streamPreparation.stats.totalUpdates} updates, ${plan.length} decisions)`,
      );
    } else {
      const contextResult = await this.contextProvider.getContext(expectedRoundId, placementStart);
      if (!contextResult) {
        return false;
      }

      const planResult = this.planBuilder.build(contextResult.context);
      plan = planResult.plan;
      planningDuration = planResult.planningMs;
      bestEvRatio = planResult.bestEvRatio;
      preparationTotal = contextResult.prepTimeMs;
      priceQuote = contextResult.context.priceQuote;
    }

    if (this.strategy.isMiningCostStrategyEnabled()) {
      const miningCost = await this.strategy.evaluateMiningCost(expectedRoundId, null, priceQuote);
      if (miningCost && miningCost.decision === 'SKIP') {
        const evLabel = miningCost.averageEvPercent ?? miningCost.evPercent;
        const evText = evLabel !== null && evLabel !== undefined ? `${evLabel.toFixed(2)}%` : 'unknown';
        log.info(`Skipping placements for round ${expectedRoundId}: mining cost unfavorable (evPercent=${evText}).`);
        return false;
      }
    }

    if (plan.length === 0) {
      const bestEvMessage =
        bestEvRatio !== null && Number.isFinite(bestEvRatio) ? `, best EV observed ${bestEvRatio.toFixed(3)}` : '';
      log.info(
        `⏭️  SKIPPED - Round ${expectedRoundId}: No profitable placements found (planning ${planningDuration}ms, total prep ${preparationTotal}ms${bestEvMessage})`,
      );
      return false;
    }

    const topEv = plan[0]?.evRatio ?? 0;
    log.info(
      `Round ${expectedRoundId}: Selected ${plan.length} placement(s), top EV=${topEv.toFixed(3)} (planning ${planningDuration}ms, total prep ${preparationTotal}ms)`,
    );
    for (const decision of plan) {
      log.debug(
        `  → Square #${decision.squareIndex + 1}: stake=${Number(decision.amountLamports) / 1e9} SOL, others=${Number(decision.othersStakeLamports) / 1e9} SOL, EV=${decision.evRatio.toFixed(3)}`,
      );
    }

    const preparedPlacements = await this.instructionsBuilder.prepare(expectedRoundId, plan, INSTRUCTION_CACHE_LIMIT);
    if (preparedPlacements.length === 0) {
      log.warn('Unable to prepare placement instructions; skipping round');
      return false;
    }

    const latencySnapshot = this.strategy.getLatencySnapshot(
      this.container.resolve<LatencyServicePort>('LatencyService'),
    );
    const execGuardMs = this.strategy.getExecGuardMs(latencySnapshot, log);
    const lastRefreshDurationMs = streamPreparation.streamHealthy
      ? this.roundStreamManager.getLastRefreshDurationMs()
      : 0;
    const safetyMs = this.strategy.calculatePlacementSafetyMs(latencySnapshot, lastRefreshDurationMs, log);

    log.debug(
      `Round ${expectedRoundId}: Placement guard=${execGuardMs.toFixed(0)}ms, safety=${safetyMs.toFixed(0)}ms, refresh=${lastRefreshDurationMs.toFixed(0)}ms`,
    );

    const placementsToExecute = await this.queueBuilder.build({
      roundId: expectedRoundId,
      endSlot,
      prepared: preparedPlacements,
      streamHealthy: streamPreparation.streamHealthy,
      guardMs: execGuardMs,
      safetyMs,
      buildInstructions: (decision) => this.instructionsBuilder.buildForDecision(expectedRoundId, decision),
      getBudget: (targetEndSlot) => this.runtimeHelper.getPlacementTimeBudget(targetEndSlot),
    });

    if (placementsToExecute.length === 0) {
      return false;
    }

    const executionStart = Date.now();
    const executionSummary = await this.executor.execute(expectedRoundId, placementsToExecute);
    const executionDuration = Date.now() - executionStart;

    if (executionSummary.completed > 0) {
      this.placementEndTime = Date.now();
      this.placementEndSlot = await this.runtimeHelper.getCurrentSlot();

      const totalDuration = Date.now() - placementStart;
      const slotsRemaining = endSlot - (this.placementEndSlot ?? 0);
      const timeRemaining = Math.round(slotsRemaining * SLOT_DURATION_MS);

      log.info(
        `✅ SUCCESS ✅ Round ${expectedRoundId}: Completed ${executionSummary.completed} placement(s) (execution ${executionDuration}ms, total ${totalDuration}ms) - ${slotsRemaining} slots (${timeRemaining}ms) remaining`,
      );

      this.runtimeHelper.recordLatency(
        expectedRoundId,
        executionSummary.completed,
        preparationTotal,
        executionDuration,
      );
    }

    if (plan.length > 0) {
      this.lastPlanPlacements = plan.length;
    }

    return executionSummary.completed > 0;
  }

  getLastPlanPlacements(): number | null {
    return this.lastPlanPlacements;
  }

  setLastPlanPlacements(count: number | null): void {
    this.lastPlanPlacements = count;
  }

  getPlacementTiming(roundId: bigint): { startTime: number; endTime: number; endSlot: number } | null {
    if (this.placementRoundId !== roundId) return null;
    if (this.placementStartTime === null || this.placementEndTime === null || this.placementEndSlot === null) {
      return null;
    }
    return {
      startTime: this.placementStartTime,
      endTime: this.placementEndTime,
      endSlot: this.placementEndSlot,
    };
  }
}
