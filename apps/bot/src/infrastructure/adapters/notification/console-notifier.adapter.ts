import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { NotificationMessage, NotificationPort } from './ports/notification.port';

const log = createChildLogger('console-notifier');

export class ConsoleNotifierAdapter implements NotificationPort {
  async send(message: NotificationMessage): Promise<void> {
    const timestamp = new Date(message.timestamp ?? Date.now()).toISOString();
    log.info(`[${timestamp}] [${message.type.toUpperCase()}] ${message.title}: ${message.message}`);
    if (message.data) {
      log.info(`  Data: ${JSON.stringify(message.data, null, 2)}`);
    }
  }
}
