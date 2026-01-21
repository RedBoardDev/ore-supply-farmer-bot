import type { BoardAccount } from '@osb/bot/application/decoders';
import type { PricePort } from '@osb/bot/domain/services/ports/price.port';
import type { RoundState } from '@osb/bot/domain/types/round';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import { IoCmoduleRegistry } from '@osb/bot/infrastructure/di/module-registry';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import { Board, RoundId, Slot } from '@osb/domain';
import type { Connection } from '@solana/web3.js';
import { RoundHandler } from '../use-cases';
import { AttemptPlacement } from '../use-cases/execute-placement/executor/attempt-placement';
import { OreBot } from './ore-bot';
import { RunLoop } from './run-loop';

const log = createChildLogger('core');
const MAX_U64 = BigInt('18446744073709551615');

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

    // Start run loop in background
    this.startRunLoop();

    // Notify start
    await this.getNotificationPort().send({
      type: 'info',
      title: 'ORE Bot Started',
      message: 'Bot started',
    });

    this.isRunning = true;
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

  getStatus(): { running: boolean; currentRound?: bigint } {
    return {
      running: this.isRunning,
      currentRound: this.currentBoard?.roundId.value,
    };
  }
}
