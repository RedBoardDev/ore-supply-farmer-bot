import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { ConfigSchema } from '@osb/config';
import { type Board, Miner, Round, RoundId } from '@osb/domain';
import type { SolanaAddress } from '@osb/domain/aggregates/miner.aggregate';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BOARD_ADDRESS, ORE_PROGRAM_ID } from '../../constants';

export class SolanaBlockchainAdapter implements BlockchainPort {
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly boardAddress: PublicKey;
  private readonly config: ConfigSchema;

  constructor(config: ConfigSchema) {
    this.config = config;
    this.connection = new Connection(
      config.rpc.httpEndpoint,
      { commitment: config.rpc.commitment }
    );
    this.programId = ORE_PROGRAM_ID;
    this.boardAddress = BOARD_ADDRESS;
  }

  private toPublicKey(address: SolanaAddress): PublicKey {
    return new PublicKey(address);
  }

  async getBoard(): Promise<Board | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(this.boardAddress);
      if (!accountInfo) return null;

      const data = accountInfo.data;
      const roundId = BigInt(data.readBigUInt64LE(8));
      const startSlot = BigInt(data.readBigUInt64LE(16));
      const endSlot = BigInt(data.readBigUInt64LE(24));
      const epochId = BigInt(data.readBigUInt64LE(32));

      return {
        roundId: RoundId.create(roundId),
        startSlot: { value: startSlot },
        endSlot: { value: endSlot },
        epochId,
      } as Board;
    } catch (error) {
      console.error('Failed to fetch board:', error);
      return null;
    }
  }

  async getRound(roundId: RoundId): Promise<Round | null> {
    try {
      const roundAddress = this.deriveRoundPda(roundId.value);
      const accountInfo = await this.connection.getAccountInfo(roundAddress);
      if (!accountInfo) return null;

      const data = accountInfo.data;
      const deployed: bigint[] = [];
      let offset = 16; // Skip discriminator + id

      for (let i = 0; i < 25; i++) {
        deployed.push(data.readBigUInt64LE(offset));
        offset += 8;
      }

      offset += 32; // Skip slotHash
      offset += 200; // Skip counts

      const expiresAt = data.readBigUInt64LE(offset);
      const motherlode = data.readBigUInt64LE(offset + 8);

      return Round.create(roundId, deployed, motherlode, expiresAt);
    } catch (error) {
      console.error('Failed to fetch round:', error);
      return null;
    }
  }

  async getMiner(authority: SolanaAddress): Promise<Miner | null> {
    try {
      const authorityKey = this.toPublicKey(authority);
      const minerAddress = this.deriveMinerPda(authorityKey);
      const accountInfo = await this.connection.getAccountInfo(minerAddress);
      if (!accountInfo) return null;

      const data = accountInfo.data;
      const deployed: bigint[] = [];
      let offset = 40; // Skip discriminator + authority

      for (let i = 0; i < 25; i++) {
        deployed.push(data.readBigUInt64LE(offset));
        offset += 8;
      }

      offset += 200; // Skip cumulative
      offset += 8; // Skip checkpointFee

      const checkpointId = data.readBigUInt64LE(offset);
      offset += 8;
      offset += 16; // Skip rewards_factor

      const rewardsSol = data.readBigUInt64LE(offset);
      offset += 8;
      offset += 16; // Skip rewardsOre + refinedOre

      const roundId = data.readBigUInt64LE(offset);

      return Miner.create(authority, deployed, rewardsSol, checkpointId, roundId);
    } catch (error) {
      console.error('Failed to fetch miner:', error);
      return null;
    }
  }

  async getBalance(publicKey: SolanaAddress): Promise<bigint> {
    try {
      const key = this.toPublicKey(publicKey);
      const lamports = await this.connection.getBalance(key);
      return BigInt(lamports);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return 0n;
    }
  }

  async submitTransaction(
    instructions: Uint8Array[],
    options?: { skipPreflight?: boolean; confirmationCommitment?: string }
  ): Promise<{ signature: string; confirmed: boolean }> {
    try {
      const transaction = new Transaction();
      for (const instruction of instructions) {
        transaction.add(new TransactionInstruction({
          programId: this.programId,
          data: Buffer.from(instruction),
          keys: [], // Keys should be provided with the instruction
        }));
      }

      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: options?.skipPreflight ?? true,
          preflightCommitment: this.config.rpc.commitment,
        }
      );

      const commitment = (options?.confirmationCommitment ?? this.config.rpc.commitment) as 'confirmed' | 'finalized' | 'processed';
      const confirmation = await this.connection.confirmTransaction(signature, commitment);

      return {
        signature,
        confirmed: !confirmation.value.err,
      };
    } catch (error) {
      console.error('Failed to submit transaction:', error);
      throw error;
    }
  }

  async onBoardChange(callback: (board: Board) => void): Promise<number> {
    return this.connection.onAccountChange(
      this.boardAddress,
      (accountInfo) => {
        const data = accountInfo.data;
        const roundId = BigInt(data.readBigUInt64LE(8));
        const startSlot = BigInt(data.readBigUInt64LE(16));
        const endSlot = BigInt(data.readBigUInt64LE(24));
        const epochId = BigInt(data.readBigUInt64LE(32));

        callback({
          roundId: RoundId.create(roundId),
          startSlot: { value: startSlot },
          endSlot: { value: endSlot },
          epochId,
        } as Board);
      },
      this.config.rpc.commitment
    );
  }

  async onSlotChange(callback: (slot: bigint) => void): Promise<number> {
    return this.connection.onSlotChange((slotInfo) => {
      callback(BigInt(slotInfo.slot));
    });
  }

  async unsubscribe(subscriptionId: number): Promise<void> {
    await this.connection.removeSlotChangeListener(subscriptionId);
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }> {
    const result = await this.connection.getLatestBlockhash();
    return {
      blockhash: result.blockhash,
      lastValidBlockHeight: BigInt(result.lastValidBlockHeight),
    };
  }

  // PDA derivation helpers
  private deriveRoundPda(roundId: bigint): PublicKey {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(roundId);
    return PublicKey.findProgramAddressSync(
      [Buffer.from('round'), idBuffer],
      this.programId
    )[0];
  }

  private deriveMinerPda(authority: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('miner'), authority.toBuffer()],
      this.programId
    )[0];
  }
}
