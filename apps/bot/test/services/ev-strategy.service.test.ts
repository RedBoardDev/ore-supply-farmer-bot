import { EvStrategyService } from '@osb/bot/domain/services/ev-strategy.service';
import { OrePrice } from '@osb/domain';
import { describe, expect, it } from 'vitest';
import { buildEvStrategyConfig } from '../builders/ev-strategy-config.builder';
import { buildMiner } from '../builders/miner.builder';
import { buildRound } from '../builders/round.builder';

describe('EvStrategyService', () => {
  it('uses SOL per ORE when computing net ore value', () => {
    const config = buildEvStrategyConfig({ includeOreInEv: true });
    const service = new EvStrategyService(config);

    const round = buildRound({ motherlode: 0n });
    const miner = buildMiner();
    const stakeLamports = 1_000_000_000n;

    const solPerOre = 0.01;
    const netSolPerOre = solPerOre * 0.9;
    const orePrice = OrePrice.create(solPerOre, netSolPerOre, Date.now());

    const result = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round,
      miner,
      orePrice,
      executedExposureLamports: 0n,
    });

    expect(result).not.toBeNull();
    const expectedEv = (1 / 25) * (0.9 + netSolPerOre);
    expect(result?.evRatio).toBeCloseTo(expectedEv, 8);
  });

  it('ignores ore price when includeOreInEv is false', () => {
    const config = buildEvStrategyConfig({ includeOreInEv: false });
    const service = new EvStrategyService(config);

    const round = buildRound({ motherlode: 1_000_000_000n });
    const miner = buildMiner();
    const stakeLamports = 1_000_000_000n;

    const orePrice = OrePrice.create(0.02, 0.018, Date.now());

    const withPrice = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round,
      miner,
      orePrice,
      executedExposureLamports: 0n,
    });

    const withoutPrice = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round,
      miner,
      orePrice: null,
      executedExposureLamports: 0n,
    });

    expect(withPrice).not.toBeNull();
    expect(withoutPrice).not.toBeNull();
    expect(withPrice?.evRatio).toBeCloseTo(withoutPrice?.evRatio ?? 0, 10);
  });

  it('increases EV when netSolPerOre increases', () => {
    const config = buildEvStrategyConfig({ includeOreInEv: true });
    const service = new EvStrategyService(config);

    const round = buildRound({ motherlode: 0n });
    const miner = buildMiner();
    const stakeLamports = 1_000_000_000n;

    const lowPrice = OrePrice.create(0.005, 0.0045, Date.now());
    const highPrice = OrePrice.create(0.05, 0.045, Date.now());

    const lowEv = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round,
      miner,
      orePrice: lowPrice,
      executedExposureLamports: 0n,
    });

    const highEv = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round,
      miner,
      orePrice: highPrice,
      executedExposureLamports: 0n,
    });

    expect(lowEv).not.toBeNull();
    expect(highEv).not.toBeNull();
    expect(highEv?.evRatio ?? 0).toBeGreaterThan(lowEv?.evRatio ?? 0);
  });

  it('increases EV when motherlode grows (ore bonus)', () => {
    const config = buildEvStrategyConfig({ includeOreInEv: true });
    const service = new EvStrategyService(config);

    const miner = buildMiner();
    const stakeLamports = 1_000_000_000n;
    const orePrice = OrePrice.create(0.02, 0.018, Date.now());

    const noMotherlode = buildRound({ motherlode: 0n });
    const withMotherlode = buildRound({ motherlode: 1_000_000_000n });

    const baseEv = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round: noMotherlode,
      miner,
      orePrice,
      executedExposureLamports: 0n,
    });

    const boostedEv = service.recalculateEv({
      squareIndex: 0,
      stakeLamports,
      round: withMotherlode,
      miner,
      orePrice,
      executedExposureLamports: 0n,
    });

    expect(baseEv).not.toBeNull();
    expect(boostedEv).not.toBeNull();
    expect(boostedEv?.evRatio ?? 0).toBeGreaterThan(baseEv?.evRatio ?? 0);
  });
});
