import { Pool } from "pg";

const globalForPg = globalThis;

export const pool =
  globalForPg.__pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://pulse@localhost:5433/ai_pulse",
    host: process.env.PGHOST ?? "/tmp",
    port: Number(process.env.PGPORT ?? 5433),
    database: process.env.PGDATABASE ?? "ai_pulse",
    user: process.env.PGUSER ?? "pulse",
    max: 8,
  });
if (!globalForPg.__pgPool) globalForPg.__pgPool = pool;

export async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}
