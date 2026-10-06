import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runKrogerCartDiagnostic } from "@/lib/kroger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const responseHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: responseHeaders });
  }
  if (session.user.site !== "all") {
    return NextResponse.json({ error: "Director access required." }, { status: 403, headers: responseHeaders });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: responseHeaders });
  }
  if ((await request.text()).trim()) {
    return NextResponse.json({ error: "This diagnostic does not accept items or other input." }, { status: 400, headers: responseHeaders });
  }
  return NextResponse.json(await runKrogerCartDiagnostic(), { headers: responseHeaders });
}
