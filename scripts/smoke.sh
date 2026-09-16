#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Post-deploy smoke test.                                                 ║
# ║                                                                          ║
# ║  Unit tests prove the parts; this proves the deployment. It talks to a    ║
# ║  running instance over HTTP exactly as a browser would — real session     ║
# ║  cookie, real database, real plan gates — and fails loudly if any of it   ║
# ║  is wrong.                                                               ║
# ║                                                                          ║
# ║  Run it against a staging URL before promoting, and against production    ║
# ║  immediately after:                                                      ║
# ║                                                                          ║
# ║      BASE_URL=https://staging.example.com \                              ║
# ║      SMOKE_EMAIL=smoke@example.com SMOKE_PASSWORD=... \                   ║
# ║      ./scripts/smoke.sh                                                  ║
# ║                                                                          ║
# ║  With credentials it exercises the authenticated surface; without them   ║
# ║  it checks the public surface only and says so, rather than silently     ║
# ║  testing less than you think.                                            ║
# ║                                                                          ║
# ║  It only ever READS and creates one disposable watchlist row, which it    ║
# ║  deletes. Safe against production; still, prefer a dedicated account.     ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$JAR" "$BODY"' EXIT

pass=0; fail=0

check() { # check <name> <expected-status> <curl args...>
  local name="$1" expected="$2"; shift 2
  local got
  got="$(curl -s -b "$JAR" -c "$JAR" -o "$BODY" -w '%{http_code}' --max-time 30 "$@")"
  if [ "$got" = "$expected" ]; then
    printf '  ok    %-42s %s\n' "$name" "$got"; pass=$((pass+1))
  else
    printf '  FAIL  %-42s expected %s, got %s\n' "$name" "$expected" "$got"
    head -c 200 "$BODY" | sed 's/^/        /'; echo
    fail=$((fail+1))
  fi
}

header_has() { # header_has <name> <header> <substring> <url>
  local name="$1" header="$2" needle="$3" url="$4"
  if curl -sI --max-time 15 "$url" | grep -i "^$header:" | grep -qi -- "$needle"; then
    printf '  ok    %-42s %s\n' "$name" "present"; pass=$((pass+1))
  else
    printf '  FAIL  %-42s %s missing %s\n' "$name" "$header" "$needle"; fail=$((fail+1))
  fi
}

echo "smoke: $BASE_URL"
echo
echo "health and public surface"
check "health"                200 "$BASE_URL/api/health"
grep -q '"status":"ok"' "$BODY" \
  && { printf '  ok    %-42s database reachable\n' "health reports database ok"; pass=$((pass+1)); } \
  || { printf '  FAIL  %-42s\n' "health reports database ok"; fail=$((fail+1)); }
check "landing"               200 "$BASE_URL/stagelab"
check "pricing"               200 "$BASE_URL/stagelab/pricing"

echo
echo "security headers"
header_has "content-security-policy"  "content-security-policy" "default-src"  "$BASE_URL/stagelab"
header_has "x-frame-options"          "x-frame-options"         "DENY"         "$BASE_URL/stagelab"
header_has "x-content-type-options"   "x-content-type-options"  "nosniff"      "$BASE_URL/stagelab"
header_has "referrer-policy"          "referrer-policy"         "strict-origin" "$BASE_URL/stagelab"
case "$BASE_URL" in
  https://*) header_has "strict-transport-security" "strict-transport-security" "max-age" "$BASE_URL/stagelab" ;;
  *) printf '  skip  %-42s http:// — HSTS is https-only by design\n' "strict-transport-security" ;;
esac

echo
echo "authentication is enforced"
check "app redirects when signed out"  307 "$BASE_URL/stagelab/app"
check "session api rejects anonymous"  401 "$BASE_URL/api/stagelab/session"
check "watchlist rejects anonymous"    401 "$BASE_URL/api/stagelab/watchlist"

if [ -z "${SMOKE_EMAIL:-}" ] || [ -z "${SMOKE_PASSWORD:-}" ]; then
  echo
  echo "  note  SMOKE_EMAIL / SMOKE_PASSWORD not set — authenticated checks skipped."
else
  echo
  echo "authenticated surface"
  CSRF="$(curl -s -c "$JAR" "$BASE_URL/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')"
  curl -s -b "$JAR" -c "$JAR" -o /dev/null -X POST "$BASE_URL/api/auth/callback/credentials" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "email=$SMOKE_EMAIL" \
    --data-urlencode "password=$SMOKE_PASSWORD" \
    --data-urlencode "json=true"

  check "session"                  200 "$BASE_URL/api/stagelab/session"
  PLAN="$(sed -n 's/.*"plan":"\([^"]*\)".*/\1/p' "$BODY")"
  echo "        plan: ${PLAN:-unknown}"

  check "overview"                 200 "$BASE_URL/api/stagelab/overview"
  check "universe (enriched)"      200 "$BASE_URL/api/stagelab/universe?enrich=1"
  grep -q '"symbol"' "$BODY" \
    && { printf '  ok    %-42s universe is populated\n' "universe has stocks"; pass=$((pass+1)); } \
    || { printf '  FAIL  %-42s empty — run db:seed:stagelab\n' "universe has stocks"; fail=$((fail+1)); }

  echo
  echo "write path (creates and removes one row)"
  check "create watchlist row"     200 -X POST "$BASE_URL/api/stagelab/watchlist" \
    -H 'content-type: application/json' \
    -d '{"symbol":"SMOKE","sector":"TEST","entryPrice":10,"stopLoss":9,"targetPrice":13}'
  NEW_ID="$(sed -n 's/.*"id":\([0-9]*\).*/\1/p' "$BODY" | head -1)"
  if [ -n "$NEW_ID" ]; then
    check "delete it again"        200 -X DELETE "$BASE_URL/api/stagelab/watchlist?id=$NEW_ID"
  else
    printf '  FAIL  %-42s no id returned, cannot clean up\n' "delete it again"; fail=$((fail+1))
  fi

  echo
  echo "plan gates behave"
  if [ "$PLAN" = "free" ]; then
    check "quant gated on free"    402 "$BASE_URL/api/stagelab/quant/traps"
    check "export gated on free"   402 "$BASE_URL/api/stagelab/export?dataset=watchlist"
  else
    check "backtest runs"          200 -X POST "$BASE_URL/api/stagelab/backtest" \
      -H 'content-type: application/json' -d '{}'
    check "export downloads"       200 "$BASE_URL/api/stagelab/export?dataset=watchlist"
  fi
fi

echo
echo "─────────────────────────────"
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
