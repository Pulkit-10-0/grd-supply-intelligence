# Website and demo handover

The browser workspace in `web/` uses React, TypeScript, Leaflet and Recharts. All operational values and commands use the authenticated API. There are no hardcoded stock cards, fabricated forecast scores or browser-side ledger edits.

## Run

Use the Python setup in the root README, migrate and seed once, then keep `grd serve` and `grd worker` running in separate terminals. With Node 24+, run `npm ci && npm run build` inside `web/`. The API serves the compiled workspace at `http://127.0.0.1:8011/`; restart it after the first build. `GRD_WEB_DIST` can point to another compiled directory. Sign in using the seeded account and your configured password. Do not put passwords in `VITE_` variables.

For editing, run `npm run dev` in `web/` and use `http://127.0.0.1:5173/`. This development server proxies the API on 8011. A server-only loopback helper signs in to `demo@grd.local` only if its organisation is synthetic. If that account is absent, use normal sign-in. The helper does not ship in the production build. Run `grd worker` for queued forecast/policy jobs.

The Dockerfile now builds the website in a Node stage and copies only compiled assets into the Python image. The Docker build itself still needs validation on a machine running Docker; it was not executed in this handover. Hosting/TLS and production activation are not claimed.

## Five-minute story

1. Open **Network overview**. Select a medicine and Silchar. ORS remains an untouched shortage scenario in this local database; Cetirizine includes the browser verification journey. Change the planning horizon and risk/expiry/freshness layer. Select a map marker or a table location; use the information button beside **Find supply** to inspect physical stock, reservations, incoming supply and the projection basis.
2. Click **Find supply**. Compare available sources and rejected options. Choose a pack-valid quantity; inspect shelf life, donor protection, indicative cost and arrival. A timing warning appears when arrival is later than the projected shortage/requested date. A feasible transfer can still leave a service gap; it does not promise to prevent that shortage.
3. Create a proposal, then **Approve & reserve**. Only approval reserves stock. **Revalidate proposal** refreshes a proposed plan's evidence/version after changed inputs. Dispatch part of the approved amount and show the shipment in the action centre. Only dispatch removes those units from source physical stock.
4. Record a partial receipt, separating accepted and damaged units. A damage reason is mandatory. Accepted units increase destination usable stock; damage enters quarantine and creates a case. Remaining shipment and unshipped plan quantities remain visible. Cancellation releases only unshipped reservations.
5. Open **Forecasts & evidence** for the same series. Run a forecast and let the worker finish; show the historical series, forecast, evaluated intervals and held-out baseline comparison. Switch to the 2/4-week horizons. A baseline may beat ML; report the selected method honestly.
6. Run **Policy comparison**. Show fill rate alongside unmet demand, expiry and average inventory. These paired synthetic single-lane experiments can reveal a service/stock/expiry trade-off; they are not measured GRD savings or a network optimisation result.
7. Finish with **Inventory & batches**, the grounded assistant, **Operations log** and **Data & provenance**. The policy assistant returns an explicit unsupported answer when no approved passage exists. Demand imports require declared provenance and a successful validation preview before commit.

Commands change the local synthetic database. There is no destructive reset button. Take a normal SQLite backup with `grd backup-sqlite <destination>` before rehearsal, or seed a separate database/account. Do not overwrite a working team dataset to reset a demo.

## Behaviour and boundaries

- Risk/expiry metrics follow the selected medicine/network filters. Execution records and discrepancies span the user's authorised network, explicitly labelled in the open-action card.
- A network snapshot uses the organisation's fixed scenario date. The 7–28 day slider changes its projection horizon, not the date of physical stock. Location evidence labels the historical mean fallback or a recent published forecast.
- Nominal days of cover uses availability divided by historical daily demand. Expiry, booked demand and dated arrivals can produce an earlier projected shortage.
- The weekly chart includes requested demand only and complete Monday–Sunday weeks. It does not add supplied quantities to requested demand or silently fill missing days with zero. Imports preserve server-side validation.
- UI permissions mirror the API; server role/location checks remain authoritative. A 409 conflict is shown and requires reconciliation/revalidation. Repeated identical failed stock commands retain their idempotency key within the browser session. This is not a persistent offline queue, and sign-out does not cache private stock in browser storage.
- Map outlines and fonts are bundled. The default map needs no external tile provider. Optional OpenStreetMap tiles require internet and are an enhancement. Connections represent configured supply relationships, not road directions, driving routes or live vehicles. Sites are approximate fictional town-level points, including a displaced warehouse label to separate the colocated Guwahati markers.
- Regional outlines: geoBoundaries gbOpen India ADM1, source DataMeet India community / Election Commission, represented year 2011, CC BY 2.5 India. The nine-state subset uses simplified geometry and normalised names; metadata is bundled at `/maps/source.json`. This is context, not a current survey. Source: https://www.geoboundaries.org/ and https://github.com/datameet/maps . Font and runtime licences are bundled in `/licenses/`.
- Production refresh requires sign-in because bearer tokens remain in memory. Live notifications/push, native Android/iOS applications, persistent offline commands, company policy approval and real local transaction data are not delivered by this web change.

## Verification

`npm test` covers lost-response command keys, server conflicts, complete requested-demand weeks, unknown stock, remaining dispatch quantities, request/proposal retry, partial damaged receipts and operator permissions. `npm run build` checks TypeScript and creates production assets. CI runs both.

Browser verification used the real local backend/worker at desktop and phone widths: source comparison, proposal/approval, partial dispatch, partial receipt with damage, stock updates, shipment remainder, grounded assistant, forecast evaluation, policy comparison, map framing/layers and responsive stock evidence. It created a Cetirizine plan for 60 units, dispatched 40, accepted 20 and quarantined 10; 10 remain in transit and 20 remain unshipped. The ledger stayed reconciled. Those are synthetic verification records.

The backend suite includes a static-website test preserving protected API responses, Swagger and missing-path behaviour. Hosting, real-device native tests and real operational acceptance remain separate checks.
