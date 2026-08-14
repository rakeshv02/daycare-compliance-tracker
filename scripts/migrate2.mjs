// node scripts/migrate2.mjs
// Adds staff_members table for new hires and editable overrides.

import pg from "pg";
import { readFileSync } from "fs";

const { Pool } = pg;
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

const connString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
console.log("Connecting to:", connString?.replace(/:([^:@]+)@/, ":***@"));
const pool = new Pool({ connectionString: connString, ssl: connString?.includes("localhost") ? false : { rejectUnauthorized: false } });

const sql = `
CREATE TABLE IF NOT EXISTS staff_members (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  site        TEXT NOT NULL,
  hire_date   DATE,
  is_db_only  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
`;

try {
  await pool.query(sql);
  console.log("✅ staff_members table ready.");
} catch (err) {
  console.error("❌", err.message);
  process.exit(1);
} finally {
  try { await pool.end(); } catch {}
}
