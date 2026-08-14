export { default } from "next-auth/middleware";

// Note: /dashboard/waitlist is deliberately NOT listed here — the parent
// waitlist dashboard is intentionally open, no staff login required.
// /dashboard/orders (Kroger grocery ordering) DOES require login — it
// involves real purchasing, unlike the waitlist.
export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/report",
    "/dashboard/report/:path*",
    "/dashboard/print/:path*",
    "/dashboard/orders",
    "/dashboard/orders/:path*",
    "/api/kroger/connect",
    "/api/kroger/callback",
  ],
};
