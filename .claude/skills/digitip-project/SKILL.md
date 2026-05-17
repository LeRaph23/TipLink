---
name: digitip-project
description: >-
  Project memory / knowledge base for DigiTip (formerly TipLink) — the NFC
  SmartTag tipping SaaS in this repository. Covers what the product is, the
  stack, directory layout, core conventions, the database schema, auth roles,
  Stripe flows, environment variables, testing, and known gotchas. Use this at
  the start of any task in this repo — before reading, planning, or writing
  code — and whenever you need to recall how DigiTip is structured.
---

# DigiTip — project memory

> The product is **DigiTip**. **TipLink** is the old name — the repo folder,
> `package.json` `name`, and `README.md` still say `tiplink`; treat that as
> legacy, not a separate project. Use "DigiTip" in user-facing copy and docs.

## What it is

DigiTip is a SaaS for cashless tipping via NFC "SmartTags". A customer taps a
physical tag, lands on a payment page, and tips a staff member or an
establishment. Establishments order SmartTags; ambassadors refer
establishments and earn commission; a super admin manages tag stock,
fulfillment, and SaaS metrics from `/dashboard/admin`.

## Stack

- **Next.js 16.2.4**, App Router — see the warning below.
- **React 19.2**, TypeScript 5, Tailwind CSS v4.
- **Supabase** — Postgres + Auth + Row Level Security + Storage, via `@supabase/ssr`.
- **Stripe** — Connect (payouts), Payment Intents (tips), webhooks, hardware-pack checkout.
- **next-intl 4** — locales `en` / `fr`, default `fr`, locale prefix always present.
- **Resend** — transactional + cold email. **Vitest** — tests. Deployed on **Vercel**.

### ⚠️ Next.js 16 is not the Next.js you know

Per `AGENTS.md`: this version has breaking API/convention changes. **Read the
relevant guide in `node_modules/next/dist/docs/` before writing Next.js code**,
and heed deprecation notices. Do not rely on training-data assumptions.

## Directory layout

| Path | Contents |
|------|----------|
| `app/[locale]/` | Locale-prefixed pages (`pay`, `dashboard`, `onboarding`, `order`, `checkout`, `ambassadeur`, auth, legal). |
| `app/api/` | Route handlers — NOT locale-prefixed (`stripe`, `webhooks`, `cron`, `admin`, `staff`, `billing`, `onboarding`, `cold-email`, `dev`, `upload`). |
| `app/auth/callback/` | Supabase auth callback. |
| `actions/` | Server actions (`'use server'`), incl. `actions/admin/` and `actions/billing/`. |
| `lib/` | Shared server logic: `supabase/`, `stripe/`, `auth/`, `nfc/`, `banking/`, `ambassadeur/`, `admin/`, plus `env.ts`, `email.ts`, `rate-limit.ts`, etc. |
| `components/` | React components grouped by feature. |
| `supabase/migrations/` | Numbered SQL migrations (`00001_…` → `00043_…`). |
| `i18n/` | `routing.ts`, `request.ts`, `navigation.ts`. `messages/` holds `en.json`, `fr.json`. |
| `types/database.ts` | **Generated** Supabase types — regenerate with `npm run db:types` after schema changes. |
| `__tests__/` | Vitest suites: `rls/`, `middleware/`, `api/`, `stripe/`, `lib/`. |
| `scripts/` | `check-env.ts`, `stripe-setup.ts`. |

## Core conventions

**Three Supabase clients — pick the right one:**
- `lib/supabase/client.ts` — browser client.
- `lib/supabase/server.ts` — `createClient()` for Server Components & actions; cookie-based auth, **RLS enforced**.
- `lib/supabase/service.ts` — `createServiceClient()` uses the service-role key, **bypasses ALL RLS**. Only for webhook handlers and server-side admin ops. **Never** import it into client/browser code.

**Server actions** return discriminated unions, e.g. `{ id: string } | { error: string }` — they do not throw for expected failures. Follow this pattern.

**Environment variables** go through `lib/env.ts` (Zod-validated; public vars fail loud at boot, secrets validated lazily). Use helpers like `getBaseUrl()` rather than reading `process.env` directly. `.env.example` documents every variable.

