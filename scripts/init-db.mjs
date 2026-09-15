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

CREATE TABLE IF NOT EXISTS attendance_imports (
  id BIGSERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_name_matches (
  normalized_name TEXT NOT NULL,
  site TEXT NOT NULL,
  imported_name TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (normalized_name, site)
);

CREATE TABLE IF NOT EXISTS attendance_punches (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES attendance_imports(id) ON DELETE CASCADE,
  source_row INTEGER NOT NULL,
  work_date DATE NOT NULL,
  punch_time TIME NOT NULL,
  punch_status TEXT NOT NULL CHECK (punch_status IN ('In', 'Out')),
  site TEXT NOT NULL,
  imported_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  staff_id TEXT,
  UNIQUE(import_id, source_row)
);
CREATE INDEX IF NOT EXISTS attendance_punches_date_idx ON attendance_punches(work_date);
CREATE INDEX IF NOT EXISTS attendance_punches_staff_idx ON attendance_punches(staff_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_schedules (
  id BIGSERIAL PRIMARY KEY,
  staff_id TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  effective_from DATE NOT NULL,
  scheduled_start TIME,
  scheduled_end TIME,
  is_workday BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, weekday, effective_from)
);
CREATE INDEX IF NOT EXISTS attendance_schedules_lookup_idx
  ON attendance_schedules(staff_id, weekday,effective_from DESC);

CREATE TABLE IF NOT EXISTS attendance_day_classifications (
  staff_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  classification TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(staff_id, work_date)
);

CREATE TABLE IF NOT EXISTS staff_leave_access (
  staff_id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_employee_ids (
  staff_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_leave_requests (
  id BIGSERIAL PRIMARY KEY,
  staff_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  is_paid_vacation BOOLEAN NOT NULL DEFAULT FALSE,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Approved','Denied','Cancelled')),
  director_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS staff_leave_requests_staff_idx
  ON staff_leave_requests(staff_id,date_from);
CREATE INDEX IF NOT EXISTS staff_leave_requests_status_idx
  ON staff_leave_requests(status,created_at);
ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS is_paid_vacation BOOLEAN NOT NULL DEFAULT FALSE;
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
