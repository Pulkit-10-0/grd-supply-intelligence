# Verification record — 1 November 2026

A later [complete local product audit](AUDIT_2026-11-01.md) includes the website, additional fixes and expanded test counts. The original backend handover record below is retained as historical evidence.

Base repository revision: `7857effb4023112e4b361baa9bc0601b1b39a95a`. Work is on local branch `codex/grd-backend` in a separate working copy. This record distinguishes executed checks from supplied deployment/configuration files.

## Executed

- **Clean standalone Python 3.12 environment:** installed the 50-package pinned lock without inherited system packages, installed this project, then ran the final suite: **28 passed, 1 skipped**. The skipped test specifically requires PostgreSQL.
- **PostgreSQL 16.15:** created an isolated temporary local cluster and dedicated `grd_test` database; ran the final suite: **29 passed**. Concurrent competing approvals, idempotent stock commands and scope checks passed on PostgreSQL as well as SQLite.
- **Lint:** `ruff check grd tests scripts` passed.
- **Migrations:** upgrades through `afc5260f2879` and `alembic check` passed on SQLite and PostgreSQL. The latest schema includes recorded shipment receipt dates and explicit synthetic scenario clocks.
- **Original CSV experiments:** downloaded the original public benchmark, extracted only its `salesdaily.csv`, and ran the corrected 02–08 sequence through `grd legacy-run`. The new adapters generated per-horizon forecast evidence, shortage warnings and transfer decisions without the original missing-input setup failure.
- **Both original planning regressions:** tests verify that an empty-stock location remains visible and that the CSV adapter and API cannot allocate the same donor units beyond availability. Competing PostgreSQL approvals yield one success and one conflict, not negative stock.
- **Complete synthetic API walkthrough:** request for 60 units → versioned approval → reservation → dispatch → 30 accepted units → 20 accepted plus 10 quarantined damaged units. The request shows 50 fulfilled, damaged stock remains ineligible, a discrepancy case is created and the ledger reconciles. The example deliberately compresses transport into one synthetic scenario date; it is not delivery-performance evidence.
- **Forecast and simulation jobs:** both completed against the seeded dataset. Forecast output includes model selection, cutoff, source dataset IDs, multi-horizon evaluation and intervals. Simulation output retains its synthetic-evidence label and shared-randomness assumptions.
- **Backup/restore:** backed up the local SQLite database with SQLite's backup API, opened the backup as a separate API database, checked `PRAGMA integrity_check`, authenticated and verified readiness and inventory reconciliation. No live database was overwritten.
- **Live HTTP:** localhost readiness returned HTTP200 and `/openapi.json` returned the current 51 API paths. Interactive API documentation is available at `/docs`.
- **Compose:** `docker compose config --quiet` passed. A full container-image build and cloud deployment were not executed.
- **Data:** generated the deterministic 18,375-row Assam operational scenario and exported its synthetic tables. Downloaded separate real NASA POWER context files for three Assam town-centre grid points, with source URLs and SHA-256 manifests. Downloaded the unchanged public pharmacy benchmark separately.

## Test coverage highlights

Unknown versus verified zero stock; overcommit under concurrent approvals; FEFO partial dispatch; expiry and pack constraints; budgets and storage caps; stale route rules; reapproval after edits; partial dispatch/receipt; duplicate/conflicting command keys; held-batch offline conflicts; return quarantine; request commitment limits; cross-role/location/organisation rejection; approved/effective policy citations; atomic import preview/replay; token revocation; untouched final forecast targets; future-observation exclusion; missing-history fallbacks; shared-stock allocation; scenario date isolation; job completion/cancellation; and simulation conservation.

The test stack currently emits a non-failing Starlette/httpx compatibility deprecation warning. No application test failures remain in the executed final suites.

## Limits that remain explicit

- Test results are backend evidence, not Android/iOS device validation, a complete frontend, measured GRD benefit or production certification.
- Forecast residual intervals use a small rolling calibration sample; inspect their reported empirical test coverage. Local weather signal value has not been demonstrated.
- Policy simulation is currently a paired single-lane experiment with declared external supply assumptions, not full network-wide optimisation/replay.
- Native persistent offline queues, camera use, push delivery, automated ERP feeds, approved company policies/data and a hosted operational restore drill remain separate activation work.
- The declared PRD workload of 100 SKUs / 5 locations / 24 months / 10 sessions has not been performance-certified here.
- CI configuration is supplied but has not been run on the remote GitHub repository. Changes have not been pushed.
