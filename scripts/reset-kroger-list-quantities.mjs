// node scripts/reset-kroger-list-quantities.mjs
// One-off fix: sets every saved-list item's default quantity back to 1,
// for lists that were already seeded before the defaults were corrected.
// Safe to run any time — just resets a number, doesn't touch anything else.

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

try {
  const r = await pool.query("UPDATE kroger_saved_list_items SET default_quantity = 1 WHERE default_quantity <> 1");
  console.log(`✓ Reset ${r.rowCount} item(s) to a default quantity of 1.`);
} catch (err) {
  console.error("Reset failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
