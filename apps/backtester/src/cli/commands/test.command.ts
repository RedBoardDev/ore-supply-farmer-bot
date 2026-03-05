import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { RunBacktestUseCase } from '@backtester/application/use-cases/run-backtest.usecase';
import { parseBacktestConfig } from '@backtester/domain/value-objects/backtest-config.vo';
import { createSimulationParams } from '@backtester/domain/value-objects/simulation-params.vo';
import { ConsoleReportAdapter } from '@backtester/infrastructure/adapters/report/console-report.adapter';
import { BacktestSimulatorAdapter } from '@backtester/infrastructure/adapters/simulator/backtest-simulator.adapter';
import { SqliteHistoricalDataAdapter } from '@backtester/infrastructure/adapters/sqlite/sqlite-historical-data.adapter';
import { logInfo, setLogLevel } from '@backtester/infrastructure/logging/levelled-logger';
import {
  validateBalanceParameter,
  validateConfigFile,
  validateLogLevelParameter,
  validateRoundIdParameter,
  validateRoundsParameter,
} from '@backtester/cli/validators';

interface TestCommandOptions {
  config: string;
  rounds?: string;
  startRound?: string;
  endRound?: string;
  balance?: string;
  output?: string;
  verbose?: boolean;
  logLevel?: string;
}

export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description('Test a configuration on historical data')
    .requiredOption('-c, --config <path>', 'Path to config.json file')
    .option('-n, --rounds <number>', 'Number of rounds to test')
    .option('--start-round <id>', 'Start from this round ID')
    .option('--end-round <id>', 'End at this round ID')
    .option('-b, --balance <sol>', 'Initial balance in SOL', '10')
    .option('-o, --output <path>', 'Output JSON report to file')
    .option('-v, --verbose', 'Show per-round breakdown', false)
    .option('-l, --log-level <level>', 'Log level (debug|info|warn|error|silent)', 'warn')
    .action(async (options: TestCommandOptions) => {
      try {
        await executeTestCommand(options);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function executeTestCommand(options: TestCommandOptions): Promise<void> {
  if (!options.config) {
    throw new Error('Config file path is required');
  }

  const logLevel = validateLogLevelParameter(options.logLevel);
  setLogLevel(logLevel);

  const configPath = path.resolve(options.config);
  const configData = validateConfigFile(configPath);

  const backtestConfig = parseBacktestConfig(configData);

  const roundCount = options.rounds ? validateRoundsParameter(options.rounds) : null;
  const startRoundId = options.startRound ? validateRoundIdParameter(options.startRound) : null;
  const endRoundId = options.endRound ? validateRoundIdParameter(options.endRound) : null;
  const initialBalanceSol = validateBalanceParameter(options.balance ?? '10');

  let dbPath = path.join(process.cwd(), 'rounds.db');
  if (!fs.existsSync(dbPath)) {
    dbPath = path.join(process.cwd(), '../../rounds.db');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found at ${dbPath}. Please ensure rounds.db exists.`);
    }
  }

  const historicalData = new SqliteHistoricalDataAdapter(dbPath);
  const simulator = new BacktestSimulatorAdapter();
  const reportAdapter = new ConsoleReportAdapter();

  const useCase = new RunBacktestUseCase(historicalData, simulator);

  logInfo('Fetching dataset info...');
  const datasetInfo = await useCase.getDatasetInfo();
  logInfo(`Dataset contains ${datasetInfo.totalRounds} valid rounds`);
  logInfo(`Round ID range: ${datasetInfo.oldestRoundId} - ${datasetInfo.latestRoundId}`);
  logInfo('');

  const params = createSimulationParams({
    roundCount,
    startRoundId,
    endRoundId,
    initialBalanceSol,
  });

  const result = await useCase.execute({
    config: backtestConfig,
    params,
  });

  reportAdapter.generateTestReport(result, options.verbose);

  if (options.output) {
    logInfo('\nJSON report export not yet implemented');
  }

  historicalData.close();
}