**Auth helpers** in `lib/auth/`: `requireSuperAdmin()` (redirects to `/login`, or `notFound()` for non-admins), `require-cron.ts`, `onboarding-token.ts`.

**i18n**: `routing.ts` sets `locales: ['en','fr']`, `defaultLocale: 'fr'`, `localePrefix: 'always'`. All user strings live in `messages/{en,fr}.json`.

## Middleware (`middleware.ts`)

Runs three things, in order:
1. **NFC redirect** — `/s/[shortId]` resolves a tag via a raw Edge-safe PostgREST `fetch` (no SDK). Assigned tag → `/[locale]/pay/group/[establishmentId]`; unassigned tag → `/[locale]/onboarding?code=…`; invalid/short id → `not-found`.
2. **next-intl** locale routing.
3. **Supabase session refresh** + route protection: `/dashboard/*` requires auth; logged-in users are bounced away from `/login` & `/signup`.

## Auth roles & dashboard

`user_role` enum: `super_admin`, `group_admin`, `manager`, `staff` (stored in the `user_roles` table). Dashboard route groups mirror this: `(super-admin)`, `(manager)`, `(staff)`, plus `billing/`.

## Database

RLS is enforced; isolation is covered by `__tests__/rls/`. Key tables:
`establishments`, `staff_profiles`, `nfc_stickers`, `transactions`,
`smarttag_orders` (+ `smarttag_order_tags`), `groups`, `group_tip_transfers`,
`staff_payouts`, `user_roles`, `promo_codes`, `webhook_events`,
`admin_audit_log`, and the ambassador/salon stack (`ambassadors`,
`ambassador_sales`, `ambassador_payouts`, `ambassador_contracts`, `salons`,
`salon_zones`, `salon_visits`, `referral_payouts`, `cold_email_prospects`).

Enums: `business_type` (`restaurant` | `beauty`), `transaction_status`
(`pending` | `succeeded` | `failed` | `refunded`), `stripe_onboarding_status`
(`not_started` | `pending` | `complete`), `user_role`.

Helper RPCs: `is_super_admin`, `get_my_group_ids`,
`get_my_managed_establishment_ids`, `get_my_staff_establishment_id`,
`get_my_staff_profile_id`, `get_establishment_report`,
`admin_transactions_summary`, `validate_unassigned_nfc_code`.

## Stripe

Stripe **Connect** handles establishment/staff payouts; **Payment Intents**
handle customer tips; hardware-pack checkout uses price IDs
`STRIPE_PRICE_PACK_SOLO_HARDWARE` / `…_DUO_HARDWARE`. Webhooks land in
`app/api/webhooks/` and are de-duplicated via the `webhook_events` table;
idempotency helpers live in `lib/stripe/idempotency.ts`.

## Environment variables

Required secrets (app won't start without them): `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PACK_SOLO_HARDWARE`,
`STRIPE_PRICE_PACK_DUO_HARDWARE`, `CRON_SECRET`, `COLD_EMAIL_UNSUB_SECRET`,
`ONBOARDING_TOKEN_SECRET`, plus the `NEXT_PUBLIC_*` set.
Optional: Resend (`RESEND_*`), Upstash Redis (rate-limiting; falls back to
in-memory), Telegram, `AMBASSADOR_SESSION_SECRET`, `SEED_DEMO_ENABLED`.
Run `npm run check:env` to verify.

## Commands

`npm run dev` · `build` · `lint` · `test` · `test:rls` · `db:types`
(regenerate `types/database.ts`) · `db:migrate` (`supabase db push`) ·
`setup:stripe` · `check:env`.

## Gotchas

- The repo/package/README still say "tiplink" — the product is **DigiTip**.
- Next.js 16 has breaking changes — consult `node_modules/next/dist/docs/`.
- Never use the service-role client in browser code.
- `types/database.ts` is generated — re-run `npm run db:types` after migrations.
- Migration numbering has a duplicate prefix (`00043_audit_fixes.sql` and
  `00043_payout_safety.sql`) — be careful when adding the next one.
