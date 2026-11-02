# Data strategy and provenance

Checked against the official I09 challenge and public sources on 1 November 2026. A public current-stock dashboard is not a historical demand dataset. No verified, unrestricted Assam distributor sales + stock + batch + delivery history has been acquired. GRD still offers representative data subject to sharing/confidentiality arrangements.

## Three separate evidence tracks

1. **Observed public forecasting benchmark:** the original pharmacy series keeps its ATC category meaning and original geographic provenance. It cannot be relabelled as observed Assam SKU demand. The legacy experiment's distributor splits, rounding and stock simulation are derived/synthetic.
2. **Assam operational scenario:** `grd seed-demo` creates 735 daily observations for each of 5 illustrative products at 5 fictional operating locations: 18,375 rows. Product presentations, demand, costs, stock and route rules are assumptions. Fixed seed 42, generator `assam-v1`, scenario date 1 November 2026. Approximate town coordinates are not actual GRD premises. A short-dated donor, a short-stock recipient, slow-moving stock and a transfer-restricted product exercise the backend. The scenario does not establish local forecast accuracy or business impact.
3. **Real regional context:** NASA POWER gridded daily temperature, humidity and corrected precipitation at approximate Guwahati, Dibrugarh and Silchar town centres, 1 January 2024–31 October 2026. Downloaded JSON and SHA-256/source manifests are stored locally under ignored `data/context`. This is weather context, not medicine sales. It is not currently included as a model feature; no improvement from it is claimed. Preserve missing-value codes as missing and test timestamp availability before any future forecast integration.

The API exposes dataset provenance and organisation evidence type. Forecast results include source dataset IDs and cut-off. Simulation results explicitly say `measured_grd_impact: false`. Preserve these labels in every website/mobile view and video.

## Reproduce the local scenario

After migrations, run:

```sh
grd seed-demo --email demo@grd.local --as-of 2026-11-01
```

Password comes from `GRD_ADMIN_PASSWORD` or an interactive prompt. The command refuses to overwrite an existing demo user. It prints IDs and manifest information, never the password.

To inspect exported synthetic tables, use the organisation ID printed above:

```sh
python scripts/export_demo_data.py --organisation ORGANISATION_ID --output data/assam-demo
```

This exporter refuses observed/shadow organisations and never exports user credentials. It refuses to overwrite existing exports.

## Reproduce public downloads

```sh
python scripts/fetch_public_data.py weather
python scripts/fetch_public_data.py pharma-benchmark
```

Raw datasets stay outside Git. The Kaggle benchmark licence is noncommercial according to its source catalogue; review permissions before a commercial pilot. The Indonesian pharmacy source is a CC BY 4.0 alternative with individual products but only one year of history. Do not import or execute its raw SQL blindly; it includes coded customer/doctor identifiers that are unnecessary for our forecasts.

## Real-data bridge

`POST /api/v1/imports/demand` accepts UTF-8 CSV or XLSX, maximum 5 MB / 10,000 rows per upload. Upload metadata and set `dry_run=true` first. Review rejected row numbers and reconcile totals, then commit the repaired file. An invalid file commits no partial observations. Re-importing an identical file returns the original dataset; different files cannot duplicate the same date/product/location/measure. Corrections require a new, explicitly reconciled source version; there is no silent overwrite endpoint.

Required columns: `date,product_id,location_id,quantity,measure`. Date is ISO `YYYY-MM-DD`; quantities are nonnegative integer base units; measure is `requested` or `sales`. Do not add distributor sell-in and retailer sell-out as independent demand. Product and location IDs must already exist in the same authorised organisation. Metadata requires `name,source_url,licence,geography,evidence_type,units,limitations`. Units must match the product base unit or be declared `product_base_units` for mixed product files. Pack conversions are explicit through `/units/convert`.

## Local leads and requested data

- GRD/organiser: representative historic orders/sales, product catalogue, inventory/replenishment and distributor inputs. Best fit for this private distributor challenge.
- AMSCL: authorised facility-level DVDMS export is a parallel public-sector lead; its workflow may differ from GRD.
- MMDSL Meghalaya: current public drug stock and batch-number lists, not a history of requests, consumption, expiry or lead times. The published copyright policy requires permission for public/commercial reuse. Nothing from the dashboard was silently embedded into the application.
- IHCI: real Indian availability/stockout indicators, but small aggregate manuscript tables, not our main forecasting corpus.

Request 24–36 months, initially 20–50 genuine SKUs across 3–5 locations: product/pack units; requested and supplied orders; opening and closing usable stock; movements; batch quantities and expiry; promised/actual dispatch and receipt timestamps; stockout intervals; corrections/returns; approved route and shelf-life rules. Stable anonymised location/customer IDs are enough. Patient identifiers are unnecessary. No emails or data requests were sent by this implementation.

Sources:

- https://startup.assam.gov.in/nesfic26/problem-statements/nesfic-i-09
- https://mmdsl.in/stock-dashboard
- https://mmdsl.in/copyright?id=cop
- https://amscl.assam.gov.in/contact-us
- https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- https://www.kaggle.com/datasets/milanzdravkovic/pharma-sales-data
- https://data.mendeley.com/datasets/2ym7v78wtd/1
- https://data.mendeley.com/datasets/xs8dpz2z6v/2
