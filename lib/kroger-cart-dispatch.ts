import { createHash, randomBytes } from "node:crypto";
import pool from "./db";
import { addToCart } from "./kroger";

export type KrogerPushResult =
  | { ok: true; skipped: string[] }
  | { ok: false; error: string };

// Verified production alias for this same app. Never accept a destination
// from the browser, and never forward customer OAuth tokens to the relay.
const RELAY_URL = "https://daycare-compliance-tracker.vercel.app/api/kroger/cart-relay";
const uncertainResult =
  "The Kroger cart result could not be confirmed. Check the Kroger cart before submitting another order; no automatic retry was made.";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cartError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const status = message.match(/\((\d{3})\)/)?.[1];
  const decoded = message.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
  const reference = decoded.match(/Reference\s+#([\w.-]+)/)?.[1];
  if (status) {
    return `Kroger cart request failed (${status}) from the Vercel relay.${reference ? ` Reference: ${reference}.` : ""} No automatic retry was made.`;
  }
  return uncertainResult;
}

async function finishDispatch(
  hash: string,
  orderId: number | null,
  actor: string,
  result: KrogerPushResult,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (orderId !== null) {
      await client.query(
        `UPDATE kroger_orders SET status = $1, error = $2,
         pushed_by = $3, pushed_at = NOW() WHERE id = $4`,
        [result.ok ? "pushed_to_cart" : "failed", result.ok ? null : result.error, actor, orderId],
      );
    }
    await client.query(
      "UPDATE kroger_cart_dispatches SET result = $1::jsonb, completed_at = NOW() WHERE token_hash = $2",
      [JSON.stringify(result), hash],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// A short-lived, unguessable capability is minted only after director
// authorization. Its hash lives in the shared app database. The relay loads
// the authorized order itself; callers cannot replace items or quantities.
export async function executeKrogerDispatch(
  token: string,
): Promise<{ status: number; result: KrogerPushResult }> {
  if (process.env.VERCEL !== "1") {
    return { status: 404, result: { ok: false, error: "Cart relay is not available on this server." } };
  }
  const hash = tokenHash(token);
  const found = await pool.query<{
    order_id: number | null;
    requested_by: string;
    purpose: "cart" | "probe";
    expired: boolean;
    started_at: string | null;
    result: KrogerPushResult | null;
  }>(
    `SELECT order_id, requested_by, purpose, expires_at <= NOW() AS expired,
     started_at, result FROM kroger_cart_dispatches WHERE token_hash = $1`,
    [hash],
  );
  const dispatch = found.rows[0];
  if (!dispatch) return { status: 401, result: { ok: false, error: "Invalid cart authorization." } };
  // Replays return the recorded result, never another cart write.
  if (dispatch.expired) return { status: 410, result: { ok: false, error: "Cart authorization expired." } };
  if (dispatch.result) return { status: 200, result: dispatch.result };
  if (dispatch.started_at) return { status: 409, result: { ok: false, error: uncertainResult } };
  const claimed = await pool.query(
    `UPDATE kroger_cart_dispatches SET started_at = NOW(), execution_host = 'vercel'
     WHERE token_hash = $1 AND started_at IS NULL AND expires_at > NOW()
     RETURNING token_hash`,
    [hash],
  );
  if (!claimed.rowCount) return { status: 409, result: { ok: false, error: uncertainResult } };

  // Authenticated transport checks exercise the handoff without touching
  // any real order or calling Kroger's write API.
  if (dispatch.purpose === "probe") {
    const result: KrogerPushResult = { ok: true, skipped: [] };
    await finishDispatch(hash, null, dispatch.requested_by, result);
    return { status: 200, result };
  }

  const order = await pool.query<{ status: string }>(
    "SELECT status FROM kroger_orders WHERE id = $1",
    [dispatch.order_id],
  );
  if (order.rows[0]?.status !== "pending") {
    const result: KrogerPushResult = { ok: false, error: "Order is no longer pending; nothing was sent." };
    await finishDispatch(hash, null, dispatch.requested_by, result);
    return { status: 409, result };
  }
  const items = await pool.query<{
    upc: string | null; name: string; quantity: number; is_custom: boolean;
  }>("SELECT upc, name, quantity, is_custom FROM kroger_order_items WHERE order_id = $1", [dispatch.order_id]);
  const catalog = items.rows.filter((item) => !item.is_custom && item.upc);
  const skipped = items.rows
    .filter((item) => item.is_custom || !item.upc)
    .map((item) => `${item.name} (x${item.quantity})`);
  let result: KrogerPushResult;
  if (!items.rows.length || catalog.some((item) =>
    !/^\d{8,14}$/.test(item.upc!) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0
  )) {
    result = { ok: false, error: "Order contains missing or invalid item data; nothing was sent." };
  } else {
    try {
      if (catalog.length) {
        await addToCart(catalog.map((item) => ({ upc: item.upc!, quantity: item.quantity })));
      }
      result = { ok: true, skipped };
    } catch (error) {
      result = { ok: false, error: cartError(error) };
    }
  }
  await finishDispatch(hash, dispatch.order_id, dispatch.requested_by, result);
  return { status: 200, result };
}

export async function dispatchKrogerOrder(orderId: number, actor: string): Promise<KrogerPushResult> {
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return { ok: false, error: "Invalid order." };
  const token = randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const reserved = await pool.query(
    `INSERT INTO kroger_cart_dispatches (token_hash, order_id, requested_by, purpose)
     SELECT $1, id, $3, 'cart' FROM kroger_orders WHERE id = $2 AND status = 'pending'
     ON CONFLICT (order_id) DO NOTHING RETURNING token_hash`,
    [hash, orderId, actor],
  );
  if (!reserved.rowCount) {
    return { ok: false, error: "Order is not pending or already has a cart attempt. Check its history and the Kroger cart before submitting another order." };
  }
  try {
    if (process.env.VERCEL === "1") return (await executeKrogerDispatch(token)).result;
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
    });
    const data: unknown = await response.json();
    // Trust only the result recorded in our own database, not arbitrary
    // JSON from a misconfigured destination or a proxy error page.
    const stored = await pool.query<{ result: KrogerPushResult | null }>(
      "SELECT result FROM kroger_cart_dispatches WHERE token_hash = $1",
      [hash],
    );
    const result = stored.rows[0]?.result;
    if (result && JSON.stringify(data) === JSON.stringify(result)) return result;
    throw new Error("Relay did not return a recorded result.");
  } catch {
    // Never fall back to a second cart write, including on HTTP timeouts.
    // A later relay completion can still replace this uncertain status.
    const stored = await pool.query<{ result: KrogerPushResult | null }>(
      "SELECT result FROM kroger_cart_dispatches WHERE token_hash = $1", [hash],
    );
    if (stored.rows[0]?.result) return stored.rows[0].result;
    await pool.query(
      `UPDATE kroger_orders SET status = 'failed', error = $1, pushed_by = $2,
       pushed_at = NOW() WHERE id = $3 AND status = 'pending'`,
      [uncertainResult, actor, orderId],
    );
    return { ok: false, error: uncertainResult };
  }
}
