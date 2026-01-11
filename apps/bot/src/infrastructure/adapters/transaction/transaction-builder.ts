import { PublicKey as SolanaPublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { deriveConfigPda, ENTROPY_PROGRAM_ID, ORE_PROGRAM_ID } from '../../constants';
import {
  type CheckpointParams,
  type ClaimSolParams,
  type ConfigAccount,
  type DeployParams,
  OreInstruction,
} from './types';

export class TransactionBuilder {
  private readonly programId: SolanaPublicKey;
  private cachedConfig: { data: ConfigAccount; fetchedAt: number } | null = null;

  constructor() {
    this.programId = ORE_PROGRAM_ID;
  }

  /**
   * Get the entropy var address from the config account.
   * Cached for 5 minutes to avoid repeated RPC calls.
   */
  async getEntropyVar(connection: {
    getAccountInfo: (pubkey: SolanaPublicKey) => Promise<{ data: Buffer } | null>;
  }): Promise<SolanaPublicKey> {
    const now = Date.now();
    if (this.cachedConfig && now - this.cachedConfig.fetchedAt < 5 * 60_000) {
      return this.cachedConfig.data.varAddress;
    }

    const configAddress = deriveConfigPda();
    const accountInfo = await connection.getAccountInfo(configAddress);

    if (!accountInfo) {
      throw new Error('Config account not found');
    }

    // Config account layout: varAddress (32 bytes) at offset 8
    const varAddress = new SolanaPublicKey(accountInfo.data.subarray(8, 40));

    this.cachedConfig = {
      data: { varAddress },
      fetchedAt: now,
    };

    return varAddress;
  }

  /**
   * Clear the config cache (call when program config changes).
   */
  clearConfigCache(): void {
    this.cachedConfig = null;
  }

  buildCheckpointInstruction(params: CheckpointParams): TransactionInstruction {
    const minerAddress = this.deriveMinerPda(params.authority);
    const roundAddress = this.deriveRoundPda(params.roundId);
    const boardAddress = this.deriveBoardPda();
    const treasuryAddress = this.deriveTreasuryPda();

    return new TransactionInstruction({
      programId: this.programId,
      data: Buffer.from([OreInstruction.Checkpoint]),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: false },
        { pubkey: boardAddress, isSigner: false, isWritable: false },
        { pubkey: minerAddress, isSigner: false, isWritable: true },
        { pubkey: roundAddress, isSigner: false, isWritable: true },
        { pubkey: treasuryAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
  }

  async buildDeployInstruction(
    params: DeployParams,
    connection: { getAccountInfo: (pubkey: SolanaPublicKey) => Promise<{ data: Buffer } | null> },
  ): Promise<TransactionInstruction> {
    if (params.targetSquares.length === 0) {
      throw new Error('targetSquares cannot be empty');
    }

    let mask = 0;
    for (const index of params.targetSquares) {
      if (index < 0 || index > 24) {
        throw new Error(`Square index ${index} out of range`);
      }
      mask |= 1 << index;
    }

    const minerAddress = this.deriveMinerPda(params.authority);
    const roundAddress = this.deriveRoundPda(params.roundId);
    const boardAddress = this.deriveBoardPda();
    const configAddress = this.deriveConfigPda();
    const automationAddress = this.deriveAutomationPda(params.authority);

    // Get entropy var from config account
    const entropyVarAddress = params.entropyVar ?? (await this.getEntropyVar(connection));

    const data = Buffer.alloc(1 + 8 + 4);
    data.writeUInt8(OreInstruction.Deploy, 0);
    data.writeBigUInt64LE(params.amountLamports, 1);
    data.writeUInt32LE(mask, 1 + 8);

    return new TransactionInstruction({
      programId: this.programId,
      data,
      keys: [
        { pubkey: params.executor, isSigner: true, isWritable: true },
        { pubkey: params.authority, isSigner: false, isWritable: true },
        { pubkey: automationAddress, isSigner: false, isWritable: true },
        { pubkey: boardAddress, isSigner: false, isWritable: true },
        { pubkey: configAddress, isSigner: false, isWritable: true },
        { pubkey: minerAddress, isSigner: false, isWritable: true },
        { pubkey: roundAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.programId, isSigner: false, isWritable: false },
        { pubkey: entropyVarAddress, isSigner: false, isWritable: true },
        { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
    });
  }

  buildClaimSolInstruction(params: ClaimSolParams): TransactionInstruction {
    const minerAddress = this.deriveMinerPda(params.authority);

    return new TransactionInstruction({
      programId: this.programId,
      data: Buffer.from([OreInstruction.ClaimSol]),
      keys: [
        { pubkey: params.authority, isSigner: true, isWritable: true },
        { pubkey: minerAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    });
  }

  buildTransaction(instructions: TransactionInstruction[], signers: SolanaPublicKey[]): Transaction {
    const transaction = new Transaction();
    for (const instruction of instructions) {
      transaction.add(instruction);
    }
    transaction.feePayer = signers[0];
    return transaction;
  }

  private deriveBoardPda(): SolanaPublicKey {
    return SolanaPublicKey.findProgramAddressSync([Buffer.from('board')], this.programId)[0];
  }

  private deriveRoundPda(roundId: bigint): SolanaPublicKey {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(roundId);
    return SolanaPublicKey.findProgramAddressSync([Buffer.from('round'), idBuffer], this.programId)[0];
  }

  private deriveMinerPda(authority: SolanaPublicKey): SolanaPublicKey {
    return SolanaPublicKey.findProgramAddressSync([Buffer.from('miner'), authority.toBuffer()], this.programId)[0];
  }

  private deriveAutomationPda(authority: SolanaPublicKey): SolanaPublicKey {
    return SolanaPublicKey.findProgramAddressSync([Buffer.from('automation'), authority.toBuffer()], this.programId)[0];
  }

  private deriveTreasuryPda(): SolanaPublicKey {
    return SolanaPublicKey.findProgramAddressSync([Buffer.from('treasury')], this.programId)[0];
  }

  private deriveConfigPda(): SolanaPublicKey {
    return deriveConfigPda();
  }
}
