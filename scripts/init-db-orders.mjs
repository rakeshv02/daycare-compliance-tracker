// node scripts/init-db-orders.mjs
// Adds tables for the Kroger grocery-ordering module.

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
-- Single-row table holding the one shared Kroger customer OAuth token
-- (authorization_code flow — represents your actual Kroger.com login).
CREATE TABLE IF NOT EXISTS kroger_auth (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  connected_by  TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kroger_auth_singleton CHECK (id = 1)
);

-- Which physical Kroger store (locationId) each site orders from.
CREATE TABLE IF NOT EXISTS kroger_stores (
  site        TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  store_name  TEXT NOT NULL,
  address     TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order history — one row per submitted batch.
CREATE TABLE IF NOT EXISTS kroger_orders (
  id               SERIAL PRIMARY KEY,
  site             TEXT NOT NULL,
  submitted_by     TEXT NOT NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  item_count       INTEGER NOT NULL,
  estimated_total  NUMERIC(10,2),
  status           TEXT NOT NULL DEFAULT 'pushed_to_cart',
  error            TEXT
);

CREATE TABLE IF NOT EXISTS kroger_order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES kroger_orders(id) ON DELETE CASCADE,
  upc        TEXT NOT NULL,
  name       TEXT NOT NULL,
  brand      TEXT,
  price      NUMERIC(10,2),
  quantity   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kroger_orders_site ON kroger_orders(site);
CREATE INDEX IF NOT EXISTS idx_kroger_order_items_order ON kroger_order_items(order_id);

-- Orders now go through a review step: a site submits a list ('pending'),
-- and only the director pushes it into the real Kroger cart ('pushed_to_cart').
-- This avoids two sites' items landing in the same shared Kroger cart at once.
ALTER TABLE kroger_orders ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE kroger_orders ADD COLUMN IF NOT EXISTS pushed_by TEXT;
ALTER TABLE kroger_orders ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

-- Superseded by kroger_saved_list_items below (UPC-based, not raw text).
-- Left in place harmlessly in case it already has rows on some environment.
CREATE TABLE IF NOT EXISTS kroger_saved_lists (
  site       TEXT PRIMARY KEY,
  raw_text   TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom (non-catalog) line items: Kroger's Cart API only accepts real UPCs,
-- so an item nobody can find in the catalog still needs to travel through
-- the order as a plain name+quantity, flagged for manual add on Kroger.com.
ALTER TABLE kroger_order_items ALTER COLUMN upc DROP NOT NULL;
ALTER TABLE kroger_order_items ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

-- Each site's real standard shopping list, seeded from actual past Kroger
-- receipts (exact UPCs — no fuzzy text search needed to reorder these).
-- frequency distinguishes staples ordered nearly every time from items
-- that only come up occasionally.
CREATE TABLE IF NOT EXISTS kroger_saved_list_items (
  id               SERIAL PRIMARY KEY,
  site             TEXT NOT NULL,
  upc              TEXT,              -- NULL for custom (non-catalog) items
  name             TEXT NOT NULL,
  brand            TEXT,
  default_quantity INTEGER NOT NULL DEFAULT 1,
  frequency        TEXT NOT NULL DEFAULT 'weekly', -- 'weekly' | 'occasional'
  is_custom        BOOLEAN NOT NULL DEFAULT false,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kroger_saved_list_items_site ON kroger_saved_list_items(site);
`;

try {
  await pool.query(sql);
  console.log("✓ Kroger ordering tables ready.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
