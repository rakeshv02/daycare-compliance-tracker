import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAuthorizeUrl } from "@/lib/kroger";

// Kicks off the one-time Kroger account connection (authorization_code flow).
// Protected by middleware.ts (staff login required) — only reachable from
// the "Connect Kroger Account" button on /dashboard/orders/setup.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", "https://daycare-compliance-tracker.vercel.app"));

  const redirectUri = process.env.KROGER_REDIRECT_URI;
  if (!redirectUri) {
    return NextResponse.json({ error: "KROGER_REDIRECT_URI is not configured." }, { status: 500 });
  }

  const state = randomUUID();
  const authorizeUrl = buildAuthorizeUrl(redirectUri, state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("kroger_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300, // 5 minutes — just needs to survive the Kroger login redirect
    path: "/",
  });
  return res;
}
