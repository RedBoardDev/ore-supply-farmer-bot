import type { NotificationMessage, NotificationPort } from '@osb/domain';
import { createChildLogger } from '@osb/domain';

const log = createChildLogger('console-notifier');

export class ConsoleNotifierAdapter implements NotificationPort {
  async send(message: NotificationMessage): Promise<void> {
    const timestamp = new Date(message.timestamp ?? Date.now()).toISOString();
    log.info(`[${timestamp}] [${message.type.toUpperCase()}] ${message.title}: ${message.message}`);
    if (message.data) {
      log.info('  Data:', JSON.stringify(message.data, null, 2) as any);
    }
  }
}

