import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import type { ParameterBounds } from '@backtester/domain/value-objects/optimization-bounds.vo';

export class ParameterGenerator {
  generateRandomConfig(bounds: ParameterBounds, baseConfig: BacktestConfig): BacktestConfig {
    const config: BacktestConfig = {
      minEvRatio: this.randomInRange(bounds.minEvRatio[0], bounds.minEvRatio[1]),
      baseStakePercent: this.randomInRange(bounds.baseStakePercent[0], bounds.baseStakePercent[1]),
      stakeScalingFactor: this.randomInRange(bounds.stakeScalingFactor[0], bounds.stakeScalingFactor[1]),
      maxPlacementsPerRound: this.randomIntInRange(
        bounds.maxPlacementsPerRound[0],
        bounds.maxPlacementsPerRound[1],
      ),
      capNormalLamports: this.randomBigIntInRange(
        bounds.capNormalLamports[0],
        bounds.capNormalLamports[1],
      ),
      capHighEvLamports: this.randomBigIntInRange(
        bounds.capHighEvLamports[0],
        bounds.capHighEvLamports[1],
      ),
      balanceBufferLamports: this.randomBigIntInRange(
        bounds.balanceBufferLamports[0],
        bounds.balanceBufferLamports[1],
      ),
      volumeDecayPercentPerPlacement: this.randomInRange(
        bounds.volumeDecayPercent[0],
        bounds.volumeDecayPercent[1],
      ),
      minStakeLamports: baseConfig.minStakeLamports,
      scanSquareCount: baseConfig.scanSquareCount,
      includeOreInEv: baseConfig.includeOreInEv,
      maxExposureLamportsPerRound: baseConfig.maxExposureLamportsPerRound,
    };

    return this.enforceInvariants(config);
  }

  generateNeighbor(
    config: BacktestConfig,
    bounds: ParameterBounds,
    perturbationFactor: number = 0.15,
  ): BacktestConfig {
    const paramToMutate = this.randomInt(0, 7);

    const newConfig = { ...config };

    switch (paramToMutate) {
      case 0:
        newConfig.minEvRatio = this.perturbValue(
          config.minEvRatio ?? 1.0,
          bounds.minEvRatio[0],
          bounds.minEvRatio[1],
          perturbationFactor,
        );
        break;
      case 1:
        newConfig.baseStakePercent = this.perturbValue(
          config.baseStakePercent,
          bounds.baseStakePercent[0],
          bounds.baseStakePercent[1],
          perturbationFactor,
        );
        break;
      case 2:
        newConfig.stakeScalingFactor = this.perturbValue(
          config.stakeScalingFactor,
          bounds.stakeScalingFactor[0],
          bounds.stakeScalingFactor[1],
          perturbationFactor,
        );
        break;
      case 3:
        newConfig.maxPlacementsPerRound = this.perturbIntValue(
          config.maxPlacementsPerRound,
          bounds.maxPlacementsPerRound[0],
          bounds.maxPlacementsPerRound[1],
          perturbationFactor,
        );
        break;
      case 4:
        newConfig.capNormalLamports = this.perturbBigIntValue(
          config.capNormalLamports,
          bounds.capNormalLamports[0],
          bounds.capNormalLamports[1],
          perturbationFactor,
        );
        break;
      case 5:
        newConfig.capHighEvLamports = this.perturbBigIntValue(
          config.capHighEvLamports,
          bounds.capHighEvLamports[0],
          bounds.capHighEvLamports[1],
          perturbationFactor,
        );
        break;
      case 6:
        newConfig.balanceBufferLamports = this.perturbBigIntValue(
          config.balanceBufferLamports,
          bounds.balanceBufferLamports[0],
          bounds.balanceBufferLamports[1],
          perturbationFactor,
        );
        break;
      case 7:
        newConfig.volumeDecayPercentPerPlacement = this.perturbValue(
          config.volumeDecayPercentPerPlacement,
          bounds.volumeDecayPercent[0],
          bounds.volumeDecayPercent[1],
          perturbationFactor,
        );
        break;
    }

    return this.enforceInvariants(newConfig);
  }

  private enforceInvariants(config: BacktestConfig): BacktestConfig {
    const capNormalLamports = config.capNormalLamports < config.minStakeLamports
      ? config.minStakeLamports
      : config.capNormalLamports;

    const capHighEvLamports = config.capHighEvLamports < capNormalLamports
      ? capNormalLamports
      : config.capHighEvLamports;

    return {
      ...config,
      capNormalLamports,
      capHighEvLamports,
    };
  }

  private randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private randomIntInRange(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  private randomBigIntInRange(min: bigint, max: bigint): bigint {
    const range = Number(max - min);
    const value = Math.floor(Math.random() * range);
    return min + BigInt(value);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private perturbValue(
    current: number,
    min: number,
    max: number,
    factor: number,
  ): number {
    const delta = (max - min) * factor;
    const perturbation = (Math.random() - 0.5) * 2 * delta;
    const newValue = current + perturbation;
    return Math.max(min, Math.min(max, newValue));
  }

  private perturbIntValue(
    current: number,
    min: number,
    max: number,
    factor: number,
  ): number {
    const delta = Math.ceil((max - min) * factor);
    const perturbation = Math.floor((Math.random() - 0.5) * 2 * delta);
    const newValue = current + perturbation;
    return Math.max(min, Math.min(max, newValue));
  }

  private perturbBigIntValue(
    current: bigint,
    min: bigint,
    max: bigint,
    factor: number,
  ): bigint {
    const range = Number(max - min);
    const delta = Math.floor(range * factor);
    const perturbation = Math.floor((Math.random() - 0.5) * 2 * delta);
    const newValue = current + BigInt(perturbation);
    return newValue < min ? min : newValue > max ? max : newValue;
  }
}
