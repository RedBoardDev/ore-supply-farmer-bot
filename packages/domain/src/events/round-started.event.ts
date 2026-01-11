export interface RoundStartedEventData {
  readonly type: 'round-started';
  readonly timestamp: number;
  readonly roundId: bigint;
  readonly startSlot: bigint;
  readonly endSlot: bigint;
  readonly epochId: bigint;
}

export function roundStartedEvent(
  roundId: bigint,
  startSlot: bigint,
  endSlot: bigint,
  epochId: bigint,
): RoundStartedEventData {
  return {
    type: 'round-started',
    timestamp: Date.now(),
    roundId,
    startSlot,
    endSlot,
    epochId,
  };
}
