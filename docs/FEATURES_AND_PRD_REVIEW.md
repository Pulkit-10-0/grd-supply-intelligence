# Whole project features and PRD completion review

**Historical baseline review.** Read [the 2 November upgrade](UPGRADE_IMPLEMENTATION.md) first: it supersedes the statements below that supplier orders, staged returns, saved network scenarios, public-data evidence and persisted Android records are missing. The original 53-requirement assessment is retained as the baseline; external-data/provider and device/pilot acceptance gates remain.

Reviewed 1 November 2026 against the original final product PRD v1.0 dated 23 October 2026 and the current repository. This is a code and recorded-evidence review, not a new exhaustive acceptance run.

**We are not fully complete against the original PRD.** The core supervised synthetic demonstration is integrated and hosted: map → shortage explanation → feasible source comparison → versioned approval → dispatch → partial receipt/quarantine → reconciliation. Android has an installable hosted demo build and a successful emulator cold launch. Several original final-product requirements are partial or absent, and device and pilot acceptance remain open.

The later user instruction to skip the iOS native build overrides the original two-platform delivery target. iOS is an intentional scope exclusion for this release, not work we should restart. Source remains cross-platform. AWS was a reference option rather than a mandatory requirement; the approved Render/Neon Free deployment is the current hosting choice.

No completion percentage is assigned: a feature count would disguise the acceptance gaps below. “Implemented core” means the principal behavior exists, not that every original acceptance criterion or real-world operational test has passed.

## How the project fits together

The planner website and Android field app use the same signed-in server. Shared definitions keep medicine records, risk ranking and display rules aligned. The server checks role/location permissions, validates plans and posts stock movements in one transactional database. A separate supervised worker reads saved calculation jobs and publishes forecast or policy-experiment results.

The live website, server and worker run together on Render Free in Singapore; persistent operating records are in Neon Free PostgreSQL 16 in Singapore. The worker pauses when the free host sleeps. Local development can use SQLite; the original root-level CSV experiments are a separate historical research workflow rather than the live platform.

The hosted network has 5 illustrative products and 5 fictional sites with approximate Assam town coordinates, generated as 18,375 synthetic demand rows. Original public pharmacy observations and real NASA POWER weather context are separate research tracks. They do not establish local GRD demand accuracy, and weather is not an evaluated live forecast feature.

## Features users can inspect

| Area | What it does | Current boundary |
|---|---|---|
| Network overview | Select medicine and site; inspect available stock, projected shortage, expiry and data freshness; map and list stay linked. | Working core |
| Action centre | Turn shortage/expiry risks, requests, open plans, receipts and discrepancies into prioritised work. | Working core; no push/escalation |
| Stock and batch ledger | Separate physical stock, reservation, in-transit goods, usable stock, expiry and quarantine; verify balances against movement history. | Working core |
| Supply comparison | Show eligible and rejected donors with pack, donor protection, arrival shelf life, cost/budget and capacity checks. | Working core for network transfers |
| Requests and approvals | Create requests and versioned proposals, revalidate changed inputs and reserve only after authorised approval. | Working core |
| Dispatch and receipts | Handle partial dispatch and partial accepted/damaged receipt, cancel only unshipped commitments and prevent repeat stock effects. | Working core; hosted journey verified |
| Count and discrepancy review | Keep the original count snapshot; open a case, assign/comment/review and make attributable adjustments rather than silently editing balances. | Working core; broader cases partial |
| Returns and holds | Put supervised returns into pending review and block held stock from eligible supply. | Partial reverse-transport lifecycle |
| Demand imports | Preview CSV/XLSX, inspect errors/provenance, reconcile the source and prevent duplicate import observations. | Working demand-only scope |
| Forecast evidence | Compare simple methods with one learning model; show 1/2/4-week held-out metrics, uncertainty and short/stale-history states. | Working core; local-signal evaluation missing |
| Policy experiment | Run a saved paired synthetic comparison and inspect service, unmet demand, expiry and stock trade-offs. | Working single-lane scope |
| Grounded assistant | Read plan evidence or retrieve cited approved-policy passages; unsupported questions stay unsupported and no stock action is executed. | Working narrow retrieval; illustrative policies |
| Operating history and access | Record who changed what and enforce organisation/role/location scope on both clients. | Working core; team hierarchy partial |
| Android field app | Today, Network, Actions, Stock and More; stock lookup, approval, dispatch, receipt, counts, evidence and internal batch lookup. | Built and cold-launched; interactive field QA open |
| Pending phone actions | Preserve original command/retry key and show conflicts instead of silently overwriting confirmed stock. | Partial: 8 commands; no offline cold start |
| Free hosted service | Website, server and worker share Render HTTPS; Neon retains records; readiness, jobs and restart persistence were verified. | Live synthetic demo; sleeps when idle |

