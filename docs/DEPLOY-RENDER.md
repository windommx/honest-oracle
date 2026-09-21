# Deploying to Render

This repo ships a `render.yaml` Blueprint that provisions a managed Postgres
database and a Node web service for this app in one step. This is the exact
sequence to go from "code in GitHub" to "live URL that works."

## 1. Apply the Blueprint

1. Push to `main` on GitHub — `render.yaml` tracks `main`. (This repo's
   feature branch, `claude/rush-engine-book-generator-zq3c3e`, was merged
   into `main` as part of setting this up; `main` now carries the Writer
   Room, the theme, and the middleware security fix together.)
2. In the Render dashboard: **New → Blueprint**, connect this GitHub repo,
   let Render read `render.yaml`.
3. Review the proposed resources (one Postgres database, one web service) and
   click **Apply**. Render creates both and starts the first deploy.

The first deploy will build, then run `npm run db:rename && npx prisma db
push` (see `render.yaml`'s `preDeployCommand`), then start the app. On a
brand-new database `db:rename` is a documented no-op — it only touches
tables that still carry their pre-rebrand names (see
`prisma/manual/2026-09-rebrand-rename.sql`).

## 2. The one manual step: NEXTAUTH_URL

Render cannot know your service's URL before the service exists, so
`render.yaml` leaves `NEXTAUTH_URL` blank (`sync: false`) — you set it once,
after the first deploy:

1. Open the service in the Render dashboard; copy the URL shown at the top
   (`https://<your-service>.onrender.com`, or your custom domain once one is
   attached).
2. Service → **Environment** → set `NEXTAUTH_URL` to that exact URL
   (including `https://`, no trailing slash).
3. Save — Render redeploys automatically.

Login/signup/session cookies will not work correctly until this is set.

## 3. Verify it's actually live and correctly configured

Do not trust "the deploy succeeded" — check the app is honest about its own
state, the same way this repo checks itself:

```bash
# Public pages load
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-app>.onrender.com/
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-app>.onrender.com/bookisdom

# Protected pages redirect to /login when signed out (307) — NOT 200
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-app>.onrender.com/lifemap/admin
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-app>.onrender.com/lifemap/api-keys
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-app>.onrender.com/history

# If NEXTAUTH_SECRET or DATABASE_URL are ever missing, the app answers 503
# with the specific missing variable named — it never silently 500s.
curl -sS https://<your-app>.onrender.com/api/lifemap/usage | head -c 300
```

If `/lifemap/admin` or `/lifemap/api-keys` return `200` instead of `307`,
something is wrong with the deployed build — stop and do not announce it as
live; that was a real, previously-shipped bug (see the `fix(security)`
commit that added `middleware.test.ts`) and must not recur.

## 4. Optional: billing (Stripe)

Only needed if you want the "upgrade to Pro" flow to work. In the Render
dashboard, set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`STRIPE_PRICE_ID_PRO` (all left blank in `render.yaml`). Without them the app
runs fine — the Free-plan limits simply always apply, and nothing crashes
(this is by the same 503-not-500 discipline as the rest of the platform).

## 5. Plans and known limits, stated plainly

- **Free Postgres on Render expires 90 days after creation** and is then
  deleted. `render.yaml` defaults the database to `plan: free` to get started
  at zero cost — upgrade it before that matters, or before real user data
  exists.
- **Free web services spin down after 15 minutes idle** and take a real
  cold-start hit on the next request. `render.yaml` defaults the web service
  to `plan: starter` (not free) specifically to avoid this for anything but a
  pure experiment; downgrade only if cold starts are acceptable.
- **Pre-Deploy Command** (used to run `db:rename` + `db push` automatically)
  may not be available on every plan/region. If Render reports it isn't
  supported, run it once by hand instead — from the service's **Shell** tab
  in the dashboard:
  ```bash
  npm run db:rename && npx prisma db push
  ```
  Do this BEFORE the first deploy serves traffic if you're migrating a
  database that already has pre-rebrand data in it; on a fresh database it's
  safe to run anytime, including after.

## 6. Redeploying later

Every subsequent push to the deployed branch redeploys automatically
(`preDeployCommand` runs again each time — both its steps are idempotent, so
this is safe). No other manual step is needed after the first deploy's
`NEXTAUTH_URL`.
