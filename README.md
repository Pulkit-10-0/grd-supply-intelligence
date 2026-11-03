<p align="center">
  <img src="web/public/favicon.svg" width="64" alt="GRD Supply Intelligence" />
</p>

<h1 align="center">GRD Supply Intelligence</h1>

<p align="center">
  Medicine demand forecasting, stock planning and accountable delivery for a connected North-East distribution network.
</p>

<p align="center">
  <a href="https://github.com/Pulkit-10-0/grd-supply-intelligence/actions/workflows/backend.yml"><img src="https://github.com/Pulkit-10-0/grd-supply-intelligence/actions/workflows/backend.yml/badge.svg?branch=main" alt="Product checks" /></a>
  · <a href="https://grd-supply-demo.onrender.com">Live demonstration</a>
  · <a href="https://startup.assam.gov.in/nesfic26/problem-statements/nesfic-i-09">Official challenge</a>
  · <a href="docs/WEBSITE_READ_ALONG.md">Website walkthrough</a>
  · <a href="docs/PRD_STATUS.md">Implementation status</a>
</p>

**GRD Supply Intelligence connects a forecast to a stock decision, and follows that decision through approval, dispatch and receipt.** It combines a planner website, an Android field app and a shared, authenticated backend. Staff can inspect demand and inventory, compare replenishment and redistribution options, protect donor locations, manage expiry risk, record physical handoffs and explain the resulting stock balance.

The application was developed around **NESFIC-I-09**, the medicine demand and inventory challenge associated with **GR Dhanuka Group / GRD Pharmaceuticals**. The “GRD” project name refers to the business named in that selected challenge.

> **Current evidence boundary:** the operational demonstration uses generated demand, fictional sites, approximate Assam town coordinates and illustrative business rules. A separate public pharmacy benchmark uses original observed category-sales data. Neither proves real GRD forecast accuracy, commercial savings or pilot outcomes.

![Planning Studio: saved supply comparisons, donor options and frozen scenarios](docs/images/planning-studio.png)

**Interface update — 3 November 2026:** guided order progress, one receiving form, clearer next actions, expandable details and editable supplier planning assumptions. Backend, website and Android CI checks passed. See the [usability update](docs/USABILITY_UPDATE_2026-11-03.md).

## Contents

