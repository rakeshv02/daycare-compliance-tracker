import pool from "@/lib/db";
import { getKrogerAuthStatus } from "@/lib/kroger";
import OrdersSetup from "@/components/orders-setup";
import type { Site } from "@/lib/inquiries";
import type { StoreConfig } from "@/app/dashboard/orders/page";

// This page has no getServerSession() call (unlike /dashboard/orders), so
// Next.js would otherwise try to statically prerender it at build time and
// hit the live database before the kroger_stores table necessarily exists.
export const dynamic = "force-dynamic";

async function loadStores(): Promise<StoreConfig[]> {
  const r = await pool.query<{ site: string; location_id: string; store_name: string; address: string }>(
    "SELECT site, location_id, store_name, address FROM kroger_stores"
  );
  return r.rows.map((row) => ({ site: row.site as Site, locationId: row.location_id, storeName: row.store_name, address: row.address }));
}

export default async function OrdersSetupPage({
  searchParams,
}: {
  searchParams: { kroger_connected?: string; kroger_error?: string };
}) {
  const [authStatus, stores] = await Promise.all([getKrogerAuthStatus(), loadStores()]);

  return (
    <OrdersSetup
      authStatus={authStatus}
      stores={stores}
      justConnected={searchParams.kroger_connected === "1"}
      connectError={searchParams.kroger_error ?? null}
    />
  );
}
