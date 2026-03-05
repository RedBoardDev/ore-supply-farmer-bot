import { ORE_BOARD_SIZE } from '@osb/bot/infrastructure/constants';
import { Miner } from '@osb/domain';

export interface MinerBuilderParams {
  authority?: string;
  deployed?: readonly bigint[];
  rewardsSol?: bigint;
  rewardsOre?: bigint;
  checkpointId?: bigint;
  roundId?: bigint;
}

export function buildMiner(params: MinerBuilderParams = {}): Miner {
  const deployed = params.deployed ?? Array.from({ length: ORE_BOARD_SIZE }, () => 0n);

  return Miner.create(
    params.authority ?? 'miner-test',
    deployed,
    params.rewardsSol ?? 0n,
    params.rewardsOre ?? 0n,
    params.checkpointId ?? 0n,
    params.roundId ?? 1n,
  );
}
