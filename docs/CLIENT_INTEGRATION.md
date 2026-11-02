# Website and React Native integration

API prefix `/api/v1`; local server `http://127.0.0.1:8011`; interactive contracts `/docs`; machine-readable `/openapi.json`. `docs/openapi.json` is a checked-in contract snapshot. `clients/grd-client.ts` provides a starter transport. The implemented Expo app lives in `mobile`, with native secure storage, session fencing and a bounded persistent outbox; see `docs/MOBILE_DEMO.md`. Product types, display helpers and prioritised action logic are shared by both clients in `shared`.

Mobile physical counts include `expected_updated_at` from the original batch snapshot. A changed batch rejects the delayed upload with 409 and requires a recount; already-recorded retries still return the same recorded result. The field is optional for existing online clients, and absence preserves the original idempotency digest.

## Identity

`POST /auth/login` takes JSON `email,password`. Store returned bearer tokens in secure platform storage. `/me` reports role, location scope, evidence type and inventory revision. Never rely on hidden UI controls to implement access: the backend enforces organisation/role/location checks. `/auth/logout` revokes that user's existing tokens. Admin creates users with explicit locations; an empty non-admin location list grants no operational locations.

The local seed user is `demo@grd.local`; password is in the ignored local `.env` file, not source control. No signup endpoint creates arbitrary administrators.

## Complete transaction journey

1. Get `/products`, `/locations` and `/network?product_id=...&as_of=2026-11-01`. Render both GeoJSON features and its matching table. Show unknown/stale states, provenance and approximate coordinates. No live vehicle location is implied.
2. `POST /requests`: destination, product, base-unit quantity, needed date and reason. Requested, fulfilled and cancelled quantities remain separate.
3. Inspect `/planning/options` or `/planning/expiry-rescue`. Draft alternatives do not reserve stock. `/plans` creates a versioned proposal linked to an optional request.
4. A manager `POST`s `/plans/{id}/approve` with the exact `version` and `as_of`. Changed input revisions return HTTP409. Create/revise a fresh proposal and review again. Approval reserves FEFO batches; it does not move them.
5. A source operator calls `/plans/{id}/dispatch` with a quantity and date. This can be partial. It reduces source physical and reserved stock and creates shipment lines in transit.
6. A destination operator calls `/shipments/{id}/receipts` with shipment-line IDs, accepted/damaged quantities and date. Partial receipts are allowed. Accepted goods become destination stock; damaged goods enter quarantine and create a case. Request fulfilment increases only for accepted receipts.
7. Refresh stock/map, `/cases` and `/inventory/reconciliation`. Source and destination ledgers must reconcile. Cancelling a plan releases only units not dispatched; it cannot teleport goods back from transit.

All inventory/execution commands require a stable `Idempotency-Key`. Same key + same body returns the prior result without another stock effect. Same key + changed body returns 409. Keep the key across network timeouts and app restarts. Do not label local queued events confirmed until the server accepts them. Offline holds, stale approvals, changed rules and insufficient stock remain visible conflicts.

Native clients must use the server's clock/validation result, not adjust balances with last-write-wins. `/mobile/sync` gives scoped audit pages; also refresh current stock and relevant shipment/plan records. Phone scanning can resolve a verified internal batch ID through `/scan/{code}`. Generic product barcodes do not prove batch or expiry; keep manual entry.

## Planning and evidence

- Batch eligibility, donor protection, route permissions, pack multiples, minimum/maximum orders, per-order budgets, destination per-product capacity and arrival shelf-life constraints are enforced on plan creation and approval. Route rule changes block old approved dispatches.
- `/jobs/forecast` and `/jobs/simulation` return durable queued jobs. Poll `/jobs/{id}`; run the separate worker process. Completed forecasts expose cut-off, method, four-week central path, selected-horizon intervals and holdout metrics. The map uses a recent published forecast where available, with a labelled historical-mean fallback outside the published horizon.
- Simulation comparisons are single-lane synthetic policy experiments with shared external randomness and explicit trade-offs. They do not prove multi-site transfer performance.
- The assistant's operations mode requires an accessible plan ID and returns its recorded facts. Policy mode returns passages only from approved, effective, accessible policy versions. This is deterministic grounded retrieval, not an unrestricted LLM. It cannot execute stock actions.

## Errors and limits

- 401: token expired/revoked; reauthenticate.
- 403: role/location denied.
- 404: unavailable record, including cross-organisation identifiers.
- 409: stale/insufficient/conflicting state; show the reason and reconcile.
- 422: malformed units, pack amounts, dates or fields.
- 429: login throttled.
- List endpoints use `offset,limit` (maximum 200). Imports have separate limits documented in DATA_STRATEGY.

Android emulator can reach the host using `10.0.2.2` rather than `127.0.0.1`. iOS simulator can use host localhost. Physical devices require a deliberately configured reachable server and TLS. The supplied dev launcher binds localhost only. Configure CORS for the website's real origin; React Native is still protected by authentication and scope.

Actual web UI, React Native persistence/scanning/push implementations and tests on both mobile platforms are separate client work. Backend command replay tests do not constitute native offline device validation.

## Audit updates, 1 November 2026

Dataset listings now accept offset/limit paging beyond the first 200 records. Shipment lines include batch_code/expiry for authorised destination receipt; source inventory remains scoped separately. Import provenance requires bounded strings and a nonempty list of limitations.

Freshness uses the oldest positive batch and is rechecked at live dispatch. SQLite's naive timestamp fields represent UTC; PostgreSQL returns timezone-aware instants. The web client normalises both for the operations timeline. New count snapshots additionally retain the batch timestamp; recount legacy open cases before operational use.

Completed calculations retain the current running lease and cannot overwrite cancellation/recovery. Simulation evidence remains synthetic_policy_simulation; source_evidence_type separately identifies the input organisation's mode. Web retries are session-bound, with bounded waits; they do not provide a durable native offline queue.
