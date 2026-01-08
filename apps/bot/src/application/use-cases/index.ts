import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { PlacementDecision } from '@osb/bot/domain/services/ports/ev-strategy.port';
import type { RoundState } from '@osb/bot/domain/types/round';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { ConfigSchema } from '@osb/config';
import type { Board, Round } from '@osb/domain';
import { ensureCheckpoint } from './checkpoint/checkpoint-usecase';
import { checkAndClaim } from './claim-rewards/claim-usecase';
import { evaluatePlacements } from './execute-placement/evaluator/placement-evaluator';
import { resetRoundState } from './monitor-round/round-state';
import { notifyRoundStart } from './notification/notify';

const log = createChildLogger('round-handler');

export class RoundHandler {
  private config: ConfigSchema;

  constructor(config: ConfigSchema) {
    this.config = config;
  }

  /**
   * Notify that a new round has started.
   */
  notifyRoundStart(roundId: bigint): void {
    notifyRoundStart(roundId, log);
  }

  /**
   * Check and claim rewards if eligible.
   */
  async checkAndClaim(blockchain: BlockchainPort): Promise<bigint> {
    return checkAndClaim(blockchain, this.config, log);
  }

  /**
   * Ensure checkpoint is submitted.
   */
  async ensureCheckpoint(blockchain: BlockchainPort, board: Board): Promise<boolean> {
    return ensureCheckpoint(blockchain, board, this.config, log);
  }

  /**
   * Evaluate and generate placement decisions.
   */
  async evaluatePlacements(
    blockchain: BlockchainPort,
    board: Board,
    round: Round
  ): Promise<PlacementDecision[]> {
    return evaluatePlacements(blockchain, board, round, log);
  }

  /**
   * Reset round state for new round.
   */
  resetState(): RoundState {
    return resetRoundState();
  }
}
