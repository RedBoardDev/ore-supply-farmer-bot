export interface PlacementExecutedEventData {
  readonly type: 'placement-executed';
  readonly timestamp: number;
  readonly roundId: bigint;
  readonly squares: number[];
  readonly amountLamports: bigint;
  readonly signature: string;
}

export function placementExecutedEvent(
  roundId: bigint,
  squares: number[],
  amountLamports: bigint,
  signature: string
): PlacementExecutedEventData {
  return {
    type: 'placement-executed',
    timestamp: Date.now(),
    roundId,
    squares,
    amountLamports,
    signature,
  };
}
