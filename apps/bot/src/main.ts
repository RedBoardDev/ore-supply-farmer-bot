import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import { Core } from './application/orchestrator/core';

const log = createChildLogger('main');

async function main(): Promise<void> {
  log.info('OSB starting...');

  const core = new Core();

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down gracefully...`);
    await core.stop();
    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await core.start();

    // Keep process alive
    if (process.env.NODE_ENV !== 'test') {
      log.info('Core is running. Press Ctrl+C to stop.');
      // Prevent process from exiting
      await new Promise(() => {});
    }
  } catch (error) {
    log.error('Fatal error starting bot', error as Error);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error('Unhandled error', error as Error);
  process.exit(1);
});
