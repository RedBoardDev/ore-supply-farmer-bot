import type { EvStrategyConfig } from '@osb/bot/domain/services/ports/ev-strategy.port';

export function buildEvStrategyConfig(overrides: Partial<EvStrategyConfig> = {}): EvStrategyConfig {
  return {
    baseStakePercent: 0.015,
    minEvRatio: null,
    capNormalLamports: 1_000_000_000n,
    capHighEvLamports: 2_000_000_000n,
    maxPlacementsPerRound: 12,
    maxExposureLamportsPerRound: null,
    balanceBufferLamports: 0n,
    minStakeLamports: 1_000_000n,
    scanSquareCount: 25,
    includeOreInEv: true,
    stakeScalingFactor: 1,
    volumeDecayPercentPerPlacement: 0,
    ...overrides,
  };
}
