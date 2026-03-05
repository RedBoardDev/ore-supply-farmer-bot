import type { BoardAccount } from '@osb/bot/application/decoders';
import type { PricePort } from '@osb/bot/domain/services/ports/price.port';
import type { RoundState } from '@osb/bot/domain/types/round';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import { registerControlService } from '@osb/bot/infrastructure/control/control-service';
import { IoCmoduleRegistry } from '@osb/bot/infrastructure/di/module-registry';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import { Board, RoundId, Slot } from '@osb/domain';
import type { Connection } from '@solana/web3.js';
import { MetricsServer } from '../../infrastructure/metrics/metrics-server';
import {
  initializeMetrics,
  recordRoundStart,
  setBotLifecycleState,
  setBotUp,
  updateActiveRounds,
} from '../../infrastructure/metrics/prometheus';
import { RoundHandler } from '../use-cases';
import { AttemptPlacement } from '../use-cases/execute-placement/executor/attempt-placement';
import { OreBot } from './ore-bot';
import { RunLoop } from './run-loop';

const log = createChildLogger('core');
const MAX_U64 = BigInt('18446744073709551615');

export type BotLifecycleState = 'running' | 'paused' | 'stopped';

export class Core extends OreBot {
  // State
  private lifecycleState: BotLifecycleState = 'stopped';
  private currentBoard: Board | null = null;
  private subscriptionId: number | null = null;
  private roundState: RoundState;

  // Business logic component
  private readonly roundHandler: RoundHandler;

  // Runtime components
  private runLoop: RunLoop | null = null;
  private attemptPlacement: AttemptPlacement | null = null;
  private stopLoopPromise: Promise<void> | null = null;
  private loopResolve: (() => void) | null = null;
  private metricsServer: MetricsServer | null = null;

  constructor() {
    super();
    this.roundHandler = new RoundHandler(this.config);
    this.roundState = this.roundHandler.resetState();
  }

  async start(): Promise<void> {
    if (this.lifecycleState === 'running') {
      log.warn('Bot already running');
      return;
    }
    if (this.lifecycleState === 'paused') {
      await this.resume();
      return;
    }

    log.info('Starting ORE smart bot...', {
      rpc: this.config.rpc.httpEndpoint,
    });

    IoCmoduleRegistry(this.config, this.env);

    // Initialize runtime components
    this.initializeRuntimeComponents();

    // Start infrastructure
    this.getBlockhashCache().start();
    this.getSlotCache().start();

    // Warm program config cache (entropy var)
    await this.initializeProgramConfig();

    // Fetch initial price quote (non-blocking)
    try {
      const pricePort = this.container.resolve<PricePort>('PricePort');
      log.info('Fetching initial price quote...');
      void pricePort.refresh().catch((error) => {
        log.debug(`Initial price refresh failed: ${(error as Error).message}`);
      });
    } catch (error) {
      log.debug(`Price service unavailable at startup: ${(error as Error).message}`);
    }

    // Load latency history
    await this.loadLatencyHistory();

    // Initialize rewards baseline
    await this.initializeRewardsBaseline();

    // Start board watcher early to seed WS snapshot and keep current board updated
    const boardWatcher = this.getBoardWatcher();
    this.bindBoardWatcher(boardWatcher);
    await boardWatcher.start();
    await boardWatcher.waitForInitialBoard();

    const initialSnapshot = boardWatcher.getBoardSnapshot();
    if (initialSnapshot) {
      this.updateCurrentBoardFromSnapshot(initialSnapshot.data);
    }

    // Subscribe to slot changes
    this.subscriptionId = await this.getBlockchain().onSlotChange(async (slot) => {
      if (
        this.currentBoard &&
        slot >= this.currentBoard.endSlot.value &&
        this.roundState.roundEndLoggedForRound !== this.currentBoard.roundId.value
      ) {
        // Set flag BEFORE async call to prevent race condition
        this.roundState.roundEndLoggedForRound = this.currentBoard.roundId.value;
        await this.handleRoundEnd();
      }
    });

    log.info(`Subscribed to slot changes (id: ${this.subscriptionId})`);

    // Get initial board
    const board = await this.getBlockchain().getBoard();
    if (board) {
      await this.syncInitialBoardState(board);
    }

    // Start run loop in background
    this.startRunLoop();

    // Start metrics server
    if (this.config.prometheus?.enabled !== false) {
      const metricsPort = this.config.prometheus?.port || 3001;
      this.metricsServer = new MetricsServer({ port: metricsPort, host: '0.0.0.0' });
      await this.metricsServer.start();
      log.info(`Metrics server started on port ${metricsPort}`);
      initializeMetrics();
      setBotUp(true);
    }

    // Register control service for API access
    registerControlService(this);

    // Set bot status metric
    setBotLifecycleState('running');

    // Notify start
    await this.getNotificationPort().send({
      type: 'info',
      title: 'ORE Bot Started',
      message: 'Bot started',
    });

    this.lifecycleState = 'running';
    log.info('ORE Smart Bot started successfully');
  }

