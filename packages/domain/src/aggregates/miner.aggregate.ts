import { Lamports } from '@osb/domain/value-objects/lamports.vo';
import type { RoundId } from '@osb/domain/value-objects/round-id.vo';

export type SolanaAddress = string;

export interface MinerProps {
  readonly authority: SolanaAddress;
  readonly deployed: readonly bigint[];
  readonly rewardsSol: bigint;
  readonly checkpointId: bigint;
  readonly roundId: bigint;
}

export class Miner {
  private constructor(
    private readonly _authority: SolanaAddress,
    private readonly _deployed: readonly bigint[],
    private readonly _rewardsSol: bigint,
    private readonly _checkpointId: bigint,
    private readonly _roundId: bigint
  ) {
    if (_deployed.length !== 25) {
      throw new Error('Miner must have exactly 25 deployed values');
    }
  }

  static create(authority: SolanaAddress, deployed: readonly bigint[], rewardsSol: bigint, checkpointId: bigint, roundId: bigint): Miner {
    return new Miner(authority, deployed, rewardsSol, checkpointId, roundId);
  }

  get authority(): SolanaAddress {
    return this._authority;
  }

  get deployed(): readonly bigint[] {
    return this._deployed;
  }

  get rewardsSol(): bigint {
    return this._rewardsSol;
  }

  get checkpointId(): bigint {
    return this._checkpointId;
  }

  get roundId(): bigint {
    return this._roundId;
  }

  needsCheckpoint(currentRoundId: RoundId): boolean {
    return this._checkpointId < currentRoundId.value;
  }

  totalExposure(): Lamports {
    const total = this._deployed.reduce((sum, val) => sum + val, 0n);
    return Lamports.create(total);
  }

  stakeOnSquare(squareIndex: number): Lamports {
    return Lamports.create(this._deployed[squareIndex] ?? 0n);
  }

  hasDeployed(): boolean {
    return this._deployed.some(val => val > 0n);
  }

  equals(other: Miner): boolean {
    return this._authority === other._authority;
  }
}

