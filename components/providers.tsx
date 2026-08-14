"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Tell NextAuth where its API routes live (accounts for the /compliance-tracker basePath in Replit)
  const authBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth`;
  return <SessionProvider basePath={authBasePath}>{children}</SessionProvider>;
}
