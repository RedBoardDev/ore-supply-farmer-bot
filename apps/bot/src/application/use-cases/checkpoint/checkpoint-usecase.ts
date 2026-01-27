import type { CheckpointService } from '@osb/bot/domain/services/checkpoint.service';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import type { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { ConfigSchema } from '@osb/config';
import type { RoundId } from '@osb/domain';
import type { Keypair, PublicKey } from '@solana/web3.js';

export async function ensureCheckpoint(
  blockchain: BlockchainPort,
  roundId: RoundId,
  config: ConfigSchema,
  logger: LoggerPort,
): Promise<boolean> {
  const container = getGlobalContainer();

  try {
    const authorityKey: PublicKey = container.resolve('AuthorityPublicKey');
    const authorityAddress = authorityKey.toBase58();
    const miner = await blockchain.getMiner(authorityAddress);

    if (!miner) {
      logger.warn('Miner account not found, skipping checkpoint');
      return false;
    }

    const checkpointService = container.resolve<CheckpointService>('CheckpointService');
    const needsCheckpoint = checkpointService.needsCheckpoint(miner, roundId);

    if (!needsCheckpoint) {
      return true;
    }

    // Use CheckpointService.ensureCheckpoint with inflight tracking
    const checkpointSubmitted = await checkpointService.ensureCheckpoint(
      miner,
      roundId,
      authorityAddress,
      async (_instructionData: Uint8Array) => {
        logger.info(`Sending checkpoint for round ${miner.roundId}`);
        const transactionBuilder = container.resolve<TransactionBuilder>('TransactionBuilder');
        const transactionSender = container.resolve<TransactionSender>('TransactionSender');
        const keypair = container.resolve<Keypair>('AuthorityKeypair');

        const checkpointIx = transactionBuilder.buildCheckpointInstruction({
          authority: authorityKey,
          roundId: miner.roundId,
        });

        const transaction = transactionBuilder.buildTransaction([checkpointIx], [keypair.publicKey]);
        const blockhash = await blockchain.getLatestBlockhash();
        transaction.recentBlockhash = blockhash.blockhash;

        const result = await transactionSender.send(transaction, [keypair], {
          // Match old code: don't wait for processed
          awaitConfirmation: false,
          awaitProcessed: false,
          confirmationCommitment: config.transaction.confirmationMode,
        });

        if (result.status === 'failed') {
          throw new Error(result.error ?? 'Checkpoint transaction failed');
        }

        // Wait for checkpoint to be processed before proceeding
        // This prevents deploy from failing with "Miner has not checkpointed"
        await new Promise(resolve => setTimeout(resolve, 1500));

        return { signature: result.signature };
      },
    );

    if (!checkpointSubmitted) {
      logger.warn('Checkpoint was not submitted (may already be in progress)');
    }
    return checkpointSubmitted;
  } catch (error) {
    logger.error('Error during checkpoint', error as Error);
    return false;
  }
}
