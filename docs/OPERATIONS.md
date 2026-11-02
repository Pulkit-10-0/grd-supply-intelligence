# Operating the backend

Use Python 3.12. Set a random 32+ character `GRD_TOKEN_SECRET`; the API refuses to start without it. Do not commit `.env`, databases, datasets, exported customer records or credentials. The local example uses SQLite; deployed service uses PostgreSQL through `DATABASE_URL`.

Run `grd migrate` once per release before starting API/workers. Alembic records schema versions; `alembic check` verifies the ORM and migrated schema agree. Migrations are not automatically applied by HTTP requests. Bootstrap a clean organisation with `grd bootstrap --name NAME --email EMAIL`; this starts in shadow mode without inventing company stock or policies. Provision operators with explicit location scope.

## Local processes

`grd serve` binds `127.0.0.1:8011`. `grd worker` polls durable jobs; `grd worker-once` processes at most one. CLI loads the project's ignored `.env` without executing shell content. Token lifetime is eight hours; logout revokes a user's tokens. Use a TLS proxy and configured origins on deployment.

The queue is in SQL; no stock commands run as background jobs. A computational worker failure cannot silently post stock. Failed jobs retain an error/status. Cancelled jobs do not publish results. `grd recover-jobs` requeues running jobs older than 30 minutes after operator inspection. A cancelled running calculation can finish its CPU work, but its result is discarded. Keep only one worker for the demo; a production lease/heartbeat should replace the simple stale-job recovery rule before running expensive jobs near the timeout.

## Containers and PostgreSQL

Set `POSTGRES_PASSWORD` to a URL-safe secret in `.env` before using Compose. `docker compose up --build` starts PostgreSQL, runs migrations, then starts API and worker. The API is exposed only at host localhost:8011. Container definitions are supplied; consult verification notes for what was actually executed on this host. Initialise a demo inside the API container with `docker compose exec api grd seed-demo --email demo@grd.local`.

For cloud hosting, use managed PostgreSQL and a separate API/worker process, HTTPS, secret injection, explicit CORS origins and access logs without request bodies/tokens. The API serialises domain transactions using a per-organisation PostgreSQL row lock; SQLite uses `BEGIN IMMEDIATE`. This prioritises correctness for the declared small pilot network. Benchmark before scaling organisations with heavy concurrent operations.

## Backup and recovery

`grd backup-sqlite PATH` uses SQLite's backup API and refuses an existing destination. To restore, stop the API/worker, preserve the existing DB, copy the backup to a new disposable DB path, run migrations and reconciliation there, then deliberately switch configuration. Do not overwrite a running database. PostgreSQL: use managed snapshots or `pg_dump`; restore to a separate database, run `grd migrate`, check source totals and `/inventory/reconciliation`, verify users/scopes and restart workers only after review. Production restore/drill evidence is still a release gate.

Health: `/health/live` verifies process availability; `/health/ready` checks database migration availability. Monitor HTTP errors/latency, failed/stale jobs, unknown/stale stock, open discrepancy cases and reconciliation failures. The local login throttle is process-local; enforce shared rate limiting at the proxy in a multi-worker deployment.

## Tests

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 pytest -q
ruff check grd tests scripts
grd migrate
alembic check
```

PostgreSQL integration tests require `GRD_TEST_DATABASE_URL` pointing to a **dedicated database named `grd_test`**. They rebuild application tables and refuse any other PostgreSQL database name. Never use company or shared development data. CI supplies its own disposable PostgreSQL service.
