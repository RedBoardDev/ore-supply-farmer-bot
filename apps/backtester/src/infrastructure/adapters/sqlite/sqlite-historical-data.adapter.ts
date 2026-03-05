import Database from 'better-sqlite3';
import type { HistoricalDataPort, HistoricalDataQuery } from '@backtester/domain/ports/historical-data.port';
import type { HistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import { createHistoricalRound } from '@backtester/domain/entities/historical-round.entity';
import {
  buildRoundsQuery,
  buildTilesQuery,
  buildCountQuery,
  buildMinMaxQuery,
} from '@backtester/infrastructure/adapters/sqlite/sqlite-queries';
import { logInfo, logWarn } from '@backtester/infrastructure/logging/levelled-logger';

interface RoundRow {
  round_id: number;
  winning_tile: number;
  price_ore_usd: number;
  price_sol_usd: number;
  total_deployed: number;
  ts_pre: number;
  board_end_slot: number;
}

interface TileRow {
  tile_index: number;
  deployed: number;
  ev_ratio: number;
}

export class SqliteHistoricalDataAdapter implements HistoricalDataPort {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
    this.db.pragma('journal_mode = WAL');
  }

  async getRounds(query: HistoricalDataQuery): Promise<readonly HistoricalRound[]> {
    const { sql, params } = buildRoundsQuery(query);
    const roundRows = this.db.prepare(sql).all(...params) as RoundRow[];

    const rounds: HistoricalRound[] = [];
    let skipped = 0;

    for (const row of roundRows) {
      try {
        const round = await this.loadRound(row);
        if (round) {
          rounds.push(round);
        } else {
          skipped++;
        }
      } catch (error) {
        logWarn(`Skipping invalid round ${row.round_id}: ${formatError(error)}`);
        skipped++;
      }
    }

    if (skipped > 0) {
      logInfo(`Loaded ${rounds.length} valid rounds, skipped ${skipped} invalid rounds`);
    }

    return rounds;
  }

  async getRoundCount(): Promise<number> {
    const sql = buildCountQuery();
    const result = this.db.prepare(sql).get() as { count: number };
    return result.count;
  }

  async getLatestRoundId(): Promise<bigint> {
    const sql = buildMinMaxQuery();
    const result = this.db.prepare(sql).get() as { min_id: number; max_id: number };
    return BigInt(result.max_id);
  }

  async getOldestRoundId(): Promise<bigint> {
    const sql = buildMinMaxQuery();
    const result = this.db.prepare(sql).get() as { min_id: number; max_id: number };
    return BigInt(result.min_id);
  }

  private async loadRound(row: RoundRow): Promise<HistoricalRound | null> {
    if (!this.validateRoundRow(row)) {
      return null;
    }

    const { sql: tilesSql, params: tilesParams } = buildTilesQuery(BigInt(row.round_id));
    const tileRows = this.db.prepare(tilesSql).all(...tilesParams) as TileRow[];

    if (tileRows.length !== 25) {
      logWarn(`Round ${row.round_id} has ${tileRows.length} tiles, expected 25`);
      return null;
    }

    tileRows.sort((a, b) => a.tile_index - b.tile_index);

    const deployed = tileRows.map((tile) => BigInt(tile.deployed));

    if (deployed.some((d) => d < 0n)) {
      logWarn(`Round ${row.round_id} has negative deployed values`);
      return null;
    }

    try {
      return createHistoricalRound({
        roundId: BigInt(row.round_id),
        deployed,
        motherlode: this.calculateMotherlode(deployed),
        expiresAt: BigInt(row.board_end_slot),
        winningTile: row.winning_tile,
        solPriceUsd: row.price_sol_usd,
        orePriceUsd: row.price_ore_usd,
        totalDeployedSol: row.total_deployed / 1_000_000_000,
        timestamp: row.ts_pre,
      });
    } catch (error) {
      logWarn(`Failed to create HistoricalRound for ${row.round_id}: ${formatError(error)}`);
      return null;
    }
  }

  private validateRoundRow(row: RoundRow): boolean {
    if (!row.round_id || row.round_id <= 0) return false;
    if (row.winning_tile === null || row.winning_tile === undefined) return false;
    if (row.winning_tile < 0 || row.winning_tile > 24) return false;
    if (!row.price_ore_usd || row.price_ore_usd <= 0) return false;
    if (!row.price_sol_usd || row.price_sol_usd <= 0) return false;
    if (!row.total_deployed || row.total_deployed < 0) return false;

    return true;
  }

  private calculateMotherlode(deployed: readonly bigint[]): bigint {
    const totalDeployed = deployed.reduce((sum, d) => sum + d, 0n);
    const motherlodePercent = 0.1;
    return BigInt(Math.floor(Number(totalDeployed) * motherlodePercent));
  }

  close(): void {
    this.db.close();
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
