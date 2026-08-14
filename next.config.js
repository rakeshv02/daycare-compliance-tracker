/** @type {import('next').NextConfig} */
const basePath = (process.env.BASE_PATH || "").replace(/\/$/, "");

const nextConfig = {
  basePath,
  // Expose basePath to client-side so SessionProvider can find the auth routes
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};
module.exports = nextConfig;
