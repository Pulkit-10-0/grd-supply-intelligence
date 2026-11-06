# Free competition demo hosting

The [Pharma Path website](https://pharma-path.onrender.com/) is a free Render Static Site. It forwards `/api/*`, `/health/*`, `/docs` and `/openapi.json` to the existing API web service. The browser uses the branded origin for both the website and the API.

The running service is Render **Free**, `grd-supply-demo`, Docker, Singapore,
with source `Pulkit-10-0/pharma-path` on `main` and manual deploys. The
evaluator cutover deployed commit `b987037` on 7 November 2026. The service
uses the existing Neon **Free** PostgreSQL database in AWS Singapore.
Provider settings store runtime secrets. Automatic cloud seeding is disabled.
The [GitHub availability workflow](../.github/workflows/demo-availability.yml)
checks readiness about every ten minutes. Scheduling and free hosting remain
best-effort.

Verified on the public service: HTTPS readiness, authenticated sign-in, website/map/action centre, stock reconciliation, forecast and simulation completion through the hosted worker, idempotent job submission, and unchanged inventory/completed jobs after a Render service restart. Evidence is in the ignored `outputs/deployment-setup` folder. Local private `demo-login.txt` contains the app login only; it is not part of the repository or Android bundle.

The Render **Free** API service hosts one supervised forecasting worker and uses persistent Neon **Free** PostgreSQL. Android connects directly to https://grd-supply-demo.onrender.com, which also serves the original website. Both browser links use the same accounts, stock and forecast jobs.

The Free API service sleeps after 15 idle minutes, can take about a minute to wake, and discards local files on sleep/restart. Open the service before a presentation; do not use artificial keep-alive traffic. The worker pauses while the service sleeps. Interrupted running jobs may require the documented `grd recover-jobs` procedure after the 30-minute lease expires. This free setup is a demo boundary, not production availability.

Neon currently advertises 100 CU-hours per project per month and 1 GB storage on Free. The worker polls while Render is awake, which keeps the database active; keep demo usage within the allowance. Render Free has 750 instance-hours per workspace per month. Monitor build, bandwidth and compute allowances; select only Free plans and do not enable paid overages. Do not use Render's temporary free Postgres, which expires after 30 days.

## Recreating the deployment

1. Create a Neon Free project in a region close to Singapore. Copy the PostgreSQL connection string, keeping `sslmode=require`. Keep it in the provider secret settings, never in the repository, browser build or mobile app. The cloud launcher selects the installed psycopg driver automatically.
2. Make the reviewed branch available in a GitHub repository you control or can deploy. In Render, create a Blueprint from `render.yaml`; confirm the web service plan is **Free**. There is no paid worker or disk in the blueprint. Do not create a second free service for the worker.
3. Set secret `DATABASE_URL` to Neon, `GRD_ADMIN_PASSWORD` to a **new** strong cloud demo password, and `GRD_DEMO_EMAIL` as desired. The Blueprint generates `GRD_TOKEN_SECRET`. Set `GRD_SEED_CLOUD_DEMO=true` for the initial empty database. The seed is explicitly synthetic; it never uploads the local database or resets existing users/stock. After the first successful deployment, set this flag back to `false`.
4. Same-origin Render hosting needs no browser CORS exception; the Blueprint starts with `CORS_ORIGINS` empty. Native clients do not need CORS exceptions either. If adding a separate Vercel browser frontend, set its exact trusted origin here; do not use `*`.
5. Deployment startup runs migrations, optionally seeds a new synthetic organisation, then supervises API and worker. Check `/health/ready`, sign in with the new cloud credentials, inspect the map, run a forecast through completion, and verify reconciliation. Restart once and verify stock and jobs persist in Neon before using it in the competition.
6. Enter the Render HTTPS origin in the mobile app's Server setting. Do not add `/api/v1` to the origin. Keep tokens and login passwords out of Expo public environment variables.

The API service was originally created using Render's public Git repository form: Docker, original branch `codex/grd-backend`, Singapore, Free, Dockerfile `./Dockerfile`, command `python scripts/cloud_demo.py`, readiness `/health/ready`. `render.yaml` describes the equivalent setup. The Neon database was migrated/seeded once before launch, so `GRD_SEED_CLOUD_DEMO=false` was used for the first Render deployment too.

## Optional Vercel website

Import the same repository on Vercel Hobby, choosing **Root Directory `web`**, the Vite framework and Node 24. Enable **Include source files outside of the Root Directory in the Build Step** because the website imports the repository's `shared` client code. Set build environment variable `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com`, then deploy. Add the exact Vercel production origin to Render's `CORS_ORIGINS` and redeploy Render. A changed API origin needs a new frontend build. Untrusted preview deployments should not receive production access.

Vercel supports FastAPI and now offers Daemons in beta, including on Hobby, subject to CPU and provisioned-memory quotas. It is technically another route, but our current backend has a persistent database, scientific Python dependencies and a continuously polling worker. Vercel-only deployment would need separate packaging and quota validation. Do not upload this repository unchanged and assume the jobs or SQLite data will persist.

Vercel hosts a browser website; Android/iOS applications are installed separately. Expo cloud builds and app-store distribution have their own limits, accounts and signing requirements.

## Credentials and recovery

Cloud passwords are independent of the existing local demo password. Do not upload `.env`, `grd.db`, data exports, backups or credentials. Docker excludes these paths. Do not enable public demo auto-login: the local Vite helper is development-only and is not included in the production build.

The local administrator can run migrations or job recovery using the cloud database secret in an isolated environment; never put the URL in shell history or logs. Stop the old worker before intentional recovery. Restore backups into a separate database and reconcile before switching services. Neon Free retention and recovery features are limited; export a separate encrypted backup for any non-disposable pilot.

Verified references: [Render Free](https://render.com/docs/free), [Neon pricing](https://neon.com/pricing), [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), [Vercel Daemons](https://vercel.com/docs/daemons), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