## What remains before a stronger competition release

1. **Prove the Android field workflow on a physical phone.** Sign in to the live origin, create/approve a request under appropriate roles, dispatch, partially receive, separate damage, scan/manual lookup, deny camera permission, lose connectivity, expire a session and retry without duplicate stock. Verify the same records on the website. Native build/install/startup are already checked; this interactive acceptance has not been claimed.
2. **Close the explicit offline acceptance gap.** The PRD says at least 50 events, persisted operational records, restart/reconnect recovery and a narrow offline journey. Current protected storage supports 8 commands of up to 1,600 bytes and keeps fetched stock records in memory. Expand the storage design and acceptance tests rather than merely changing a queue constant. Full offline cold start and automatic background work are absent.
3. **Add the promised notification workflow.** Persist alerts/acknowledgements, link authorised tasks, test opted-in Android push and implement owner-configured overdue escalation. An action badge or case list does not deliver this requirement.
4. **Finish the actual reverse-stock lifecycle.** Split return request, dispatch, in-transit state, receipt and disposition. Current return handling is a supervised confirmed receipt into pending review; it is not a complete transported return.
5. **Strengthen the decision and evidence work.** Add a valid matched local-seasonal-signal ablation, broaden forecast calibration/cohorts, expand the policy experiment toward the promised saved disruption/network comparison, and test donor/recipient trade-offs. If local observations are unavailable, keep synthetic demonstration claims separate from observed accuracy and do not invent a positive signal result.
6. **Finish remaining product breadth deliberately.** External supplier replenishment/acknowledgement, configurable allocation priorities, broader discrepancies, attachments, group/territory administration, dense-map behavior and source repair/versioning are not all delivered. Some can be scoped out of the demo with an explicit product decision; the existing PRD cannot simply be marked complete.
7. **Complete release evidence.** Exercise cloud backup-and-restore and failed-job recovery; measure the declared workload on the actual free host, review accessibility and supported devices, and record known failures. The earlier local read-load test and cloud restart persistence are useful evidence but do not replace those checks.

## Inputs required before company deployment

Approved GRD demand, stock/batch movements, real lead times and operating policies are still required. Map the true SKU units, locations, transfer permissions, budgets, capacities and disposition authority. Start with shadow recommendations and staff validation. Company-approved policy documents must replace illustrative passages before answers can be called company policy.

No measured GRD stock-out reduction, expiry saving, forecast improvement target or commercial service-level gain has been established. The published challenge targets require an agreed pilot baseline, definitions and observation period. Real ERP feeds, carrier/vehicle telemetry, production notification providers, retention ownership and support arrangements have their own activation work. Payments, medicine prescribing and full regulatory recall-case management remain outside the agreed base product.

A hosted synthetic demo is already delivered. A complete final PRD release and an industry-ready company deployment are later gates with the concrete work and inputs listed here.

## Requirement by requirement

Every explicitly numbered feature requirement from the original PRD appears below. Broader acceptance criteria on performance, recovery, research, 50-event offline replay and impact measurement are assessed above and remain separate gates.

