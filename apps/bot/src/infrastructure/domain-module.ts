import type { EvStrategyConfig } from '@osb/domain';
import {
  createDefaultClock,
  createDefaultEvStrategyService,
  createDefaultLatencyService,
  createPinoLogger,
  type LoggerPort,
} from '@osb/domain';
import { type Container, getGlobalContainer } from './container';

export interface DomainModuleConfig {
  evStrategyConfig: EvStrategyConfig;
}

export function registerDomainModule(config: DomainModuleConfig): Container {
  const container = getGlobalContainer();

  // Logger
  container.registerInstance(
    'Logger',
    createPinoLogger({ name: 'osb' })
  );

  // Clock
  container.register(
    'Clock',
    () => createDefaultClock()
  );

  // Latency Service
  container.register(
    'LatencyService',
    () => createDefaultLatencyService({
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
    () => {
      const logger = container.resolve<LoggerPort>('Logger');
      return createDefaultEvStrategyService(config.evStrategyConfig, logger);
    }
  );

  return container;
}
