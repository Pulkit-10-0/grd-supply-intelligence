# Operations upgrade

Scope authorised on 2 November 2026: implement all twelve recommendations in
COMPARABLE_PROJECT_RESEARCH_2026-11-02.md, integrated with the existing stock ledger.

- [x] Action deadlines, escalation and time-based risk grid
- [x] Frozen plan impact comparisons and versioned disruption scenarios
- [x] Split-source proposals with atomic approval and donor protection
- [x] Shipment QR, delivery checklist and repeat-safe proof of delivery
- [x] Approved-version pick, packing and delivery documents
- [x] Supplier replenishment suggestions, orders, acknowledgement and partial receipts
- [x] Assigned count/recount sessions with snapshot conflict guards
- [x] Separate observed-public-data forecast benchmark
- [x] Availability-supported demand quality and sensitivity
- [x] Durable operational exception inbox with ownership and resolution
- [x] Readable stock cards and linked ledger evidence
- [x] Separate return approval, dispatch, transit, receipt and disposition
- [x] Android durable offline records and at least 50 repeat-safe commands
- [x] Shared web/Android workflows, migration, live deployment, updated Android build and project map
- [ ] Physical-device acceptance: camera optics/permission flows and actual offline field journey

External activation dependencies: real supplier/courier credentials and Android push
credentials must be supplied before those delivery adapters can send external events.
In-app inbox and explicitly labelled manual/demo event entry must work independently.
No iOS build. Free hosting only. Preserve existing cloud records.

## Implemented surfaces

- Website: Network overview → risk grid; Planning studio → frozen alternatives,
  split approval and map-linked disruptions; Operations desk → inbox, suppliers,
  count sessions, warehouse/delivery documents and returns; Evidence & stock cards
  → movement equation, supported demand-quality estimates and original public benchmark.
- Android: More → Operations desk for assigned counts, alerts, supplier receiving,
  return transitions and stock cards. Shipment QR opens the receiving checklist;
  delivery proofs record receiver and document reference. Cached authorised records
  survive restart until the server-issued session expiry; up to 100 commands of
  25 KB each use encrypted, atomically committed vault chunks.
- Backend: additive migration `c92e56a1f710`, typed workflow commands, persistent
  versions, existing role/site checks, audit and original idempotency keys.

## Verification recorded so far

- Final backend suite: 70 PostgreSQL tests pass; 69 SQLite tests pass with the PostgreSQL-only concurrency case skipped. Ruff passes.
- Android lint/typecheck and all 13 logic tests passed, including 50 persisted
  commands, restart, lost reply, scope isolation, expiry and failed storage commits.
- All 20 website tests and the production build pass. Browser testing found and fixed the quantity minimum/step offset and verified supplier draft/approval/acknowledgement/partial receipt, count submission and the live benchmark.
- Private pre-upgrade Neon backup restored into a separate local PostgreSQL database;
  migration and schema check passed with all existing row counts and stock totals
  unchanged (29 batches, 31 movements, 2 plans and 2 shipments).

## Honest boundaries

Scenario projections are deterministic planning estimates. The service-gap metric
is **unit-days**, so a booked unit still waiting on the next day contributes again;
it is not unique lost sales, clinical harm, or measured pilot impact. Supplier
quantities with no verified batch shelf life remain provisional in stock projections.
Split-source planning uses a transparent earliest-arrival greedy allocation with
pack-level feasibility search; it does not claim globally optimal network allocation.

The demand-quality estimator needs observed in-stock reporting plus sales coverage.
Without that evidence it returns unsupported. It never overwrites raw data or silently
feeds adjusted values into the operational forecast. The original public pharmacy
benchmark retains its ATC categories and publisher units; it is separate from Assam
operations and is distributed with source attribution and its non-commercial licence note.

Continuous background escalation, real provider push, supplier/courier integrations,
company datasets/policies, pilot acceptance and store distribution remain activation
or acceptance work. iOS build remains excluded by the user's instruction.

## Live release

Website/API: https://grd-supply-demo.onrender.com (Render Free + Neon Free).
The live upgrade preserves existing stock records. Acceptance fixtures add labelled
saved comparisons, a hypothetical flood-route scenario, a supplier **draft**, an
assigned count and persistent exceptions; these actions do not move physical stock.
The original public N02BE benchmark completed through the hosted worker (300 complete
weeks). Its validation-selected recent-four-week baseline does not win every final
held-out horizon; all methods and measured coverage remain visible.

Android: `outputs/mobile-demo/GRD-Supply-Android.apk` and the versioned
`GRD-Supply-Android-1.2.0.apk`. The package targets the same HTTPS API, version 1.2.0 /
code 3, with cleartext traffic disabled. It remains a debug-signed demonstration
package, not a store release. Package verification and an emulator cold launch passed.
Android Studio's interactive device view timed out while attaching the emulator;
therefore camera, denied-permission and full native offline field acceptance remain
unverified. The 50-command restart/replay acceptance currently passes in automated
logic tests, not as a physical-device claim.

The map scanner reports two high-severity unauthenticated-controls warnings because
it does not recognise the shared `Depends(context)` protection. Manual route inspection
confirms all 80 private handlers require that check; only login and health are public.
Unauthenticated and site-scope tests pass. The warnings are annotated on the map.
