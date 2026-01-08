import type { EvStrategyService } from '@osb/bot/domain/services/ev-strategy.service';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { PricePort } from '@osb/bot/domain/services/ports/price.port';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';
import type { Board, Round } from '@osb/domain';
import type { PublicKey } from '@solana/web3.js';

export async function evaluatePlacements(
  blockchain: BlockchainPort,
  board: Board,
  round: Round,
  logger: LoggerPort
): Promise<PlacementDecision[]> {
  const container = getGlobalContainer();

  try {
    const evStrategy = container.resolve<EvStrategyService>('EvStrategyService');
    const authorityKey: PublicKey = container.resolve('AuthorityPublicKey');
    const balance = await blockchain.getBalance(authorityKey.toBase58());

    const miner = await blockchain.getMiner(authorityKey.toBase58());
    if (!miner) {
      logger.warn('Miner not found, cannot evaluate placements');
      return [];
    }

    const pricePort = container.resolve<PricePort>('PricePort');
    let price = pricePort.getPrice();
    if (!price) {
      price = await pricePort.refresh();
    }

    const orePerSol = price?.orePerSol ?? 0.5;
    const netOrePerSol = price?.netOrePerSol ?? orePerSol * 0.9;

    logger.debug(`Using price: ${orePerSol} ORE/SOL`);

    const decisions = evStrategy.calculateDecisions(
      board,
      round,
      miner,
      orePerSol,
      netOrePerSol,
      balance
    );

    if (decisions.length === 0) {
      logger.debug('No profitable placements found');
    } else {
      logger.info(`Generated ${decisions.length} placement decisions`);
    }

    return decisions;
  } catch (error) {
    logger.error('Error evaluating placements', error as Error);
    return [];
  }
}