1. [The selected problem statement](#1-the-selected-problem-statement)
2. [The operational problems we address](#2-the-operational-problems-we-address)
3. [Factors a useful solution must consider](#3-factors-a-useful-solution-must-consider)
4. [Our solution and intended users](#4-our-solution-and-intended-users)
5. [A complete example journey](#5-a-complete-example-journey)
6. [Website screens](#6-website-screens)
7. [Feature details and operating workflows](#7-feature-details-and-operating-workflows)
8. [How forecasting and decision-making work](#8-how-forecasting-and-decision-making-work)
9. [Datasets, provenance and synthetic data](#9-datasets-provenance-and-synthetic-data)
10. [Android app and offline behaviour](#10-android-app-and-offline-behaviour)
11. [Architecture and technology](#11-architecture-and-technology)
12. [Data model and API](#12-data-model-and-api)
13. [Local setup](#13-local-setup)
14. [Deployment](#14-deployment)
15. [Testing and recorded verification](#15-testing-and-recorded-verification)
16. [A suggested demonstration](#16-a-suggested-demonstration)
17. [What is complete and what remains](#17-what-is-complete-and-what-remains)
18. [Real-data and pilot activation](#18-real-data-and-pilot-activation)
19. [Repository structure](#19-repository-structure)
20. [Documentation, attribution and licences](#20-documentation-attribution-and-licences)

## 1. The selected problem statement

| Item | Challenge context |
|---|---|
| Identifier | **NESFIC-I-09**, Industry / MSME stream |
| Official title | **Improving Medicine Demand Forecasting and Inventory Availability Across Northeast India** |
| Challenge owner | GR Dhanuka Group |
| Business described | GRD Pharmaceuticals |
| Initial geography | Assam, with wider North-East applicability |
| Indicative pilot | Guwahati/Rani operations and selected distribution partners; approximately 12–16 weeks |
| Primary need | Better demand visibility and practical stock/replenishment decisions |

The [official challenge](https://startup.assam.gov.in/nesfic26/problem-statements/nesfic-i-09) describes a dispersed network serving multiple customer types. Demand and transport conditions differ between locations. Decisions informed by sales history, partner inputs and manual judgement can leave inventory in the wrong place or trigger replenishment too late.

Its published improvement targets, to be assessed against an agreed pilot baseline, are:

| Intended improvement | Published target | What we would need to measure |
|---|---:|---|
| Forecast performance | At least **20%** improvement | Agreed error metric, baseline method, forecast horizons and representative SKU/location cohorts |
| Stock-out incidence | At least **20%** reduction | Agreed event/day definition, exposure denominator and comparable observation periods |
| Excess or slow stock | At least **15%** reduction | Owner-approved excess thresholds and comparable stock/value measurements |
| Expiry losses | At least **15%** reduction | Batch expiry outcomes and an agreed valuation method |
| Fulfilment/service | At least **10 percentage points** improvement | Agreed fill-rate or service-level definition |

**These are challenge targets, not achieved project results.** The challenge also describes representative operational data and expert/pilot access subject to confidentiality and data-sharing arrangements. This repository does not contain a company data-sharing agreement or a private GRD dataset.

The sections below explain our engineering interpretation of the problem and the implemented response.

## 2. The operational problems we address

| Problem | Why it matters | Our response |
|---|---|---|
| Fragmented visibility | A central team cannot act on stock it cannot reliably see | A common product/location view, map, stock cards, dated evidence and reporting-quality signals |
| Sales do not always equal demand | An empty shelf can suppress recorded sales | Separate requested and sales measures; availability-supported demand-quality estimates |
| Stock exists in the wrong location | One distributor may be short while another carries transferable surplus | Eligible-source comparison, donor protection, split-source plans and redistribution |
| Replenishment starts too late | A warning is less useful if the delivery window has already closed | Dated projections, conservative lead assumptions and latest-safe-action deadlines |
| Slow-moving batches expire | A high physical balance can conceal unusable or expiring stock | Batch-level expiry, FEFO allocation, hold states, expiry exposure and rescue options |
| A proposed action is mistaken for execution | A recommendation alone does not move or deliver medicine | Explicit approval, reservation, dispatch, receipt and exception states |
| Delivery quantities differ from dispatch | Short or damaged consignments distort availability if recorded casually | Per-line receiving, quarantine, short-delivery exceptions and receiver-confirmed proof |
| Physical counts differ from the system | Silent edits destroy trust and traceability | Assigned count/recount rounds, original snapshots, reviewed ledger adjustments and reconciliation |
| Returns disappear between sites | A return can be counted at both locations or released prematurely | Separate reverse transport and disposition stages |
| Connectivity is variable | Field work can be interrupted after a request has already reached the server | Encrypted cached records, a durable provisional outbox and original-key replay |
| A polished dashboard hides weak evidence | Attractive charts can overstate the quality of their underlying data | Explicit provenance, separated benchmarks, held-out evaluation and visible limitations |

The objective is a coherent operating workflow: **observe → predict → compare → approve → execute → reconcile → evaluate**.

## 3. Factors a useful solution must consider

A medicine supply recommendation depends on more than tomorrow's sales estimate.

| Factor | How the application handles it | Current qualification |
|---|---|---|
| Product identity | Uses explicit products, strengths/forms where supplied, base units and pack conversions | Demo presentations are illustrative |
| Geography | Keeps locations, districts, coordinates and supply routes explicit | Coordinates represent approximate towns, not real company premises |
| Seasonal variation | Evaluates calendar/seasonal forecasting alternatives | Local weather or outbreak improvement has not been established |
| Transport uncertainty | Uses route lead times and conservative upper lead assumptions | These are configured rules, not live courier predictions |
| Expiry and shelf life | Checks batch expiry and minimum remaining life at arrival | Actual company limits must be approved before a pilot |
| Donor availability | Separates unreserved eligible stock from stock needed to protect the donor | The planning policy is transparent and configurable through operating records |
| Reservations and commitments | Accounts for existing reservations, requests and declared inbound | A proposal is not treated as delivered stock |
| Order packs and limits | Enforces exact packs, minimums and configured maximum quantities | Quantities are integer product base units |
| Costs, budgets and capacity | Applies available route/product constraints | Missing or illustrative prices are not presented as observed commercial costs |
| Data freshness and coverage | Exposes input age, missing history and unsupported estimates | Unknown data is not silently changed to zero |
| Human responsibility | Uses roles, location scope, version checks and explicit approval | Role approval is not a claim of a separately enforced two-person control |
| Connectivity | Supports a narrow, protected offline field workflow | First sign-in, expired sessions and final server acceptance require connectivity |
| Operational fit | Supports imports and shared APIs rather than requiring wholesale system replacement | Real ERP and provider adapters remain activation work |

No specialised hardware is needed for the core demonstration. An Android phone camera can scan internal QR labels; manual entry is available. GPS sensors, temperature devices and live vehicle telemetry are not required or claimed.

## 4. Our solution and intended users

### Product direction

**GRD Supply Intelligence is a location-aware medicine demand and stock-planning platform that forecasts demand, identifies shortage and expiry exposure, compares replenishment and redistribution options, and tracks approved actions through receipt.**

It adds operational evidence around those decisions: original-data forecasting benchmarks, stock movement explanations, count sessions, delivery documents and a grounded read-only assistant.

### Who uses it

| User | Typical responsibilities |
|---|---|
| Central administrator | Provision accounts and configure the organisation |
| Supply-chain manager | Review and approve plans, supplier orders, stock corrections and returns |
| Planner | Inspect demand, compare sources, create proposals and rehearse disruptions |
| Warehouse/distributor operator | Dispatch, receive, confirm handoffs and submit assigned counts within authorised locations |
| Data steward | Review source data, imports, stock holds and policy material within permitted scope |
| Viewer/management | Inspect permitted stock, planning and evidence records |

The backend enforces access. Hiding a button in a client is not the permission boundary.

## 5. A complete example journey

1. A planner selects a medicine and Silchar in the network view.
2. The system shows a projected stock gap and the assumptions behind it.
3. A latest-safe-action date subtracts conservative delivery time and an approval/handling buffer from the shortage date. Negative slack stays visibly overdue.
4. The planner freezes the current network state and compares no action, eligible single sources and a split-source alternative where feasible.
5. Each donor remains visible in the comparison. The system checks packs, available batches, donor protection, route permission, arrival shelf life and configured limits.
6. The planner creates a hypothetical delay or demand increase to see how the same frozen base changes.
7. A manager approves a real alternative. All selected sources are revalidated and reserved together; failure on one leg rolls the approval back.
8. The warehouse prints the approved-version pick/packing documents, checks the batches and records dispatch.
9. The receiver opens the shipment through its QR label or record, confirms physical quantities, receiver identity and a document reference, and records accepted/damaged units.
10. Accepted units enter usable stock; damaged units enter quarantine. A short line remains an exception rather than being silently counted as received.
11. The system updates fulfilment, stock movements, cases and reconciliation.
12. The team reviews the stock card and evidence workspace. Scenario estimates and forecast-test results remain distinct from measured business outcomes.

**Physical events are recorded by authorised people.** The platform does not infer that a vehicle arrived or that a consignment was received merely because an expected date passed.

## 6. Website screens

| Screen | What you can do |
|---|---|
| **Network overview** | Filter medicine, site, horizon, risk/expiry/freshness; inspect the map, matching site table, shortage evidence and stock-risk grid |
| **Action centre** | Prioritise requests, risks, proposed/approved plans, shipments and discrepancy work; approve, dispatch or receive where permitted |
| **Planning studio** | Save frozen comparisons, inspect donor/recipient impact, approve eligible sources and save map-linked disruption scenarios |
| **Operations desk → Exception inbox** | Check current conditions, assign ownership/dates, acknowledge and resolve persistent issues with a reason |
| **Operations desk → Supplier orders** | Draft explained quantities, review/approve, record acknowledgement/promised arrival and receive consignments |
| **Operations desk → Count sessions** | Assign batches, enter counts, request a fresh recount and review differences |
| **Operations desk → Dispatch & delivery** | Open approved warehouse documents, shipment delivery notes, QR labels and proof-of-delivery checklists |
| **Operations desk → Return transfers** | Follow the staged return journey through final release or quarantine |
| **Inventory & batches** | Inspect quantities, expiry, status, reservations and permitted stock controls |
| **Forecasts & evidence** | Run demand forecasts and paired policy experiments; inspect forecasts, uncertainty, metrics and assumptions |
| **Evidence & stock cards** | Trace the stock equation, inspect supported demand-quality estimates and run the original public-data benchmark |
| **Operations log** | Inspect permitted audit and operational history |
| **Data & provenance** | Review datasets and preview/import demand with source metadata and row-level validation |

The supply assistant answers from recorded plan evidence or approved policy passages. Its current implementation uses deterministic fact retrieval/extractive matching; it is not an autonomous purchasing agent or an externally connected general-purpose language model.

## 7. Feature details and operating workflows

### 7.1 Reliable stock and batch foundation

The stock model distinguishes:

- **Physical:** units actually recorded at a location, including held or expired stock.
- **Usable:** physical units whose status and expiry permit use.
- **Reserved:** units committed to an approved action.
- **Available:** eligible usable stock after reservations.
- **In transit:** dispatched units not yet received.
- **Projected:** a future balance after modelled demand, expiry and eligible declared arrivals.

Stock-changing actions create attributable movements. Counts and corrections do not silently overwrite history. Reconciliation checks whether batch balances agree with their movements.

### 7.2 Action deadlines and the risk grid

The daily grid uses the same selected medicine, location filters, scenario date and horizon as the map. Unknown and stale evidence are distinguished from a supported shortage projection.

A deadline is calculated as:

```text
latest safe action date
  = projected shortage date
  − conservative delivery lead
  − approval/handling buffer
```

The visible route-based deadline is an assumption requiring source availability checks. Delivery lead is counted once. The demo uses its fixed operating date, so deadlines do not drift with the presenter's computer clock.

### 7.3 Source comparison, donor protection and split approval

Transfer eligibility considers exact product identity, route permissions, pack multiples, FEFO batches, unreserved availability, donor demand protection and shelf life at arrival. Configured order limits, capacity and budgets are also checked.

Split planning uses an **earliest-arrival greedy allocation with pack-level feasibility search**. It does not claim a globally optimal network solution. Approval is atomic across its selected legs and revalidates current stock/rules.

A frozen comparison does not reserve stock. Approval reserves it; dispatch and receipt are separate events.

### 7.4 Frozen impact comparisons and disruption scenarios

A saved comparison retains a stock/demand snapshot, revision and fingerprint. Alternatives use the same base assumptions. The view exposes location-level timelines, arrival dates, remaining gaps and donor effects.

Saved disruption scenarios can add delivery delay, demand uplift or reduced incoming supply for selected sites. They have their own identifiers and are linked to the original frozen comparison.

**Service-gap totals are unit-days.** A booked unit that remains unfilled on another day contributes again. This is not a count of unique lost sales, affected patients or clinical harm.

### 7.5 Warehouse documents and proof of delivery

Approved-version pick and packing lists show batch codes, expiry, approved quantity, outstanding pick quantities and dispatch status. Printing a document does not move stock; dispatch still rechecks eligibility and holds.

Shipment notes carry internal identifiers such as:

```text
GRD:BATCH:<internal-batch-id>
GRD:SHIPMENT:<internal-shipment-id>
```

Scanning opens an authenticated record. It does not automatically confirm delivery. A retail product barcode is not treated as proof of a batch or expiry.

Delivery proof records the actual receiver, document/discrepancy reference, checked quantities, accepted units, damaged/quarantined units and short-line exceptions. A repeated command with its original key does not receive the same stock twice.

### 7.6 Supplier replenishment

The proposed order quantity is explained using eligible stock, reservations, commitments, confirmed inbound, lead/coverage assumptions and packs.

```text
draft → approved → acknowledged → partial receipt → received
                      ↘ cancellation of outstanding work where allowed
```

Acknowledgement records a supplier-confirmed promised date. It is a **manual recorded confirmation**, not a claim that a live supplier API sent the event. No automatic purchase, payment or supplier message is sent.

Incoming supplier stock without verified batch shelf life remains provisional in operational stock projections. Actual receipts create usable or quarantined batches.

### 7.7 Count and recount sessions

An assigned worklist captures original batch balances and update timestamps. The counter submits one quantity for each assigned batch. Review can request a fresh recount, preserving previous rounds.

Only an authorised adjustment changes stock. If the underlying stock changed after the captured snapshot, the system requires reconciliation/recount rather than applying an obsolete count.

### 7.8 Staged returns

```text
requested → approved → reverse dispatch / in transit
          → received for review → release or quarantine → closed
```

Approval reserves the identified units. Reverse dispatch removes them from the sending site's physical balance. Receipt creates a return-pending batch; release or quarantine is a separate decision.

Goods in reverse transit are unavailable at both ends. A legacy supervised confirmed-return endpoint remains for compatibility; the Operations desk exposes the staged workflow.

### 7.9 Persistent exception inbox

The inbox covers action deadlines, overdue receipts, held stock, count variances, stale inputs and reported sync conflicts. Records have stable identity, version, owner, due date, acknowledgement and resolution history.

Current condition checks run on demand. Duplicate checks preserve an existing item rather than creating a new alert every time. The free host can sleep; this is not continuous background escalation or a guaranteed push SLA.

### 7.10 Stock and evidence cards

The stock card shows:

```text
opening stock
+ receipts and positive adjustments
− dispatch, issues, write-offs and negative adjustments
= physical balance
```

It then separates usable, reserved and available stock, shows source age, and links figures to movement references. A newly added batch must not make older positive stock appear freshly reconciled.

### 7.11 Stock-out-aware demand quality

Raw sales and requested quantities stay separate. The optional estimate uses reported sales on observed in-stock days to estimate missing demand on evidenced stock-out days with sales coverage.

It exposes reporting coverage, unsupported days, source attribution and sensitivity. Missing availability evidence or an unsupported denominator does not produce invented demand.

Adjusted values neither overwrite raw observations nor automatically enter the operational forecasting series.

### 7.12 Forecast and policy evidence

The evidence workspace supports:

- Operational forecasts on the labelled demonstration/imported series.
- A separate observed public-category benchmark.
- Reproducible paired single-lane policy experiments.
- Frozen deterministic network planning comparisons.

These answer different questions and are not interchangeable evidence of real-world impact.

## 8. How forecasting and decision-making work

### Forecast evaluation

The current forecasting module evaluates:

| Method | Purpose |
|---|---|
| Naive | Last observed complete weekly value |
| Recent four-week average | Simple, interpretable short-term baseline |
| Croston-style intermittent-demand baseline | A candidate for intermittent series |
| Seasonal naive | A seasonal comparison when sufficient history exists |
| Histogram gradient boosting | One machine-learning candidate using historical/calendar features |

The evaluator uses complete observed Monday–Sunday weeks. Missing periods are not silently filled with zero. Insufficient or stale history produces an explicit status.

Forecasts cover **1, 2 and 4 weeks**. Multi-step predictions recurse without inserting future actual sales as lag inputs. Validation selects the model; final held-out targets are separated from validation. The selected model may be a simple baseline.

Residual-based intervals and measured held-out coverage are reported. Calibration and final-test samples are small, and overlapping origins limit the strength of conclusions. An ML win, fixed accuracy percentage or transferability to Assam is not promised.

### Operational projection

The network projects stock using available batches, expiry, eligible declared arrivals and demand. A recent matching published forecast is used where available, with a labelled historical-mean fallback.

Booked requests and forecast demand are treated as alternatives through a maximum rule, rather than simply added together and double-counted. Outstanding booked demand can carry forward.

Forecast uncertainty is displayed as evidence; the current network engine does not claim a fully stochastic, uncertainty-calibrated supply optimisation.

### Planning rules

The decision engine checks feasibility and explains rejections. An appealing comparison result cannot bypass:

- Authorised organisation and sites.
- Current product/route permissions.
- Nonnegative stock and existing reservations.
- Pack/minimum/maximum quantities.
- Donor protection.
- Arrival shelf life.
- Configured capacity and cost limits.
- Current plan/worklist version and operating date.

The system assists supply operations. It does not prescribe medicine, choose therapeutic substitutes or infer clinical priority.

## 9. Datasets, provenance and synthetic data

### Three evidence tracks

| Track | Contents | Used for | What it cannot establish |
|---|---|---|---|
| **Assam operational scenario** | Generated demand, fictional sites, illustrative medicines, stock and route rules | The map, stock decisions, execution workflows and operational demonstration | Observed regional demand, actual GRD performance or real commercial savings |
| **Original public pharmacy benchmark** | Eight ATC sales categories, original dates and fractional publisher quantities | Independent forecasting evaluation in the evidence workspace | Actual Assam SKU/location demand, local inventory or delivery performance |
| **Regional weather context** | Separately downloadable NASA POWER weather observations | Research/context for a possible future signal study | A demonstrated forecasting benefit; weather is not currently an evaluated model input |

### Synthetic operational scenario

The seeded scenario contains **18,375 daily demand rows**:

```text
5 illustrative products × 5 fictional locations × 735 days
```

The locations are a Guwahati central demo warehouse and fictional distributors associated with Guwahati, Dibrugarh, Silchar and Jorhat. Coordinates approximate town centres.

Illustrative products include paracetamol, cetirizine and ORS presentations, plus slow-moving and transfer-restricted examples. They exercise different operating cases; they are not an official company SKU catalogue.

The generator includes a short-stock recipient, short-dated surplus and configured route constraints. The standard demonstration stock date is **1 November 2026**. Changing a projection horizon does not change that physical stock date.

See [the generator](grd/demo.py) and [data strategy](docs/DATA_STRATEGY.md).

### Original public benchmark

Source: [Milan Zdravkovic — Pharma Sales Data, Kaggle](https://www.kaggle.com/datasets/milanzdravkovic/pharma-sales-data).

| Property | Original snapshot |
|---|---|
| Daily observations | **2,106** |
| Period | **2014-01-02 to 2019-10-08** |
| Series | `M01AB`, `M01AE`, `N02BA`, `N02BE`, `N05B`, `N05C`, `R03`, `R06` |
| Quantities | Publisher category-sales quantities; fractional values retained |
| Provenance | Observed source with publisher preprocessing; missing values/outliers were preprocessed upstream |
| Missing operational fields | Location-specific stocks, batches, expiry, requested/fulfilled orders, reservations, routes and shipment events |
| Source licence note | CC BY-NC 4.0 according to the source catalogue; source-specific terms remain relevant |
| Included files | [CSV snapshot](grd/assets/pharma-salesdaily.csv), [manifest](grd/assets/pharma-manifest.json), [attribution](grd/assets/README.md) |

**Why not use that single file for the entire application?** It can benchmark category forecasting, but it cannot truthfully supply the location, batch, stock, route and delivery records required by an operating supply network. Inventing those records creates a synthetic scenario; it does not localise the original observations into real Assam data.

The repository therefore uses two separate datasets for two separate purposes. The public benchmark never writes its ATC categories into the Assam operating ledger.

<details>
<summary>View the original-data benchmark screen</summary>

![Observed public-category benchmark with validation-selected model and held-out metrics](docs/images/public-benchmark.png)

</details>

### The earlier experiment pipeline

The original notebook and root scripts remain as attributed historical experiments. The earlier pipeline derives distributor histories from public category sales and simulates operational quantities. These derived allocations are synthetic.

It remains runnable independently:

```sh
python scripts/fetch_public_data.py pharma-benchmark
# Extract salesdaily.csv from the downloaded archive into data/external/.
grd legacy-run --source data/external/salesdaily.csv --output data/legacy-run --as-of 2019-09-05
```

It is not the production API's live stock database. Historical dashboard exports are not current model-evaluation evidence.

### Bringing your own demand data

The demand importer accepts UTF-8 CSV or XLSX, at most **5 MB / 10,000 rows** per upload.

Required columns:

```csv
date,product_id,location_id,quantity,measure
```

Use existing authorised product/location IDs, ISO dates, nonnegative integer product base units, and `requested` or `sales` as the measure. Do not combine sell-in and sell-out as independent demand.

Metadata declares `name`, `source_url`, `licence`, `geography`, `evidence_type`, `units` and `limitations`. Preview with `dry_run=true` before committing. Invalid files do not partially commit; identical observations are not silently duplicated or overwritten.

## 10. Android app and offline behaviour

The mobile client uses **React Native with Expo SDK 58** and native components. It connects directly to the same API as the website.

### Field workflows

- Today, Network, Actions, Stock and More tabs.
- Bundled regional map, authorised stock/risk markers and site details.
- Scoped plan/dispatch/receipt actions where the user's role permits them.
- Internal batch and shipment QR lookup with manual fallback.
- Receiver-confirmed delivery proof.
- Assigned count sessions, supplier receipts, return transitions and exception worklists through **More → Operations desk**.
- Stock cards, forecast/job evidence and grounded assistance.

Android is the current delivery target. Cross-platform source remains, but **the iOS native build is intentionally excluded from this release**.

### Offline rules

| Behaviour | Current implementation |
|---|---|
| Cached operational records | Encrypted device storage; restores only for the same origin/session while authorisation is unexpired |
| First sign-in / expired session | Requires server connectivity |
| Pending commands | Up to **100**, each at most **25,000 UTF-8 bytes** |
| Storage writes | Chunked protected items; a manifest commits last so a failed write preserves the previous complete value |
| Lost response | Retry the original persisted key and body |
| Conflict | Stops replay and requires refresh/reconciliation |
| Displayed stock | Remains confirmed server stock; a provisional command does not increase it |
| Background sync | Not a continuously running automatic synchronisation service |
| Push | Provider credentials are not configured; the in-app inbox works independently |

The outbox is scoped to server origin, organisation and user. Authorisation and inventory rules are checked again by the server. Native tokens use OS-protected storage; passwords are not stored.

**Acceptance boundary:** automated tests cover 50 persisted commands, restart, lost-response replay, expiry/account isolation and failed storage commits. The Android package passed signature/configuration checks, emulator installation and cold launch. Physical-phone camera, denied-permission and complete offline field acceptance remain open.

## 11. Architecture and technology

```mermaid
flowchart LR
    Web["Planner website<br/>React + TypeScript"] --> API["Authenticated FastAPI service"]
    Phone["Android field app<br/>React Native + Expo"] --> API
    Phone <--> Local["Encrypted authorised cache<br/>Provisional command outbox"]
    API --> Rules["Stock and workflow rules<br/>Scope, version and feasibility checks"]
    Rules --> DB[("Transactional SQL records<br/>PostgreSQL / local SQLite")]
    API --> Planning["Frozen planning and risk projections"]
    Planning --> DB
    Runner["Calculation worker"] --> DB
    Runner --> Models["Forecasts · public benchmark<br/>paired policy experiments"]
    Models --> Runner
```

For the hosted demonstration, the compiled website, API and one supervised calculation worker run together on **Render Free**. **Neon PostgreSQL** stores persistent operating records. The Android app uses the same HTTPS origin.

Forecast/simulation/benchmark jobs are durable SQL records. Stock-changing actions run synchronously through protected transactions; they are not silently posted by the background worker.

### Stack

| Layer | Technologies |
|---|---|
| Website | React, TypeScript, Vite, Leaflet, Recharts, QR rendering |
| Android | React Native 0.88, Expo SDK 58, Expo Router, SecureStore, camera support, bundled SVG map |
| Shared client logic | TypeScript types, display helpers and action rules |
| API | FastAPI, Pydantic, SQLAlchemy |
| Database/migrations | PostgreSQL, SQLite for local work, Alembic |
| Authentication | Argon2 password hashing; expiring/revocable signed bearer tokens |
| Forecasting | pandas, NumPy, scikit-learn; transparent statistical baselines |
| Jobs | SQL-backed calculation queue and supervised Python worker |
| Delivery | Docker, Render, Neon; optional separate Vercel frontend configuration |
| Checks | pytest, Ruff, Vitest, TypeScript, Expo lint and GitHub Actions |

No Redis, paid message broker or specialised device is required for the current demo.

## 12. Data model and API

### Main records

| Group | Principal records |
|---|---|
| Identity and access | Organisation, user, role and authorised location scope |
| Catalogue/network | Product, location and route |
| Inventory | Batch, immutable movement and allocation/reservation |
| Fulfilment | Stock request, versioned plan, shipment and shipment line |
| Worklists | Versioned supplier order, count session, exception, comparison, scenario, delivery proof and return transfer |
| Evidence | Dataset provenance, demand observation, dated availability, policy, calculation job and audit |
| Retry safety | Actor-scoped idempotency key, content digest and saved result |

### API groups

The API uses `/api/v1`. Examples:

| Group | Representative routes |
|---|---|
| Identity | `/auth/login`, `/me`, `/users`, `/team` |
| Inventory | `/inventory/batches`, `/inventory/stock-card`, `/inventory/reconciliation` |
| Transfers | `/requests`, `/plans`, `/shipments` |
| Planning | `/network`, `/planning/options`, `/planning/comparisons` |
| Worklists | `/operations/{kind}`, `/count-sessions`, `/suppliers/orders`, `/return-transfers` |
| Delivery | `/scan/{code}`, `/shipments/{id}/document`, `/shipments/{id}/proof` |
| Data/evidence | `/imports/demand`, `/data/availability`, `/data/demand-quality`, `/benchmarks/source`, `/benchmarks/run` |
| Collaboration/jobs | `/inbox/refresh`, `/cases`, `/jobs`, `/assistant`, `/audit` |

These are route groups/examples, not a complete method contract. See the [OpenAPI snapshot](docs/openapi.json), the running **`/docs`** interface and [client integration guide](docs/CLIENT_INTEGRATION.md).

Stock commands and new operational mutations require stable `Idempotency-Key` values. Worklist/plan transitions use their expected versions.

### Integrity and access

- Organisation-level isolation plus role/location checks.
- Nonnegative-stock constraints and movement reconciliation.
- Per-organisation transactional locking for domain changes.
- Approval/dispatch revalidation after stock or rule changes.
- Protected internal QR lookup; no unauthenticated stock mutation.
- Revocable eight-hour sessions in the current configuration.
- No deployed passwords, database URLs or signing secrets in the repository or client bundle.

The local login throttle is process-local. This correctness-oriented small-network architecture needs additional load, monitoring and shared rate-limit work before production scale.

## 13. Local setup

### Prerequisites

- **Python 3.12** for the documented/retested environment.
- **Node.js 24** and npm.
- Git.
- PostgreSQL 16 if using the production-like database route; SQLite works for local exploration.
- For native Android builds: compatible JDK, Android SDK/NDK and an emulator or Android device. See [the mobile guide](docs/MOBILE_DEMO.md).

### A. Clone and install the backend

```sh
git clone https://github.com/Pulkit-10-0/grd-supply-intelligence.git
cd grd-supply-intelligence

python3.12 -m venv .venv
source .venv/bin/activate

pip install -r requirements.lock
pip install --no-deps -e .

cp .env.example .env
```

On Windows, activate the equivalent `.venv/Scripts/Activate.ps1` environment.

Edit the ignored `.env` before starting:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Local SQLite URL or your own PostgreSQL connection |
| `GRD_TOKEN_SECRET` | Your own random signing secret, at least 32 characters |
| `GRD_ADMIN_PASSWORD` | Your own strong seed/bootstrap password, at least 12 characters |
| `CORS_ORIGINS` | Explicit trusted browser origins when required |
| `OMP_NUM_THREADS` / `OPENBLAS_NUM_THREADS` | Set to `1` for the small demo deployment |

Generate a random token secret locally if needed:

```sh
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The command prints a newly generated local value. Put it in your private environment, not in a commit or frontend/mobile variable. Example placeholders are not usable shared demo credentials.

### B. Migrate and create the synthetic workspace

```sh
grd migrate
grd seed-demo --email demo@grd.local --as-of 2026-11-01
```

The seed refuses to overwrite an existing account. Keep its declared date when issuing demo inventory commands. It prints record IDs and provenance, not the password.

For a clean company/shadow organisation instead:

```sh
grd bootstrap --name "Your organisation" --email your-admin@example.com
```

Bootstrap does not invent company stock or policies. Provision catalogue, locations, users and approved operating inputs separately.

### C. Build and serve the website

From the repository root:

```sh
cd web
npm ci
npm run build
cd ..

grd serve
```

Open:

- **Website:** http://127.0.0.1:8011/
- **API documentation:** http://127.0.0.1:8011/docs
- **Readiness:** http://127.0.0.1:8011/health/ready

Sign in with the email you seeded and the password you configured.

### D. Start the calculation worker

In another terminal at the repository root, with the Python environment active:

```sh
grd worker
```

For one queued calculation:

```sh
grd worker-once
```

A queued forecast, simulation or public benchmark will not complete if no worker is running.

### E. Frontend development

Keep the API and worker running. In another terminal:

```sh
cd web
npm run dev
```

Open http://127.0.0.1:5173/. The local development server proxies API calls. Its guarded local synthetic sign-in helper is absent from the production build. Production browser tokens are kept in memory, so a page reload requires sign-in again.

### F. Android development and release build

```sh
cd mobile
npm ci
npm run typecheck
npm run lint
npm test
```

For the hosted demo:

```sh
export EXPO_PUBLIC_GRD_API_URL=https://grd-supply-demo.onrender.com
export GRD_ALLOW_LOCAL_HTTP=0

npx expo prebuild --platform android
npx expo run:android --variant release
```

For a local Android emulator API, use `http://10.0.2.2:8011` and explicitly set `GRD_ALLOW_LOCAL_HTTP=1` before prebuild/build. A local HTTP-enabled binary is a different configuration; use HTTPS and disable cleartext traffic for hosted distribution.

Generated native folders are not committed. Configure native behaviour through `app.config.js` and Expo config plugins. Android version metadata for this release is **1.3.0 / version code 4**.

An APK can be built from source using the steps above. Locally produced demonstration APKs, signing keys and build caches are deliberately excluded from Git. The existing demonstrated build uses a debug/demo signing identity; production/store distribution needs its own signing and acceptance process.

### G. PostgreSQL with Docker Compose

Set your own `POSTGRES_PASSWORD` in the private `.env` and provide the other required environment settings:

```sh
docker compose up --build
docker compose exec api grd seed-demo --email demo@grd.local
```

The configuration starts PostgreSQL, applies migrations and runs the API and worker. PostgreSQL uses a named local volume. See [operations](docs/OPERATIONS.md) for backup, recovery and container details.

## 14. Deployment

**Reference demo:** https://grd-supply-demo.onrender.com

| Component | Current demonstrated arrangement |
|---|---|
| Website | Compiled React assets served from the API container |
| API | FastAPI on Render Free |
| Calculation worker | One supervised process alongside the API |
| Persistent database | Neon PostgreSQL |
| Mobile | Independently installed Android client using the same HTTPS API |

Free hosting can sleep. The calculation worker pauses with the service, and local container files are not durable storage. Open the demo before presenting and use the database for persistent operating records.

`render.yaml` and `Dockerfile` describe the deployment approach. Configure secrets in provider-private settings. Initial cloud seeding is deliberate and must be disabled afterward; never reseed or upload a local database over an existing operating environment.

**This repository has a new `main` branch.** The reference live demo remains connected to the original team repository. Creating this public source repository did not move cloud accounts, secrets, deployment ownership or the database. Select this repository/branch explicitly if creating a new deployment.

A separate Vercel website is optional; it still needs the persistent backend/database/worker. Do not assume deploying the repository as a static frontend deploys the calculation service.

See [free-hosting instructions](docs/FREE_DEPLOYMENT.md). Historical provider-plan details in older documents are dated observations; check the provider's current terms before provisioning.

## 15. Testing and recorded verification

### Run the checks

From the Python environment at the repository root:

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 pytest -q
ruff check grd tests scripts
```

Website:

```sh
cd web
npm ci
npm test
npm run build
```

Mobile:

```sh
cd mobile
npm ci
npm test
npm run typecheck
npm run lint
```

Run migrations/schema checks against an appropriate disposable local environment:

```sh
grd migrate
alembic check
```

**PostgreSQL integration tests rebuild application tables.** They only accept a dedicated database named `grd_test`; never use the live demo or company database. With your own test connection:

```sh
GRD_TEST_DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/grd_test pytest -q
```

Replace placeholders locally and keep real credentials out of shell logs and commits. GitHub Actions provisions its own disposable PostgreSQL service.

### Source-snapshot verification

The application snapshot was checked on 2 November 2026:

| Check | Recorded result |
|---|---|
| Backend with PostgreSQL | **70 passed** |
| Backend with SQLite | **69 passed**, one PostgreSQL-only case skipped |
| Website tests | **20 passed** |
| Android logic tests | **13 passed** |
| Backend lint, TypeScript, Expo lint | Passed |
| Website production build | Passed |
| Original source CI | All backend, web and mobile job groups green |
| Database upgrade | Pre-upgrade cloud backup restored locally; additive migration preserved existing records and stock totals |
| Hosted operations | Readiness, authentication, saved comparisons/scenarios, supplier draft, count worklist, inbox and reconciliation verified |
| Hosted benchmark | Original N02BE category completed through the calculation worker |
| Android package | Signature/configuration/private-setting checks, installation and emulator cold launch passed |
| Physical field acceptance | Still open |

The new repository's CI badge reports its own current run. The table records the tested source snapshot; it is not a permanent guarantee for future changes.

Important regression cases include duplicate receipts, stale count snapshots, competing approvals, atomic split rollback, hold/shelf-life rejection, tenant/site isolation, replay after a lost response and failed secure-storage commits.

## 16. A suggested demonstration

A strong short presentation follows one operational story:

1. Explain the challenge and identify which data is synthetic.
2. Open **Network overview**, select a medicine/site and inspect shortage timing, freshness and expiry.
3. Open a risk-grid cell and discuss the action deadline.
4. In **Planning studio**, compare no action and permitted sources. Inspect donor effects and any residual gap.
5. Save a hypothetical route delay and show the linked map/table.
6. Return to a fresh actionable comparison and approve it with the correct role.
7. Dispatch from the **Action centre** and show approved warehouse documents.
8. Open **Dispatch & delivery** or scan the shipment in Android; record a checked partial receipt and damage where applicable.
9. Verify the stock card, outstanding shipment quantities, quarantine and ledger reconciliation.
10. Show a count/recount or staged return, then its exception work item.
11. Show the original-data benchmark as independent forecasting evidence, including any baseline that beats the selected model on a held-out horizon.
12. End with the real-data/pilot activation plan.

Warm the free service before presenting. Do not claim that clicking “dispatch” proves a vehicle moved or that a synthetic experiment achieved the published business targets.

## 17. What is complete and what remains

| Area | Implemented in the demo | Remaining work |
|---|---|---|
| Shared operating foundation | Authenticated API, scoped records, transactional stock ledger and migrations | Real organisation onboarding, retention/support ownership and load qualification |
| Planning | Feasibility rules, deadlines, timelines, split approval and frozen disruption comparisons | Global optimisation, broader uncertainty propagation and approved real commercial rules |
| Execution | Partial fulfilment, receiver proof, documents, supplier worklists, counts and staged returns | Supplier/courier integration, field operating acceptance and commercial activation |
| Data/evidence | Attributed imports, separated source tracks, benchmarks and supported demand-quality calculations | Actual regional demand/availability exports and broader evaluation |
| Collaboration | Persistent ownership, due dates, acknowledgement and in-app exceptions | Configured push provider and reliable always-on escalation |
| Android | Native source, protected cache/outbox, worklists, scanning/manual entry and built package | Real-phone camera, denied-permission, full offline journey and pilot/store signing |
| Local signals | Seasonal baselines and downloadable regional context | Matched local demand/signal evaluation; no weather benefit is claimed |
| Business impact | Measurement framework and reproducible synthetic experiments | A real baseline, agreed KPIs and observed pilot outcomes |
| iOS | Cross-platform source retained | Native delivery excluded from current scope |

The solution is a substantial integrated competition demonstration. It is not yet a validated live company deployment or a completed real-world pilot.

## 18. Real-data and pilot activation

An initial practical bridge is a small, authorised SKU/location cohort rather than a fabricated “complete” company dataset.

Request, subject to the owner's data-sharing arrangements:

- Product identities, strengths/forms, base/pack units and permitted conversions.
- Historic requested, supplied and sold quantities with stable location identifiers.
- Opening/closing stock and attributable movements.
- Batch quantities, expiry, holds, returns and corrections.
- Stock-out intervals and reporting coverage.
- Order, dispatch, promised-arrival and actual-receipt timestamps.
- Approved route, shelf-life, safety-stock, capacity and commercial rules.
- Owner-approved policy documents and operational responsibilities.

A sensible proposed starting scope is 20–50 genuine SKUs across 3–5 locations, with sufficient history to evaluate seasonality and a separate future pilot observation window. This is a project proposal, not a confirmed allocation from the challenge owner.

Map the units and definitions, reconcile source totals, establish a baseline, run in shadow mode, validate with staff and only then authorise operational actions. Measure outcomes on agreed periods/cohorts and retain adverse or inconclusive results.

Patient identifiers are unnecessary for the stated stock-planning workflows.

## 19. Repository structure

```text
.
├── grd/                        Shared backend and operating logic
│   ├── api.py                  Authentication and core API
│   ├── domain.py               Stock, feasibility and fulfilment rules
│   ├── operations.py           Supplier/count/return/inbox workflows
│   ├── operations_api.py       Shared operational routes
│   ├── models.py               SQL records
│   ├── planning.py             Network risk view
│   ├── scenarios.py            Frozen comparison/projection engine
│   ├── forecasting.py          Baselines, ML and evaluation
│   ├── benchmark.py            Separate original-data benchmark
│   ├── simulation.py           Paired single-lane policy experiment
│   ├── worker.py               Durable calculation processing
│   ├── demo.py                 Explicit synthetic scenario generator
│   └── assets/                 Attributed public benchmark snapshot
├── web/                        Planner website
│   └── src/operations/         Planning, worklists and evidence screens
├── mobile/                     Native Android field app
│   └── src/                    Screens, secure cache, outbox and transport
├── shared/                     Shared TypeScript definitions/helpers
├── migrations/                 Versioned Alembic upgrades
├── tests/                      Backend/integrity/access/evidence tests
├── scripts/                    Operating, data and deployment helpers
├── docs/                       Guides, status, research and API contract
│   └── images/                 Public synthetic-demo screenshots
├── .github/workflows/          Backend, web and Android checks
├── Dockerfile                  Combined web/API runtime image
├── compose.yaml                Local PostgreSQL/API/worker setup
├── render.yaml                 Reference free-demo deployment
└── 02_...08_*.py               Attributed earlier experiment entry points
```

Local credentials, databases, exports, backups, build caches, generated native folders and APKs are excluded. The attributed public benchmark is an explicit dataset exception.

## 20. Documentation, attribution and licences

### Further reading

| Document | Purpose |
|---|---|
| [Interface update](docs/USABILITY_UPDATE_2026-11-03.md) | Guided workflows, reduced interface text and compatibility checks |
| [Website read-along](docs/WEBSITE_READ_ALONG.md) | Screen-by-screen explanation for a new reader |
| [Upgrade implementation](docs/UPGRADE_IMPLEMENTATION.md) | Delivered operational features, checks and boundaries |
| [PRD status](docs/PRD_STATUS.md) | Current traceability and activation gates |
| [Historical PRD review](docs/FEATURES_AND_PRD_REVIEW.md) | Earlier 53-requirement baseline, explicitly superseded where applicable |
| [Data strategy](docs/DATA_STRATEGY.md) | Provenance, imports and real-data bridge |
| [Android guide](docs/MOBILE_DEMO.md) | Mobile workflows, build configuration and acceptance limits |
| [Client/API integration](docs/CLIENT_INTEGRATION.md) | Shared service contract and integration guidance |
| [Operations](docs/OPERATIONS.md) | Processes, recovery, backups and disposable tests |
| [Hosting](docs/FREE_DEPLOYMENT.md) | Reference deployment arrangement and configuration |
| [Comparable-project research](docs/COMPARABLE_PROJECT_RESEARCH_2026-11-02.md) | Repository/video inspiration and recommended features |
| [OpenAPI](docs/openapi.json) | Machine-readable API snapshot |
| [Source origin](docs/SOURCE_ORIGIN.md) | Upstream credit, source commit and clean-publication notes |

Older audit/handoff documents are dated milestones. Use this README, the current upgrade checklist and source code when their earlier status descriptions differ.

### Original team and sources

This repository is a clean publication snapshot derived from the team's original repository, [HarshadaNayyar/GRD-medicine-supply](https://github.com/HarshadaNayyar/GRD-medicine-supply), source commit [2d30f0f](https://github.com/HarshadaNayyar/GRD-medicine-supply/commit/2d30f0f0ad66785e6b36e9c4dec12379f6a79d1b). Original notebook/experiment work is credited to that team repository; the source history is linked rather than imported.

Key references and retained notices:

- [Official NESFIC-I-09 challenge](https://startup.assam.gov.in/nesfic26/problem-statements/nesfic-i-09).
- [Pharma Sales Data](https://www.kaggle.com/datasets/milanzdravkovic/pharma-sales-data), with [snapshot attribution](grd/assets/README.md).
- [NASA POWER documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) for the optional weather download.
- [Map source metadata](web/public/maps/source.json): geoBoundaries/DataMeet/Election Commission of India boundary lineage, CC BY 2.5 India; mobile outlines are simplified.
- Optional OpenStreetMap background attribution is displayed in the map.
- [Bundled font and runtime notices](web/public/licenses/) and [Expo template notice](mobile/EXPO_TEMPLATE_LICENSE) remain included.

No new repository-wide licence is assigned here. Existing source-specific dataset, asset, template and dependency terms remain included; public access does not remove those conditions.

### Contributing

Keep operating rules in the backend, preserve organisation/site scope and original retry keys, and add meaningful regressions for stock changes. Preserve raw/source data and the separation between observed benchmarks, generated operations and measured business outcomes. Do not replace an honest baseline result with a headline chosen from the final test.

Use issues or pull requests for improvements. Do not attach private customer data, passwords, connection strings or database backups.

---

**The product promise:** a team should be able to see the risk, understand the evidence, choose a feasible action, complete the handoff and explain exactly how stock changed.
