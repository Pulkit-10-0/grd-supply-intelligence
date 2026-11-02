# GRD website read-along guide

Open **https://grd-supply-demo.onrender.com** beside this guide. Read one section, then try its steps. The free host may take about a minute to wake. Use the shared demo login from the [local login details](outputs/deployment-setup/demo-login.txt).

**Know this first:** the live website uses generated Assam demand, fictional operating sites and assumed stock/route rules. It does not currently use the original Kaggle dataset for its forecasts. The **Synthetic demo** badge and **1 November 2026** date describe the fixed scenario; the date is not a live clock. Saved actions change this shared demo, so your numbers may differ from earlier screenshots.

## 1. What problem are we solving?

The [NESFIC-I-09 challenge](https://startup.assam.gov.in/nesfic26/problem-statements/nesfic-i-09) concerns medicine demand forecasting and stock availability across Northeast India. The brief names GRD Pharmaceuticals and lists GR Dhanuka Group as the challenge owner.

A distributor can run out while another location holds excess or near-expiry stock. Demand changes, transport takes time, and scattered records make decisions difficult. A forecast alone does not move medicine to the right place.

**Our solution:** show the problem, explain it, compare feasible supply, approve a response, record delivery and verify the resulting stock.

`Find risk → compare options → approve → dispatch → receive → reconcile`

## 2. Five words to understand

| Word | Plain meaning |
|---|---|
| Product / SKU | One medicine presentation with defined units and pack size. |
| Batch | A quantity of that product with a batch label and expiry date. |
| Reserved | Stock promised to an approved plan; still physically at the source. |
| In transit | Stock dispatched but not yet confirmed received. |
| Quarantined | Physically present but unavailable for normal supply pending review. |

## 3. Network overview — where is the problem?

**Purpose:** understand the selected medicine across the network.

1. Choose a medicine at the top; start with **Cetirizine** or **ORS**.
2. Select **Silchar**, or another location showing risk, on the map or table.
3. Switch **Stock risk / Expiry / Freshness**. Move the **Planning horizon** slider.
4. Read the selected location panel; open the information button beside **Find supply** for its supporting stock/projection evidence.

Read the top cards as follows:

- **Available stock:** eligible units after reservations; physical stock may be higher.
- **Critical locations:** sites needing attention under the current projection.
- **Expiry exposure:** projected units at risk of remaining unused, not already measured losses.
- **Open actions:** operating work to review. Execution records/cases can span your authorised network, beyond the selected medicine.

The horizon changes how far ahead we project, not the date of physical stock. Missing information is **unknown**, not healthy zero stock. Map connections are supply relationships, not driving directions or vehicle tracking. **Export view** exports the displayed network table.

## 4. Find supply — what can we do?

Click **Find supply**, or **Create supply plan**.

1. Check destination, quantity and **Needed by** date. Use whole permitted packs.
2. Compare sources. Read both eligible choices and rejected alternatives.
3. Inspect donor stock protection, arrival, shelf life and configured cost/limits.
4. Click **Create plan for review** when you understand the evidence.

A transfer can be permitted yet arrive after the shortage starts: read the timing warning. It does not promise to eliminate the service gap. A proposal alone moves no stock. **Approve & reserve** sets stock aside; **Revalidate proposal** refreshes a proposal after its inputs change.

## 5. Action centre — what needs doing?

Open **Action centre** in the sidebar.

Browse **All actions**, **Critical**, **Supply plans**, **Requests** and **Discrepancies**. Open a card to inspect the affected record. The bell also opens this work area; it is not evidence of delivered phone push notifications.

In a plan, inspect its status, source/destination, quantity, batch eligibility and shipment trail. Use **Dispatch stock** only after approval. Dispatch removes stock from the source and puts it in transit; receipt confirms what actually arrived.

For a receipt, enter **accepted** and **damaged** units separately. Damage needs a reason and enters quarantine. Cases let permitted users assign an owner, comment, set deadlines and review corrections. Available controls depend on your role.

## 6. Inventory & batches — can we trust the stock?

Search the **Batch register**, filter by location/status and open a batch.

Compare physical quantity, reserved quantity, available units, expiry and disposition. **Ledger reconciled** means recorded balances agree with movement/reservation history; it does not prove someone physically counted the warehouse.

Batch controls support holds, counts and authorised corrections. A count difference creates a review case instead of silently overwriting stock. Held, damaged or expired medicine cannot become normal supply merely because it is physically present.

## 7. Forecasts & evidence — what might happen?

### Demand outlook

Choose a medicine and **distributor** location, then click **Run forecast**. Wait for the calculation to finish; you can use other screens meanwhile.

Inspect the demand history, forecast and uncertainty band. Change the **Evaluation horizon** between supported 1-, 2- and 4-week results.

| Label | How to read it |
|---|---|
| Selected method | The method chosen using validation results; a simple baseline may win. |
| Test error · WAPE | Forecast error on held-out history; lower is better. It is not “accuracy percent.” |
| Error reduction vs baseline | Improvement relative to the recent-four-week method; it can be negative. |
| Interval coverage | How often held-out outcomes fell inside the estimated range. |

The band is not a guarantee. Insufficient/stale history is reported explicitly. These live results use **synthetic demand**, so they do not establish real GRD forecast accuracy.

### Policy comparison

Switch to **Policy comparison**, adjust delivery lead time/safety stock and click **Run policy comparison**.

Compare service, unmet demand, shortage days, expiry and average inventory together. Better service may require more stock. This is a paired **synthetic single-lane experiment**, not a measured GRD saving or a full-network optimisation.

## 8. Operations log — what happened?

Search the timeline after performing an action. Follow the actor, event, time and record reference. Use it to explain the difference between proposing, approving, dispatching and receiving; they are separate recorded events.

## 9. Data & provenance — where did the numbers come from?

Open a dataset in the register and read its source, geography, evidence type and limitations.

- The current network is generated. The original pharmacy dataset remains a separate local experiment.
- NASA POWER weather is separate context; it is not an input to the current forecast.
- Actual GRD demand, stock and approved policies have not been supplied.

If inspecting **Import demand**, choose a CSV/XLSX and enter its source details. **Validate preview** checks it; **Commit import** actually saves observations. Product/location IDs must already exist. Uploads require `date, product_id, location_id, quantity, measure`; use base units. Do not commit an arbitrary file merely to explore the screen.

## 10. Supply assistant — explain the evidence

Open **Supply assistant** at the bottom of the sidebar.

- **Operational evidence:** select a recorded plan and ask why that supply response was chosen. Inspect its saved facts and reference.
- **Approved policies:** ask about shelf life or returns; read the cited passage, version and date. Demo passages are illustrative, not approved GRD company policy.

The assistant retrieves evidence; it does not approve or move stock. An unsupported answer means the required approved source is missing.

## 11. Optional practice journey

Do this once if you want to change the demo; otherwise inspect an existing plan.

1. On the map, select a shortage location and a medicine with pack size 10.
2. **Find supply** for **40 units**. Read the required date and arrival warning; choose a source currently marked eligible.
3. Create the proposal, inspect it, then **Approve & reserve**.
4. **Dispatch stock: 40**. Find its shipment in the action centre.
5. First receipt: **20 accepted, 0 damaged**; click **Confirm receipt**. There are still 20 units in transit.
6. Second receipt: **19 accepted, 1 damaged**, with a damage reason. These are totals across shipment lines, not quantities to repeat on every line.
7. Inspect inventory, the discrepancy case and the operations log. The destination gains **39 usable units and 1 quarantined unit**. The damaged unit does not fulfil demand; any residual request needs resolution.

If no source is eligible, read the rejection rather than forcing the example. If inputs changed, refresh/revalidate. Then return to the same medicine on the map and inspect its updated evidence.

## 12. What is still unfinished?

The core hosted journey works. Full offline mobile acceptance, push/escalation, external supplier ordering, separate return transport stages, broader scenario/seasonal evaluation and real company activation remain. Android shares this backend; iOS native delivery was explicitly skipped.

For the complete list, see [the feature and PRD review](FEATURES_AND_PRD_REVIEW.md). While presenting, describe a **working synthetic demonstration**, not proven GRD savings or a finished company deployment.


## New operations upgrade: where to explore next

- **Network overview → Stock-risk timeline:** every day has a balance/risk cell;
  select a cell to see its site evidence and latest safe action date.
- **Planning studio:** create a frozen comparison for a medicine, receiving site
  and pack quantity. Inspect no action and feasible sources, including split sources
  when needed. Each donor remains visible. Save a hypothetical delivery delay,
  demand increase or supply reduction; the map and table show that scenario.
  Approval reserves real batches only after current inputs pass the server checks.
- **Operations desk → Exception inbox:** check current conditions, assign an owner,
  acknowledge the issue, follow its record and resolve it with a reason.
- **Supplier orders:** draft from the explained replenishment suggestion, get manager
  approval, record a supplier-confirmed arrival date and receive actual batches.
  No real purchase is sent. Unverified future supplier shelf life is provisional.
- **Count sessions:** assign batches, enter physical quantities, request a recount
  when necessary and approve differences. Changing stock invalidates the snapshot.
- **Dispatch & delivery:** print the approved pick/packing list and shipment delivery
  note. Scan its QR in Android or confirm the handoff on the web. Record receiver,
  document reference, accepted/damaged quantities and any short lines.
- **Return transfers:** follow request → approval → reverse dispatch → transit →
  receipt into review → release/quarantine. Stock in transit is unavailable.
- **Evidence & stock cards:** read the stock equation and individual movements;
  inspect sales/reporting/availability quality; run the original public pharmacy
  benchmark separately from Assam synthetic operations.

Scenario gaps are **unit-days**, not unique lost sales or measured patient outcomes.
The original public benchmark keeps its original ATC categories and publisher units.
Push messages and live supplier/courier systems need credentials; the in-app worklists
and manually recorded confirmations are the working demo workflow.
