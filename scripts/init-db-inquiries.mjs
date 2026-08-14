// node scripts/init-db-inquiries.mjs
// Adds the `inquiries` table for the parent waitlist/enquiry tool.

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
CREATE TABLE IF NOT EXISTS inquiries (
  id                      SERIAL PRIMARY KEY,
  site                    TEXT NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),

  parent_first            TEXT NOT NULL,
  parent_last             TEXT NOT NULL,
  phone                   TEXT NOT NULL,
  email                   TEXT,

  child1_first            TEXT,
  child1_last             TEXT,
  child1_birthday         DATE,
  child1_date_needed      DATE,

  child2_first            TEXT,
  child2_last             TEXT,
  child2_birthday         DATE,
  child2_date_needed      DATE,

  tour_time               TIMESTAMPTZ,
  tour_completed          BOOLEAN NOT NULL DEFAULT false,
  tour_completed_at       TIMESTAMPTZ,

  thank_you_sent          BOOLEAN NOT NULL DEFAULT false,
  thank_you_sent_at       TIMESTAMPTZ,
  thank_you_error         TEXT,

  enrolled                BOOLEAN NOT NULL DEFAULT false,
  start_date              DATE,
  registration_type       TEXT,
  assigned_classroom      TEXT,
  paperwork_returned_date DATE,
  teacher_notified        BOOLEAN NOT NULL DEFAULT false,
  registration_paid       BOOLEAN NOT NULL DEFAULT false,
  notes                   TEXT,

  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiries_site_idx ON inquiries (site);
CREATE INDEX IF NOT EXISTS inquiries_created_idx ON inquiries (created_at DESC);

-- Audit trail for sensitive actions on the no-login waitlist dashboard
-- (deleting a record, sending a thank-you text) — records which staff
-- action-code performed it and when.
CREATE TABLE IF NOT EXISTS inquiry_audit_log (
  id           SERIAL PRIMARY KEY,
  inquiry_id   INTEGER NOT NULL,
  action       TEXT NOT NULL,
  staff_name   TEXT NOT NULL,
  detail       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiry_audit_log_inquiry_idx ON inquiry_audit_log (inquiry_id);

-- Do-not-enroll flag (e.g. inappropriate behavior during tour) and
-- CCS/state-subsidy approval tracking. ADD COLUMN IF NOT EXISTS is safe to
-- run again even if the table already exists.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS ccs_approved BOOLEAN NOT NULL DEFAULT false;

-- Records that the parent checked the consent/fee-disclosure box, and when.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ;
`;

try {
  await pool.query(sql);
  console.log("✅ inquiries table ready.");
} catch (err) {
  console.error("❌", err.message);
  process.exit(1);
} finally {
  try { await pool.end(); } catch {}
}
