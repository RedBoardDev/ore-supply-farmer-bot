import type { RoundId } from '@osb/domain/value-objects/round-id.vo';
import type { Slot } from '@osb/domain/value-objects/slot.vo';

export interface BoardProps {
  readonly roundId: RoundId;
  readonly startSlot: Slot;
  readonly endSlot: Slot;
  readonly epochId: bigint;
}

export class Board {
  private constructor(
    private readonly _roundId: RoundId,
    private readonly _startSlot: Slot,
    private readonly _endSlot: Slot,
    private readonly _epochId: bigint,
  ) {}

  static create(roundId: RoundId, startSlot: Slot, endSlot: Slot, epochId: bigint): Board {
    if (endSlot.value <= startSlot.value) {
      throw new Error('endSlot must be greater than startSlot');
    }
    return new Board(roundId, startSlot, endSlot, epochId);
  }

  get roundId(): RoundId {
    return this._roundId;
  }

  get startSlot(): Slot {
    return this._startSlot;
  }

  get endSlot(): Slot {
    return this._endSlot;
  }

  get epochId(): bigint {
    return this._epochId;
  }

  remainingSlots(currentSlot: Slot): bigint {
    if (currentSlot.value >= this._endSlot.value) {
      return 0n;
    }
    return this._endSlot.value - currentSlot.value;
  }

  isRoundEnded(currentSlot: Slot): boolean {
    return currentSlot.value >= this._endSlot.value;
  }

  isRoundStarted(currentSlot: Slot): boolean {
    return currentSlot.value >= this._startSlot.value;
  }

  isWithinRound(currentSlot: Slot): boolean {
    return currentSlot.value >= this._startSlot.value && currentSlot.value < this._endSlot.value;
  }

  equals(other: Board): boolean {
    return (
      this._roundId.equals(other._roundId) &&
      this._startSlot.equals(other._startSlot) &&
      this._endSlot.equals(other._endSlot)
    );
  }
}
