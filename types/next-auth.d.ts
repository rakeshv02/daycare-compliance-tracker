// Augment NextAuth session to include the custom `site` field set in lib/auth.ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      site: string;
    };
  }
}
