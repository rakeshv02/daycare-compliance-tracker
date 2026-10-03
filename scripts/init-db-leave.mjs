import pg from "pg";
const connectionString = process.env.COMPLIANCE_DATABASE_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString?.includes("localhost") ? false : { rejectUnauthorized: false },
});
try {
  await pool.query(`
    BEGIN;
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
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Denied','Cancelled')),
      director_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (date_to >= date_from)
    );
    CREATE INDEX IF NOT EXISTS staff_leave_requests_staff_idx ON staff_leave_requests(staff_id,date_from);
    CREATE INDEX IF NOT EXISTS staff_leave_requests_status_idx ON staff_leave_requests(status,created_at);
    ALTER TABLE staff_leave_requests
      ADD COLUMN IF NOT EXISTS is_paid_vacation BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE staff_leave_requests
      ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT 'Full day' CHECK (duration IN ('Full day','Half day','Part of day')),
      ADD COLUMN IF NOT EXISTS start_time TIME,
      ADD COLUMN IF NOT EXISTS end_time TIME;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staff_leave_requests_partial_time_check'
        AND conrelid='staff_leave_requests'::regclass) THEN
        ALTER TABLE staff_leave_requests ADD CONSTRAINT staff_leave_requests_partial_time_check CHECK (
          (duration='Full day' AND start_time IS NULL AND end_time IS NULL) OR
          (duration IN ('Half day','Part of day') AND date_from=date_to
            AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time>start_time)
        );
      END IF;
    END $$;
    COMMIT;
  `);
  console.log("Leave tables created (or already exist).");
} finally {
  await pool.end();
}