/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strip trailing slash from BASE_PATH — Next.js basePath must not end with /
  basePath: (process.env.BASE_PATH || "").replace(/\/$/, ""),
};
module.exports = nextConfig;
