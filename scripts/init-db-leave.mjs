import pg from "pg";
const connectionString = process.env.COMPLIANCE_DATABASE_URL || process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString?.includes("localhost") ? false : { rejectUnauthorized: false },
});
try {
  await pool.query(`
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
  `);
  console.log("Leave tables created (or already exist).");
} finally {
  await pool.end();
}