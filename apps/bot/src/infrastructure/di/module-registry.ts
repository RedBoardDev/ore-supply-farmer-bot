import { CheckpointService } from '@osb/bot/domain/services/checkpoint.service';
import { ClockService } from '@osb/bot/domain/services/default-clock';
import { EvStrategyService } from '@osb/bot/domain/services/ev-strategy.service';
import { FileLatencyStorage, LatencyServiceAdapter, type LatencyStoragePort } from '@osb/bot/domain/services/latency.service';
import { MiningCostStrategy } from '@osb/bot/domain/services/mining-cost-strategy.service';
import type { BlockchainPort } from '@osb/bot/domain/services/ports/blockchain.port';
import type { EvStrategyServicePort } from '@osb/bot/domain/services/ports/ev-strategy.port.d';
import type { PricePort } from '@osb/bot/domain/services/ports/price.port';
import { type InstructionCache, InstructionCacheAdapter } from '@osb/bot/infrastructure/adapters/cache/instruction-cache.adapter';
import { SlotCacheAdapter } from '@osb/bot/infrastructure/adapters/cache/slot-cache.adapter';
import { ConsoleNotifierAdapter } from '@osb/bot/infrastructure/adapters/notification/console-notifier.adapter';
import { DiscordNotifierAdapter } from '@osb/bot/infrastructure/adapters/notification/discord-notifier.adapter';
import type { DiscordNotifier } from '@osb/bot/infrastructure/adapters/notification/discord-notifier.interface';
import type { NotificationPort } from '@osb/bot/infrastructure/adapters/notification/ports/notification.port';
import { type PlacementPrefetcher, PlacementPrefetcherAdapter } from '@osb/bot/infrastructure/adapters/placement-prefetcher.adapter';
import { LiteJupiterPriceAdapter } from '@osb/bot/infrastructure/adapters/price/lite-jupiter-price.adapter';
import { type RoundMetricsManager, RoundMetricsManagerAdapter } from '@osb/bot/infrastructure/adapters/round/round-metrics';
import { type RoundStreamManager, RoundStreamManagerAdapter } from '@osb/bot/infrastructure/adapters/round/round-stream-manager.adapter';
import { TransactionBuilder } from '@osb/bot/infrastructure/adapters/transaction/transaction-builder';
import { TransactionSender } from '@osb/bot/infrastructure/adapters/transaction/transaction-sender.adapter';
import { type BoardWatcher, BoardWatcherAdapter, } from '@osb/bot/infrastructure/adapters/watch/board-watcher.adapter';
import { createChildLogger } from '@osb/bot/infrastructure/logging/pino-logger';
import type { ConfigSchema } from '@osb/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { type BlockhashCache, BlockhashCacheAdapter } from '../adapters/blockchain/blockhash-cache.adapter';
import { SolanaBlockchainAdapter } from '../adapters/blockchain/solana.adapter';
import { type Container, getGlobalContainer } from './container';

const log = createChildLogger('bot-registry');

