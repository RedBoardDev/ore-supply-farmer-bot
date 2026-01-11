export interface CheckpointCompletedEventData {
  readonly type: 'checkpoint-completed';
  readonly timestamp: number;
  readonly roundId: bigint;
  readonly minerAuthority: string;
  readonly checkpointId: bigint;
}

export function checkpointCompletedEvent(
  roundId: bigint,
  minerAuthority: string,
  checkpointId: bigint,
): CheckpointCompletedEventData {
  return {
    type: 'checkpoint-completed',
    timestamp: Date.now(),
    roundId,
    minerAuthority,
    checkpointId,
  };
}
