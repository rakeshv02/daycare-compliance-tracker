import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool from "@/lib/db";
import OrdersBoard from "@/components/orders-board";
import { getPendingOrders } from "@/lib/kroger-actions";
import type { Site } from "@/lib/inquiries";

export type StoreConfig = { site: Site; locationId: string; storeName: string; address: string };
export type OrderHistoryItem = { upc: string | null; name: string; brand: string | null; price: number | null; quantity: number; isCustom: boolean };
export type OrderHistoryEntry = {
  id: number;
  site: string;
  submittedBy: string;
  submittedAt: string;
  itemCount: number;
  estimatedTotal: number | null;
  status: string;
  error: string | null;
  items: OrderHistoryItem[];
};

async function loadStores(): Promise<StoreConfig[]> {
  const r = await pool.query<{ site: string; location_id: string; store_name: string; address: string }>(
    "SELECT site, location_id, store_name, address FROM kroger_stores"
  );
  return r.rows.map((row) => ({ site: row.site as Site, locationId: row.location_id, storeName: row.store_name, address: row.address }));
}

async function loadOrderHistory(): Promise<OrderHistoryEntry[]> {
  const [orders, items] = await Promise.all([
    pool.query<{
      id: number; site: string; submitted_by: string; submitted_at: string;
      item_count: number; estimated_total: string | null; status: string; error: string | null;
    }>("SELECT id, site, submitted_by, submitted_at::text, item_count, estimated_total::text, status, error FROM kroger_orders ORDER BY submitted_at DESC LIMIT 50"),
    pool.query<{ order_id: number; upc: string | null; name: string; brand: string | null; price: string | null; quantity: number; is_custom: boolean }>(
      "SELECT order_id, upc, name, brand, price::text, quantity, is_custom FROM kroger_order_items"
    ),
  ]);

  const itemsByOrder = new Map<number, OrderHistoryItem[]>();
  for (const it of items.rows) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push({ upc: it.upc, name: it.name, brand: it.brand, price: it.price ? Number(it.price) : null, quantity: it.quantity, isCustom: it.is_custom });
    itemsByOrder.set(it.order_id, list);
  }

  return orders.rows.map((o) => ({
    id: o.id,
    site: o.site,
    submittedBy: o.submitted_by,
    submittedAt: o.submitted_at,
    itemCount: o.item_count,
    estimatedTotal: o.estimated_total ? Number(o.estimated_total) : null,
    status: o.status,
    error: o.error,
    items: itemsByOrder.get(o.id) ?? [],
  }));
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  const sessionSite = (session?.user.site ?? "all") as import("@/lib/staff").SiteFilter;

  const [stores, history, pendingOrders] = await Promise.all([
    loadStores(),
    loadOrderHistory(),
    sessionSite === "all" ? getPendingOrders() : Promise.resolve([]),
  ]);

  return <OrdersBoard sessionSite={sessionSite} stores={stores} history={history} pendingOrders={pendingOrders} />;
}