export function moduleRegistry(botConfig: ConfigSchema): Container {
  const container = getGlobalContainer();

  container.registerInstance('BotConfig', botConfig);

  // Clock
  container.register(
    'Clock',
    () => new ClockService()
  );

  // Solana Connection
  container.register(
    'SolanaConnection',
    () => new Connection(botConfig.rpc.httpEndpoint, {
      commitment: botConfig.rpc.commitment,
      wsEndpoint: botConfig.rpc.wsEndpoint,
    })
  );

  // Slot Cache (WebSocket-based slot updates)
  const solanaConnection = container.resolve<Connection>('SolanaConnection');
  container.registerInstance(
    'SlotCache',
    new SlotCacheAdapter(solanaConnection)
  );

  // Wallet keypair - only required in live mode
  container.register(
    'WalletKeypair',
    () => {
      // Skip keypair loading in dry-run mode
      if (botConfig.runtime.dryRun) {
        log.info('[DRY RUN] Skipping wallet keypair loading');
        return null;
      }

      const envVar = botConfig.wallet.keypairEnvVar; // TODO comment recuperer depuis le .env ?
      let privateKeyBase58 = process.env[envVar];

      // Try fallback env var if primary not set
      if (!privateKeyBase58) { // TODO et du coup gérer ça
        privateKeyBase58 = process.env.BOT_KEYPAIR;
      }

      if (!privateKeyBase58) {
        throw new Error(`Missing wallet keypair env var: ${envVar} or BOT_KEYPAIR`);
      }

      // Parse private key from various formats
      try {
        // Try JSON format first
        if (privateKeyBase58.startsWith('[')) {
          const keyArray = JSON.parse(privateKeyBase58);
          return Buffer.from(keyArray);
        }

        // Try comma-separated format
        if (privateKeyBase58.includes(',')) {
          const keyArray = privateKeyBase58.split(',').map(Number);
          return Buffer.from(keyArray);
        }

        // Default: base58 format
        const bs58 = require('bs58');
        return Buffer.from(bs58.decode(privateKeyBase58));
      } catch (error) {
        throw new Error(`Failed to parse wallet keypair: ${(error as Error).message}`);
      }
    },
    { singleton: true }
  );

  // Authority Keypair (for transactions) - only in live mode
  container.register(
    'AuthorityKeypair',
    () => {
      if (botConfig.runtime.dryRun) {
        return null;
      }
      const keypairBuffer = container.resolve<Buffer>('WalletKeypair');
      if (!keypairBuffer) {
        throw new Error('Wallet keypair not available');
      }
      return Keypair.fromSecretKey(keypairBuffer);
    }
  );

  // Authority PublicKey
  container.register(
    'AuthorityPublicKey',
    () => {
      if (botConfig.runtime.dryRun) {
        // Return a dummy public key for dry-run
        return new PublicKey('11111111111111111111111111111111');
      }
      const keypair = container.resolve<Keypair>('AuthorityKeypair');
      return keypair.publicKey;
    }
  );

  // Blockchain Adapter
  container.registerInstance<BlockchainPort>(
    'BlockchainPort',
    new SolanaBlockchainAdapter(botConfig)
  );

  // Price Adapter
  container.registerInstance<PricePort>(
    'PricePort',
    new LiteJupiterPriceAdapter(botConfig)
  );

  // Notification Port
  if (botConfig.telemetry.discordWebhookUrl) {
    container.registerInstance<NotificationPort>(
      'NotificationPort',
      new DiscordNotifierAdapter(botConfig.telemetry.discordWebhookUrl)
    );
  } else {
    container.registerInstance<NotificationPort>(
      'NotificationPort',
      new ConsoleNotifierAdapter()
    );
  }

  // Transaction Builder
  container.registerInstance(
    'TransactionBuilder',
    new TransactionBuilder()
  );

  // Transaction Sender
  container.register(
    'TransactionSender',
    () => {
      const connection = container.resolve<Connection>('SolanaConnection');
      // const blockchain = container.resolve<BlockchainPort>('BlockchainPort');
      return new TransactionSender(connection, botConfig);
    }
  );

  // EV Strategy Service
  container.registerInstance<EvStrategyServicePort>(
    'EvStrategyService',
    new EvStrategyService({
      baseStakePercent: botConfig.strategy.baseStakePercent,
      minEvRatio: botConfig.strategy.minEvRatio,
      capNormalLamports: botConfig.strategy.capNormalLamports,
      capHighEvLamports: botConfig.strategy.capHighEvLamports,
      maxPlacementsPerRound: botConfig.strategy.maxPlacementsPerRound,
      maxExposureLamportsPerRound: botConfig.strategy.maxExposureLamportsPerRound,
      balanceBufferLamports: botConfig.strategy.balanceBufferLamports,
      minStakeLamports: botConfig.strategy.minStakeLamports,
      scanSquareCount: botConfig.strategy.scanSquareCount,
      includeOreInEv: botConfig.strategy.includeOreInEv,
      stakeScalingFactor: botConfig.strategy.stakeScalingFactor,
      volumeDecayPercentPerPlacement: botConfig.strategy.volumeDecayPercentPerPlacement,
    })
  );

  // Checkpoint Service
  container.registerInstance<CheckpointService>(
    'CheckpointService',
    new CheckpointService()
  );

  // Latency Service
  container.register(
    'LatencyService',
    () => new LatencyServiceAdapter({
      slotDurationMs: 400, // ~2.5 slots per second
      smoothing: 0.2,
      initialPrepMs: 400,
      initialExecPerPlacementMs: 160,
      maxSamples: 200,
    })
  );

  // Latency Storage
  container.registerInstance<LatencyStoragePort>(
    'LatencyStoragePort',
    new FileLatencyStorage({
      path: botConfig.runtime.latencyMetricsPath,
      maxEntries: botConfig.runtime.latencyHistorySize,
      flushIntervalMs: 5000,
    })
  );

  // ============================================================================
  // Adapters
  // ============================================================================

  // Instruction Cache
  container.registerInstance<InstructionCache>(
    'InstructionCache',
    new InstructionCacheAdapter()
  );

  // Blockhash Cache
  container.registerInstance<BlockhashCache>(
    'BlockhashCache',
    new BlockhashCacheAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      refreshIntervalMs: 200,
    })
  );

  // Board Watcher
  container.registerInstance<BoardWatcher>(
    'BoardWatcher',
    new BoardWatcherAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
    })
  );

  // Round Stream Manager
  container.registerInstance<RoundStreamManager>(
    'RoundStreamManager',
    new RoundStreamManagerAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      strategyPlanner: {
        buildPlan: (context: {
          round: any;
          miner: any;
          walletBalanceLamports: bigint;
          priceQuote: any;
          maxPlacements: number;
        }): any[] => {
          try {
            const evStrategy = container.resolve<any>('EvStrategyService');
            const decisions = evStrategy.calculateDecisions(
              undefined,
              context.round,
              context.miner,
              context.priceQuote?.orePerSol ?? 0.5,
              context.priceQuote?.netOrePerSol ?? 0.45,
              context.walletBalanceLamports
            );
            return decisions;
          } catch (error) {
            log.debug(`Stream buildPlan failed: ${(error as Error).message}`);
            return [];
          }
        },
      },
    })
  );

  // Placement Prefetcher
  container.registerInstance<PlacementPrefetcher>(
    'PlacementPrefetcher',
    new PlacementPrefetcherAdapter({
      connection: solanaConnection,
      commitment: botConfig.rpc.commitment,
      authorityPublicKey: container.resolve<PublicKey>('AuthorityPublicKey'),
    })
  );

  // Round Metrics Manager
  container.registerInstance<RoundMetricsManager>(
    'RoundMetricsManager',
    new RoundMetricsManagerAdapter(container.resolve<DiscordNotifier>('DiscordNotifier'))
  );

  // Mining Cost Strategy
  container.registerInstance<MiningCostStrategy>(
    'MiningCostStrategy',
    new MiningCostStrategy({
      enabled: botConfig.miningCost.enabled,
      thresholdPercent: botConfig.miningCost.thresholdPercent,
      historyRounds: botConfig.miningCost.historyRounds,
    })
  );

  return container;
}
