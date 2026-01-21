import type { PlacementPrefetcher } from '@osb/bot/application/use-cases/execute-placement/prefetcher/placement-prefetcher';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { LatencyServicePort, LatencyStoragePort } from '@osb/bot/domain/services/ports/latency.port';
import type { BlockhashCache } from '@osb/bot/infrastructure/adapters/blockchain/blockhash-cache.adapter';
import type { InstructionCache } from '@osb/bot/infrastructure/adapters/cache/instruction-cache.adapter';
import type { SlotCache } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import type { NotificationPort } from '@osb/bot/infrastructure/adapters/notification/ports/notification.port';
import type { RoundMetricsManager } from '@osb/bot/infrastructure/adapters/round/round-metrics';
import type { RoundStreamManager } from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import type { BoardWatcher } from '@osb/bot/infrastructure/adapters/watch/board-watcher.adapter';
import { type Container, getGlobalContainer } from '@osb/bot/infrastructure/di/container';
import { type ConfigSchema, loadConfig } from '@osb/config';
import type { EnvSchema } from '@osb/config/env';
import type { PublicKey } from '@solana/web3.js';

export abstract class OreBot {
  protected readonly container: Container;
  protected readonly config: ConfigSchema;
  protected readonly env: EnvSchema;

  constructor() {
    this.container = getGlobalContainer();
    const { config, env } = loadConfig();
    this.config = config;
    this.env = env;
  }

  // ============================================================================
  // Core Infrastructure
  // ============================================================================

  protected getBlockchain(): BlockchainPort {
    return this.container.resolve<BlockchainPort>('BlockchainPort');
  }

  protected getNotificationPort(): NotificationPort {
    return this.container.resolve<NotificationPort>('NotificationPort');
  }

  protected getAuthorityPublicKey(): PublicKey {
    return this.container.resolve<PublicKey>('AuthorityPublicKey');
  }

  // ============================================================================
  // Caches & Managers
  // ============================================================================

  protected getBlockhashCache(): BlockhashCache {
    return this.container.resolve<BlockhashCache>('BlockhashCache');
  }

  protected getSlotCache(): SlotCache {
    return this.container.resolve<SlotCache>('SlotCache');
  }

  protected getInstructionCache(): InstructionCache {
    return this.container.resolve<InstructionCache>('InstructionCache');
  }

  protected getRoundMetricsManager(): RoundMetricsManager {
    return this.container.resolve<RoundMetricsManager>('RoundMetricsManager');
  }

  // ============================================================================
  // Watchers & Streams
  // ============================================================================

  protected getBoardWatcher(): BoardWatcher {
    return this.container.resolve<BoardWatcher>('BoardWatcher');
  }

  protected getRoundStreamManager(): RoundStreamManager {
    return this.container.resolve<RoundStreamManager>('RoundStreamManager');
  }

  protected getPlacementPrefetcher(): PlacementPrefetcher {
    return this.container.resolve<PlacementPrefetcher>('PlacementPrefetcher');
  }

  // ============================================================================
  // Services
  // ============================================================================

  // protected getPricePort(): PricePort {
  //   return this.container.resolve<PricePort>('PricePort');
  // }

  protected getLatencyService(): LatencyServicePort {
    return this.container.resolve<LatencyServicePort>('LatencyService');
  }

  protected getLatencyStorage(): LatencyStoragePort {
    return this.container.resolve<LatencyStoragePort>('LatencyStoragePort');
  }

  // /**
  //  * Get fresh blockhash for transactions.
  //  */
  protected async getFreshBlockhash() {
    const blockhashCache = this.getBlockhashCache();
    return blockhashCache.getFreshBlockhash();
  }
}