| PRD ID | Assessment | Implemented behavior | Remaining acceptance or scope | Evidence |
|---|---|---|---|---|
| DATA-01 | Partial | Demand CSV/XLSX preview, row validation, provenance and duplicate prevention work. | Generic inventory/master-data mappings, versioned repair/replacement and agreed API extracts remain. | grd/imports.py; docs/DATA_STRATEGY.md |
| DATA-02 | Partial | Unknown stock, batch age and stale forecast states are visible. | Named source refresh ownership, configurable refresh/escalation and a complete quality-repair workflow remain. | grd/planning.py; grd/imports.py |
| FC-01 | Partial | Requested and sales measures are separate; weekly forecasts and unfulfilled request quantities are retained. | Stock-out-censored demand inference, daily/adaptive horizons and its sensitivity evidence remain. | grd/forecasting.py; grd/worker.py |
| FC-02 | Implemented core | Naive, recent-average, Croston and seasonal baselines compete with a gradient-boosting model; validation selects the winner. | Requalify on representative medicine/location cohorts; an ML win is not promised. | grd/forecasting.py |
| FC-03 | Partial | Cut-offs, model version, 1/2/4-week errors and empirical residual intervals are exposed. | Broader calibration and reconciled aggregate forecast hierarchy remain; current calibration sample is small. | grd/forecasting.py |
| FC-04 | Not implemented | Calendar features and a seasonal-naive baseline exist; separate Assam weather context has been downloaded. | No matched local-signal model-versus-no-signal ablation is delivered. Weather is not a production model input. | grd/forecasting.py; scripts/fetch_public_data.py |
| FC-05 | Partial | Routes carry labelled lower/upper lead-day assumptions used in supply checks. | Learn lead-time distributions from actual dispatch/receipt history once it is available. | grd/models.py; grd/domain.py |
| PLAN-01 | Partial | Projects shortage and expiry with batches, commitments, inbound supply and max(booked, forecast) demand consumption. | Full uncertainty-driven risk propagation and validated live arrival reliability remain. | grd/planning.py |
| PLAN-02 | Partial | Compares existing-network donors, rejected transfers and no action; requests and internal replenishment work. | External supplier purchase/replenishment orders, acknowledgement and vendor comparisons remain. | grd/api.py; grd/schemas.py |
| PLAN-03 | Implemented core | Checks links, stock, commitments, packs, minimums, budget, capacity, shelf life and current evidence before approval/dispatch. | Approve real GRD rules and test missing-rule behavior against the mapped pilot configuration. | grd/domain.py; tests/test_constraints.py |
| PLAN-04 | Partial | Finite-stock draft allocation uses earliest required date and request time without reusing donor units. | Configurable owner-approved service priorities and multi-donor/network optimisation remain. | grd/api.py:allocate |
| PLAN-05 | Implemented core | Expiry rescue checks recipient demand, donor protection, arrival shelf life and transfer eligibility. | Validate real costs, permitted transfers and actual usage against owner data. | grd/api.py:expiry_rescue; grd/domain.py |
| PLAN-06 | Partial | Shows option constraints, indicative configured costs and a paired inventory/service policy comparison. | A common multi-objective network scenario comparison and complete cost sensitivity remain. | grd/domain.py; grd/simulation.py |
| INV-01 | Partial | Specific product presentations, integer base units, packs and exact conversions are stored. | Versioned identity/conversion edits, deeper location hierarchy and complete master-data authoring remain. | grd/models.py; grd/schemas.py |
| INV-02 | Implemented core | Balances, reservations, dispatch, transit, partial receipts and ineligible batch states remain distinct and traceable. | Owner acceptance and production source reconciliation are still required. | grd/domain.py; tests/test_stock.py |
| INV-03 | Implemented core | Balances, reservations, dispatch, transit, partial receipts and ineligible batch states remain distinct and traceable. | Owner acceptance and production source reconciliation are still required. | grd/domain.py; tests/test_stock.py |
| INV-04 | Partial | Eligible batches are picked by earliest expiry and holds prevent allocation or picking. | Configurable approaching-expiry alert policies and a complete imported hold acknowledgement workflow remain. | grd/domain.py; grd/api.py |
| INV-05 | Implemented core | Counts create review cases; authorised adjustments and linked reversals preserve history and stale-snapshot checks. | Exercise native count/reconnect conflicts on a real phone and approve company correction authority. | grd/api.py; mobile/src/queue.ts |
| INV-06 | Partial | Negative usable stock is blocked; source ages and recorded movement/receipt dates are retained. | Observed supplier reliability and complete provisional/reconstructed balance reporting remain. | grd/domain.py; grd/models.py |
| ORDER-01 | Partial | Requests record quantity, destination, due date and reason; fulfilment and cancellation preserve outstanding demand. | Request import, explicit accepted/backorder states and broader lost-demand reasons remain. | grd/models.py:StockRequest; grd/api.py |
| ORDER-02 | Partial | Internal request, versioned plan, shipment and receipt records are linked. | External procurement references, supplier acknowledgement and the complete commercial order lifecycle remain. | grd/models.py:Plan; grd/models.py:Shipment |
| SHIP-01 | Implemented core | Versioned reservations, partial dispatch, per-batch partial receipt, damage quarantine and residual quantities work. | Native field QA, actual carrier events and operational acceptance remain. | grd/domain.py; tests/test_stock.py; outputs/deployment-setup/live-workflow-smoke.json |
| SHIP-02 | Implemented core | Versioned reservations, partial dispatch, per-batch partial receipt, damage quarantine and residual quantities work. | Native field QA, actual carrier events and operational acceptance remain. | grd/domain.py; tests/test_stock.py; outputs/deployment-setup/live-workflow-smoke.json |
| FLOW-01 | Implemented core | Approvals require the exact version and current input revision; changes require revalidation. | Confirm owner override/exception rules; broad exception authoring is not complete. | grd/api.py; grd/domain.py |
| FLOW-02 | Partial | Cases have owners, comments, due dates and history; plans/shipments have stable links. | Attachment storage, broader task ownership and record-linked notification delivery remain. | grd/models.py:Case; grd/api.py:case_update |
| UX-01 | Partial | Consistent labels, map/list selection, responsive views and loading/empty/error/unknown states exist. | Broader accessibility and representative staff/device acceptance remain; prior browser checks are not certification. | web/src/App.tsx; web/src/ui.tsx; mobile/src/ui.tsx |
| UX-02 | Partial | Consistent labels, map/list selection, responsive views and loading/empty/error/unknown states exist. | Broader accessibility and representative staff/device acceptance remain; prior browser checks are not certification. | web/src/App.tsx; web/src/ui.tsx; mobile/src/ui.tsx |
| COLLAB-01 | Partial | Organisation, role and explicit location permissions are enforced centrally. | Dedicated region/territory/team/group membership and their management workflows remain. | grd/security.py; grd/api.py:context; grd/domain.py |
| COLLAB-02 | Not implemented in full | The action centre and discrepancy cases expose current risks and assigned work. | Persistent alert acknowledgement/deduplication, overdue escalation and opted-in push delivery are absent. A badge is not push. | shared/actions.ts; grd/models.py |
| MOB-01 | Partial; iOS removed | Android covers core tasks, map, stock, approvals, dispatch, receipts, counts and evidence; a demo APK is built and cold-launched. | Native login and full field journey QA, return coverage and signed pilot distribution remain. iOS delivery was later explicitly skipped by the user. | docs/MOBILE_DEMO.md; mobile/src/DetailScreen.tsx |
| MOB-02 | Partial; acceptance gap | Original commands persist in protected storage; retries are deliberate and scope-bound. | Eight small commands and memory-only stock records do not satisfy the PRD 50-event/restart/cached-record requirement. Full offline cold start and background sync are absent. | mobile/src/queue.ts; mobile/src/session.tsx |
| MOB-03 | Implemented logic; device unverified | Provisional actions do not increase confirmed stock; retries retain keys and 409 conflicts stop replay. | Prove restart, session expiry, hold changes and conflict recovery through native device acceptance tests. | mobile/src/queue.ts; mobile/tests/offline.test.ts |
| MOB-04 | Partial | Internal GRD batch QR labels and manual entry are supported. | General product/manufacturer barcode mappings and camera/denied-permission/poor-label testing remain. | mobile/src/ScanScreen.tsx; grd/api.py:scan |
| MOB-05 | Not implemented in full | Secure sign-in passes, scoped pending work and sign-out safeguards exist. | Push registration/deep links, tested shared-device behavior and a localisation framework remain; iOS testing is excluded by later instruction. | mobile/src/session.tsx; mobile/src/storage.ts |
| MAP-01 | Partial | Website and Android have selectable locations, a medicine network and accessible location lists. | Dense-marker clustering, deeper customer/territory hierarchy and broader drill-down remain. | web/src/NetworkMap.tsx; mobile/src/NetworkMap.tsx |
| MAP-02 | Partial | Stock risk, expiry and freshness views plus product/location/horizon filters work on the website. | Full inbound-delay/excess layers, demand-segment/territory/scenario filters and equivalent mobile layer coverage remain. | web/src/App.tsx; mobile/src/screens.tsx |
| MAP-03 | Implemented core | Authorised detail opens stock, risk and linked actions; links are clearly configured relationships, not verified driving routes. | Responsible-team expansion and broader phone drill-down acceptance remain. Live vehicle telemetry was explicitly outside the base scope. | web/src/NetworkMap.tsx; mobile/src/DetailScreen.tsx |
| MAP-04 | Implemented core | Authorised detail opens stock, risk and linked actions; links are clearly configured relationships, not verified driving routes. | Responsible-team expansion and broader phone drill-down acceptance remain. Live vehicle telemetry was explicitly outside the base scope. | web/src/NetworkMap.tsx; mobile/src/DetailScreen.tsx |
| MAP-05 | Partial | A horizon control projects risk from the fixed declared stock date and shows the demand basis. | A full baseline-versus-disruption scenario timeline on the map remains. A horizon slider is not that complete scenario system. | web/src/App.tsx; grd/planning.py |
| MAP-06 | Partial | Bundled outlines and list/detail views remain useful without external map tiles. | Persist permitted task/location records and complete the requested mobile offline detail behavior. | mobile/src/NetworkMap.tsx; mobile/src/session.tsx |
| CASE-01 | Partial | Damage/count/return cases support ownership, comments, deadlines, review, adjustment and linked corrections. | Complete shortage/excess/wrong-product/wrong-batch resolution journeys, attachments and operational acceptance remain. | grd/api.py; web/src/dialogs.tsx |
| CASE-02 | Partial | Damage/count/return cases support ownership, comments, deadlines, review, adjustment and linked corrections. | Complete shortage/excess/wrong-product/wrong-batch resolution journeys, attachments and operational acceptance remain. | grd/api.py; web/src/dialogs.tsx |
| RETURN-01 | Partial; lifecycle gap | A supervised confirmed return posts stock into return_pending and creates a disposition case. | Separate return initiation, dispatch, reverse in-transit tracking and receipt events are not implemented. | grd/api.py:returned |
| HOLD-01 | Partial | Authorised holds and release reasons block stock from planning and picking; changed stock forces revalidation. | Imported hold/recall references, affected-party acknowledgement and complete operational hold workflow remain. Full regulatory recall-case management is excluded. | grd/api.py:hold; grd/domain.py |
| AI-01 | Partial | Operations mode returns recorded plan evidence; policy mode cites accessible approved/effective passages or states that evidence is missing. | Broader operational question coverage, stale/conflicting document handling and actual owner-approved company policies remain. Current demonstration policies are illustrative. | grd/api.py:assistant; grd/demo.py |
| AI-02 | Partial | Operations mode returns recorded plan evidence; policy mode cites accessible approved/effective passages or states that evidence is missing. | Broader operational question coverage, stale/conflicting document handling and actual owner-approved company policies remain. Current demonstration policies are illustrative. | grd/api.py:assistant; grd/demo.py |
| AI-03 | Implemented core | Retrieval stays behind server access checks; policy text is inert source content and cannot execute commands. | Complete a reviewed adversarial/cross-scope assistant evaluation set. | grd/api.py:assistant; tests/test_access_data.py |
| AI-04 | Optional drafting absent | The assistant is read-only and never changes stock or approves a plan. | Draft preparation and broader conversational synthesis are optional extensions, not reasons to bypass the reliable structured workflow. | grd/api.py:assistant |
| SIM-01 | Partial | A reproducible paired single-lane experiment compares service, unmet demand, expiry and inventory with conservation checks. | Full network/batch replay, the operational baseline, complete configured costs and reusable experiment export packages remain. | grd/simulation.py |
| SIM-02 | Partial | Users can vary experiment days, seed, lead days and proposed safety days. | Supplier availability, demand uplift, budget, service-priority and shelf-life scenario controls linked to map/plan comparisons remain. | grd/schemas.py:SimulationJob; grd/simulation.py |
| SIM-03 | Partial | A reproducible paired single-lane experiment compares service, unmet demand, expiry and inventory with conservation checks. | Full network/batch replay, the operational baseline, complete configured costs and reusable experiment export packages remain. | grd/simulation.py |
| EXPLAIN-01 | Partial | Plans retain the recorded input revision, allocation evidence, binding checks, arrival assumptions and approval version. | Complete alternative/override history and an owner-approved policy-version evidence package remain. | grd/models.py:Plan; grd/domain.py |
| EXPLAIN-02 | Implemented core | Synthetic operations, forecast tests and policy experiments are labelled separately and do not claim measured GRD outcomes. | Preserve these boundaries in the submission deck/video and re-evaluate on approved pilot observations. | grd/demo.py; grd/worker.py; web/src/workspaces.tsx |

