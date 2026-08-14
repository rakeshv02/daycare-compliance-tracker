# Staff Compliance Tracker — Setup Guide

This app is a Next.js 14 (App Router) project. It lives inside the Blossoms Connect Replit monorepo at `artifacts/compliance-tracker/` and is served at `/compliance-tracker/`.

---

## Running locally (Replit)

```bash
pnpm --filter @workspace/compliance-tracker run dev
```

The dev server binds to `$PORT` (injected by Replit) and `0.0.0.0`. It reads `/compliance-tracker/` as its base path automatically.

---

## Environment variables

### Replit Secrets (encrypted — set via Tools → Secrets in Replit)

| Key | Purpose |
|-----|---------|
| `COMPLIANCE_DATABASE_URL` | Neon Postgres pooled connection string |
| `COMPLIANCE_NEXTAUTH_SECRET` | NextAuth JWT signing secret |
| `NOAHS_PASSWORD` | Login password for the `noahs` account |
| `LIGHTHOUSE_PASSWORD` | Login password for the `lighthouse` account |
| `DIRECTOR_PASSWORD` | Login password for the `director` account |
| `RESEND_API_KEY` | Resend API key for compliance alert emails |

### `.env.local` (create this file manually — never commit to git)

```env
# VoIP.ms — automated thank-you SMS after a tour
VOIPMS_API_USERNAME=rakesh@thearks.com
VOIPMS_API_PASSWORD=<your VoIP.ms API password from the portal>
VOIPMS_DID=<your 10-digit SMS-enabled DID>

# Staff action codes (protects waitlist delete / send-text)
# Format: code:Name,code:Name  — leading zeros matter
STAFF_ACTION_CODES=0829:Nancy,5598:April,0837:Katelynn,7847:Morgan,0000:Rakesh

# Kroger grocery ordering
KROGER_CLIENT_ID=<from developer.kroger.com>
KROGER_CLIENT_SECRET=<from developer.kroger.com>
KROGER_REDIRECT_URI=https://daycare-compliance-tracker.vercel.app/api/kroger/callback

# Cron endpoint security — any random string
CRON_SECRET=<any random string>
```

### Vercel (set via Vercel dashboard → project → Settings → Environment Variables)

Add everything in Replit Secrets above, **plus** `RESEND_API_KEY`. Vercel already has `DATABASE_URL` and `NEXTAUTH_SECRET` from the original setup — these map to `COMPLIANCE_DATABASE_URL` and `COMPLIANCE_NEXTAUTH_SECRET` via fallback logic in `lib/db.ts` and `lib/auth.ts`.

---

## Login accounts

| Username | Site access |
|----------|-------------|
| `noahs` | Noah's Arks only |
| `lighthouse` | Light House Academy only |
| `director` | All sites |

Passwords are stored in Replit Secrets (see above).

---

## Pushing to GitHub / Vercel

Vercel auto-deploys from the `main` branch of `github.com/rakeshv02/daycare-compliance-tracker`. To push changes from the Replit monorepo:

```bash
git subtree split --prefix=artifacts/compliance-tracker -b compliance-split
git push https://${GITHUB_PAT}@github.com/rakeshv02/daycare-compliance-tracker compliance-split:main --force
git branch -D compliance-split
```

`GITHUB_PAT` is a Replit Secret with a fine-grained GitHub token that has Contents read/write on this repo.

---

## Architecture notes

- **Database:** Neon Postgres (external). `lib/db.ts` reads `COMPLIANCE_DATABASE_URL` first, falls back to `DATABASE_URL` so Vercel works without renaming variables.
- **Auth:** NextAuth v4 credentials provider. `lib/auth.ts` reads `COMPLIANCE_NEXTAUTH_SECRET` first, falls back to `NEXTAUTH_SECRET`. Session includes a custom `site` field typed in `types/next-auth.d.ts`.
- **Base path:** All plain `<a href>` and `window.open()` calls must use `process.env.NEXT_PUBLIC_BASE_PATH` as a prefix. Next.js `<Link>` and `router.push` handle it automatically.
- **SMS:** VoIP.ms REST API (`lib/sms.ts`). 100 SMS/day limit per account.
- **Grocery orders:** Kroger OAuth2 (`lib/kroger.ts`). Token stored in `kroger_auth` table, auto-refreshed.
- **Email alerts:** Resend (`app/api/cron/alerts/` and `app/api/cron/weekly-waitlist-summary/`). Cron endpoints require `Authorization: Bearer <CRON_SECRET>` header.
