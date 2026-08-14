"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import pool from "./db";
import { authOptions } from "./auth";
import { searchStores, searchProducts, getProductsByUpcs, addToCart } from "./kroger";
import type { StoreResult, ProductResult, CartItemInput } from "./kroger";

async function requireStaffName(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not signed in.");
  return session.user.name ?? session.user.site ?? "Unknown";
}

// Only the director account (site === "all") is allowed to actually push
// an order into the real, shared Kroger cart — see the "pending" flow below.
async function requireDirector(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Not signed in.");
  if (session.user.site !== "all") throw new Error("Only the director account can push orders to Kroger.");
  return session.user.name ?? "Director";
}

export async function findKrogerStoresAction(zip: string): Promise<StoreResult[]> {
  await requireStaffName();
  if (!zip.trim()) throw new Error("Enter a zip code.");
  return searchStores(zip.trim());
}

export async function saveKrogerStore(site: string, store: StoreResult): Promise<void> {
  await requireStaffName();
  await pool.query(
    `INSERT INTO kroger_stores (site, location_id, store_name, address, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (site) DO UPDATE SET
       location_id = EXCLUDED.location_id,
       store_name = EXCLUDED.store_name,
       address = EXCLUDED.address,
       updated_at = NOW()`,
    [site, store.locationId, store.name, store.address]
  );
  revalidatePath("/dashboard/orders/setup");
  revalidatePath("/dashboard/orders");
}

async function locationIdForSite(site: string): Promise<string> {
  const r = await pool.query<{ location_id: string }>("SELECT location_id FROM kroger_stores WHERE site = $1", [site]);
  const locationId = r.rows[0]?.location_id;
  if (!locationId) throw new Error(`No Kroger store set up for ${site} yet — go to Orders → Setup first.`);
  return locationId;
}

export async function searchKrogerProductsAction(term: string, site: string): Promise<ProductResult[]> {
  await requireStaffName();
  if (!term.trim()) return [];
  const locationId = await locationIdForSite(site);
  return searchProducts(term.trim(), locationId);
}

// ---------- Standard list (built from real receipts — exact UPCs) ----------

export type SavedListItem = {
  id: number;
  upc: string | null;
  name: string;
  brand: string | null;
  defaultQuantity: number;
  frequency: "weekly" | "occasional";
  isCustom: boolean;
  price: number | null;
  promoPrice: number | null;
  imageUrl: string | null;
};

export async function getSavedListItems(site: string): Promise<SavedListItem[]> {
  await requireStaffName();
  const rows = await pool.query<{
    id: number; upc: string | null; name: string; brand: string | null;
    default_quantity: number; frequency: string; is_custom: boolean;
  }>("SELECT id, upc, name, brand, default_quantity, frequency, is_custom FROM kroger_saved_list_items WHERE site = $1 ORDER BY frequency DESC, sort_order ASC, id ASC", [site]);

  const catalogUpcs = rows.rows.filter((r) => r.upc && !r.is_custom).map((r) => r.upc as string);
  let liveByUpc = new Map<string, ProductResult>();
  if (catalogUpcs.length) {
    try {
      const locationId = await locationIdForSite(site);
      const live = await getProductsByUpcs(catalogUpcs, locationId);
      liveByUpc = new Map(live.map((p) => [p.upc, p]));
    } catch {
      // Store not set up yet, or lookup failed — fall back to saved name/no price below.
    }
  }

  return rows.rows.map((r) => {
    const live = r.upc ? liveByUpc.get(r.upc) : undefined;
    return {
      id: r.id,
      upc: r.upc,
      name: live?.name ?? r.name,
      brand: live?.brand ?? r.brand,
      defaultQuantity: r.default_quantity,
      frequency: r.frequency === "occasional" ? "occasional" : "weekly",
      isCustom: r.is_custom,
      price: live?.price ?? null,
      promoPrice: live?.promoPrice ?? null,
      imageUrl: live?.imageUrl ?? null,
    };
  });
}

export async function removeSavedListItemAction(id: number): Promise<void> {
  await requireStaffName();
  await pool.query("DELETE FROM kroger_saved_list_items WHERE id = $1", [id]);
  revalidatePath("/dashboard/orders");
}

// Adds a real Kroger product (from a search result) to the site's standard list.
export async function addProductToSavedList(site: string, product: ProductResult, quantity: number, frequency: "weekly" | "occasional"): Promise<void> {
  await requireStaffName();
  await pool.query(
    `INSERT INTO kroger_saved_list_items (site, upc, name, brand, default_quantity, frequency, is_custom)
     VALUES ($1, $2, $3, $4, $5, $6, false)`,
    [site, product.upc, product.name, product.brand, quantity, frequency]
  );
  revalidatePath("/dashboard/orders");
}

