// Run once after deploying to create tables: node scripts/init-db.mjs
// Requires DATABASE_URL in environment (or .env.local loaded by dotenv).

import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const { Pool } = pg;

// Load .env.local manually if present
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#") && rest.length) {
      let val = rest.join("=").trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key.trim()] = val;
    }
  }
} catch {}

// Use the unpooled connection for DDL (pgbouncer doesn't support CREATE TABLE)
const connString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
console.log("Connecting to:", connString?.replace(/:([^:@]+)@/, ":***@"));

const pool = new Pool({
  connectionString: connString,
  ssl: connString?.includes("localhost") ? false : { rejectUnauthorized: false },
});

const sql = `
CREATE TABLE IF NOT EXISTS staff_credentials (
  staff_id    TEXT NOT NULL,
  cred_type   TEXT NOT NULL,
  issued_date DATE,
  expires_date DATE NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (staff_id, cred_type)
);

CREATE TABLE IF NOT EXISTS training_entries (
  id          SERIAL PRIMARY KEY,
  staff_id    TEXT NOT NULL,
  entry_date  DATE NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  hours       NUMERIC(5,1) NOT NULL,
  topic       TEXT NOT NULL DEFAULT 'core',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS training_entries_staff_idx ON training_entries (staff_id);

CREATE TABLE IF NOT EXISTS staff_roles (
  staff_id   TEXT PRIMARY KEY,
  role       TEXT NOT NULL DEFAULT 'Caregiver',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

try {
  await pool.query(sql);
  console.log("✅ Tables created (or already exist).");
} catch (err) {
  console.error("❌ Error:", err.message);
  console.error("Full error:", err);
  process.exit(1);
} finally {
  try { await pool.end(); } catch {}
}
