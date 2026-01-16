import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { PreparedPlacement } from '@osb/bot/domain/types/prepared-placement';
import type { InstructionCache } from '@osb/bot/infrastructure/adapters/cache/instruction-cache.adapter';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import { INSTRUCTION_CACHE_LIMIT } from '@osb/bot/infrastructure/constants';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { ConfigSchema } from '@osb/config';
import { ComputeBudgetProgram, type Connection, type PublicKey, type TransactionInstruction } from '@solana/web3.js';

export class PlacementInstructionsBuilder {
  constructor(
    private readonly config: ConfigSchema,
    private readonly instructionCache: InstructionCache,
    private readonly transactionBuilder: TransactionBuilder,
    private readonly authorityPublicKey: PublicKey,
    private readonly connection: Connection,
    private readonly logger: LoggerPort,
  ) {}

  async prepare(
    roundId: bigint,
    decisions: PlacementDecision[],
    limit: number = INSTRUCTION_CACHE_LIMIT,
  ): Promise<PreparedPlacement[]> {
    const prepared: PreparedPlacement[] = [];
    const slice = decisions.slice(0, Math.max(1, limit));

    for (const decision of slice) {
      try {
        const instructions = await this.buildForDecision(roundId, decision);
        prepared.push({ decision, instructions });
      } catch (error) {
        this.logger.error(`Failed to prepare square #${decision.squareIndex + 1}: ${(error as Error).message}`);
        return [];
      }
    }

    return prepared;
  }

  async buildForDecision(roundId: bigint, decision: PlacementDecision): Promise<TransactionInstruction[]> {
    const entropyVar = await this.transactionBuilder.getEntropyVar(this.connection);
    const entropyVarKey = entropyVar.toBase58();
    const key = this.getInstructionCacheKey(roundId, decision.squareIndex, decision.amountLamports, entropyVarKey);
    const cached = this.instructionCache.get(key);
    if (cached) {
      return cached;
    }

    const instructions: TransactionInstruction[] = [];

    if (this.config.transaction.computeUnitLimit > 0) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: this.config.transaction.computeUnitLimit,
        }),
      );
    }

    if (this.config.transaction.priorityFeeMicrolamports > 0) {
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: this.config.transaction.priorityFeeMicrolamports,
        }),
      );
    }

    const deployIx = await this.transactionBuilder.buildDeployInstruction(
      {
        executor: this.authorityPublicKey,
        authority: this.authorityPublicKey,
        roundId,
        amountLamports: decision.amountLamports,
        targetSquares: [decision.squareIndex],
        entropyVar,
      },
      this.connection,
    );

    instructions.push(deployIx);
    this.instructionCache.set(key, instructions);
    return instructions;
  }

  private getInstructionCacheKey(
    roundId: bigint,
    squareIndex: number,
    amountLamports: bigint,
    entropyVarKey: string,
  ): string {
    return `${roundId.toString()}:${squareIndex}:${amountLamports.toString()}:${entropyVarKey}`;
  }
}
