---
name: verify-ui
description: Boot TipLink locally with demo data and verify a change end to end in a real browser — drive the UI yourself (click, type, read console), log in through the real email-code flow, and run the Playwright suite. Use after any UI, auth, dashboard or payment-page change, or when asked to run, test, screenshot or check the app.
---

# Verify TipLink in a real browser

The stack is fully local and disposable: local Supabase (Docker), `next dev`
on :3000, demo data. Nothing touches production.

## 1. Start the stack

```bash
npm run e2e:up          # idempotent; first run pulls Docker images (~2 min)
npm run e2e:up -- --reset   # wipe the DB and re-seed
npm run e2e:down        # stop next (needed after next.config / env changes); --all also stops Supabase
```

Demo manager: `demo@tiplink.dev` (group "Demo Bistro", 4 staff, 40
transactions). Login is by **email code**: codes land in Mailpit at
http://127.0.0.1:54324 — read the latest with
`curl -s localhost:54324/api/v1/messages` then `/api/v1/message/<ID>` (field `Text`).

Logs: `.e2e/next.log` (server + browser console), `.e2e/supabase.log`.

## 2. Drive the UI yourself

The `browser` MCP server (`.mcp.json` → `scripts/e2e/browser-mcp.sh`) gives
you Playwright tools: `browser_navigate`, `browser_snapshot`, `browser_click`,
`browser_type`, `browser_take_screenshot`, `browser_console_messages`,
`browser_network_requests`, `browser_resize` (use 390x844 for the mobile tip
flow). Headed on a developer machine (the user watches live), headless in the cloud.

Walk the flow the change touches as a user would, then check:
- no "Une erreur est survenue" error boundary,
- `browser_console_messages` has no new errors (dev-only noise to ignore:
  `eval() is not supported`, Vercel analytics CSP, Stripe Connect.js without keys),
- the data you entered shows up where it should (re-read the page, or query
  `docker exec -i supabase_db_TipLink psql -U postgres -c "..."`).

Send the user screenshots of what you verified (SendUserFile) when they
cannot see the browser.

## 3. Lock it in with a test

Add or extend a spec in `e2e/` (helpers: `login(page)`, `readOtp`,
`trackPageErrors`), then run:

```bash
npm run e2e                       # all specs, desktop + mobile
npx playwright test e2e/x.spec.ts # one file
```

Artifacts: `.e2e/report` (HTML), `.e2e/test-results` (screenshot, video, trace on failure).

## Limits

- Stripe: dummy keys by default, so payment forms, Connect onboarding and
  `/pricing` cannot work; specs needing it are skipped. Export
  `E2E_STRIPE_SECRET_KEY`, `E2E_STRIPE_PUBLISHABLE_KEY`,
  `E2E_STRIPE_PRODUCT_PACK_SOLO/DUO` (test mode only) before `e2e:up` to enable them.
- Realtime is disabled (its container needs IPv6).
- Migration `00023` is skipped on purpose (never applied in production, see up.sh).
