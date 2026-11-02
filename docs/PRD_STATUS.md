# PRD traceability and activation gates

Updated 2 November 2026 after the integrated operations upgrade. The twelve research
recommendations now have working shared-backend implementations; see
[the release checklist and limitations](UPGRADE_IMPLEMENTATION.md). The full original
final-product PRD still includes company-data, provider and field/pilot acceptance
gates. iOS native delivery remains excluded by the user's later instruction.

| Area | Implemented | Remaining activation / acceptance |
|---|---|---|
| Data foundation | Attributed demand imports, batches/units, immutable movements, reconciliation and dated availability evidence | Approved company schema/data, ERP feed and correction/replacement workflow |
| Forecasting | Baselines + ML candidate, validation selection, separated final tests, uncertainty/coverage and a separate original public-data benchmark | Broader rolling evaluation/calibration and matched local-signal ablation |
| Demand quality | Raw sales/requested preserved; observed availability/reporting supports an explicit lost-demand estimate and sensitivity | Actual stock-out/reporting exports; unsupported results stay unsupported |
| Planning | Donor protection, FEFO, packs, shelf life, route/cost/capacity checks, earliest-due allocations and atomic split-source approvals | Global optimisation and approved real commercial rules |
| Scenario evidence | Frozen no-action/source comparisons, donor/recipient timelines, saved disruption IDs and linked scenario map | Broader stochastic network replay and measured pilot outcomes |
| Action timing | Latest safe action date with negative overdue slack, explicit delivery/buffer assumptions and durable exception escalation | Reliable always-on scheduling; Free service sleeps |
| Supplier orders | Explained quantities, drafts, manager approval, manually recorded acknowledgement/promised date and partial accepted/damaged receipts | Real supplier API credentials, commercial approval and vendor reliability data |
| Warehouse and delivery | Approved-version pick/packing documents, internal shipment QR, delivery note and receiver-confirmed proof with short/damaged lines | Physical camera/field acceptance and external courier integration |
| Counts and returns | Assigned count/recount rounds with snapshot guards; staged return approval, dispatch, transit, receipt and disposition | Real operational user acceptance and company correction authority |
| Collaboration | Persistent deduplicated inbox, ownership, due dates, acknowledgement, resolution and sync-conflict reporting | Android push credentials/provider delivery, protected attachments and production SLA |
| Website | Polished map/actions plus Planning studio, Operations desk and evidence/stock-card workspaces | Broader assistive-technology and operational load acceptance |
| Android | Shared operations, shipment QR/manual lookup, proof of delivery and encrypted cached authorised records with a 100-command outbox | Physical-device login/camera/offline acceptance and store/pilot signing/distribution |
| Assistance | Read-only recorded-plan facts and cited approved policy excerpts | Owner-approved real policy corpus and optional improved retrieval/synthesis |
| Hosting | Render Free + persistent Neon PostgreSQL, additive migration, restored backup drill, authenticated live checks and green CI | Always-on production hosting, monitoring, incident/retention policies and pilot acceptance |

Do not present synthetic demonstrations, public pharmacy benchmarks or deterministic
scenario estimates as measured GRD business outcomes. No fixed accuracy or impact
percentage is claimed. The original 53-requirement baseline review is retained in
[FEATURES_AND_PRD_REVIEW.md](FEATURES_AND_PRD_REVIEW.md), with the upgrade as its explicit
superseding implementation record.
