import type { HistoricalDataQuery } from '@backtester/domain/ports/historical-data.port';

export function buildRoundsQuery(query: HistoricalDataQuery): { sql: string; params: unknown[] } {
  let sql = `
    SELECT
      r.round_id,
      r.winning_tile,
      r.price_ore_usd,
      r.price_sol_usd,
      r.total_deployed,
      r.ts_pre,
      r.board_end_slot
    FROM rounds r
    WHERE r.winning_tile IS NOT NULL
      AND r.price_ore_usd > 0
      AND r.price_sol_usd > 0
  `;

  const params: unknown[] = [];

  if (query.startRoundId !== undefined && query.startRoundId !== null) {
    sql += ` AND r.round_id >= ?`;
    params.push(Number(query.startRoundId));
  }

  if (query.endRoundId !== undefined && query.endRoundId !== null) {
    sql += ` AND r.round_id <= ?`;
    params.push(Number(query.endRoundId));
  }

  sql += ` ORDER BY r.round_id ASC`;

  if (query.offset !== undefined && query.offset > 0) {
    sql += ` LIMIT -1 OFFSET ?`;
    params.push(query.offset);
  }

  if (query.count !== undefined && query.count !== null) {
    if (query.offset !== undefined && query.offset > 0) {
      sql = sql.replace('LIMIT -1 OFFSET ?', 'LIMIT ? OFFSET ?');
      params[params.length - 1] = query.count;
      params.push(query.offset);
    } else {
      sql += ` LIMIT ?`;
      params.push(query.count);
    }
  }

  return { sql, params };
}

export function buildTilesQuery(roundId: bigint): { sql: string; params: unknown[] } {
  const sql = `
    SELECT
      tile_index,
      deployed,
      ev_ratio
    FROM tiles
    WHERE round_id = ?
    ORDER BY tile_index ASC
  `;

  return { sql, params: [Number(roundId)] };
}

export function buildCountQuery(): string {
  return `
    SELECT COUNT(*) as count
    FROM rounds
    WHERE winning_tile IS NOT NULL
      AND price_ore_usd > 0
      AND price_sol_usd > 0
  `;
}

export function buildMinMaxQuery(): string {
  return `
    SELECT
      MIN(round_id) as min_id,
      MAX(round_id) as max_id
    FROM rounds
    WHERE winning_tile IS NOT NULL
      AND price_ore_usd > 0
      AND price_sol_usd > 0
  `;
}