  private initializeRuntimeComponents(): void {
    this.attemptPlacement = new AttemptPlacement(
      this.config,
      this.getBlockchain(),
      this.roundHandler,
      this.getRoundStreamManager(),
      this.getPlacementPrefetcher(),
      this.getInstructionCache(),
      this.getBlockhashCache(),
      this.getRoundMetricsManager(),
      this.getSlotCache(),
    );

    const attemptPlacement = this.attemptPlacement;
    if (!attemptPlacement) {
      throw new Error('AttemptPlacement not initialized');
    }

    // Initialize RunLoop
    this.runLoop = new RunLoop(
      this.config,
      this.getBlockchain(),
      this.getBoardWatcher(),
      this.getRoundStreamManager(),
      this.getPlacementPrefetcher(),
      this.roundHandler,
      this.roundState,
      () => this.getLatencyService().getSnapshot(),
      (roundId, _endSlot) => this.handleNewRound(roundId),
      (roundId, endSlot, board) => attemptPlacement.execute(roundId, endSlot, board),
      (currentRound) => this.getRoundMetricsManager()?.finalizeRounds(currentRound) ?? Promise.resolve(),
      attemptPlacement,
    );
  }

  private startRunLoop(): void {
    if (!this.runLoop) return;

    // Create stop promise for clean shutdown
    this.stopLoopPromise = new Promise((resolve) => {
      this.loopResolve = resolve;
    });

    // Start loop in background
    this.runLoop.start().then(() => {
      this.loopResolve?.();
    });
  }

  private async handleNewRound(roundId: bigint): Promise<void> {
    // Record round start for Prometheus metrics
    recordRoundStart(roundId.toString(), Date.now());
    updateActiveRounds(1);

    // Notify round start to checkpoint service
    this.roundHandler.notifyRoundStart(roundId);
  }

  private bindBoardWatcher(boardWatcher: ReturnType<Core['getBoardWatcher']>): void {
    boardWatcher.on('board', (snapshot) => {
      this.updateCurrentBoardFromSnapshot(snapshot.data);
    });
  }

  private updateCurrentBoardFromSnapshot(snapshot: BoardAccount): void {
    if (!this.isBoardReady(snapshot)) {
      return;
    }

    // Guard: prevent stale board updates after round has ended.
    // If we've already logged round end for this roundId, skip the update
    // since the board watcher might still be polling the old board.
    if (this.roundState.roundEndLoggedForRound === snapshot.roundId) {
      return;
    }

    try {
      this.currentBoard = Board.create(
        RoundId.create(snapshot.roundId),
        Slot.create(snapshot.startSlot),
        Slot.create(snapshot.endSlot),
        snapshot.epochId,
      );
    } catch (error) {
      log.debug(`Unable to update current board: ${(error as Error).message}`);
    }
  }

  private isBoardReady(board: BoardAccount): boolean {
    return board.endSlot > board.startSlot && board.endSlot < MAX_U64;
  }

  private async syncInitialBoardState(board: Board): Promise<void> {
    this.currentBoard = board;
    // Need to use Object.assign to avoid mutating the original object
    Object.assign(this.roundState, this.roundHandler.resetState());

    const roundId = board.roundId.value;
    log.info(`Round ${roundId}: Tracking (slots ${board.startSlot} → ${board.endSlot})`);

    // Clear stream and prefetcher
    this.getRoundStreamManager().clearDecisions();
    this.getPlacementPrefetcher().clear();
  }

  private async handleRoundEnd(): Promise<void> {
    if (!this.currentBoard) return;

    const roundId = this.currentBoard.roundId.value;

    // Guard: prevent duplicate round end logs
    if (this.roundState.roundEndLoggedForRound === roundId) {
      return;
    }
    this.roundState.roundEndLoggedForRound = roundId;

    log.info(`Round ${roundId} ended`);

    updateActiveRounds(0);
    await this.getRoundMetricsManager()?.finalizeRounds(roundId);
    this.currentBoard = null;
    // Need to use Object.assign to avoid mutating the original object
    Object.assign(this.roundState, this.roundHandler.resetState());
  }

