import { EventEmitter } from 'node:events';
import {
  type BoardAccount,
  decodeBoardAccount,
  decodeRoundAccount,
  type RoundAccount,
} from '@osb/bot/application/decoders';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { Commitment, Connection } from '@solana/web3.js';
import { BOARD_ADDRESS, deriveRoundPda } from '../../constants';

interface AccountFetchResult<T> {
  pubkey: string;
  slot: number;
  data: T;
}

type BoardEvents = 'board';

export interface BoardWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  getBoardSnapshot(): AccountFetchResult<BoardAccount> | null;
  getRoundSnapshot(): AccountFetchResult<RoundAccount> | null;
  waitForInitialBoard(): Promise<void>;
  ensureRoundLoaded(roundId: bigint): Promise<void>;
  on(event: BoardEvents, callback: (snapshot: AccountFetchResult<BoardAccount>) => void): this;
}

interface BoardWatcherOptions {
  connection: Connection;
  commitment: Commitment;
}

const log = createChildLogger('board-watcher');

const MAX_U64 = BigInt('18446744073709551615');

export class BoardWatcherAdapter extends EventEmitter implements BoardWatcher {
  private boardSubscription: number | null = null;
  private roundSubscription: number | null = null;
  private currentBoard: AccountFetchResult<BoardAccount> | null = null;
  private currentRound: AccountFetchResult<RoundAccount> | null = null;
  private currentRoundId: bigint | null = null;
  private readonly initialBoardPromise: Promise<void>;
  private resolveInitialBoard: (() => void) | null = null;
  private started = false;

  constructor(private readonly options: BoardWatcherOptions) {
    super();
    this.initialBoardPromise = new Promise<void>((resolve) => {
      this.resolveInitialBoard = resolve;
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    await this.seedBoardSnapshot();
    await this.subscribeBoard();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    if (this.boardSubscription !== null) {
      await this.options.connection.removeAccountChangeListener(this.boardSubscription).catch(() => {});
      this.boardSubscription = null;
    }
    if (this.roundSubscription !== null) {
      await this.options.connection.removeAccountChangeListener(this.roundSubscription).catch(() => {});
      this.roundSubscription = null;
    }
    this.started = false;
  }

  getBoardSnapshot(): AccountFetchResult<BoardAccount> | null {
    return this.currentBoard;
  }

  getRoundSnapshot(): AccountFetchResult<RoundAccount> | null {
    return this.currentRound;
  }

  async waitForInitialBoard(): Promise<void> {
    await this.initialBoardPromise;
  }

  async ensureRoundLoaded(roundId: bigint): Promise<void> {
    if (this.currentRound && this.currentRoundId === roundId) {
      return;
    }
    await this.fetchRoundSnapshot(roundId).catch((error) => {
      log.debug(`Unable to prefetch round ${roundId.toString()}: ${(error as Error).message}`);
    });
  }

  private async seedBoardSnapshot(): Promise<void> {
    const account = await this.options.connection.getAccountInfoAndContext(BOARD_ADDRESS, this.options.commitment);
    if (!account.value) {
      throw new Error('Board account not found on-chain');
    }
    this.applyBoardUpdate(account.value.data as Buffer, account.context.slot);
  }

  private async subscribeBoard(): Promise<void> {
    this.boardSubscription = this.options.connection.onAccountChange(
      BOARD_ADDRESS,
      (accountInfo, ctx) => {
        try {
          this.applyBoardUpdate(accountInfo.data as Buffer, ctx.slot);
        } catch (error) {
          log.warn(`Failed to process board update: ${(error as Error).message}`);
        }
      },
      this.options.commitment,
    );
  }

  private applyBoardUpdate(data: Buffer, slot: number): void {
    const board = decodeBoardAccount(data);
    const snapshot: AccountFetchResult<BoardAccount> = {
      pubkey: BOARD_ADDRESS.toBase58(),
      slot,
      data: board,
    };
    this.currentBoard = snapshot;
    if (this.resolveInitialBoard) {
      this.resolveInitialBoard();
      this.resolveInitialBoard = null;
    }
    this.emit('board', snapshot);
    if (this.currentRoundId === null || this.currentRoundId !== board.roundId) {
      void this.subscribeRound(board.roundId);
    }
  }

  private async subscribeRound(roundId: bigint): Promise<void> {
    this.currentRoundId = roundId;
    const roundAddress = deriveRoundPda(roundId);
    if (this.roundSubscription !== null) {
      await this.options.connection.removeAccountChangeListener(this.roundSubscription).catch(() => {});
      this.roundSubscription = null;
    }
    // this.currentRoundAddress = roundAddress;
    await this.fetchRoundSnapshot(roundId).catch(() => {
      // round account might not exist yet
    });
    this.roundSubscription = this.options.connection.onAccountChange(
      roundAddress,
      (accountInfo, ctx) => {
        try {
          const decoded = decodeRoundAccount(accountInfo.data as Buffer);
          this.currentRound = {
            pubkey: roundAddress.toBase58(),
            slot: ctx.slot,
            data: decoded,
          };
        } catch (error) {
          log.warn(`Failed to decode round ${roundId.toString()} update: ${(error as Error).message}`);
        }
      },
      this.options.commitment,
    );
  }

  private async fetchRoundSnapshot(roundId: bigint): Promise<void> {
    const roundAddress = deriveRoundPda(roundId);
    const account = await this.options.connection.getAccountInfoAndContext(roundAddress, this.options.commitment);
    if (!account.value) {
      return;
    }
    this.currentRound = {
      pubkey: roundAddress.toBase58(),
      slot: account.context.slot,
      data: decodeRoundAccount(account.value.data as Buffer),
    };
  }
}

export function isBoardReady(board: BoardAccount): boolean {
  return board.endSlot > board.startSlot && board.endSlot < MAX_U64;
}
