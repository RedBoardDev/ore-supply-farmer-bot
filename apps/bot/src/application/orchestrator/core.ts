import type { RoundState } from '@osb/bot/domain/types/round';
import { IoCmoduleRegistry } from '@osb/bot/infrastructure/di/module-registry';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { Board } from '@osb/domain';
import { RoundHandler } from '../use-cases';
import { AttemptPlacement } from '../use-cases/execute-placement/executor/attempt-placement';
import { OreBot } from './ore-bot';
import { RunLoop } from './run-loop';

const log = createChildLogger('core');

export class Core extends OreBot {
  // State
  private isRunning = false;
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

  constructor() {
    super();
    this.roundHandler = new RoundHandler(this.config);
    this.roundState = this.roundHandler.resetState();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Bot already running');
      return;
    }

    log.info('Starting ORE smart bot...', {
      dryRun: this.config.runtime.dryRun,
      rpc: this.config.rpc.httpEndpoint,
    });

    IoCmoduleRegistry(this.config);

    // Initialize runtime components
    this.initializeRuntimeComponents();

    // Start infrastructure
    this.getBlockhashCache().start();
    this.getSlotCache().start();

    // Load latency history
    await this.loadLatencyHistory();

    // Initialize rewards baseline
    await this.initializeRewardsBaseline();

    // Subscribe to slot changes
    this.subscriptionId = await this.getBlockchain().onSlotChange(async (slot) => {
      if (this.currentBoard && slot >= this.currentBoard.endSlot.value) {
        await this.handleRoundEnd();
      }
    });

    log.info(`Subscribed to slot changes (id: ${this.subscriptionId})`);

    // Get initial board
    const board = await this.getBlockchain().getBoard();
    if (board) {
      await this.syncInitialBoardState(board);
    }

    // Start board watcher
    await this.getBoardWatcher().start();

    // Start run loop in background
    this.startRunLoop();

    // Notify start
    await this.getNotificationPort().send({
      type: 'info',
      title: 'ORE Bot Started',
      message: `Bot started in ${this.config.runtime.dryRun ? 'DRY RUN' : 'LIVE'} mode`,
    });

    this.isRunning = true;
    log.info('ORE Smart Bot started successfully');
  }

  private initializeRuntimeComponents(): void {
    this.attemptPlacement = new AttemptPlacement(
      this.config,
      this.getBlockchain(),
      this.getRoundStreamManager(),
      this.getPlacementPrefetcher(),
      this.getInstructionCache(),
      this.getBlockhashCache(),
      this.getRoundMetricsManager(),
      this.getSlotCache()
    );

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
      (roundId, endSlot) => this.attemptPlacement!.execute(roundId, endSlot),
      (currentRound) => this.getRoundMetricsManager()?.finalizeRounds(currentRound) ?? Promise.resolve(),
      this.attemptPlacement
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
    // Notify round start to checkpoint service
    this.roundHandler.notifyRoundStart(roundId);
  }

  private async syncInitialBoardState(board: Board): Promise<void> {
    this.currentBoard = board;
    this.roundState = this.roundHandler.resetState();

    const roundId = board.roundId.value;
    log.info(`Round ${roundId}: Tracking (slots ${board.startSlot} → ${board.endSlot})`);

    // Clear stream and prefetcher
    this.getRoundStreamManager().clearDecisions();
    this.getPlacementPrefetcher().clear();

    // Claim and checkpoint
    await this.roundHandler.checkAndClaim(this.getBlockchain());
    await this.roundHandler.ensureCheckpoint(this.getBlockchain(), board);
  }

  private async handleRoundEnd(): Promise<void> {
    if (!this.currentBoard) return;

    const roundId = this.currentBoard.roundId.value;
    log.info(`Round ${roundId} ended`);

    const authorityKey = this.getAuthorityPublicKey();
    const miner = await this.getBlockchain().getMiner(authorityKey.toBase58());

    if (miner) {
      const delta = miner.rewardsSol;
      if (delta > 0n) {
        log.info(`Round ${roundId}: +${Number(delta) / 1e9} SOL rewards`);
      }
    }

    await this.getRoundMetricsManager()?.finalizeRounds(roundId);
    this.currentBoard = null;
    this.roundState = this.roundHandler.resetState();
  }

  private async loadLatencyHistory(): Promise<void> {
    try {
      const history = await this.getLatencyStorage().load();
      if (history.length > 0) {
        const latencyService = this.getLatencyService();
        for (const record of history) {
          latencyService.record(record.placementCount, record.prepMs, record.executionMs);
        }
        log.debug(`Loaded ${history.length} latency samples`);
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

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    log.info('Stopping ORE Smart Bot...');

    // Stop run loop first
    this.runLoop?.stop();
    if (this.stopLoopPromise) {
      await this.stopLoopPromise;
    }

    // Cleanup infrastructure
    await this.cleanupAfterLoop();

    await this.getNotificationPort().send({
      type: 'info',
      title: 'ORE Bot Stopped',
      message: 'Bot has been stopped',
    });

    this.isRunning = false;
    log.info('ORE Smart Bot stopped');
  }

  private async cleanupAfterLoop(): Promise<void> {
    this.getBlockhashCache().stop();
    this.getSlotCache().stop();

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

  getStatus(): { running: boolean; currentRound?: bigint } {
    return {
      running: this.isRunning,
      currentRound: this.currentBoard?.roundId.value,
    };
  }
}
