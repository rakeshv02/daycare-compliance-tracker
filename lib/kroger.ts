// Kroger public API client.
// Docs: https://developer.kroger.com — Products, Locations, Cart, Identity, OAuth2.
//
// Two separate auth flows are used here:
//  1. client_credentials — an "app" token, no user login, used for Products/Locations
//     search (scope: product.compact). Fetched fresh per call; cheap and short-lived.
//  2. authorization_code — a "customer" token tied to your actual Kroger.com login,
//     required for Cart (scope: cart.basic:write) and Identity (scope: profile.compact).
//     This is a one-time browser login (see /dashboard/orders/setup) whose refresh_token
//     is stored in the kroger_auth table and auto-refreshed here as needed.

import pool from "@/lib/db";

const KROGER_API_URL = "https://api.kroger.com";
const TOKEN_URL = `${KROGER_API_URL}/v1/connect/oauth2/token`;
const AUTHORIZE_URL = `${KROGER_API_URL}/v1/connect/oauth2/authorize`;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is not configured.`);
  return val;
}

function basicAuthHeader(): string {
  const clientId = requireEnv("KROGER_CLIENT_ID");
  const clientSecret = requireEnv("KROGER_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

// ---------- App-level token (client_credentials) ----------

let cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 30_000) {
    return cachedAppToken.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger app-token request failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  cachedAppToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedAppToken.token;
}

// ---------- Customer-level token (authorization_code + refresh) ----------

type KrogerAuthRow = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_by: string | null;
  connected_at: string;
};

export async function getKrogerAuthStatus(): Promise<{ connected: boolean; connectedBy: string | null; connectedAt: string | null }> {
  const r = await pool.query<KrogerAuthRow>("SELECT * FROM kroger_auth WHERE id = 1");
  const row = r.rows[0];
  if (!row) return { connected: false, connectedBy: null, connectedAt: null };
  return { connected: true, connectedBy: row.connected_by, connectedAt: row.connected_at };
}

async function getCustomerToken(): Promise<string> {
  const r = await pool.query<KrogerAuthRow>("SELECT * FROM kroger_auth WHERE id = 1");
  const row = r.rows[0];
  if (!row) {
    throw new Error("Kroger account isn't connected yet. Go to Orders → Setup and connect it first.");
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return row.access_token;
  }

  // Refresh — Kroger rotates the refresh_token on every use, so we must persist the new one.
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Kroger token refresh failed (${res.status}): ${text}. You may need to reconnect the account at Orders → Setup.`
    );
  }
  const data = await res.json();
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await pool.query(
    "UPDATE kroger_auth SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW() WHERE id = 1",
    [data.access_token, data.refresh_token, newExpiresAt]
  );
  return data.access_token;
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = requireEnv("KROGER_CLIENT_ID");
  const params = new URLSearchParams({
    scope: "cart.basic:write profile.compact",
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, redirectUri: string, connectedBy: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger authorization failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await pool.query(
    `INSERT INTO kroger_auth (id, access_token, refresh_token, expires_at, connected_by, connected_at, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       connected_by = EXCLUDED.connected_by,
       connected_at = NOW(),
       updated_at = NOW()`,
    [data.access_token, data.refresh_token, expiresAt, connectedBy]
  );
}

// ---------- Locations ----------

export type StoreResult = {
  locationId: string;
  name: string;
  address: string;
  phone: string | null;
};

export async function searchStores(zip: string): Promise<StoreResult[]> {
  const token = await getAppToken();
  const params = new URLSearchParams({ "filter.zipCode.near": zip, "filter.limit": "10" });
  const res = await fetch(`${KROGER_API_URL}/v1/locations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger store search failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.data ?? []).map((loc: any) => ({
    locationId: loc.locationId,
    name: loc.name,
    address: `${loc.address?.addressLine1 ?? ""}, ${loc.address?.city ?? ""}, ${loc.address?.state ?? ""} ${loc.address?.zipCode ?? ""}`.trim(),
    phone: loc.phone ?? null,
  }));
}

// ---------- Products ----------

export type ProductResult = {
  upc: string;
  name: string;
  brand: string | null;
  price: number | null;
  promoPrice: number | null;
  size: string | null;
  imageUrl: string | null;
};

export async function searchProducts(term: string, locationId: string): Promise<ProductResult[]> {
  const token = await getAppToken();
  const params = new URLSearchParams({ "filter.term": term, "filter.locationId": locationId, "filter.limit": "24" });
  const res = await fetch(`${KROGER_API_URL}/v1/products?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger product search failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (data.data ?? []).map(mapProduct);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(p: any): ProductResult {
  const item = p.items?.[0];
  const image = p.images?.find((im: any) => im.perspective === "front") ?? p.images?.[0];
  const thumb = image?.sizes?.find((s: any) => s.size === "medium") ?? image?.sizes?.[0];
  return {
    upc: p.upc ?? p.productId,
    name: p.description,
    brand: p.brand ?? null,
    price: item?.price?.regular ?? null,
    promoPrice: item?.price?.promo ?? null,
    size: item?.size ?? null,
    imageUrl: thumb?.url ?? null,
  };
}

// Looks up known UPCs directly (e.g. a saved standard list) instead of a
// fuzzy text search — exact product, current price/availability at this store.
export async function getProductsByUpcs(upcs: string[], locationId: string): Promise<ProductResult[]> {
  if (!upcs.length) return [];
  const token = await getAppToken();
  const params = new URLSearchParams({ "filter.productId": upcs.join(","), "filter.locationId": locationId, "filter.limit": String(upcs.length) });
  const res = await fetch(`${KROGER_API_URL}/v1/products?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger product lookup failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return (data.data ?? []).map(mapProduct);
}

// ---------- Cart ----------

export type CartItemInput = { upc: string; quantity: number };

export async function addToCart(items: CartItemInput[]): Promise<void> {
  const token = await getCustomerToken();
  const res = await fetch(`${KROGER_API_URL}/v1/cart/add`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ items: items.map((i) => ({ upc: i.upc, quantity: i.quantity, modality: "PICKUP" })) }),
  });
  if (res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kroger cart/add failed (${res.status}): ${text}`);
  }
}

// ---------- Identity (optional, used to show "connected as ___") ----------

export async function getProfile(): Promise<{ id: string } | null> {
  try {
    const token = await getCustomerToken();
    const res = await fetch(`${KROGER_API_URL}/v1/identity/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.data?.id ?? "unknown" };
  } catch {
    return null;
  }
}
