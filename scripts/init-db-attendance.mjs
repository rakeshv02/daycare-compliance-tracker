import pg from "pg";
import { readFileSync } from "fs";

const { Pool } = pg;
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && !key.startsWith("#") && rest.length) process.env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
} catch {}

const connectionString =
  process.env.COMPLIANCE_DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.COMPLIANCE_DATABASE_URL ||
  process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes("localhost") ? false : { rejectUnauthorized: false },
});

const sql = `
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
  ON attendance_schedules(staff_id, weekday, effective_from DESC);

CREATE TABLE IF NOT EXISTS attendance_schedule_overrides (
  id BIGSERIAL PRIMARY KEY,
  staff_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  scheduled_start TIME,
  scheduled_end TIME,
  is_workday BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, work_date)
);
CREATE INDEX IF NOT EXISTS attendance_schedule_overrides_lookup_idx
  ON attendance_schedule_overrides(staff_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_day_classifications (
  staff_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  classification TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(staff_id, work_date)
);
`;

try {
  await pool.query(sql);
  console.log("Attendance tables created (or already exist).");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}