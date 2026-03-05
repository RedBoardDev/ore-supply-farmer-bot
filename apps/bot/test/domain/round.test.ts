import { Round } from '@osb/domain/aggregates/round.aggregate';
import { RoundId } from '@osb/domain/value-objects/round-id.vo';
import { describe, expect, it } from 'vitest';

function createDeployedArray(updates: Record<number, bigint> = {}): readonly bigint[] {
  const deployed = Array(25).fill(0n);
  for (const [index, value] of Object.entries(updates)) {
    deployed[Number(index)] = value;
  }
  return deployed;
}

describe('Round Aggregate', () => {
  it('creates valid round with 25 deployed values', () => {
    const roundId = RoundId.create(1n);
    const deployed = createDeployedArray({ 0: 1_000_000_000n, 5: 2_000_000_000n });
    const motherlode = 10_000_000_000n;
    const expiresAt = 200n;

    const round = Round.create(roundId, deployed, motherlode, expiresAt);

    expect(round.id.equals(roundId)).toBe(true);
    expect(round.motherlode).toBe(10_000_000_000n);
    expect(round.expiresAt).toBe(200n);
  });

  it('stakeOnSquare returns Lamports object', () => {
    const roundId = RoundId.create(1n);
    const deployed = createDeployedArray({ 3: 1_500_000_000n });
    const round = Round.create(roundId, deployed, 0n, 200n);

    const stake = round.stakeOnSquare(3);

    expect(stake.value).toBe(1_500_000_000n);
  });

  it('stakeOnSquare returns zero Lamports for empty square', () => {
    const round = Round.create(RoundId.create(1n), createDeployedArray(), 0n, 200n);

    const stake = round.stakeOnSquare(7);

    expect(stake.value).toBe(0n);
  });

  it('othersStakeOn calculates correctly', () => {
    const roundId = RoundId.create(1n);
    const deployed = createDeployedArray({ 2: 3_000_000_000n });
    const round = Round.create(roundId, deployed, 0n, 200n);
    const minerStake = 1_000_000_000n;

    const others = round.othersStakeOn(2, minerStake);

    expect(others.value).toBe(2_000_000_000n);
  });

  it('othersStakeOn returns 0 when miner has more than deployed', () => {
    const round = Round.create(RoundId.create(1n), createDeployedArray({ 2: 1_000_000_000n }), 0n, 200n);
    const minerStake = 2_000_000_000n;

    const others = round.othersStakeOn(2, minerStake);

    expect(others.value).toBe(0n);
  });

  it('isSquareEmpty returns true for zero stake', () => {
    const round = Round.create(RoundId.create(1n), createDeployedArray(), 0n, 200n);

    expect(round.isSquareEmpty(0)).toBe(true);
    expect(round.isSquareEmpty(10)).toBe(true);
  });

  it('isSquareEmpty returns false for non-zero stake', () => {
    const round = Round.create(RoundId.create(1n), createDeployedArray({ 5: 1_000_000_000n }), 0n, 200n);

    expect(round.isSquareEmpty(5)).toBe(false);
  });

  it('isExpired returns true when current slot >= expiresAt', () => {
    const round = Round.create(RoundId.create(1n), createDeployedArray(), 0n, 200n);

    expect(round.isExpired(200n)).toBe(true);
    expect(round.isExpired(250n)).toBe(true);
  });

  it('isExpired returns false when current slot < expiresAt', () => {
    const round = Round.create(RoundId.create(1n), createDeployedArray(), 0n, 200n);

    expect(round.isExpired(150n)).toBe(false);
    expect(round.isExpired(199n)).toBe(false);
  });

  it('totalDeployed returns Lamports object', () => {
    const roundId = RoundId.create(1n);
    const deployed = createDeployedArray({
      0: 1_000_000_000n,
      1: 2_000_000_000n,
      2: 3_000_000_000n,
    });
    const round = Round.create(roundId, deployed, 0n, 200n);

    const total = round.totalDeployed();

    expect(total.value).toBe(6_000_000_000n);
  });

  it('equals compares by id', () => {
    const id1 = RoundId.create(1n);
    const id2 = RoundId.create(2n);
    const deployed = createDeployedArray();

    const round1 = Round.create(id1, deployed, 0n, 200n);
    const round2 = Round.create(id2, deployed, 0n, 200n);
    const round1Copy = Round.create(id1, deployed, 0n, 200n);

    expect(round1.equals(round1Copy)).toBe(true);
    expect(round1.equals(round2)).toBe(false);
  });

  it('throws when deployed array is not 25 elements', () => {
    expect(() => {
      Round.create(RoundId.create(1n), [1n, 2n], 0n, 200n);
    }).toThrow('Round must have exactly 25 deployed values');
  });

  it('deployed array is accessible', () => {
    const deployed = createDeployedArray({ 10: 5_000_000_000n });
    const round = Round.create(RoundId.create(1n), deployed, 0n, 200n);

    expect(round.deployed[10]).toBe(5_000_000_000n);
    expect(round.deployed.length).toBe(25);
  });
});
