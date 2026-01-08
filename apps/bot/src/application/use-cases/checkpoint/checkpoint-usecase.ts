import type { CheckpointService } from '@osb/bot/domain/services/checkpoint.service';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import type { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { ConfigSchema } from '@osb/config';
import type { Board } from '@osb/domain';
import type { Keypair, PublicKey } from '@solana/web3.js';

export async function ensureCheckpoint(
  blockchain: BlockchainPort,
  board: Board,
  config: ConfigSchema,
  logger: LoggerPort
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
    const needsCheckpoint = checkpointService.needsCheckpoint(miner, board.roundId);

    if (!needsCheckpoint) {
      logger.debug('Checkpoint not needed');
      return true;
    }

    logger.info(`Miner needs checkpoint (current: ${miner.checkpointId}, target: ${board.roundId.value})`);

    if (config.runtime.dryRun) {
      logger.info('[DRY RUN] Would submit checkpoint');
      return true;
    }

    // Use CheckpointService.ensureCheckpoint with inflight tracking
    const checkpointSubmitted = await checkpointService.ensureCheckpoint(
      miner,
      board.roundId,
      authorityAddress,
      async (_instructionData: Uint8Array) => {
        const transactionBuilder = container.resolve<TransactionBuilder>('TransactionBuilder');
        const transactionSender = container.resolve<TransactionSender>('TransactionSender');
        const keypair = container.resolve<Keypair>('AuthorityKeypair');

        const checkpointIx = transactionBuilder.buildCheckpointInstruction({
          authority: authorityKey,
          roundId: board.roundId.value,
        });

        const transaction = transactionBuilder.buildTransaction([checkpointIx], [keypair.publicKey]);
        const blockhash = await blockchain.getLatestBlockhash();
        transaction.recentBlockhash = blockhash.blockhash;

        const result = await transactionSender.send(transaction, [keypair]);

        if (!result.confirmed) {
          throw new Error(result.error ?? 'Checkpoint transaction failed');
        }

        return { signature: result.signature };
      }
    );

    if (checkpointSubmitted) {
      logger.info('Checkpoint submitted successfully');
      return true;
    } else {
      logger.warn('Checkpoint was not submitted (may already be in progress)');
      return false;
    }
  } catch (error) {
    logger.error('Error during checkpoint', error as Error);
    return false;
  }
}
