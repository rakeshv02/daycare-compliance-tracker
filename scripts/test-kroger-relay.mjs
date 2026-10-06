// Deterministic tests: no real database or Kroger cart requests.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { registerHooks } from "node:module";

const state = { orders: new Map(), grants: new Map(), carts: [], network: 0, fail: false };
const hash = (token) => createHash("sha256").update(token).digest("hex");
const db = {
  async connect() { return { query: db.query.bind(db), release() {} }; },
  async query(sql, args = []) {
    const text = sql.replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [], rowCount: 0 };
    if (text.startsWith("INSERT INTO kroger_cart_dispatches")) {
      const [key, id, actor] = args;
      if (state.orders.get(id)?.status !== "pending" ||
          [...state.grants.values()].some((g) => g.order_id === id)) return { rows: [], rowCount: 0 };
      state.grants.set(key, { order_id: id, requested_by: actor, purpose: "cart", expired: false, started_at: null, result: null });
      return { rows: [{ token_hash: key }], rowCount: 1 };
    }
    if (text.startsWith("SELECT order_id, requested_by")) {
      const grant = state.grants.get(args[0]);
      return { rows: grant ? [{ ...grant }] : [], rowCount: grant ? 1 : 0 };
    }
    if (text.startsWith("UPDATE kroger_cart_dispatches SET started_at")) {
      const grant = state.grants.get(args[0]);
      if (!grant || grant.started_at || grant.expired) return { rows: [], rowCount: 0 };
      grant.started_at = "now";
      return { rows: [{ token_hash: args[0] }], rowCount: 1 };
    }
    if (text.startsWith("SELECT status FROM kroger_orders")) {
      const order = state.orders.get(args[0]);
      return { rows: order ? [{ status: order.status }] : [], rowCount: order ? 1 : 0 };
    }
    if (text.startsWith("SELECT upc, name, quantity")) return { rows: state.orders.get(args[0]).items };
    if (text.startsWith("UPDATE kroger_orders SET status = $1")) {
      const [status, error, actor, id] = args;
      Object.assign(state.orders.get(id), { status, error, actor });
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("UPDATE kroger_cart_dispatches SET result")) {
      state.grants.get(args[1]).result = JSON.parse(args[0]);
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith("SELECT result FROM kroger_cart_dispatches")) {
      const grant = state.grants.get(args[0]);
      return { rows: grant ? [{ result: grant.result }] : [] };
    }
    if (text.startsWith("UPDATE kroger_orders SET status = 'failed'")) {
      const order = state.orders.get(args[2]);
      if (order.status === "pending") Object.assign(order, { status: "failed", error: args[0] });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected test SQL: ${text}`);
  },
};
globalThis.krogerRelayTestDb = db;
globalThis.krogerRelayTestCart = async (items) => {
  state.carts.push(items);
  await Promise.resolve();
  if (state.fail) throw new Error("Kroger cart/add failed (403): <HTML>Access Denied Reference&#32;&#35;18.test.ref</HTML>");
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./db") return { url: "data:text/javascript,export default globalThis.krogerRelayTestDb", shortCircuit: true };
    if (specifier === "./kroger") return { url: "data:text/javascript,export const addToCart = globalThis.krogerRelayTestCart", shortCircuit: true };
    if (specifier === "@/lib/kroger-cart-dispatch") {
      return { url: new URL("../lib/kroger-cart-dispatch.ts", import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { dispatchKrogerOrder, executeKrogerDispatch } = await import("../lib/kroger-cart-dispatch.ts");
const { POST, GET } = await import("../app/api/kroger/cart-relay/route.ts");
const items = Array.from({ length: 9 }, (_, index) => ({
  upc: `000111100${String(index).padStart(4, "0")}`, name: `Product ${index}`,
  quantity: index === 8 ? 1 : 5, is_custom: false,
}));
function reset() {
  state.orders.clear(); state.grants.clear(); state.carts.length = 0;
  state.network = 0; state.fail = false;
  state.orders.set(1, { status: "pending", items });
  process.env.VERCEL = "1";
}
function grant(purpose = "cart") {
  const token = randomBytes(32).toString("base64url");
  state.grants.set(hash(token), {
    order_id: purpose === "probe" ? null : 1, requested_by: "Director",
    purpose, expired: false, started_at: null, result: null,
  });
  return token;
}
function request(token, body) {
  return new Request("https://relay.example/api/kroger/cart-relay", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body }),
  });
}
let passed = 0;
async function test(name, run) { reset(); await run(); passed++; console.log(`PASS ${name}`); }
await test("only the Vercel executor can access the relay", async () => {
  process.env.VERCEL = "";
  assert.equal(GET().status, 404);
  assert.equal((await POST(request(grant()))).status, 404);
  assert.equal(state.carts.length, 0);
});
await test("missing and forged authorizations cannot add items", async () => {
  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request(randomBytes(32).toString("base64url")))).status, 401);
  assert.equal(state.carts.length, 0);
});
await test("caller cannot override order products or quantities", async () => {
  assert.equal((await POST(request(grant(), '{"quantity":999}'))).status, 400);
  assert.equal(state.carts.length, 0);
});
await test("expired capability cannot execute", async () => {
  const token = grant(); state.grants.get(hash(token)).expired = true;
  assert.equal((await POST(request(token))).status, 410);
  assert.equal(state.carts.length, 0);
});
await test("transport probe never reads or mutates a real cart order", async () => {
  assert.equal((await POST(request(grant("probe")))).status, 200);
  assert.equal(state.carts.length, 0);
  assert.equal(state.orders.get(1).status, "pending");
});
await test("same nine products and quantities go to Kroger, without prices", async () => {
  const result = await dispatchKrogerOrder(1, "Director");
  assert.equal(result.ok, true);
  assert.deepEqual(state.carts[0], items.map((i) => ({ upc: i.upc, quantity: i.quantity })));
  assert.equal(state.orders.get(1).status, "pushed_to_cart");
});
await test("custom products are reported, not sent to Kroger", async () => {
  state.orders.get(1).items = [...items, { upc: null, name: "Bakery", quantity: 2, is_custom: true }];
  assert.deepEqual((await dispatchKrogerOrder(1, "Director")).skipped, ["Bakery (x2)"]);
  assert.equal(state.carts[0].length, 9);
});
await test("concurrent and repeated capabilities do not add duplicate units", async () => {
  const token = grant();
  await Promise.all([POST(request(token)), POST(request(token))]);
  assert.equal(state.carts.length, 1);
  assert.equal((await POST(request(token))).status, 200);
  assert.equal(state.carts.length, 1);
});
await test("double-clicking or another director cannot send an order twice", async () => {
  await Promise.all([dispatchKrogerOrder(1, "Director"), dispatchKrogerOrder(1, "Director")]);
  assert.equal(state.carts.length, 1);
});
await test("Replit makes one protected request; cart execution happens on Vercel", async () => {
  process.env.VERCEL = "";
  globalThis.fetch = async (url, init) => {
    state.network++;
    assert.equal(url, "https://daycare-compliance-tracker.vercel.app/api/kroger/cart-relay");
    assert.equal(init.body, undefined);
    process.env.VERCEL = "1";
    try { return await POST(new Request(url, init)); }
    finally { process.env.VERCEL = ""; }
  };
  assert.equal((await dispatchKrogerOrder(1, "Director")).ok, true);
  assert.equal(state.network, 1);
  assert.equal(state.carts.length, 1);
});
await test("provider denial is recorded and never automatically retried", async () => {
  state.fail = true;
  const result = await dispatchKrogerOrder(1, "Director");
  assert.equal(result.ok, false);
  assert.match(result.error, /403.*Vercel/);
  assert.match(result.error, /18.test.ref/);
  assert.ok(!result.error.includes("<HTML>"));
  assert.equal(state.orders.get(1).status, "failed");
  assert.equal((await dispatchKrogerOrder(1, "Director")).ok, false);
  assert.equal(state.carts.length, 1);
});
await test("network uncertainty does not fall back or retry the cart", async () => {
  process.env.VERCEL = "";
  globalThis.fetch = async () => { state.network++; throw new Error("timeout"); };
  assert.equal((await dispatchKrogerOrder(1, "Director")).ok, false);
  assert.equal(state.network, 1);
  assert.equal(state.carts.length, 0);
  assert.match(state.orders.get(1).error, /could not be confirmed/);
});
await test("invalid data and already-failed orders cannot be pushed", async () => {
  state.orders.get(1).items = [{ ...items[0], quantity: 0 }];
  assert.equal((await dispatchKrogerOrder(1, "Director")).ok, false);
  assert.equal(state.carts.length, 0);
});
console.log(`${passed} Kroger relay tests passed; no real cart or database used.`);
