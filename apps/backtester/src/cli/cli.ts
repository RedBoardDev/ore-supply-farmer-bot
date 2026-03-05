import { Command } from 'commander';
import { registerOptimizeCommand } from '@backtester/cli/commands/optimize.command';
import { registerTestCommand } from '@backtester/cli/commands/test.command';

export function createCLI(): Command {
  const program = new Command();

  program.name('backtest').description('ORE Bot Backtesting and Optimization System').version('1.0.0');

  registerTestCommand(program);
  registerOptimizeCommand(program);

  return program;
}
