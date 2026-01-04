export interface RewardsClaimedEventData {
  readonly type: 'rewards-claimed';
  readonly timestamp: number;
  readonly roundId: bigint;
  readonly amountLamports: bigint;
}

export function rewardsClaimedEvent(roundId: bigint, amountLamports: bigint): RewardsClaimedEventData {
  return {
    type: 'rewards-claimed',
    timestamp: Date.now(),
    roundId,
    amountLamports,
  };
}
