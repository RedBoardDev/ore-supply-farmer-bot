import { Lamports } from '@osb/domain/value-objects/lamports.vo';
import type { RoundId } from '@osb/domain/value-objects/round-id.vo';

export interface RoundProps {
  readonly id: RoundId;
  readonly deployed: readonly bigint[];
  readonly motherlode: bigint;
  readonly expiresAt: bigint;
}

export class Round {
  private constructor(
    private readonly _id: RoundId,
    private readonly _deployed: readonly bigint[],
    private readonly _motherlode: bigint,
    private readonly _expiresAt: bigint
  ) {
    if (_deployed.length !== 25) {
      throw new Error('Round must have exactly 25 deployed values');
    }
  }

  static create(id: RoundId, deployed: readonly bigint[], motherlode: bigint, expiresAt: bigint): Round {
    return new Round(id, deployed, motherlode, expiresAt);
  }

  get id(): RoundId {
    return this._id;
  }

  get deployed(): readonly bigint[] {
    return this._deployed;
  }

  get motherlode(): bigint {
    return this._motherlode;
  }

  get expiresAt(): bigint {
    return this._expiresAt;
  }

  stakeOnSquare(squareIndex: number): Lamports {
    return Lamports.create(this._deployed[squareIndex] ?? 0n);
  }

  othersStakeOn(squareIndex: number, minerStake: bigint): Lamports {
    const total = this._deployed[squareIndex] ?? 0n;
    const others = total - minerStake;
    return Lamports.create(others < 0n ? 0n : others);
  }

  isSquareEmpty(squareIndex: number): boolean {
    return this._deployed[squareIndex] === 0n;
  }

  isExpired(currentSlot: bigint): boolean {
    return currentSlot >= this._expiresAt;
  }

  totalDeployed(): Lamports {
    const total = this._deployed.reduce((sum, val) => sum + val, 0n);
    return Lamports.create(total);
  }

  equals(other: Round): boolean {
    return this._id.equals(other._id);
  }
}

