import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import type { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { ConfigSchema } from '@osb/config';
import { rewardsClaimedEvent } from '@osb/domain';
import type { Keypair, PublicKey } from '@solana/web3.js';

export async function checkAndClaim(
  blockchain: BlockchainPort,
  config: ConfigSchema,
  logger: LoggerPort
): Promise<bigint> {
  if (config.runtime.dryRun) {
    logger.info('[DRY RUN] Would check for claims');
    return 0n;
  }

  const container = getGlobalContainer();

  try {
    const authorityKey: PublicKey = container.resolve('AuthorityPublicKey');
    const authorityAddress = authorityKey.toBase58();
    const miner = await blockchain.getMiner(authorityAddress);

    if (!miner) {
      logger.warn('Miner account not found, cannot claim');
      return 0n;
    }

    const rewardsSol = miner.rewardsSol;
    const thresholdLamports = BigInt(Math.floor(config.claim.thresholdSol * 1e9));

    if (rewardsSol < thresholdLamports) {
      return 0n;
    }

    const claimStart = Date.now();
    logger.info(`Claiming ${Number(rewardsSol) / 1e9} SOL rewards`);

    const transactionBuilder = container.resolve<TransactionBuilder>('TransactionBuilder');
    const transactionSender = container.resolve<TransactionSender>('TransactionSender');
    const keypair = container.resolve<Keypair>('AuthorityKeypair');

    const claimIx = transactionBuilder.buildClaimSolInstruction({ authority: authorityKey });
    const transaction = transactionBuilder.buildTransaction([claimIx], [keypair.publicKey]);
    const blockhash = await blockchain.getLatestBlockhash();
    transaction.recentBlockhash = blockhash.blockhash;

    const result = await transactionSender.send(transaction, [keypair]);

    if (result.confirmed) {
      const claimDuration = Date.now() - claimStart;
      const event = rewardsClaimedEvent(miner.roundId, rewardsSol);
      const notifier = container.resolve('NotificationPort') as any;
      await notifier.send({
        type: 'success',
        title: 'Rewards Claimed',
        message: `Claimed ${Number(rewardsSol) / 1e9} SOL`,
        data: event as unknown as Record<string, unknown>,
      });

      // Update baseline rewards for accurate PnL calculation
      try {
        const roundMetricsManager = container.resolve<any>('RoundMetricsManager');
        if (roundMetricsManager) {
          roundMetricsManager.handleClaimedRewards(rewardsSol);
        }
      } catch { }

      logger.info(`Rewards claimed successfully (${claimDuration}ms)`);
      return rewardsSol;
    } else {
      logger.error(`Claim failed: ${result.error}`);
      return 0n;
    }
  } catch (error) {
    logger.error('Error during claim check', error as Error);
    return 0n;
  }
}