## Architecture review notes

The automatic floorplan health check labels many requests “unprotected” because it does not follow the shared `Depends(context)` check. Manual code inspection confirms all 54 non-public handlers use that dependency. Fresh unauthenticated requests to live `/me`, `/products`, `/plans` and a request-creation command returned 401. The two health requests and password login are intentionally public. This scanner finding is a reviewed false positive, not evidence of an open stock-writing service.

The automatic localhost warning points at development-only website forwarding/sign-in helpers. Production website calls use the hosted same origin, and the Android APK contains the public HTTPS origin with cleartext disabled. Four large files—main website, operating dialogs, evidence workspaces and server request definitions—are genuine maintenance hotspots; splitting them would improve future change safety. A complete security audit is not implied by this review.

## Source and evidence references

- Original PRD: `NESFIC_I09_Final_PRD_v1_0.docx (team reference, not bundled)`.
- User-approved change: skip the iOS native build; deploy the synthetic demo on Free Render and Neon.
- `docs/MOBILE_DEMO.md`, `docs/FREE_DEPLOYMENT.md`, `docs/DATA_STRATEGY.md`, `docs/PRD_STATUS.md`.
- Hosted checks: ignored `outputs/deployment-setup/live-worker-smoke.json`, `live-workflow-smoke.json`, `live-restart-proof.json` and `android-launch.txt`.
- APK checks: ignored `outputs/mobile-demo/hosted-build.json`.
- The older audit and website handoff record prior milestones; their statements that hosting/native apps were not delivered have been superseded by the later deployment/mobile handoffs.
- Floorplan: `floorplan/index.html`; editable architecture and descriptions stay local and out of Git.
