export interface RoundEndedEventData {
  readonly type: 'round-ended';
  readonly timestamp: number;
  readonly roundId: bigint;
  readonly winningSquare: number;
  readonly potAmount: bigint;
  readonly winnerAddress: string;
}

export function roundEndedEvent(
  roundId: bigint,
  winningSquare: number,
  potAmount: bigint,
  winnerAddress: string,
): RoundEndedEventData {
  return {
    type: 'round-ended',
    timestamp: Date.now(),
    roundId,
    winningSquare,
    potAmount,
    winnerAddress,
  };
}
