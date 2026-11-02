import { useEffect, useState } from "react";
import { BookOpen, FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";
import { api, command } from "../api";
import type { Data, Job, Metrics } from "../types";
import type { Quality, StockCard } from "../../../shared/operations";
import { Badge, Empty, Loading, SectionTitle } from "../ui";
import {
  dateLabel,
  hasRole,
  number,
  shortLocation,
  shortProduct,
  title,
} from "../utils";
import { Field, useOperation } from "./common";

export function EvidenceWorkspace({
  data,
  asOf,
  onRefresh,
  notify,
}: {
  data: Data;
  asOf: string;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("card"),
    [product, setProduct] = useState(data.products[0]?.id || ""),
    [location, setLocation] = useState(data.locations[0]?.id || ""),
    [card, setCard] = useState<StockCard | null>(null),
    [quality, setQuality] = useState<Quality | null>(null),
    [availability, setAvailability] = useState(""),
    [source, setSource] = useState(""),
    [category, setCategory] = useState("N02BE"),
    [benchmark, setBenchmark] = useState<Job | null>(null),
    [sourceInfo, setSourceInfo] = useState<{
      source_url: string;
      licence: string;
      attribution: string;
      units: string;
    } | null>(null),
    [fetchError, setFetchError] = useState("");
  const { busy, error, run } = useOperation(onRefresh, notify);
  const start = new Date(
    new Date(asOf + "T00:00:00Z").getTime() - 27 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  useEffect(() => {
    let current = true;
    setCard(null);
    setQuality(null);
    setFetchError("");
    void Promise.all([
      api<StockCard>(
        `/inventory/stock-card?product_id=${encodeURIComponent(product)}&location_id=${encodeURIComponent(location)}&as_of=${asOf}`,
      ),
      api<Quality>(
        `/data/demand-quality?product_id=${encodeURIComponent(product)}&location_id=${encodeURIComponent(location)}&start=${start}&end=${asOf}`,
      ),
    ])
      .then(([c, q]) => {
        if (current) {
          setCard(c);
          setQuality(q);
        }
      })
      .catch((e) => {
        if (current) setFetchError(e.message);
      });
    return () => {
      current = false;
    };
  }, [product, location, asOf, start, data.me.inventory_revision]);
  useEffect(() => {
    void api<typeof sourceInfo>("/benchmarks/source")
      .then(setSourceInfo)
      .catch((e) => setFetchError(e.message));
  }, []);
  const latest = benchmark
    ? data.jobs.find((j) => j.id === benchmark.id) || benchmark
    : data.jobs.find(
        (j) => j.kind === "benchmark" && j.payload.category === category,
      );
  const result = latest?.result;
  return (
    <div className="operations-space">
      <div className="page-heading">
        <div>
          <p className="eyebrow">KNOW WHAT SUPPORTS THE DECISION</p>
          <h1>Show the working.</h1>
          <p>
            Follow a stock balance to its movements. Separate observed evidence
            from generated operations.
          </p>
        </div>
        <Badge>
          <ShieldCheck size={14} />
          Traceable evidence
        </Badge>
      </div>
      <div
        className="ops-navigation"
        role="tablist"
        aria-label="Evidence workspaces"
      >
        {[
          { id: "card", name: "Stock & movement card", Icon: BookOpen },
          { id: "quality", name: "Demand quality", Icon: ShieldCheck },
          {
            id: "benchmark",
            name: "Original-data benchmark",
            Icon: FlaskConical,
          },
        ].map(({ id, name, Icon }) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {name}
          </button>
        ))}
      </div>
      {(error || fetchError) && (
        <div className="error-banner" role="alert">
          {error || fetchError}
        </div>
      )}
      {tab !== "benchmark" && (
        <div className="panel ops-form-row">
          <Field label="Medicine">
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            >
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortProduct(p.name)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {shortLocation(l.name)}
                </option>
              ))}
            </select>
          </Field>
          <Badge tone="demo">
            {data.me.evidence_type} · {dateLabel(asOf)}
          </Badge>
        </div>
      )}
      {tab === "card" && (
        <section className="panel ops-main-panel">
          <SectionTitle
            eyebrow="PHYSICAL STOCK → AVAILABLE STOCK"
            title="A balance you can explain"
          >
            Opening stock + incoming and positive adjustments − outgoing and
            negative adjustments = physical balance.
          </SectionTitle>
          {!card ? (
            <Loading label="Tracing stock movements" />
          ) : (
            <>
              <div className="stock-equation">
                <div>
                  <small>Opening</small>
                  <strong>{number(card.opening)}</strong>
                </div>
                <b>+</b>
                <div>
                  <small>Receipts / adjustments</small>
                  <strong>
                    {number(card.receipts_and_positive_adjustments)}
                  </strong>
                </div>
                <b>−</b>
                <div>
                  <small>Issues / dispatch / loss</small>
                  <strong>
                    {number(card.issues_and_negative_adjustments)}
                  </strong>
                </div>
                <b>=</b>
                <div className="equation-total">
                  <small>Physical balance</small>
                  <strong>{number(card.calculated_physical)}</strong>
                </div>
              </div>
              <div className="ops-metrics">
                <span>
                  Usable physical<b>{number(card.balance.usable)}</b>
                </span>
                <span>
                  Reserved<b>{number(card.balance.reserved)}</b>
                </span>
                <span>
                  Available now<b>{number(card.balance.available)}</b>
                </span>
                <span>
                  Ledger check<b>{card.reconciled ? "Balanced" : "Review"}</b>
                </span>
              </div>
              <p className="ops-note">
                Oldest positive batch update:{" "}
                {card.balance.updated_at
                  ? new Date(card.balance.updated_at).toLocaleString("en-IN")
                  : "Unknown"}
                . Held and expired stock remain physical but are excluded from
                usable stock. Projected stock additionally includes future
                demand, expiry and declared arrivals.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Recorded at</th>
                      <th>Movement</th>
                      <th>Units</th>
                      <th>Batch record</th>
                      <th>Evidence reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.movements.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {new Date(m.created_at).toLocaleString("en-IN")}
                        </td>
                        <td>{title(m.reason)}</td>
                        <td className={m.delta >= 0 ? "good-number" : ""}>
                          {m.delta > 0 ? "+" : ""}
                          {number(m.delta)}
                        </td>
                        <td>
                          <code title={m.batch_id}>
                            {m.batch_id.slice(0, 12)}
                          </code>
                        </td>
                        <td>
                          <code title={m.reference}>{m.reference}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      {tab === "quality" && (
        <section className="panel ops-main-panel">
          <SectionTitle
            eyebrow="SALES ARE NOT ALWAYS DEMAND"
            title="Availability-supported demand evidence"
          >
            The raw requested and sales measures stay separate. An estimate
            requires dated stock availability and reported sales.
          </SectionTitle>
          {!quality ? (
            <Loading />
          ) : (
            <>
              <Badge
                tone={quality.status === "unsupported" ? "amber" : "green"}
              >
                {title(quality.status)}
              </Badge>
              <div className="ops-metrics">
                <span>
                  Raw sales<b>{number(quality.raw_sales)}</b>
                </span>
                <span>
                  Raw requested<b>{number(quality.raw_requested)}</b>
                </span>
                <span>
                  Inferred lost demand
                  <b>{number(quality.inferred_lost_units)}</b>
                </span>
                <span>
                  Adjusted sales estimate
                  <b>{number(quality.adjusted_demand)}</b>
                </span>
              </div>
              <p>
                {quality.sales_reporting_days}/{quality.calendar_days} days of
                sales reporting · {quality.availability_reporting_days}{" "}
                availability-reporting days · {quality.observed_stockout_days}{" "}
                evidenced stock-out days · {quality.unsupported_stockout_days}{" "}
                without sales coverage.
              </p>
              {quality.sensitivity.length > 0 && (
                <div className="sensitivity-row">
                  {quality.sensitivity.map((s) => (
                    <div key={s.rate_multiplier}>
                      <small>{s.rate_multiplier}× in-stock sales rate</small>
                      <strong>
                        {number(s.estimated_lost_units)} inferred lost units
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              <p className="ops-note">
                {quality.assumptions} No availability evidence has been invented
                for this demo. Sources:{" "}
                {quality.sources.join(", ") || "none supplied"}.
              </p>
            </>
          )}
          {hasRole(data, "steward", "manager") && (
            <form
              className="availability-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const days = availability
                    .trim()
                    .split(/\r?\n/)
                    .map((line) => {
                      const [date, reported, available] = line
                        .split(",")
                        .map((x) => x.trim());
                      if (
                        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                        !["true", "false"].includes(reported) ||
                        !["true", "false"].includes(available)
                      )
                        throw new Error(
                          "Use date,reported,available with true/false; omit a header.",
                        );
                      return {
                        date,
                        reported: reported === "true",
                        available: available === "true",
                      };
                    });
                  await command("/data/availability", {
                    product_id: product,
                    location_id: location,
                    source,
                    days,
                  });
                  setAvailability("");
                  setQuality(
                    await api<Quality>(
                      `/data/demand-quality?product_id=${encodeURIComponent(product)}&location_id=${encodeURIComponent(location)}&start=${start}&end=${asOf}`,
                    ),
                  );
                  notify(
                    "Dated availability evidence recorded. Raw demand is unchanged.",
                  );
                });
              }}
            >
              <h3>Add observed availability evidence</h3>
              <Field label="Source / dated evidence reference">
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </Field>
              <Field label="One line per day: YYYY-MM-DD,reported,available">
                <textarea
                  required
                  placeholder={`${asOf},true,false`}
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                />
              </Field>
              <p className="ops-note">
                Reported=false means missing evidence, not a stock-out. Existing
                dates cannot be silently overwritten. Enter genuine exports or
                clearly identify synthetic test inputs in the source.
              </p>
              <button className="button primary" disabled={busy}>
                Record availability evidence
              </button>
            </form>
          )}
        </section>
      )}
      {tab === "benchmark" && (
        <section className="panel ops-main-panel">
          <SectionTitle
            eyebrow="ORIGINAL PUBLIC DATA · SEPARATE EVIDENCE"
            title="Test the forecast on the original pharmacy series"
          >
            Eight ATC categories, original dates and fractional publisher
            quantities. These results do not represent observed Assam demand.
          </SectionTitle>
          <div className="source-attribution">
            <FlaskConical size={24} />
            <div>
              <strong>
                {sourceInfo?.attribution ||
                  "Milan Zdravkovic · Pharma Sales Data"}
              </strong>
              <p>{sourceInfo?.units}</p>
              {typeof result?.date_start === "string" &&
                typeof result?.date_end === "string" && (
                  <p>
                    Original observation period: {String(result.date_start)} to{" "}
                    {String(result.date_end)}.
                  </p>
                )}
              <a
                href={
                  sourceInfo?.source_url ||
                  "https://www.kaggle.com/datasets/milanzdravkovic/pharma-sales-data"
                }
                target="_blank"
                rel="noreferrer"
              >
                View original dataset
              </a>
              <small>{sourceInfo?.licence}</small>
            </div>
          </div>
          <div className="ops-form-row">
            <Field label="Original ATC category">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setBenchmark(null);
                }}
              >
                {[
                  "M01AB",
                  "M01AE",
                  "N02BA",
                  "N02BE",
                  "N05B",
                  "N05C",
                  "R03",
                  "R06",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <button
              className="button primary"
              disabled={
                busy ||
                !hasRole(data, "planner", "steward", "manager") ||
                (!!latest && ["queued", "running"].includes(latest.status))
              }
              onClick={() =>
                run(async () => {
                  setBenchmark(
                    await command<Job>(
                      `/benchmarks/run?category=${category}`,
                      {},
                    ),
                  );
                  notify(
                    "Public benchmark queued. The worker computes held-out metrics.",
                  );
                })
              }
            >
              <FlaskConical size={16} />
              Run reproducible benchmark
            </button>
            <button className="button secondary" onClick={onRefresh}>
              <RefreshCw size={15} />
              Refresh result
            </button>
          </div>
          {!latest ? (
            <Empty title="Run the first observed-data benchmark">
              Model selection uses validation only. Final test targets are
              separated and forecasts recurse without future actual sales as
              lags.
            </Empty>
          ) : (
            <>
              <Badge tone={latest.status === "completed" ? "green" : "amber"}>
                {latest.status} · {latest.progress}%
              </Badge>
              {latest.error && <p role="alert">{latest.error}</p>}
              {latest.status === "completed" && result && (
                <>
                  <div className="ops-metrics">
                    <span>
                      Selected model
                      <b>{String(result.selected_model || "—")}</b>
                    </span>
                    <span>
                      Complete weeks<b>{number(result.complete_weeks)}</b>
                    </span>
                    <span>
                      Last validation target
                      <b>{dateLabel(String(result.validation_last_target))}</b>
                    </span>
                    <span>
                      First final-test target
                      <b>{dateLabel(String(result.test_first_target))}</b>
                    </span>
                  </div>
                  <p className="ops-note">
                    {String(result.selection)}. {String(result.interval_note)}.
                    Only four test origins per horizon: useful evidence, not a
                    guarantee of generalisation.
                  </p>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Horizon</th>
                          <th>Model</th>
                          <th>MAE</th>
                          <th>WAPE</th>
                          <th>Bias</th>
                          <th>Test observations</th>
                          <th>Interval coverage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(
                          result.test_metrics_by_horizon || {},
                        ).flatMap(([h, models]) =>
                          Object.entries(models).map(
                            ([model, m]: [string, Metrics]) => (
                              <tr
                                key={h + model}
                                className={
                                  model === result.selected_model
                                    ? "selected-metric"
                                    : ""
                                }
                              >
                                <td>{h} week(s)</td>
                                <td>
                                  {model}
                                  {model === result.selected_model
                                    ? " · selected"
                                    : ""}
                                </td>
                                <td>{number(m.mae)}</td>
                                <td>
                                  {m.wape_pct === null
                                    ? "Undefined (zero actual total)"
                                    : number(m.wape_pct) + "%"}
                                </td>
                                <td>
                                  {m.bias_pct === null
                                    ? "—"
                                    : number(m.bias_pct) + "%"}
                                </td>
                                <td>{m.observations}</td>
                                <td>
                                  {m.interval_coverage === undefined
                                    ? "—"
                                    : number(m.interval_coverage * 100) + "%"}
                                </td>
                              </tr>
                            ),
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
