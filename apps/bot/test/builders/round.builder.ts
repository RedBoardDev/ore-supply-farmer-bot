import { ORE_BOARD_SIZE } from '@osb/bot/infrastructure/constants';
import { Round, RoundId } from '@osb/domain';

export interface RoundBuilderParams {
  id?: bigint;
  deployed?: readonly bigint[];
  motherlode?: bigint;
  expiresAt?: bigint;
}

export function buildRound(params: RoundBuilderParams = {}): Round {
  const deployed = params.deployed ?? Array.from({ length: ORE_BOARD_SIZE }, () => 0n);

  return Round.create(RoundId.create(params.id ?? 1n), deployed, params.motherlode ?? 0n, params.expiresAt ?? 0n);
}
