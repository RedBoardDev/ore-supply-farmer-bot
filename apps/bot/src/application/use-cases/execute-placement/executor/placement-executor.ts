import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { QueuedPlacement } from '@osb/bot/domain/types/round';
import type { BlockhashCache } from '@osb/bot/infrastructure/adapters/blockchain/blockhash-cache.adapter';
import type { RoundMetricsManager } from '@osb/bot/infrastructure/adapters/round/round-metrics';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import type { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { TransactionConfig } from '@osb/config';
import type { Connection, Keypair, TransactionInstruction } from '@solana/web3.js';

export interface PlacementExecutionResult {
  success: boolean;
  decision: PlacementDecision;
  signature?: string;
  error?: string;
}

export interface PlacementExecutionSummary {
  results: PlacementExecutionResult[];
  completed: number;
}

export class PlacementExecutor {
  constructor(
    private readonly transactionBuilder: TransactionBuilder,
    private readonly transactionSender: TransactionSender,
    private readonly blockhashCache: BlockhashCache,
    private readonly connection: Connection,
    private readonly authorityKeypair: Keypair,
    private readonly transactionConfig: TransactionConfig,
    private readonly logger: LoggerPort,
    private readonly roundMetricsManager?: RoundMetricsManager | null,
  ) {}

  async execute(roundId: bigint, placementsToExecute: QueuedPlacement[]): Promise<PlacementExecutionSummary> {
    let blockhashContext: { blockhash: string; lastValidBlockHeight: number };
    try {
      blockhashContext = await this.blockhashCache.getFreshBlockhash();
    } catch (error) {
      this.logger.error(`Failed to fetch blockhash for placements: ${(error as Error).message}`);
      return { results: [], completed: 0 };
    }

    const results = await Promise.all(
      placementsToExecute.map(async ({ placement }) => {
        const squareLabel = placement.decision.squareIndex + 1;
        const txStart = Date.now();

        try {
          const transaction = this.transactionBuilder.buildTransaction(placement.instructions, [
            this.authorityKeypair.publicKey,
          ]);
          transaction.recentBlockhash = blockhashContext.blockhash;

          const awaitConfirmation = this.transactionConfig.awaitConfirmation;
          const awaitProcessed = awaitConfirmation ? false : this.transactionConfig.awaitProcessed;
          const result = await this.transactionSender.send(transaction, [this.authorityKeypair], {
            useCachedBlockhash: true,
            blockhashContext,
            awaitConfirmation,
            awaitProcessed,
          });
          const txDuration = Date.now() - txStart;

          if (result.status !== 'failed') {
            const signatureLabel = result.signature ? ` - ${result.signature.slice(0, 8)}...` : '';
            const statusLabel =
              result.status === 'confirmed'
                ? 'confirmed'
                : result.status === 'processed'
                  ? 'processed'
                  : 'submitted (unconfirmed)';
            this.logger.info(`  ✓ Square #${squareLabel} ${statusLabel} (${txDuration}ms)${signatureLabel}`);

            this.roundMetricsManager?.recordPlacement(
              roundId,
              placement.decision.amountLamports,
              placement.decision.squareIndex,
            );

            return { success: true, decision: placement.decision, signature: result.signature };
          }

          this.logger.error(`  ✗ Square #${squareLabel} failed (${txDuration}ms): ${result.error ?? 'unknown error'}`);
          await this.simulatePlacement(placement.instructions, roundId, placement.decision.squareIndex);
          return { success: false, decision: placement.decision, error: result.error };
        } catch (error) {
          const txDuration = Date.now() - txStart;
          this.logger.error(`  ✗ Square #${squareLabel} failed (${txDuration}ms): ${(error as Error).message}`);
          await this.simulatePlacement(placement.instructions, roundId, placement.decision.squareIndex);
          return { success: false, decision: placement.decision, error: (error as Error).message };
        }
      }),
    );

    const completed = results.filter((result) => result.success).length;
    return { results, completed };
  }

  private async simulatePlacement(
    instructions: TransactionInstruction[],
    roundId: bigint,
    squareIndex: number,
  ): Promise<void> {
    try {
      const transaction = this.transactionBuilder.buildTransaction(instructions, [this.authorityKeypair.publicKey]);
      const blockhashContext = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhashContext.blockhash;
      transaction.sign(this.authorityKeypair);

      const simulation = await this.connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        this.logger.error(
          `Simulation error for round ${roundId} square=${squareIndex + 1}: ${JSON.stringify(simulation.value.err)}`,
        );
      }
      if (simulation.value.logs?.length) {
        this.logger.error(`Simulation logs: ${simulation.value.logs.join('\n')}`);
      }
    } catch (error) {
      this.logger.debug(`Unable to simulate placement: ${(error as Error).message}`);
    }
  }
}
