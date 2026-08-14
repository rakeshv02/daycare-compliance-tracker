import { Pool } from "pg";

// Use COMPLIANCE_DATABASE_URL to avoid colliding with Blossoms Connect's DATABASE_URL
const connectionString =
  process.env.COMPLIANCE_DATABASE_URL || process.env.DATABASE_URL;

// Reuse the pool across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool() {
  if (!connectionString) {
    throw new Error(
      "COMPLIANCE_DATABASE_URL is not set. Add your Neon connection string as a secret."
    );
  }
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    max: 10,
  });
}

const pool = globalThis._pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis._pgPool = pool;

export default pool;
