import { decodeBoardAccount, decodeMinerAccount, decodeRoundAccount } from '@osb/bot/application/decoders';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { ConfigSchema } from '@osb/config';
import { Board, Miner, Round, RoundId, Slot } from '@osb/domain';
import type { SolanaAddress } from '@osb/domain/aggregates/miner.aggregate';
import { type Connection, PublicKey } from '@solana/web3.js';
import { BOARD_ADDRESS, deriveMinerPda, deriveRoundPda } from '../../constants';

export class SolanaBlockchainAdapter implements BlockchainPort {
  private readonly connection: Connection;
  private readonly boardAddress: PublicKey;
  private readonly config: ConfigSchema;

  constructor(connection: Connection, config: ConfigSchema) {
    this.config = config;
    this.connection = connection;
    this.boardAddress = BOARD_ADDRESS;
  }

  private toPublicKey(address: SolanaAddress): PublicKey {
    return new PublicKey(address);
  }

  async getBoard(): Promise<Board | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(this.boardAddress, this.config.rpc.commitment);
      if (!accountInfo) return null;

      const decoded = decodeBoardAccount(accountInfo.data as Buffer);

      return Board.create(
        RoundId.create(decoded.roundId),
        Slot.create(decoded.startSlot),
        Slot.create(decoded.endSlot),
        decoded.epochId,
      );
    } catch (error) {
      console.error('Failed to fetch board:', error);
      return null;
    }
  }

  async getRound(roundId: RoundId): Promise<Round | null> {
    try {
      const roundAddress = deriveRoundPda(roundId.value);
      const accountInfo = await this.connection.getAccountInfo(roundAddress, this.config.rpc.commitment);
      if (!accountInfo) return null;

      const decoded = decodeRoundAccount(accountInfo.data as Buffer);
      return Round.create(RoundId.create(decoded.id), decoded.deployed, decoded.motherlode, decoded.expiresAt);
    } catch (error) {
      console.error('Failed to fetch round:', error);
      return null;
    }
  }

  async getMiner(authority: SolanaAddress): Promise<Miner | null> {
    try {
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
    } catch (error) {
      console.error('Failed to fetch miner:', error);
      return null;
    }
  }

  async getBalance(publicKey: SolanaAddress): Promise<bigint> {
    try {
      const key = this.toPublicKey(publicKey);
      const lamports = await this.connection.getBalance(key, this.config.rpc.commitment);
      return BigInt(lamports);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return 0n;
    }
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
    const result = await this.connection.getLatestBlockhash();
    return {
      blockhash: result.blockhash,
      lastValidBlockHeight: BigInt(result.lastValidBlockHeight),
    };
  }
}
