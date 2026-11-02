# Comparable medicine supply projects and recommended improvements

Reviewed 2 November 2026 for the GRD medicine-supply project. The strongest direction is to preserve our shared backend and stock ledger, then add deadline-aware planning, a stock-risk timeline grid, scan-assisted receiving and an inspectable plan-impact comparison. Several mature systems provide better references for operating workflows than a generic AI dashboard.

## Review scope

Surveyed 12 GitHub repositories across nine project families and inspected selected implementation files, repository trees and metadata. Inspected 11 YouTube watch pages and obtained six transcripts; the other five are explicitly metadata-only references below. Competitor applications were not installed or executed, and their advertised performance was not reproduced. Downloaded source was read as data; no repository setup scripts or notebook code were run.

Repository snapshots and video evidence are stored locally in the ignored `outputs/comparable-projects` directory. These findings are recommendations; no product features were implemented or deployed by this research.

## Repository shortlist and what to learn

### openboxes/openboxes

[Repository](https://github.com/openboxes/openboxes) · Warehouse execution · inspected revision `0493fec99606`

**Observed:** Request, pick/pack, ship/receive, purchase-order workflow and cycle-count records.

**Useful change for us:** Add printable pick/pack and shipment documents, bin/container references, supplier ordering and count/recount sessions.

**Boundary:** Keep existing FEFO, partial receipts and ledger checks; those are already present.

Implementation references: [Stock movement implementation](https://github.com/openboxes/openboxes/blob/0493fec99606cae1971bc55124daabebddabbe69/grails-app/services/org/pih/warehouse/inventory/StockMovementService.groovy), [Cycle-count implementation](https://github.com/openboxes/openboxes/blob/0493fec99606cae1971bc55124daabebddabbe69/grails-app/domain/org/pih/warehouse/inventory/CycleCount.groovy).

### OpenLMIS/openlmis-stockmanagement

[Repository](https://github.com/OpenLMIS/openlmis-stockmanagement) · Medical stock records · inspected revision `e32a9a1887fd`

**Observed:** Stock events/cards and physical inventory records separate events from balances.

**Useful change for us:** Add a readable product/location stock card with reason-coded movements and structured count sessions.

**Boundary:** Our stock ledger and organisation/location permissions already cover much of this core.

Implementation references: [Stock-event processing](https://github.com/OpenLMIS/openlmis-stockmanagement/blob/e32a9a1887fd85eecc93ec51362c6033936eb583/src/main/java/org/openlmis/stockmanagement/service/StockEventProcessor.java).

### OpenLMIS/openlmis-requisition

[Repository](https://github.com/OpenLMIS/openlmis-requisition) · Requisition and approval · inspected revision `367374d2cbf9`

**Observed:** Templates and an explicit requisition service support the request/approval process.

**Useful change for us:** Support routine and emergency request types, a configurable review step and a visible suggested-versus-requested-versus-approved quantity.

**Boundary:** Keep human approval and immutable posted-stock history.

Implementation references: [Requisition workflow](https://github.com/OpenLMIS/openlmis-requisition/blob/367374d2cbf9f9fd2357daacd088e4c0d0e31e2d/src/main/java/org/openlmis/requisition/service/RequisitionService.java).

### OpenLMIS/openlmis-fulfillment

[Repository](https://github.com/OpenLMIS/openlmis-fulfillment) · Proof of delivery · inspected revision `044e750ef981`

**Observed:** Shipment-linked proof-of-delivery records include line items, received/delivered-by fields and receipt date.

**Useful change for us:** Add a shipment QR reference, prefilled receiving checklist, receiver acknowledgement and a downloadable delivery record.

**Boundary:** Carrier-delivered status does not by itself confirm usable batches or accepted quantities.

Implementation references: [Delivery record](https://github.com/OpenLMIS/openlmis-fulfillment/blob/044e750ef981b8eeae2eab1ebbc3d517f65c83bb/src/main/java/org/openlmis/fulfillment/domain/ProofOfDelivery.java), [Delivery service](https://github.com/OpenLMIS/openlmis-fulfillment/blob/044e750ef981b8eeae2eab1ebbc3d517f65c83bb/src/main/java/org/openlmis/fulfillment/service/ProofOfDeliveryService.java).

### msupply-foundation/open-msupply

[Repository](https://github.com/msupply-foundation/open-msupply) · Offline medical logistics · inspected revision `749a3d1202cf`

**Observed:** Synchronisation documentation describes source-site routing, cursors, buffers, de-duplication and coexistence of protocol versions.

**Useful change for us:** Persist permitted task/stock records and build explicit sync state, conflict recovery and restart tests around our existing command keys.

**Boundary:** Do not replace our entire stack with its replication architecture. Our eight-command queue still needs the PRD 50-event acceptance work.

Implementation references: [Synchronisation design](https://github.com/msupply-foundation/open-msupply/blob/749a3d1202cfad0d7bfed04b2ab1b3c87f323f38/docs/content/docs/sync/_index.md).

### FASP-QAT/fasp-api

[Repository](https://github.com/FASP-QAT/fasp-api) · Forecast-to-supply planning · inspected revision `c24b444f979a`

**Observed:** Documentation separates forecasting/supply planning and describes offline conflict resolution, source data and shipment scenarios.

**Useful change for us:** Save a versioned supply-plan scenario: change a shipment quantity/date and inspect resulting stock/service/cost consequences.

**Boundary:** National/program planning is a different cadence; adapt ideas to distributor/SKU operations.

Implementation references: [Technical manual](https://github.com/FASP-QAT/fasp-api/blob/c24b444f979a68d9eb75bfeb0446e9b5a243814c/docs/QAT-technical-manual.md).

### FASP-QAT/fasp-core-ui

[Repository](https://github.com/FASP-QAT/fasp-core-ui) · Planner investigation tools · inspected revision `0889c405e1d8`

**Observed:** The UI includes stock-status matrices and explicit adjusted-consumption fields using reporting coverage and stock-out days.

**Useful change for us:** Create a SKU/location-by-week risk grid; keep observed sales and adjusted demand separate with inspectable assumptions.

**Boundary:** Missing or fully stocked-out periods require an unavailable estimate or bounded scenario, not division by zero or fabricated demand.

Implementation references: [Stock-risk matrix](https://github.com/FASP-QAT/fasp-core-ui/blob/0889c405e1d8936b07adedc2b7c54cb8fe14230a/src/views/Report/StockStatusMatrix.js), [Consumption adjustments](https://github.com/FASP-QAT/fasp-core-ui/blob/0889c405e1d8936b07adedc2b7c54cb8fe14230a/src/views/ConsumptionDataEntryandAdjustment/ConsumptionDataEntryAndAdjustment.js).

### DHIKSHITHA0906/MedSupply

[Repository](https://github.com/DHIKSHITHA0906/MedSupply) · Closest medicine decision prototype · inspected revision `dbdf5e8d62dc`

**Observed:** Code calculates action slack/deadlines and copies the network before comparing a candidate plan with no action.

**Useful change for us:** Add latest-safe-action timing and a donor/recipient before-versus-after comparison, with arrival uncertainty and residual shortages.

**Boundary:** Its supplier ripple and clinical-looking weights are demo assumptions; do not adopt them as validated medical priorities.

Implementation references: [Action deadline](https://github.com/DHIKSHITHA0906/MedSupply/blob/dbdf5e8d62dca064f327d6ec44b33a727ea67f64/backend/medsupply_member_c/deadline.py), [Before/after simulation](https://github.com/DHIKSHITHA0906/MedSupply/blob/dbdf5e8d62dca064f327d6ec44b33a727ea67f64/backend/medsupply_member_c/simulator.py).

### Aashrith04/RE-STOCK

[Repository](https://github.com/Aashrith04/RE-STOCK) · Expiry redistribution prototype · inspected revision `197d34636c4c`

**Observed:** The optimizer uses SciPy integer allocation across recipients; a separate decision layer turns results into operational choices.

**Useful change for us:** Use constrained split allocation and show units rescued, configured transport cost and unserved demand as separate quantities.

**Boundary:** Grocery markdown/donation logic is not a medicine policy. Minimum transfer is filtered after solving in the inspected code, and forecast fallback can invent a positive seeded rate; do not copy those behaviors.

Implementation references: [Redistribution optimizer](https://github.com/Aashrith04/RE-STOCK/blob/197d34636c4c82f8f52a76458fe7f23d70ea0cb3/backend/app/optimization/redistribution_optimizer.py), [Forecast fallback](https://github.com/Aashrith04/RE-STOCK/blob/197d34636c4c82f8f52a76458fe7f23d70ea0cb3/backend/app/ml/demand_forecaster.py).

### Lakog9/pharma-demand-forecasting

[Repository](https://github.com/Lakog9/pharma-demand-forecasting) · Forecast evidence example · inspected revision `ea4372dd5fe7`

**Observed:** The notebook uses the same public pharmacy source as our earlier experiments and demonstrates model-comparison plots.

**Useful change for us:** Add an observed-source benchmark view with computed per-category/horizon baseline metrics and data provenance.

**Boundary:** Summary metric tables are hard-coded; test features use lagged actual observations, so its advertised result is not proof of our fixed-origin multi-week performance.

Implementation references: [Forecast notebook](https://github.com/Lakog9/pharma-demand-forecasting/blob/ea4372dd5fe7969696463ad644fa6af0906888db/notebooks/02_forecasting.ipynb).

### KacperJarosik/Warehouse-Cost-Optimization-Pharmaceutical-Company

[Repository](https://github.com/KacperJarosik/Warehouse-Cost-Optimization-Pharmaceutical-Company) · Inventory economics and data lead · inspected revision `4d742cf4e99a`

**Observed:** Actual CSV inspection finds 250 products, monthly sales/inventory for 2023–2025 and lead-time, shelf-life, holding-cost and price parameters.

**Useful change for us:** Use the structure as a lead for a separate inventory-economics benchmark and inspect configured cost trade-offs.

**Boundary:** The dataset description says 123 products while the CSVs contain 250. Source observations, origin and reuse permission need qualification; it is not verified Assam/GRD data.

Implementation references: [Product parameters](https://github.com/KacperJarosik/Warehouse-Cost-Optimization-Pharmaceutical-Company/blob/4d742cf4e99ad5c07cf11b0490834176e05cb6b2/products_parameters.csv), [Dataset description](https://github.com/KacperJarosik/Warehouse-Cost-Optimization-Pharmaceutical-Company/blob/4d742cf4e99ad5c07cf11b0490834176e05cb6b2/dataset_description.md).

### Sreenivasreddy-2206/smart-medicine-redistribution

[Repository](https://github.com/Sreenivasreddy-2206/smart-medicine-redistribution) · Small geographic matching prototype · inspected revision `301c5e70de3f`

**Observed:** Readable matching rules combine donor surplus, requested medicine, expiry and geographic proximity.

**Useful change for us:** Use the simple source-card presentation to improve readability, while retaining our stricter validation.

**Boundary:** The inspected code substitutes a default distance when coordinates are missing and uses heuristic scores; retain our unknown-data state rather than borrowing that fallback.

Implementation references: [Recommendation rules](https://github.com/Sreenivasreddy-2206/smart-medicine-redistribution/blob/301c5e70de3f1727371b0f4dcff44341951ec823/backend/src/services/recommendationService.js).

## YouTube watchlist

Old version-specific tutorials are useful workflow references, not a claim that their screens match today’s release. The newer UI-modernisation video is also listed. Links below identify real watch pages, not search-result guesses. Timestamp links refer to transcript segments; auto-generated captions may contain errors.

| Video | Evidence inspected | What to study | Source |
|---|---|---|---|
| Purchase Order Workflow Demo (OpenBoxes) | Transcript | Purchase-order placement, shipment creation, receiving and putaway; start around 1:31 or 3:09. | [Watch](https://www.youtube.com/watch?v=3dll3xtM6XY) |
| Barcode Scanning Preview (OpenBoxes) | Watch page metadata; no transcript | Barcode scanning interaction reference; verify exact supported labels in code before adopting. | [Watch](https://www.youtube.com/watch?v=Fyu19ZPmM9k) |
| Inventory Cycle Count (OpenBoxes) | Transcript | Small repeatable count worklists, last-count age, variance investigation and count reporting. | [Watch](https://www.youtube.com/watch?v=qvz8uxyMVuw) |
| OpenLMIS 3.6 Demo: Ordering & Stock Management (OpenLMIS) | Watch page metadata; no transcript | Ordering and stock-management walkthrough; use current source/docs for implementation behavior. | [Watch](https://www.youtube.com/watch?v=KbPgKDdiqJ8) |
| Receiving stock - supplier invoices (mSupply Mobile) (mSupply Mobile) | Transcript | Expected supplier invoice appears through sync; receiver checks item/batch/quantity/expiry and finalises. Useful segment begins at 0:37. | [Watch](https://www.youtube.com/watch?v=HCWB3vBgnPQ) |
| Stocktake (mSupply Mobile) (mSupply Mobile) | Watch page metadata; no transcript | Phone stocktake workflow reference; distinguish this mobile client from the current Open mSupply repository. | [Watch](https://www.youtube.com/watch?v=dNJpYO4qUlM) |
| Demand Reporting in OpenBoxes (OpenBoxes) | Watch page metadata; no transcript | Demand-reporting screen reference; do not infer its method or measured accuracy from the title. | [Watch](https://www.youtube.com/watch?v=Sv2mXrrL04M) |
| OpenLMIS UI Modernization: Stock Management (SolDevelo) | Watch page metadata; no transcript | Recent OpenLMIS stock-management UI presentation; a visual reference rather than a completed functional audit. | [Watch](https://www.youtube.com/watch?v=fIGI_wl0H44) |
| OpenLMIS Version 3 - Requisitions (OpenLMIS) | Transcript | Offline indication and staged submission/review/authorisation/approval; offline demonstration begins around 3:42. | [Watch](https://www.youtube.com/watch?v=NyX78UIM1Ls) |
| Ordering stock - supplier requisitions (mSupply Mobile) (mSupply Mobile) | Transcript | Suggested stock quantity from current stock, consumption and target cover; requested quantity remains reviewable. | [Watch](https://www.youtube.com/watch?v=7ULpQJsOy4Q) |
| Using Inventory Levels (OpenBoxes) | Transcript | Facility-specific minimum, maximum and reorder levels instead of a single universal threshold. | [Watch](https://www.youtube.com/watch?v=KYL8_QQ0380) |

## Improvements ranked for our current project

These priorities are our product assessment, not ratings published by the source projects. Effort is relative and excludes integrations/data that have not been supplied.

### 1 Action deadline and escalation

Show when approval/dispatch must happen, not only the predicted shortage date.

- **Reference:** MedSupply deadline implementation.
- **Current position:** We show shortage dates and late-arrival warnings, but no explicit latest-safe-action workflow.
- **Implementation boundary:** Use the plan’s conservative arrival lead and approval/handling buffer, label assumptions, keep overdue slack negative and escalate only to authorised owners.
- **Relative effort:** Low–medium; valid lead assumptions required.

### 2 Stock-risk timeline grid

Rows are product/location pairs; columns are days or weeks. Click a red cell to open its evidence and plan options.

- **Reference:** QAT Stock Status Matrix.
- **Current position:** We have a map and selected-location evidence, not a dense across-time portfolio grid.
- **Implementation boundary:** Show unknown/stale separately; keep the same filters, stock date and scenario as the map.
- **Relative effort:** Medium; existing projection data is a starting point.

### 3 Scan-assisted proof of delivery

Open expected shipment via QR; check quantities/batches/expiry, capture accepted/damaged/short lines and receiver confirmation.

- **Reference:** OpenLMIS delivery records; mSupply receiving video.
- **Current position:** We already support partial receipts and internal batch scanning; shipment QR, delivery document and stronger receiving handoff remain.
- **Implementation boundary:** Prefill expected information; preserve actual confirmation, scope checks, original command key and audit. Add protected evidence storage only if needed.
- **Relative effort:** Medium; Android camera/offline acceptance is required.

### 4 Plan impact comparison

Compare no action, single-source and split-source choices; show recipient and every donor before/after with arrival and service gaps.

- **Reference:** MedSupply simulator; QAT scenarios.
- **Current position:** Our donor protection exists; the current policy simulator is separate and single-lane.
- **Implementation boundary:** Fork a recorded state, use the same demand/arrival assumptions for all plans, expose residual shortage and never post simulated movements.
- **Relative effort:** Medium–high; add true split planning and approval reservations.

### 5 Pick, pack and dispatch documents

Generate a warehouse pick list, packing list and delivery note with batch/quantity checks.

- **Reference:** OpenBoxes stock-movement workflow.
- **Current position:** We reserve and dispatch FEFO stock but do not expose a full pick/pack/bin/container process.
- **Implementation boundary:** Print only the approved version; printing does not move stock; recheck holds/eligibility at dispatch.
- **Relative effort:** Low–medium for documents; larger for bins/containers.

### 6 Suggested replenishment orders

Calculate an explained proposed quantity, let staff adjust/review it, then track supplier acknowledgement and promised arrival.

- **Reference:** mSupply ordering; OpenBoxes purchase-order demo.
- **Current position:** We have requests/internal transfers; external supplier order lifecycle is missing.
- **Implementation boundary:** Include usable stock, outstanding commitments, confirmed inbound, packs and current rules; no auto-purchase without explicit authority.
- **Relative effort:** Medium–high; supplier integration is a separate dependency.

### 7 Count and recount sessions

Create a worklist of batches/products to count, assign an owner, compare variances and request recount before review.

- **Reference:** OpenBoxes CycleCount and cycle-count video.
- **Current position:** We already have guarded individual counts and review cases.
- **Implementation boundary:** Retain original stock snapshots and conflict checks; never silently overwrite changed balances.
- **Relative effort:** Medium; builds on existing count cases.

### 8 Observed-data forecast evidence

Run and display a separate original-data benchmark with honest per-series/horizon results.

- **Reference:** Pharma-demand forecasting example; our original dataset.
- **Current position:** The live forecast workspace currently uses only synthetic history.
- **Implementation boundary:** Keep source/category identity and units, train/validation/test separation, fixed-origin horizon evaluation and labels separate from generated Assam operations.
- **Relative effort:** Medium; no new external account needed.

### 9 Stock-out-aware demand quality

Show sales versus inferred demand separately with stock-availability/reporting evidence and sensitivity.

- **Reference:** QAT adjusted-consumption implementation.
- **Current position:** We preserve sales/requested measures but do not infer censored demand from actual availability.
- **Implementation boundary:** Requires observed availability/stock-out dates; preserve raw values and prevent unsupported or zero-denominator inference.
- **Relative effort:** High data dependency; do not pretend synthetic adjustment proves real lost demand.

### 10 Versioned disruption scenarios

Save a delayed delivery, reduced supplier availability or demand uplift and show which plans/locations become infeasible.

- **Reference:** QAT supply planning; MedSupply network copy.
- **Current position:** Existing simulation supports limited policy inputs, not a common map-linked scenario.
- **Implementation boundary:** Use distinct scenario IDs, compare against one frozen base and mark all generated shocks and costs.
- **Relative effort:** Medium–high; combine with plan impact rather than a separate disconnected dashboard.

### 11 Operational exception inbox

Unify late shipments, unconfirmed receipts, count variances, holds, stale inputs and failed sync with owner, due date and resolution.

- **Reference:** OpenLMIS workflows; QAT problem actions.
- **Current position:** We have action ranking and cases; durable acknowledgement, push/escalation and complete ownership remain.
- **Implementation boundary:** Use persistent alert identity/deduplication, permission-safe task links and a delivery adapter; free-host sleep affects scheduler timing.
- **Relative effort:** Medium; reliable background delivery may need later hosting changes.

### 12 Readable stock and evidence card

Explain opening stock plus receipts minus dispatch/write-off, then reservations and usable balance; show the source age.

- **Reference:** OpenLMIS stock cards; QAT calculation transparency.
- **Current position:** We already have reconciliation, movements and location evidence, spread over several views.
- **Implementation boundary:** Link each figure to permitted records; distinguish physical balance, availability and projected stock.
- **Relative effort:** Low–medium; mostly presentation of existing records.

## A deadline that the user can act on

A useful displayed quantity is:

`latest safe action = projected shortage time − conservative remaining lead time − approval/handling buffer`

Show the assumptions and their source. Do not subtract transport twice if it is already included in lead time. Use the declared scenario clock for a fixed demo, preserve negative slack as overdue, and show alternative actions when one transfer cannot arrive in time. Uncertain forecasts and lead times should produce a labelled planning envelope rather than a falsely precise guaranteed deadline. The MedSupply source is a starting pattern, not a calibrated medical-risk model.

## What to automate and what still needs confirmation

Automatically prepare proposed quantities, find candidates, populate expected shipment lines, generate documents, trigger authorised notifications and import genuine supplier/carrier events. A receiver still checks what physically arrived before confirming accepted/damaged stock. A carrier event saying delivered does not prove product identity, batch condition or quantity. An integration simulator can demonstrate event ingestion only if labelled as simulated.

The mSupply receiving transcript explicitly separates automatically synced expected invoice information from the receiver’s review and finalisation. OpenLMIS represents delivery confirmation as a linked record. These are good precedents for reducing typing while retaining accountable stock posting.

## What is already present and should be preserved

Our product already has organisation/role/location checks, a transactional batch ledger, FEFO reservations, stale-plan revalidation, partial dispatch/receipt, damage quarantine, count snapshot guards, repeat-safe stock commands, held-out forecast evaluation, source labels and durable calculation jobs. Do not describe these as new additions merely because another repository contains them. The original two-platform scope was changed by the user: iOS native delivery remains intentionally skipped.

## Findings that change how we use these sources

1. **RE-STOCK is a grocery/perishable prototype.** Its inspected integer optimizer limits aggregate surplus and recipient capacities, then removes allocations below its minimum quantity after the solve. That is not the same as modelling minimum-lot activation inside the optimisation; an apparently optimal plan can lose allocations after filtering. Its demand fallback can produce a seeded positive number without observed history. Preserve our explicit missing-data behavior and revalidate every rounded/selected allocation.
2. **The pharmacy forecasting example is not a transferable accuracy promise.** Its notebook constructs lag features from the complete series before the date split and evaluates test-date rows using earlier observed actuals. That can represent rolling prediction, but it is not a demonstrated fixed-origin multi-week forecast. Several displayed metric tables are hard-coded. Recompute metrics from saved predictions and keep final-test targets separate from model selection.
3. **The geographic redistribution example fabricates a distance fallback when coordinates are missing.** Adopt readable source comparisons, not assumed proximity presented as observed travel time. Keep exact product identity; do not infer clinical substitution or patient priority from an inventory score.
4. **The warehouse-economics dataset is a lead, not a replacement chosen for us.** Actual files have 250 products, whereas one documentation file says 123. It includes monthly sales/inventory, product costs, lead time and shelf life, which is structurally useful. It lacks verified Assam geography, received-batch events and confirmed source/reuse suitability for our intended pilot. Retain the fixed 2025 holdout if evaluating it; do not merge it into generated locations as observed Indian demand.
5. **Licences differ.** Repository metadata identifies OpenBoxes as EPL-1.0, OpenLMIS services as AGPL-3.0 and QAT as Apache-2.0. Open mSupply has a custom licence in its LICENSE file. Several small repositories have no licence identified by the API. Public visibility is not a blanket permission to copy code or redistribute data. Use the patterns as references, inspect the actual applicable licence before source reuse, and keep dataset permissions separate from code licensing.

## Recommended implementation sequence

**First strengthen trust:** bring a correctly evaluated observed-source benchmark into the evidence workspace, complete physical-phone acceptance and the original 50-event offline/restart/reconnect requirement, and preserve explicit synthetic labels.

**Then add a visible decision advantage:** latest-safe-action timing, the product/location/time risk matrix and a versioned before/after plan comparison. Reuse the current planning calculations so the map, grid and decision cards agree.

**Then close execution:** shipment QR and proof of delivery, printable pick/pack records, supplier order/acknowledgement and separate return transport stages. Add durable notification ownership/escalation as those events are introduced.

**Then deepen optimisation:** constrained multi-donor/multi-recipient allocation, disruption sensitivity and observed availability-aware demand. These depend on trustworthy data and real operating rules; adding another model or a broader chat box first would not establish those capabilities.

## Suggested demonstration

A late shipment changes the risk grid. The planner sees the remaining decision window, compares no action with two feasible responses, and opens the predicted effect on recipient and donors. Approval reserves real eligible stock. The warehouse prints/scans the shipment reference. The receiver sees expected lines on Android, records a partial receipt and quarantine, reconnects after a short outage, and the website shows one confirmed stock effect with an inspectable delivery record. The evidence screen separately shows observed-data forecast tests and labelled synthetic operating scenarios.

## Additional primary references

- [OpenLMIS functional documentation](https://openlmis.atlassian.net/wiki/spaces/OP/pages/88670494/Functional+Documentation): requisition, dispatch and proof-of-delivery workflows.
- [Open mSupply internal orders](https://docs.msupply.foundation/docs/replenishment/internal-orders/): target cover and editable suggested quantities.
- [Open mSupply stocktakes](https://docs.msupply.foundation/docs/inventory/stocktakes/): stocktake lifecycle.
- [OpenBoxes stock-movement documentation](https://docs.openboxes.com/en/develop/api-guide/outbound/stockMovement/): stock movement request contract.
- [Open mSupply licence](https://github.com/msupply-foundation/open-msupply/blob/develop/LICENSE): actual custom source terms.

The repository study, watchlist and proposed changes are research. Current demo features and acceptance gaps remain recorded in `docs/FEATURES_AND_PRD_REVIEW.md`; none of the suggestions above should be presented as implemented until built and tested.
