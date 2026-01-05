
import type { ConfigSchema, } from '@osb/config';
import {
  DefaultClock,
  DefaultEvStrategyService,
  DefaultLatencyService,
} from '@osb/domain';
import { type Container, getGlobalContainer, } from './container';


export function registerDomainModule(config: ConfigSchema): Container {
  const container = getGlobalContainer();
  // Clock
  container.register(
    'Clock',
    () => new DefaultClock()
  );

  // Latency Service
  container.register(
    'LatencyService',
    () => new DefaultLatencyService({
      slotDurationMs: 400, // ~2.5 slots per second
      smoothing: 0.2,
      initialPrepMs: 400,
      initialExecPerPlacementMs: 160,
      maxSamples: 200,
    })
  );

  // EV Strategy Service
  container.register(
    'EvStrategyService',
    () => new DefaultEvStrategyService({
      baseStakePercent: config.strategy.baseStakePercent,
      minEvRatio: config.strategy.minEvRatio,
      capNormalLamports: config.strategy.capNormalLamports,
      capHighEvLamports: config.strategy.capHighEvLamports,
      maxPlacementsPerRound: config.strategy.maxPlacementsPerRound,
      maxExposureLamportsPerRound: config.strategy.maxExposureLamportsPerRound,
      balanceBufferLamports: config.strategy.balanceBufferLamports,
      minStakeLamports: config.strategy.minStakeLamports,
      scanSquareCount: config.strategy.scanSquareCount,
      includeOreInEv: config.strategy.includeOreInEv,
      stakeScalingFactor: config.strategy.stakeScalingFactor,
      volumeDecayPercentPerPlacement: config.strategy.volumeDecayPercentPerPlacement,
    })
  );

  return container;
}
