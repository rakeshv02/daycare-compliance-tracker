import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exchangeCodeForToken } from "@/lib/kroger";

// Kroger redirects here after the staff member approves access on Kroger.com.
// Protected by middleware.ts (staff login required).
export async function GET(req: NextRequest) {
  const setupUrl = new URL("/dashboard/orders/setup", req.url);

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("kroger_oauth_state")?.value;
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    setupUrl.searchParams.set("kroger_error", `Kroger denied the request: ${errorParam}`);
    return NextResponse.redirect(setupUrl);
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    setupUrl.searchParams.set("kroger_error", "Connection request expired or didn't match — please try again.");
    return NextResponse.redirect(setupUrl);
  }

  const redirectUri = process.env.KROGER_REDIRECT_URI;
  if (!redirectUri) {
    setupUrl.searchParams.set("kroger_error", "KROGER_REDIRECT_URI is not configured.");
    return NextResponse.redirect(setupUrl);
  }

  try {
    await exchangeCodeForToken(code, redirectUri, session.user?.name ?? session.user?.site ?? "Unknown");
    setupUrl.searchParams.set("kroger_connected", "1");
  } catch (err) {
    setupUrl.searchParams.set("kroger_error", err instanceof Error ? err.message : "Connection failed.");
  }

  const res = NextResponse.redirect(setupUrl);
  res.cookies.delete("kroger_oauth_state");
  return res;
}
