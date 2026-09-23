#!/usr/bin/env bash
# Boots a fully local, disposable TipLink stack for end-to-end testing:
#   Docker -> local Supabase (auth + REST + storage + inbucket) -> migrations
#   -> Next dev server on :3000 -> demo seed (demo@tiplink.dev) + super admin (admin@tiplink.dev).
#
# Nothing here touches a remote project: every key is a local Supabase default
# or a dummy value, and Stripe/Resend/Google calls simply fail or are skipped.
# Safe to re-run; each step is skipped when already done.
#
# Usage: scripts/e2e/up.sh            # start everything
#        scripts/e2e/up.sh --reset    # wipe the local DB and re-seed
#        scripts/e2e/down.sh          # stop next (add --all to stop Supabase too)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STATE_DIR="$ROOT/.e2e"
mkdir -p "$STATE_DIR"
PORT="${E2E_PORT:-3000}"
BASE_URL="http://localhost:$PORT"

log() { printf '\033[36m[e2e]\033[0m %s\n' "$*"; }

# --- 1. Docker ---------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  # Only a bare Linux box (e.g. a cloud container) runs its own daemon; on
  # macOS and on Windows/WSL the daemon belongs to Docker Desktop.
  if [ "$(uname)" = "Darwin" ] || grep -qi microsoft /proc/version 2>/dev/null || ! command -v dockerd >/dev/null; then
    echo "Docker is not running: start Docker Desktop (on Windows, enable WSL integration for this distro), then re-run."
    exit 1
  fi
  log "starting dockerd"
  (nohup dockerd >"$STATE_DIR/dockerd.log" 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { echo "dockerd did not start, see $STATE_DIR/dockerd.log"; exit 1; }
fi

# --- 2. Supabase -------------------------------------------------------------
# Realtime is off: its container needs IPv6, which sandboxed runners lack, and
# the app works without live updates. `supabase start` applies the migrations.
export SUPABASE_REALTIME_ENABLED=false
if [ "${1:-}" = "--reset" ]; then
  log "resetting local Supabase"
  npx supabase stop --no-backup >/dev/null 2>&1 || true
fi
if ! npx supabase status >/dev/null 2>&1; then
  log "starting local Supabase and applying migrations (first run pulls images, ~2 min)"
  npx supabase start -x studio,imgproxy,vector,logflare,edge-runtime,postgres-meta,supavisor,realtime >"$STATE_DIR/supabase.log" 2>&1 \
    || { tail -30 "$STATE_DIR/supabase.log"; exit 1; }
fi
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"

DB="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
psql_db() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# --- 3. Env ------------------------------------------------------------------
# Optional Stripe TEST-mode values (see .claude/skills/verify-ui/SKILL.md),
# kept in .env.e2e at the repo root (ignored by git via .env*).
if [ -f "$ROOT/.env.e2e" ]; then
  set -a; . "$ROOT/.env.e2e"; set +a
  case "${E2E_STRIPE_SECRET_KEY:-}" in
    ""|sk_test_*|rk_test_*) ;;
    *) echo "E2E_STRIPE_SECRET_KEY must be a TEST key (sk_test_...). Refusing to start."; exit 1;;
  esac
fi

