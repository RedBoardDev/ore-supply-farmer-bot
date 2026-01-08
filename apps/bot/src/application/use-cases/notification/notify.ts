import type { CheckpointService } from '@osb/bot/domain/services/checkpoint.service';
import { getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import type { LoggerPort } from '@osb/bot/infrastructure/logging/logger.port';

export function notifyRoundStart(roundId: bigint, logger: LoggerPort): void {
  const container = getGlobalContainer();
  const checkpointService = container.resolve<CheckpointService>('CheckpointService');
  checkpointService.notifyRoundStart(roundId);
  logger.debug('Notified round start to checkpoint service');
}
