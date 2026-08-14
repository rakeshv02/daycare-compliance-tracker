/** @type {import('next').NextConfig} */
const basePath = (process.env.BASE_PATH || "").replace(/\/$/, "");

// Derive public URL for NextAuth — works in both Replit dev and Vercel
const nextAuthUrl = process.env.NEXTAUTH_URL ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}${basePath}`
    : `http://localhost:${process.env.PORT || 3001}${basePath}`);

const nextConfig = {
  basePath,
  env: {
    // Expose basePath to client so SessionProvider fetches from the right path
    NEXT_PUBLIC_BASE_PATH: basePath,
    // Map our prefixed secret to the name NextAuth expects
    NEXTAUTH_SECRET: process.env.COMPLIANCE_NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET || "",
    NEXTAUTH_URL: nextAuthUrl,
  },
};
module.exports = nextConfig;