// Adds a non-catalog item to the site's standard list (e.g. a bakery order,
// or anything Kroger's search can't find). Flagged for manual add later.
export async function addCustomSavedListItem(site: string, name: string, quantity: number, frequency: "weekly" | "occasional"): Promise<void> {
  await requireStaffName();
  if (!name.trim()) throw new Error("Enter an item name.");
  await pool.query(
    `INSERT INTO kroger_saved_list_items (site, upc, name, brand, default_quantity, frequency, is_custom)
     VALUES ($1, NULL, $2, NULL, $3, $4, true)`,
    [site, name.trim(), quantity, frequency]
  );
  revalidatePath("/dashboard/orders");
}

// ---------- Submitting an order (goes to "pending" — director pushes it) ----------

export type SubmitOrderItem = {
  upc: string | null;
  name: string;
  brand: string | null;
  price: number | null;
  quantity: number;
  isCustom: boolean;
};

export async function submitKrogerOrder(site: string, items: SubmitOrderItem[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const staffName = await requireStaffName();
  if (!items.length) return { ok: false, error: "No items in the list." };

  const estimatedTotal = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);

  const orderResult = await pool.query<{ id: number }>(
    "INSERT INTO kroger_orders (site, submitted_by, item_count, estimated_total, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id",
    [site, staffName, items.length, estimatedTotal]
  );
  const orderId = orderResult.rows[0].id;

  for (const item of items) {
    await pool.query(
      "INSERT INTO kroger_order_items (order_id, upc, name, brand, price, quantity, is_custom) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [orderId, item.upc, item.name, item.brand, item.price, item.quantity, item.isCustom]
    );
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// ---------- Director review queue ----------

export type PendingOrder = {
  id: number;
  site: string;
  submittedBy: string;
  submittedAt: string;
  items: { upc: string | null; name: string; brand: string | null; price: number | null; quantity: number; isCustom: boolean }[];
  estimatedTotal: number | null;
};

export async function getPendingOrders(): Promise<PendingOrder[]> {
  await requireStaffName();
  const [orders, items] = await Promise.all([
    pool.query<{ id: number; site: string; submitted_by: string; submitted_at: string; estimated_total: string | null }>(
      "SELECT id, site, submitted_by, submitted_at::text, estimated_total::text FROM kroger_orders WHERE status = 'pending' ORDER BY submitted_at ASC"
    ),
    pool.query<{ order_id: number; upc: string | null; name: string; brand: string | null; price: string | null; quantity: number; is_custom: boolean }>(
      `SELECT oi.order_id, oi.upc, oi.name, oi.brand, oi.price::text, oi.quantity, oi.is_custom
       FROM kroger_order_items oi
       JOIN kroger_orders o ON o.id = oi.order_id
       WHERE o.status = 'pending'`
    ),
  ]);

  const itemsByOrder = new Map<number, PendingOrder["items"]>();
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
    items: itemsByOrder.get(o.id) ?? [],
    estimatedTotal: o.estimated_total ? Number(o.estimated_total) : null,
  }));
}

// Director-only: pushes one pending order's catalog items into the real
// Kroger cart. Custom (non-catalog) items can't go through the Cart API —
// they're reported back so the director knows to add them manually.
export async function pushOrderToKroger(orderId: number): Promise<{ ok: true; skipped: string[] } | { ok: false; error: string }> {
  const staffName = await requireDirector();

  const orderRes = await pool.query<{ id: number; status: string }>("SELECT id, status FROM kroger_orders WHERE id = $1", [orderId]);
  const order = orderRes.rows[0];
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending") return { ok: false, error: `Order is already ${order.status}.` };

  const itemsRes = await pool.query<{ upc: string | null; name: string; quantity: number; is_custom: boolean }>(
    "SELECT upc, name, quantity, is_custom FROM kroger_order_items WHERE order_id = $1",
    [orderId]
  );
  const catalogItems = itemsRes.rows.filter((r) => !r.is_custom && r.upc);
  const skipped = itemsRes.rows.filter((r) => r.is_custom || !r.upc).map((r) => `${r.name} (x${r.quantity})`);
  const cartItems: CartItemInput[] = catalogItems.map((r) => ({ upc: r.upc as string, quantity: r.quantity }));

  if (cartItems.length) {
    try {
      await addToCart(cartItems);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error pushing to Kroger cart.";
      await pool.query("UPDATE kroger_orders SET status = 'failed', error = $1, pushed_by = $2, pushed_at = NOW() WHERE id = $3", [error, staffName, orderId]);
      revalidatePath("/dashboard/orders");
      return { ok: false, error };
    }
  }

  await pool.query("UPDATE kroger_orders SET status = 'pushed_to_cart', pushed_by = $1, pushed_at = NOW() WHERE id = $2", [staffName, orderId]);
  revalidatePath("/dashboard/orders");
  return { ok: true, skipped };
}
