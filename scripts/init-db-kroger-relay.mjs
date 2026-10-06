// Additive migration for this app's existing external Neon database.
import pg from "pg";
try { process.loadEnvFile(".env.local"); } catch {}
const connectionString = process.env.COMPLIANCE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Compliance database is not configured.");
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kroger_cart_dispatches (
      token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      order_id INTEGER UNIQUE REFERENCES kroger_orders(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('cart', 'probe')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 seconds'),
      started_at TIMESTAMPTZ,
      execution_host TEXT,
      completed_at TIMESTAMPTZ,
      result JSONB,
      CHECK ((purpose = 'cart' AND order_id IS NOT NULL)
          OR (purpose = 'probe' AND order_id IS NULL))
    );
  `);
  console.log("Kroger relay schema ready; existing orders were not changed.");
} finally {
  await pool.end();
}
