// Run once after deploying feature update:  node scripts/migrate.mjs
// Adds the staff_lifecycle and staff_driver_info tables.

import pg from "pg";
import { readFileSync } from "fs";

const { Pool } = pg;

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#") && rest.length) process.env[key.trim()] = rest.join("=").trim();
  }
} catch {}

const connString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
console.log("Connecting to:", connString?.replace(/:([^:@]+)@/, ":***@"));

const pool = new Pool({
  connectionString: connString,
  ssl: connString?.includes("localhost") ? false : { rejectUnauthorized: false },
});

const sql = `
CREATE TABLE IF NOT EXISTS staff_lifecycle (
  staff_id     TEXT PRIMARY KEY,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  leaving_date DATE,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_driver_info (
  staff_id               TEXT PRIMARY KEY,
  is_driver              BOOLEAN NOT NULL DEFAULT false,
  dl_number              TEXT,
  dl_expires             DATE,
  transport_training_date DATE,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
`;

try {
  await pool.query(sql);
  console.log("✅ Migration complete.");
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
} finally {
  try { await pool.end(); } catch {}
}