  private async loadLatencyHistory(): Promise<void> {
    try {
      const history = await this.getLatencyStorage().load();
      if (history.length > 0) {
        const latencyService = this.getLatencyService();
        latencyService.restoreFromHistory(history);

        const lastRecord = history[history.length - 1];
        if (lastRecord) {
          this.attemptPlacement?.setLastPlanPlacements(lastRecord.placementCount);
        }

        const snapshot = latencyService.getSnapshot();
        log.debug(
          `Loaded ${history.length} latency sample(s); prep≈${snapshot.prepMs.toFixed(
            1,
          )}ms exec≈${snapshot.execPerPlacementMs.toFixed(1)}ms`,
        );
      } else {
        log.debug('Latency history empty; using default timing estimates.');
      }
    } catch {
      log.debug(`Unable to load latency history`);
    }
  }

  private async initializeRewardsBaseline(): Promise<void> {
    try {
      const authorityKey = this.getAuthorityPublicKey();
      const miner = await this.getBlockchain().getMiner(authorityKey.toBase58());
      if (miner) {
        this.getRoundMetricsManager()?.setBaseline(miner.rewardsSol);
      }
    } catch {
      log.debug(`Unable to initialize rewards baseline`);
    }
  }

  private async initializeProgramConfig(): Promise<void> {
    try {
      const connection = this.container.resolve<Connection>('SolanaConnection');
      const transactionBuilder = this.container.resolve<TransactionBuilder>('TransactionBuilder');
      const entropyVar = await transactionBuilder.getEntropyVar(connection);
      log.info(`Program config loaded (entropy var=${entropyVar.toBase58()})`);
    } catch (error) {
      log.debug(`Unable to load program config: ${(error as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    if (this.lifecycleState === 'stopped') return;

    log.info('Stopping ORE Smart Bot...');

    // Set bot status metric
    setBotLifecycleState('stopped');

    // Stop run loop first
    this.runLoop?.stop();
    if (this.stopLoopPromise) {
      await this.stopLoopPromise;
    }

    // Stop metrics server
    if (this.metricsServer) {
      setBotUp(false);
      await this.metricsServer.stop();
      this.metricsServer = null;
    }

    updateActiveRounds(0);

    // Cleanup infrastructure
    await this.cleanupAfterLoop();

    await this.getNotificationPort().send({
      type: 'info',
      title: 'ORE Bot Stopped',
      message: 'Bot has been stopped',
    });

    this.lifecycleState = 'stopped';
    log.info('ORE Smart Bot stopped');
  }

  private async cleanupAfterLoop(): Promise<void> {
    this.getBlockhashCache().stop();
    this.getSlotCache().stop();

    if (this.subscriptionId !== null) {
      try {
        await this.getBlockchain().unsubscribeSlot(this.subscriptionId);
      } catch (error) {
        log.debug(`Failed to unsubscribe slot listener: ${(error as Error).message}`);
      } finally {
        this.subscriptionId = null;
      }
    }

    try {
      await this.getRoundStreamManager().stop();
    } catch (error) {
      log.debug(`Failed to stop round stream: ${(error as Error).message}`);
    }

    try {
      await this.getBoardWatcher().stop();
    } catch (error) {
      log.debug(`Failed to stop board watcher: ${(error as Error).message}`);
    }

    this.getPlacementPrefetcher().clear();
  }

  async pause(): Promise<void> {
    if (this.lifecycleState !== 'running') return;
    this.runLoop?.pause();
    this.lifecycleState = 'paused';
    setBotLifecycleState('paused');
    log.info('ORE Smart Bot paused');
  }

  async resume(): Promise<void> {
    if (this.lifecycleState === 'running') return;
    if (!this.runLoop) {
      this.lifecycleState = 'stopped';
      await this.start();
      return;
    }
    this.runLoop.resume();
    this.lifecycleState = 'running';
    setBotLifecycleState('running');
    log.info('ORE Smart Bot resumed');
  }

  getStatus(): {
    running: boolean;
    state: BotLifecycleState;
    currentRound?: bigint;
    currentRoundEndSlot?: number;
    slotsRemaining?: number;
  } {
    const currentRoundEndSlot =
      this.currentBoard?.endSlot.value !== undefined ? Number(this.currentBoard.endSlot.value) : undefined;
    let slotsRemaining: number | undefined;
    if (currentRoundEndSlot !== undefined) {
      const slotCache = this.getSlotCache();
      const currentSlot = slotCache.isRunning() ? slotCache.getSlotSync() : slotCache.getSlot();
      if (currentSlot > 0) {
        slotsRemaining = Math.max(0, currentRoundEndSlot - currentSlot);
      }
    }

    return {
      running: this.lifecycleState === 'running',
      state: this.lifecycleState,
      currentRound: this.currentBoard?.roundId.value,
      currentRoundEndSlot,
      slotsRemaining,
    };
  }
}
