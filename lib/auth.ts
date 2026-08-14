import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { SiteFilter } from "./staff";

type UserAccount = { username: string; passwordEnvKey: string; site: SiteFilter; label: string };

const ACCOUNTS: UserAccount[] = [
  { username: "noahs",      passwordEnvKey: "NOAHS_PASSWORD",      site: "Noah's Arks",         label: "Noah's Arks" },
  { username: "lighthouse", passwordEnvKey: "LIGHTHOUSE_PASSWORD",  site: "Light House Academy", label: "Light House Academy" },
  { username: "director",   passwordEnvKey: "DIRECTOR_PASSWORD",   site: "all",                  label: "Director (all sites)" },
];

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Site login",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) return null;
        const account = ACCOUNTS.find(
          (a) => a.username === credentials.username.toLowerCase().trim()
        );
        if (!account) return null;
        const expected = process.env[account.passwordEnvKey];
        if (!expected || credentials.password !== expected) return null;
        return { id: account.username, name: account.label, site: account.site };
      },
    }),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt({ token, user }: any) {
      if (user) token.site = user.site;
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session({ session, token }: any) {
      if (session.user) session.user.site = token.site;
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  // Use COMPLIANCE_NEXTAUTH_SECRET so it doesn't clash with other apps
  secret: process.env.COMPLIANCE_NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET,
};
