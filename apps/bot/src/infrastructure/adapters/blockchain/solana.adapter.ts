import { decodeBoardAccount, decodeMinerAccount, decodeRoundAccount } from '@osb/bot/application/decoders';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import { recordRpcRequest } from '@osb/bot/infrastructure/metrics/prometheus';
import type { ConfigSchema } from '@osb/config';
import { Board, Miner, Round, RoundId, Slot } from '@osb/domain';
import type { SolanaAddress } from '@osb/domain/aggregates/miner.aggregate';
import { type Connection, PublicKey } from '@solana/web3.js';
import { BOARD_ADDRESS, deriveMinerPda, deriveRoundPda } from '../../constants';

export class SolanaBlockchainAdapter implements BlockchainPort {
  private readonly connection: Connection;
  private readonly boardAddress: PublicKey;
  private readonly config: ConfigSchema;
  private readonly logger = createChildLogger('solana-blockchain');
  private readonly endpointLabel: string;

  constructor(connection: Connection, config: ConfigSchema) {
    this.config = config;
    this.connection = connection;
    this.boardAddress = BOARD_ADDRESS;
    this.endpointLabel = this.formatEndpointLabel(config.rpc.httpEndpoint);
  }

  private toPublicKey(address: SolanaAddress): PublicKey {
    return new PublicKey(address);
  }

  async getBoard(): Promise<Board | null> {
    return this.withRpcMetrics(
      'getBoard',
      async () => {
        const accountInfo = await this.connection.getAccountInfo(this.boardAddress, this.config.rpc.commitment);
        if (!accountInfo) return null;

        const decoded = decodeBoardAccount(accountInfo.data as Buffer);

        return Board.create(
          RoundId.create(decoded.roundId),
          Slot.create(decoded.startSlot),
          Slot.create(decoded.endSlot),
          decoded.epochId,
        );
      },
      (error) => {
        this.logger.error(`Failed to fetch board: ${(error as Error).message}`);
        return null;
      },
    );
  }

  async getRound(roundId: RoundId): Promise<Round | null> {
    return this.withRpcMetrics(
      'getRound',
      async () => {
        const roundAddress = deriveRoundPda(roundId.value);
        const accountInfo = await this.connection.getAccountInfo(roundAddress, this.config.rpc.commitment);
        if (!accountInfo) return null;

        const decoded = decodeRoundAccount(accountInfo.data as Buffer);
        return Round.create(RoundId.create(decoded.id), decoded.deployed, decoded.motherlode, decoded.expiresAt);
      },
      (error) => {
        this.logger.error(`Failed to fetch round: ${(error as Error).message}`);
        return null;
      },
    );
  }

  async getMiner(authority: SolanaAddress): Promise<Miner | null> {
    return this.withRpcMetrics(
      'getMiner',
      async () => {
        const authorityKey = this.toPublicKey(authority);
        const minerAddress = deriveMinerPda(authorityKey);
        const accountInfo = await this.connection.getAccountInfo(minerAddress, this.config.rpc.commitment);
        if (!accountInfo) return null;

        const decoded = decodeMinerAccount(accountInfo.data as Buffer);
        return Miner.create(
          authority,
          decoded.deployed,
          decoded.rewardsSol,
          decoded.rewardsOre,
          decoded.checkpointId,
          decoded.roundId,
        );
      },
      (error) => {
        this.logger.error(`Failed to fetch miner: ${(error as Error).message}`);
        return null;
      },
    );
  }

  async getBalance(publicKey: SolanaAddress): Promise<bigint> {
    return this.withRpcMetrics(
      'getBalance',
      async () => {
        const key = this.toPublicKey(publicKey);
        const lamports = await this.connection.getBalance(key, this.config.rpc.commitment);
        return BigInt(lamports);
      },
      (error) => {
        this.logger.error(`Failed to fetch balance: ${(error as Error).message}`);
        return 0n;
      },
    );
  }

  async onBoardChange(callback: (board: Board) => void): Promise<number> {
    return this.connection.onAccountChange(
      this.boardAddress,
      (accountInfo) => {
        try {
          const decoded = decodeBoardAccount(accountInfo.data as Buffer);
          const board = Board.create(
            RoundId.create(decoded.roundId),
            Slot.create(decoded.startSlot),
            Slot.create(decoded.endSlot),
            decoded.epochId,
          );
          callback(board);
        } catch (error) {
          console.error('Failed to decode board change:', error);
        }
      },
      this.config.rpc.commitment,
    );
  }

  async onSlotChange(callback: (slot: bigint) => void): Promise<number> {
    return this.connection.onSlotChange((slotInfo) => {
      callback(BigInt(slotInfo.slot));
    });
  }

  async unsubscribeBoard(subscriptionId: number): Promise<void> {
    await this.connection.removeAccountChangeListener(subscriptionId);
  }

  async unsubscribeSlot(subscriptionId: number): Promise<void> {
    await this.connection.removeSlotChangeListener(subscriptionId);
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    return this.withRpcMetrics(
      'getLatestBlockhash',
      async () => {
        const result = await this.connection.getLatestBlockhash();
        return {
          blockhash: result.blockhash,
          lastValidBlockHeight: BigInt(result.lastValidBlockHeight),
        };
      },
      (error) => {
        this.logger.error(`Failed to fetch latest blockhash: ${(error as Error).message}`);
        return {
          blockhash: '',
          lastValidBlockHeight: 0n,
        };
      },
    );
  }

  private formatEndpointLabel(endpoint: string): string {
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint;
    }
  }

  private recordRpc(method: string, status: 'success' | 'error', durationMs: number): void {
    recordRpcRequest(this.endpointLabel, method, status, durationMs / 1000);
  }

  private async withRpcMetrics<T>(method: string, action: () => Promise<T>, onError: (error: Error) => T): Promise<T> {
    const start = Date.now();
    try {
      const result = await action();
      this.recordRpc(method, 'success', Date.now() - start);
      return result;
    } catch (error) {
      this.recordRpc(method, 'error', Date.now() - start);
      return onError(error as Error);
    }
  }
}
