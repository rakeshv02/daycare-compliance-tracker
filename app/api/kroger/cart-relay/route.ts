import { executeKrogerDispatch } from "@/lib/kroger-cart-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET() {
  return process.env.VERCEL === "1"
    ? Response.json({ service: "kroger-cart-relay", version: 1 })
    : Response.json({ error: "Not found." }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.VERCEL !== "1") return Response.json({ error: "Not found." }, { status: 404 });
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  // No caller-supplied order, actor, product, quantity, or price is accepted.
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.byteLength) {
          await reader.cancel();
          return Response.json({ ok: false, error: "Request body must be empty." }, { status: 400 });
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const { status, result } = await executeKrogerDispatch(token);
    return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { ok: false, error: "Cart result could not be confirmed. Check the cart before submitting another order." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
