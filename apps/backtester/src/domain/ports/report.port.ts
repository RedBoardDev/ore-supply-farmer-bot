import type { BacktestResult } from '@backtester/domain/aggregates/backtest-result.aggregate';
import type { OptimizationResult } from '@backtester/domain/ports/optimizer.port';

export interface ReportPort {
  generateTestReport(result: BacktestResult, verbose?: boolean): void;
  generateOptimizationReport(result: OptimizationResult): void;
  generatePerRoundBreakdown(result: BacktestResult, limit?: number): void;
}

export interface JsonReportPort {
  exportTestReport(result: BacktestResult, outputPath: string): Promise<void>;
  exportOptimizationReport(result: OptimizationResult, outputPath: string): Promise<void>;
}
