import { LAMPORTS_PER_SOL, Lamports } from '@osb/domain/value-objects/lamports.vo';
import { RoundId } from '@osb/domain/value-objects/round-id.vo';
import { SLOT_DURATION_MS, SLOTS_PER_SECOND, Slot } from '@osb/domain/value-objects/slot.vo';
import { StakeAmount } from '@osb/domain/value-objects/stake-amount.vo';
import { describe, expect, it } from 'vitest';

describe('Lamports Value Object', () => {
  it('creates valid positive lamports', () => {
    const lamports = Lamports.create(1_000_000_000n);
    expect(lamports.value).toBe(1_000_000_000n);
  });

  it('creates zero lamports', () => {
    const lamports = Lamports.create(0n);
    expect(lamports.isZero()).toBe(true);
  });

  it('throws for negative value', () => {
    expect(() => Lamports.create(-100n)).toThrow('Lamports value cannot be negative');
  });

  it('converts from SOL correctly', () => {
    const lamports = Lamports.fromSol(0.5);
    expect(lamports.value).toBe(500_000_000n);
  });

  it('converts to SOL correctly', () => {
    const lamports = Lamports.create(1_500_000_000n);
    expect(lamports.toSol()).toBe(1.5);
  });

  it('adds lamports correctly', () => {
    const a = Lamports.create(1_000_000_000n);
    const b = Lamports.create(500_000_000n);
    const result = a.add(b);
    expect(result.value).toBe(1_500_000_000n);
  });

  it('subtracts lamports correctly', () => {
    const a = Lamports.create(1_500_000_000n);
    const b = Lamports.create(500_000_000n);
    const result = a.subtract(b);
    expect(result.value).toBe(1_000_000_000n);
  });

  it('throws when subtracting larger from smaller', () => {
    const a = Lamports.create(500_000_000n);
    const b = Lamports.create(1_000_000_000n);
    expect(() => a.subtract(b)).toThrow('Cannot subtract larger Lamports from smaller');
  });

  it('multiplies correctly', () => {
    const lamports = Lamports.create(1_000_000_000n);
    const result = lamports.multiply(2);
    expect(result.value).toBe(2_000_000_000n);
  });

  it('multiplies with decimal correctly', () => {
    const lamports = Lamports.create(1_000_000_000n);
    const result = lamports.multiply(1.5);
    expect(result.value).toBe(1_500_000_000n);
  });

  it('equals compares correctly', () => {
    const a = Lamports.create(1_000_000_000n);
    const b = Lamports.create(1_000_000_000n);
    const c = Lamports.create(2_000_000_000n);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('greaterThan works correctly', () => {
    const a = Lamports.create(2_000_000_000n);
    const b = Lamports.create(1_000_000_000n);
    expect(a.greaterThan(b)).toBe(true);
    expect(b.greaterThan(a)).toBe(false);
  });

  it('lessThan works correctly', () => {
    const a = Lamports.create(1_000_000_000n);
    const b = Lamports.create(2_000_000_000n);
    expect(a.lessThan(b)).toBe(true);
    expect(b.lessThan(a)).toBe(false);
  });

  it('toString formats correctly', () => {
    const lamports = Lamports.create(1_500_000_000n);
    expect(lamports.toString()).toBe('1500000000 lamports');
  });
});

describe('RoundId Value Object', () => {
  it('creates valid round id', () => {
    const roundId = RoundId.create(1n);
    expect(roundId.value).toBe(1n);
  });

  it('equals compares correctly', () => {
    const a = RoundId.create(1n);
    const b = RoundId.create(1n);
    const c = RoundId.create(2n);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});

describe('Slot Value Object', () => {
  it('creates valid slot from bigint', () => {
    const slot = Slot.create(100n);
    expect(slot.value).toBe(100n);
  });

  it('throws for negative slot', () => {
    expect(() => Slot.create(-1n)).toThrow('Slot value cannot be negative');
  });

  it('isBefore works correctly', () => {
    const a = Slot.create(50n);
    const b = Slot.create(100n);
    expect(a.isBefore(b)).toBe(true);
    expect(b.isBefore(a)).toBe(false);
  });

  it('isAfter works correctly', () => {
    const a = Slot.create(100n);
    const b = Slot.create(50n);
    expect(a.isAfter(b)).toBe(true);
    expect(b.isAfter(a)).toBe(false);
  });

  it('slotsUntil calculates correctly', () => {
    const a = Slot.create(50n);
    const b = Slot.create(100n);
    expect(a.slotsUntil(b)).toBe(50n);
    expect(b.slotsUntil(a)).toBe(0n);
  });

  it('equals compares correctly', () => {
    const a = Slot.create(100n);
    const b = Slot.create(100n);
    const c = Slot.create(50n);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('toMs converts correctly', () => {
    const slot = Slot.create(4n); // 4 slots
    // SLOT_DURATION_MS = 400ms, so 4 * 400 = 1600ms
    expect(slot.toMs()).toBe(1600);
  });

  it('toSeconds converts correctly', () => {
    const slot = Slot.create(5n); // 5 slots
    // SLOTS_PER_SECOND = 2.5, so 5 / 2.5 = 2 seconds
    expect(slot.toSeconds()).toBe(2);
  });

  it('SLOTS_PER_SECOND is correct', () => {
    expect(SLOTS_PER_SECOND).toBe(2.5);
  });

  it('SLOT_DURATION_MS is correct', () => {
    // 1000 / 2.5 = 400ms
    expect(SLOT_DURATION_MS).toBe(400);
  });
});

describe('StakeAmount Value Object', () => {
  it('creates minimum stake amount', () => {
    const lamports = Lamports.create(1_000_000_000n);
    const stake = StakeAmount.minimum(lamports);
    expect(stake.value).toEqual(lamports);
    expect(stake.isMinimum).toBe(true);
    expect(stake.isCapped).toBe(false);
  });

  it('creates normal stake amount', () => {
    const lamports = Lamports.create(1_000_000_000n);
    const stake = StakeAmount.normal(lamports, false);
    expect(stake.value).toEqual(lamports);
    expect(stake.isMinimum).toBe(false);
    expect(stake.isCapped).toBe(false);
  });

  it('creates capped stake amount', () => {
    const lamports = Lamports.create(1_000_000_000n);
    const stake = StakeAmount.normal(lamports, true);
    expect(stake.value).toEqual(lamports);
    expect(stake.isMinimum).toBe(false);
    expect(stake.isCapped).toBe(true);
  });

  it('creates high EV stake amount', () => {
    const lamports = Lamports.create(2_000_000_000n);
    const stake = StakeAmount.highEV(lamports, false);
    expect(stake.value).toEqual(lamports);
    expect(stake.isMinimum).toBe(false);
    expect(stake.isCapped).toBe(false);
  });

  it('equals compares correctly', () => {
    const lamports1 = Lamports.create(1_000_000_000n);
    const lamports2 = Lamports.create(1_000_000_000n);
    const lamports3 = Lamports.create(2_000_000_000n);

    const a = StakeAmount.normal(lamports1, false);
    const b = StakeAmount.normal(lamports2, false);
    const c = StakeAmount.normal(lamports3, false);

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('toString formats with correct suffix', () => {
    const lamports = Lamports.create(1_000_000_000n);
    const minStake = StakeAmount.minimum(lamports);
    const cappedStake = StakeAmount.normal(lamports, true);

    expect(minStake.toString()).toContain('(min)');
    expect(cappedStake.toString()).toContain('(capped)');
  });
});