# Passed through the process environment, never written to .env*.local, so a
# developer's real .env.local is neither read-over nor overwritten.
cat >"$STATE_DIR/env" <<EOF
NEXT_PUBLIC_BASE_URL=$BASE_URL
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=${E2E_STRIPE_SECRET_KEY:-sk_test_e2e_dummy_key}
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${E2E_STRIPE_PUBLISHABLE_KEY:-pk_test_e2e_dummy_key}
STRIPE_WEBHOOK_SECRET=${E2E_STRIPE_WEBHOOK_SECRET:-whsec_e2e_dummy_secret}
STRIPE_PRODUCT_PACK_SOLO=${E2E_STRIPE_PRODUCT_PACK_SOLO:-prod_e2e_solo}
STRIPE_PRODUCT_PACK_DUO=${E2E_STRIPE_PRODUCT_PACK_DUO:-prod_e2e_duo}
STRIPE_PRICE_PRO_MONTHLY=${E2E_STRIPE_PRICE_PRO_MONTHLY:-}
STRIPE_PRICE_PRO_YEARLY=${E2E_STRIPE_PRICE_PRO_YEARLY:-}
STRIPE_WEBHOOK_SECRET_CONNECT=${E2E_STRIPE_WEBHOOK_SECRET_CONNECT:-whsec_e2e_dummy_secret_connect}
CRON_SECRET=e2e-cron-secret-0000000000000000
COLD_EMAIL_UNSUB_SECRET=e2e-cold-email-secret-000000000000
ONBOARDING_TOKEN_SECRET=e2e-onboarding-secret-00000000000
AMBASSADOR_SESSION_SECRET=e2e-ambassador-secret-0000000000000000
SEED_DEMO_ENABLED=true
NEXT_TELEMETRY_DISABLED=1
EOF

# --- 4. Next dev server ------------------------------------------------------
# A running server keeps the env it started with: restart it when that changed
# (e.g. Stripe keys added to .env.e2e).
if curl -sf -o /dev/null "$BASE_URL/fr" && ! cmp -s "$STATE_DIR/env" "$STATE_DIR/env.running"; then
  log "env changed, restarting next dev"
  "$ROOT/scripts/e2e/down.sh"
  for _ in $(seq 1 20); do curl -sf -o /dev/null "$BASE_URL/fr" || break; sleep 1; done
fi
if ! curl -sf -o /dev/null "$BASE_URL/fr"; then
  cp "$STATE_DIR/env" "$STATE_DIR/env.running"
  log "starting next dev on :$PORT (log: .e2e/next.log)"
  (set -m; set -a; . "$STATE_DIR/env"; set +a; nohup npx next dev -p "$PORT" >"$STATE_DIR/next.log" 2>&1 < /dev/null & echo $! >"$STATE_DIR/next.pid")
  for _ in $(seq 1 120); do curl -sf -o /dev/null "$BASE_URL/fr" && break; sleep 1; done
  curl -sf -o /dev/null "$BASE_URL/fr" || { tail -30 "$STATE_DIR/next.log"; exit 1; }
fi

# --- 5. Demo data ------------------------------------------------------------
log "seeding demo data"
curl -sf -X POST "$BASE_URL/api/dev/seed-demo" >"$STATE_DIR/seed.json" \
  || { echo "seed failed:"; cat "$STATE_DIR/seed.json"; exit 1; }

# Super admin: ships SmartTags to paid orders from /dashboard/admin. Created
# through the GoTrue admin API; re-runs just find the existing user.
ADMIN_EMAIL=admin@tiplink.dev
curl -s -o /dev/null -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Admin Digitip\"}}"
psql_db -c "INSERT INTO user_roles (user_id, role)
  SELECT id, 'super_admin' FROM auth.users WHERE email = '$ADMIN_EMAIL'
    AND NOT EXISTS (SELECT 1 FROM user_roles r JOIN auth.users u ON u.id = r.user_id
                    WHERE u.email = '$ADMIN_EMAIL' AND r.role = 'super_admin')" >/dev/null

log "ready"
echo "  app:       $BASE_URL/fr"
echo "  manager:   demo@tiplink.dev    (login by email code)"
echo "  admin:     admin@tiplink.dev   (super admin, login by email code)"
if [ -z "${E2E_STRIPE_SECRET_KEY:-}" ]; then
  echo "  stripe:    OFF (dummy keys) - payments cannot work; see .env.e2e in the verify-ui skill"
else
  echo "  stripe:    TEST mode"
fi
echo "  emails:    http://127.0.0.1:54324 (Mailpit: login codes land here)"
echo "  seed:      .e2e/seed.json"
