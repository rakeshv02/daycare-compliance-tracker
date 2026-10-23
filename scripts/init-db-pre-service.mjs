// One-time backfill for the existing external Compliance database.
import pg from "pg";
import { pathToFileURL } from "node:url";
import { STAFF_BASE } from "../lib/staff.ts";

export async function initializePreService(client) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('compliance-pre-service-init'))");
    const exists = await client.query("SELECT to_regclass('public.staff_pre_service') AS existing");
    if (exists.rows[0].existing) {
      await client.query("COMMIT");
      return { alreadyInitialized: true, backfilled: 0, missingHireDates: 0 };
    }
    await client.query(`
      CREATE TABLE staff_pre_service (
        staff_id TEXT PRIMARY KEY,
        completed BOOLEAN NOT NULL DEFAULT false,
        completed_date DATE,
        date_source TEXT NOT NULL DEFAULT 'manual'
          CHECK (date_source IN ('manual', 'hire_date_backfill')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (completed OR completed_date IS NULL)
      )
    `);
    const members = await client.query("SELECT id, hire_date::text, is_db_only FROM staff_members");
    const overrides = new Map(members.rows.map((r) => [r.id, r]));
    const staff = new Map(STAFF_BASE.map((s) => [
      s.id, overrides.get(s.id)?.hire_date ?? s.hireDate ?? null,
    ]));
    for (const row of members.rows) {
      if (row.is_db_only && !staff.has(row.id)) staff.set(row.id, row.hire_date);
    }
    let missingHireDates = 0;
    for (const [id, hireDate] of staff) {
      if (!hireDate) missingHireDates++;
      await client.query(
        `INSERT INTO staff_pre_service (staff_id, completed, completed_date, date_source)
         VALUES ($1, true, $2, 'hire_date_backfill')`,
        [id, hireDate || null]
      );
    }
    await client.query("COMMIT");
    return { alreadyInitialized: false, backfilled: staff.size, missingHireDates };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(".env.local"); } catch {}
  const connectionString = process.env.COMPLIANCE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Compliance database is not configured.");
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    console.log(JSON.stringify(await initializePreService(client)));
  } finally {
    client.release();
    await pool.end();
  }
}
