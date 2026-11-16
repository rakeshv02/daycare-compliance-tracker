// Additive migration for the app's existing external Compliance database.
import pg from "pg";
try { process.loadEnvFile(".env.local"); } catch {}
const connectionString = process.env.COMPLIANCE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Compliance database is not configured.");
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    ALTER TABLE inquiries
      ADD COLUMN IF NOT EXISTS payment_receipt_number TEXT,
      ADD COLUMN IF NOT EXISTS payment_date DATE;
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'inquiries'::regclass AND conname = 'inquiries_payment_receipt_pair'
      ) THEN
        ALTER TABLE inquiries ADD CONSTRAINT inquiries_payment_receipt_pair CHECK (
          (payment_receipt_number IS NULL AND payment_date IS NULL)
          OR (
            payment_receipt_number IS NOT NULL AND payment_date IS NOT NULL
            AND length(payment_receipt_number) BETWEEN 1 AND 100
            AND payment_receipt_number ~ '^[A-Za-z0-9]+$'
          )
        );
      END IF;
    END $$;
  `);
  await client.query("COMMIT");
  console.log("Payment receipt fields ready; existing inquiry values were not changed.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
