import type { BacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';

export interface ConfigVariation {
  readonly id: string;
  readonly config: BacktestConfig;
  readonly parentId: string | null;
  readonly generation: number;
  readonly mutatedParams: readonly string[];
}

export function createConfigVariation(params: {
  config: BacktestConfig;
  parentId?: string | null;
  generation?: number;
  mutatedParams?: readonly string[];
}): ConfigVariation {
  const id = generateConfigId(params.config);

  return {
    id,
    config: params.config,
    parentId: params.parentId ?? null,
    generation: params.generation ?? 0,
    mutatedParams: params.mutatedParams ?? [],
  };
}

function generateConfigId(config: BacktestConfig): string {
  const parts = [
    `ev${config.minEvRatio?.toFixed(2) ?? 'null'}`,
    `bs${(config.baseStakePercent * 100).toFixed(1)}`,
    `sf${config.stakeScalingFactor.toFixed(1)}`,
    `mp${config.maxPlacementsPerRound}`,
  ];

  return parts.join('_');
}

export function compareConfigs(a: BacktestConfig, b: BacktestConfig): boolean {
  return (
    a.baseStakePercent === b.baseStakePercent &&
    a.minStakeLamports === b.minStakeLamports &&
    a.capNormalLamports === b.capNormalLamports &&
    a.capHighEvLamports === b.capHighEvLamports &&
    a.minEvRatio === b.minEvRatio &&
    a.maxPlacementsPerRound === b.maxPlacementsPerRound &&
    a.maxExposureLamportsPerRound === b.maxExposureLamportsPerRound &&
    a.balanceBufferLamports === b.balanceBufferLamports &&
    a.scanSquareCount === b.scanSquareCount &&
    a.includeOreInEv === b.includeOreInEv &&
    a.stakeScalingFactor === b.stakeScalingFactor &&
    a.volumeDecayPercentPerPlacement === b.volumeDecayPercentPerPlacement
  );
}
