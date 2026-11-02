import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Layers,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { all, api, command, upload } from "./api";
import type { Batch, Data, Job, Metrics } from "./types";
import {
  dateLabel,
  parseInstant,
  daysBetween,
  exportCsv,
  hasRole,
  number,
  shortLocation,
  shortProduct,
  title,
  weeklyHistory,
  type Observation,
} from "./utils";
import { Badge, Empty, Loading, Modal, SectionTitle, Stat } from "./ui";

export function InventoryWorkspace({
  data,
  asOf,
  onBatch,
}: {
  data: Data;
  asOf: string;
  onBatch: (batch: Batch) => void;
}) {
  const [search, setSearch] = useState(""),
    [location, setLocation] = useState("all"),
    [filter, setFilter] = useState("all");
  const rows = data.batches
    .filter((b) => {
      const p = data.products.find((x) => x.id === b.product_id);
      return (
        (location === "all" || b.location_id === location) &&
        (filter === "all" ||
          (filter === "usable" && b.status === "usable" && b.expiry > asOf) ||
          (filter === "held" && b.status !== "usable") ||
          (filter === "expiry" && daysBetween(asOf, b.expiry) <= 60)) &&
        `${b.code} ${p?.name}`.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const available = data.batches.reduce(
    (a, b) =>
      a +
      (b.status === "usable" && b.expiry > asOf ? b.quantity - b.reserved : 0),
    0,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STOCK YOU CAN TRUST</p>
          <h1>The right batch. A reliable balance.</h1>
          <p>Every unit has a state, a location and a traceable history.</p>
        </div>
        <Badge tone={data.reconciliation.ok ? "green" : "critical"}>
          <ShieldCheck size={13} />
          {data.reconciliation.ok
            ? "Ledger reconciled"
            : "Review reconciliation"}
        </Badge>
      </div>
      <div className="stats-grid inventory-stats">
        <Stat
          label="Batch records"
          value={number(data.batches.length)}
          detail="Across your authorised locations"
          icon={<Boxes size={19} />}
        />
        <Stat
          label="Available units"
          value={number(available)}
          detail="Excludes reservations and holds"
          icon={<PackageOpen size={19} />}
        />
        <Stat
          label="Short-dated batches"
          value={number(
            data.batches.filter(
              (b) =>
                b.quantity > 0 &&
                daysBetween(asOf, b.expiry) <= 60 &&
                daysBetween(asOf, b.expiry) > 0,
            ).length,
          )}
          detail="Expiry within 60 days"
          icon={<Clock3 size={19} />}
          tone="amber"
        />
        <Stat
          label="Held or quarantined"
          value={number(
            data.batches.filter((b) => b.quantity > 0 && b.status !== "usable")
              .length,
          )}
          detail="Excluded from usable availability"
          icon={<ShieldCheck size={19} />}
          tone="coral"
        />
      </div>
      <section className="panel">
        <SectionTitle
          title="Batch register"
          action={
            <button
              className="text-button"
              onClick={() =>
                exportCsv(
                  "grd-batches.csv",
                  rows.map((b) => ({
                    batch: b.code,
                    medicine: data.products.find((p) => p.id === b.product_id)
                      ?.name,
                    location: data.locations.find((l) => l.id === b.location_id)
                      ?.name,
                    quantity: b.quantity,
                    reserved: b.reserved,
                    status: b.status,
                    expiry: b.expiry,
                    evidence_type: data.me.evidence_type,
                  })),
                )
              }
            >
              <ArrowDownToLine size={15} />
              Export filtered records
            </button>
          }
        >
          First-expiry-first-out among eligible batches.
        </SectionTitle>
        <div className="inventory-controls">
          <div className="tabs">
            {[
              ["all", "All batches"],
              ["usable", "Usable"],
              ["expiry", "Expiring soon"],
              ["held", "Held / quarantined"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="searchbox">
            <Search size={16} />
            <input
              aria-label="Search batches"
              placeholder="Search medicine or batch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Inventory location"
            className="standalone-select"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="all">All locations</option>
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {shortLocation(l.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine / batch</th>
                <th>Location</th>
                <th>Physical</th>
                <th>Reserved</th>
                <th>Expiry</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong className="cell-title">
                      {shortProduct(
                        data.products.find((x) => x.id === b.product_id)
                          ?.name || "Medicine",
                      )}
                    </strong>
                    <small className="cell-subtitle">{b.code}</small>
                  </td>
                  <td>
                    {shortLocation(
                      data.locations.find((x) => x.id === b.location_id)
                        ?.name || "Location",
                    )}
                  </td>
                  <td className="number-cell">{number(b.quantity)}</td>
                  <td>{number(b.reserved)}</td>
                  <td>
                    <strong
                      className={
                        daysBetween(asOf, b.expiry) <= 60 ? "text-amber" : ""
                      }
                    >
                      {dateLabel(b.expiry, true)}
                    </strong>
                    <small className="cell-subtitle">
                      {daysBetween(asOf, b.expiry)} days remaining
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={
                        b.status === "usable" && b.expiry > asOf
                          ? "green"
                          : "warning"
                      }
                    >
                      {b.expiry <= asOf ? "Expired" : title(b.status)}
                    </Badge>
                  </td>
                  <td>
                    <button className="row-action" onClick={() => onBatch(b)}>
                      Review
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty title="No batches match">
              Change the location, state or search.
            </Empty>
          )}
        </div>
      </section>
    </>
  );
}

export function ForecastWorkspace({
  data,
  productId,
  onProduct,
  locationId,
  onLocation,
  asOf,
  onRefresh,
  notify,
}: {
  data: Data;
  productId: string;
  onProduct: (id: string) => void;
  locationId: string;
  onLocation: (id: string) => void;
  asOf: string;
  onRefresh: () => Promise<void>;
  notify: (value: string) => void;
}) {
  const [tab, setTab] = useState("forecast"),
    [history, setHistory] = useState<Observation[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [metricHorizon, setMetricHorizon] = useState("1"),
    [lead, setLead] = useState(5),
    [safety, setSafety] = useState(10);
  const product = data.products.find((x) => x.id === productId);
  const selectedLocation =
    data.locations.find((x) => x.id === locationId) ||
    data.locations.find((x) => x.kind === "distributor");
  const locId = selectedLocation?.id || "";
  const jobs = data.jobs.filter(
    (j) =>
      j.payload.product_id === productId &&
      j.payload.location_id === locId &&
      j.payload.as_of === asOf,
  );
  const forecastJob = [...jobs]
    .reverse()
    .find(
      (j) =>
        j.kind === "forecast" &&
        j.status === "completed" &&
        j.result.status === "ready",
    );
  const simulation = [...jobs]
    .reverse()
    .find((j) => j.kind === "simulation" && j.status === "completed");
  const running = jobs.some((j) => ["queued", "running"].includes(j.status));
  const latest = [...jobs].reverse()[0];
  const datasetsVersion = data.datasets
    .map((d) => d.id + ":" + d.digest)
    .join(",");
  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setError("");
    setLoading(true);
    if (!productId || !locId) {
      setLoading(false);
      return;
    }
    all<Observation>(
      `/demand?product_id=${encodeURIComponent(productId)}&location_id=${encodeURIComponent(locId)}`,
    )
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, locId, datasetsVersion]);
  const chart = useMemo(() => {
    const past = weeklyHistory(history, asOf);
    const future =
      forecastJob?.result.operational_forecast ||
      forecastJob?.result.forecast ||
      [];
    const intervals = forecastJob?.result.forecast || [];
    return [
      ...past.map((x) => ({
        ...x,
        forecast: null as number | null,
        band: null as number[] | null,
      })),
      ...future.map((x) => {
        const q = intervals.find((y) => y.weeks_ahead === x.weeks_ahead);
        return {
          date: x.week_ending,
          actual: null,
          forecast: x.quantity,
          band:
            q?.lower != null && q?.upper != null ? [q.lower, q.upper] : null,
        };
      }),
    ];
  }, [history, forecastJob, asOf]);
  const scores = forecastJob?.result.test_metrics_by_horizon?.[metricHorizon];
  const method = forecastJob?.result.selected_model || "recent4";
  const selected = scores?.[method];
  const baseline = scores?.recent4;
  const uplift =
    baseline?.wape_pct && selected?.wape_pct != null
      ? (100 * (baseline.wape_pct - selected.wape_pct)) / baseline.wape_pct
      : null;
  async function run() {
    setBusy(true);
    setError("");
    try {
      await command(
        "/jobs/" + (tab === "forecast" ? "forecast" : "simulation"),
        tab === "forecast"
          ? {
              product_id: productId,
              location_id: locId,
              as_of: asOf,
              measure: "requested",
              horizons: [1, 2, 4],
            }
          : {
              product_id: productId,
              location_id: locId,
              as_of: asOf,
              seed: 42,
              days: 90,
              lead_days: lead,
              proposed_safety_days: safety,
            },
      );
      await onRefresh();
      notify(
        tab === "forecast"
          ? "Forecast queued. Results will appear when the worker completes."
          : "Policy comparison queued with shared scenario randomness.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIDENCE THROUGH EVIDENCE</p>
          <h1>Look ahead. Show your working.</h1>
          <p>
            Understand the demand signal and the trade-offs behind a stock
            policy.
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || running || !hasRole(data, "planner", "manager")}
          onClick={run}
        >
          {running || busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Sparkles size={17} />
          )}{" "}
          {running
            ? "Calculation in progress"
            : tab === "forecast"
              ? "Run forecast"
              : "Run policy comparison"}
        </button>
      </div>
      <div className="filterbar">
        <label className="product-select">
          <Boxes size={18} />
          <span>
            <small>MEDICINE</small>
            <select
              aria-label="Forecast medicine"
              value={productId}
              onChange={(e) => onProduct(e.target.value)}
            >
              {data.products.map((p) => (
                <option value={p.id} key={p.id}>
                  {shortProduct(p.name)}
                </option>
              ))}
            </select>
          </span>
          <ChevronDown size={15} />
        </label>
        <span className="filter-divider" />
        <label className="scope-select">
          <MapPinIcon />
          <select
            aria-label="Forecast location"
            value={locId}
            onChange={(e) => onLocation(e.target.value)}
          >
            {data.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {shortLocation(l.name)}
              </option>
            ))}
          </select>
        </label>
        <span className="filter-spacer" />
        <Badge tone="demo">
          {data.me.evidence_type === "synthetic"
            ? "Synthetic demand"
            : "Declared source data"}
        </Badge>
      </div>
      <div className="tabs workspace-tabs">
        <button
          className={tab === "forecast" ? "active" : ""}
          onClick={() => setTab("forecast")}
        >
          <Activity size={16} />
          Demand outlook
        </button>
        <button
          className={tab === "simulation" ? "active" : ""}
          onClick={() => setTab("simulation")}
        >
          <FlaskConical size={16} />
          Policy comparison
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {running && (
        <div className="job-banner">
          <LoaderCircle className="spin" size={17} />
          <span>
            The worker is evaluating this series. You can continue using the
            workspace.
          </span>
          <Badge tone="blue">{title(latest?.status || "Queued")}</Badge>
        </div>
      )}
      {latest?.status === "failed" && (
        <div className="inline-error">
          Calculation failed: {latest.error}. Start the worker and retry after
          reviewing the inputs.
        </div>
      )}
      {latest?.kind === "forecast" &&
        latest.status === "completed" &&
        latest.result.status !== "ready" && (
          <div className="notice">
            <TriangleAlert size={18} />
            <p>
              {latest.result.reason ||
                "Insufficient history for a supported forecast."}
            </p>
          </div>
        )}
      {tab === "forecast" ? (
        <>
          <div className="forecast-stats">
            <div className="evidence-stat">
              <small>SELECTED METHOD</small>
              <strong>
                {forecastJob
                  ? method === "ml"
                    ? "Gradient boosting"
                    : title(method)
                  : "Not evaluated"}
              </strong>
              <span>
                {forecastJob?.result.selection?.includes("fallback")
                  ? "Short-history fallback; evaluation unavailable"
                  : "Chosen using validation results"}
              </span>
            </div>
            <div className="evidence-stat">
              <small>TEST ERROR · WAPE</small>
              <strong>
                {number(selected?.wape_pct, 1)}
                {selected?.wape_pct != null && <em>%</em>}
              </strong>
              <span>Lower is better · {metricHorizon}-week horizon</span>
            </div>
            <div className="evidence-stat">
              <small>ERROR REDUCTION VS BASELINE</small>
              <strong
                className={uplift != null && uplift >= 0 ? "text-green" : ""}
              >
                {uplift == null ? "—" : `${number(uplift, 1)}%`}
              </strong>
              <span>Relative to the recent-four-week baseline</span>
            </div>
            <div className="evidence-stat">
              <small>INTERVAL COVERAGE</small>
              <strong>
                {selected?.interval_coverage == null
                  ? "—"
                  : `${number(selected.interval_coverage * 100, 0)}%`}
              </strong>
              <span>Observed on the held-out test windows</span>
            </div>
          </div>
          <section className="panel forecast-chart">
            <SectionTitle
              title="Demand, with a view ahead"
              action={
                <div className="chart-legend">
                  <span>
                    <i className="actual" />
                    Recorded demand
                  </span>
                  <span>
                    <i className="forecast" />
                    Forecast
                  </span>
                  <span>
                    <i className="range" />
                    Evaluated range
                  </span>
                </div>
              }
            >
              {shortProduct(product?.name || "Medicine")} ·{" "}
              {shortLocation(selectedLocation?.name || "Location")} · weekly{" "}
              {product?.base_unit}s
            </SectionTitle>
            {loading ? (
              <Loading label="Loading demand observations" />
            ) : chart.length ? (
              <div className="chart-height">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chart}
                    margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 5"
                      vertical={false}
                      stroke="#e8ece7"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(x) => dateLabel(String(x))}
                      tick={{ fontSize: 11, fill: "#86918b" }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#86918b" }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <Tooltip
                      labelFormatter={(x) => dateLabel(String(x), true)}
                      contentStyle={{
                        border: "1px solid #e2e8de",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [
                        Array.isArray(value)
                          ? `${number(Number(value[0]))} – ${number(Number(value[1]))}`
                          : number(Number(value)),
                        name === "actual"
                          ? "Recorded demand"
                          : name === "forecast"
                            ? "Forecast"
                            : "Evaluated range",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="band"
                      stroke="none"
                      fill="#b8c9ef"
                      fillOpacity={0.4}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke="#2d7560"
                      strokeWidth={2.5}
                      fill="url(#demand-fill)"
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="#6579b7"
                      strokeWidth={2.5}
                      strokeDasharray="5 4"
                      dot={{ r: 3, fill: "#6579b7", strokeWidth: 0 }}
                      connectNulls={false}
                    />
                    <defs>
                      <linearGradient
                        id="demand-fill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#82b49a"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#82b49a"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty title="Demand history is missing">
                Import a declared source before generating a forecast.
              </Empty>
            )}
            <div className="chart-caption">
              <ShieldCheck size={15} />
              {forecastJob
                ? `Cut-off ${dateLabel(forecastJob.result.source_cutoff, true)} · ${forecastJob.result.complete_weeks} complete weeks · ${forecastJob.result.model_version}`
                : "Run a forecast to add the next four weeks and held-out evaluation."}
            </div>
          </section>
          <div className="evidence-grid">
            <section className="panel">
              <SectionTitle
                title="Compare the methods"
                action={
                  <select
                    aria-label="Evaluation horizon"
                    className="standalone-select"
                    value={metricHorizon}
                    onChange={(e) => setMetricHorizon(e.target.value)}
                  >
                    {[1, 2, 4].map((h) => (
                      <option value={h} key={h}>
                        {h}-week horizon
                      </option>
                    ))}
                  </select>
                }
              >
                Final test targets stay separate from model selection.
              </SectionTitle>
              {scores ? (
                <div className="method-list">
                  {Object.entries(scores).map(([name, score]) => (
                    <div key={name}>
                      <span>
                        {name === method ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <span className="method-dot" />
                        )}
                        {name === "ml" ? "Gradient boosting" : title(name)}
                        {name === method && (
                          <Badge tone="green">Selected</Badge>
                        )}
                      </span>
                      <strong>
                        {number(score.wape_pct, 1)}
                        {score.wape_pct != null ? "%" : ""} <small>WAPE</small>
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No evaluation yet">
                  Run the selected series to compare supported baselines and ML.
                </Empty>
              )}
            </section>
            <section className="panel evidence-note">
              <span className="note-icon">
                <ShieldCheck size={23} />
              </span>
              <h3>
                A forecast is a decision input.
                <br />
                The evidence stays visible.
              </h3>
              <p>
                Missing weeks are not silently filled with zero. Short histories
                use an explicit fallback. A simpler model can win.
              </p>
              <div className="notice">
                <Clock3 size={17} />
                <p>
                  {forecastJob?.result.interval_note ||
                    "Prediction ranges appear after evaluation. They do not guarantee demand or delivery outcomes."}
                </p>
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="panel">
            <SectionTitle
              title="Test a policy before acting"
              action={
                <Badge tone="demo">Synthetic single-lane experiment</Badge>
              }
            >
              Both policies face the same demand, delivery delays and starting
              stock.
            </SectionTitle>
            <div className="simulation-controls">
              <label>
                Assumed lead time <strong>{lead} days</strong>
                <input
                  aria-label="Simulation lead time"
                  type="range"
                  min="1"
                  max="14"
                  value={lead}
                  onChange={(e) => setLead(Number(e.target.value))}
                />
              </label>
              <label>
                Proposed safety stock <strong>{safety} days</strong>
                <input
                  aria-label="Simulation safety stock"
                  type="range"
                  min="1"
                  max="28"
                  value={safety}
                  onChange={(e) => setSafety(Number(e.target.value))}
                />
              </label>
              <div className="simulation-fixed">
                <small>COMPARISON WINDOW</small>
                <strong>90 days</strong>
                <span>Baseline safety stock: 2 days · seed 42</span>
              </div>
            </div>
          </section>
          {simulation ? (
            <SimulationResult job={simulation} />
          ) : (
            <section className="panel">
              <Empty
                title="Make the trade-off visible"
                action={
                  <button
                    className="button primary"
                    onClick={run}
                    disabled={
                      busy || running || !hasRole(data, "planner", "manager")
                    }
                  >
                    Run policy comparison
                    <ArrowRight size={16} />
                  </button>
                }
              >
                Compare service and inventory together. Added stock is a cost,
                not a hidden benefit.
              </Empty>
            </section>
          )}
        </>
      )}
    </>
  );
}
function MapPinIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}
function SimulationResult({ job }: { job: Job }) {
  const a = job.result.baseline!,
    b = job.result.proposed!;
  const rows = [
    ["fill_rate_pct", "Unit fill rate", "%"],
    ["shortage_days", "Shortage days", ""],
    ["unmet_units", "Unmet demand", " units"],
    ["expired_units", "Expiry writeoffs", " units"],
    ["average_inventory_units", "Average inventory", " units"],
  ] as const;
  return (
    <section className="panel">
      <SectionTitle
        title="Service improves only if the trade-off works"
        action={<Badge tone="blue">Reproducible scenario</Badge>}
      >
        Result: lead time {String(job.payload.lead_days)} days · safety stock{" "}
        {String(job.payload.proposed_safety_days)} days. Simulated outcomes, not
        measured GRD performance.
      </SectionTitle>
      <div className="simulation-results">
        <div className="simulation-bars">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                {
                  name: "Fill rate",
                  Baseline: a.fill_rate_pct,
                  Proposed: b.fill_rate_pct,
                },
              ]}
              barGap={16}
            >
              <CartesianGrid strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(x) => `${x}%`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(x) => `${number(Number(x), 1)}%`}
                contentStyle={{ borderRadius: 12 }}
              />
              <Legend />
              <Bar
                dataKey="Baseline"
                fill="#b3c0b6"
                radius={[7, 7, 0, 0]}
                maxBarSize={76}
              />
              <Bar
                dataKey="Proposed"
                fill="#2f765f"
                radius={[7, 7, 0, 0]}
                maxBarSize={76}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="comparison-table">
          <div className="comparison-head">
            <span>Measure</span>
            <b>Baseline</b>
            <b>Proposed</b>
          </div>
          {rows.map(([key, label, unit]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>
                {number(a[key], 1)}
                {unit}
              </strong>
              <strong>
                {number(b[key], 1)}
                {unit}
              </strong>
            </div>
          ))}
        </div>
      </div>
      <div className="notice">
        <FlaskConical size={19} />
        <p>
          {job.result.assumptions?.join(". ")}. This experiment does not
          establish network-wide transfer feasibility.
        </p>
      </div>
    </section>
  );
}

export function SourceWorkspace({
  data,
  onRefresh,
}: {
  data: Data;
  onRefresh: () => Promise<void>;
}) {
  const [importing, setImporting] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TRUST BEGINS WITH THE SOURCE</p>
          <h1>Know what the data can prove.</h1>
          <p>
            Keep observed records, generated scenarios and assumptions clearly
            distinct.
          </p>
        </div>
        {hasRole(data, "steward", "manager") && (
          <button className="button primary" onClick={() => setImporting(true)}>
            <Upload size={17} />
            Import demand data
          </button>
        )}
      </div>
      <div className="source-principles">
        <div>
          <span>
            <Database size={23} />
          </span>
          <h3>Declared provenance</h3>
          <p>
            Every imported dataset records its origin, licence, geography and
            units.
          </p>
        </div>
        <div>
          <span>
            <ShieldCheck size={23} />
          </span>
          <h3>Reconciled quantities</h3>
          <p>
            Duplicate observations and invalid rows cannot silently change
            demand.
          </p>
        </div>
        <div>
          <span>
            <Layers size={23} />
          </span>
          <h3>Honest evidence</h3>
          <p>
            A synthetic Assam scenario is useful for workflow testing, not a
            measured local result.
          </p>
        </div>
      </div>
      <section className="panel">
        <SectionTitle
          title="Dataset register"
          action={<Badge>{data.datasets.length} declared sources</Badge>}
        >
          Sources available within your role and organisation.
        </SectionTitle>
        {data.datasets.map((ds) => (
          <div className="dataset-card" key={ds.id}>
            <div className="dataset-icon">
              <Database size={23} />
            </div>
            <div className="dataset-main">
              <div>
                <h3>{ds.name}</h3>
                <Badge
                  tone={
                    ds.provenance.evidence_type === "synthetic"
                      ? "demo"
                      : "blue"
                  }
                >
                  {String(ds.provenance.evidence_type || "Declared source")}
                </Badge>
              </div>
              <p>
                {String(ds.provenance.geography || "Geography not supplied")} ·{" "}
                {number(ds.row_count)} records ·{" "}
                {String(ds.provenance.units || "Declared units")}
              </p>
              <small>
                {String(ds.provenance.licence || "Licence not supplied")}
              </small>
              <div className="dataset-limitations">
                {Array.isArray(ds.provenance.limitations)
                  ? ds.provenance.limitations.map((x, i) => (
                      <span key={i}>{String(x)}</span>
                    ))
                  : null}
              </div>
            </div>
          </div>
        ))}
        {!data.datasets.length && (
          <Empty title="No source records available">
            Source records may require a data-steward role.
          </Empty>
        )}
      </section>
      <div className="evidence-grid">
        <section className="panel source-context">
          <Badge tone="blue">Separate research context</Badge>
          <h3>
            Regional weather is context.
            <br />
            It is not medicine demand.
          </h3>
          <p>
            NASA POWER weather files for Guwahati, Dibrugarh and Silchar are
            kept separately. They are not a feature in the current forecast, and
            no forecast gain from weather is claimed.
          </p>
          <a
            className="text-button"
            href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/"
            target="_blank"
            rel="noreferrer"
          >
            NASA POWER source documentation
            <ExternalLink size={14} />
          </a>
        </section>
        <section className="panel source-context">
          <Badge tone="neutral">Pilot data dependency</Badge>
          <h3>
            Ready for a genuine
            <br />
            local distributor export.
          </h3>
          <p>
            Product identities, requested and supplied orders, batch stock,
            expiry and delivery dates will replace assumptions when an
            authorised source is available.
          </p>
          <div className="notice">
            <ShieldCheck size={17} />
            <p>
              No private GRD records, access rights or policy approvals have
              been assumed.
            </p>
          </div>
        </section>
      </div>
      {importing && (
        <ImportDialog
          onRefresh={onRefresh}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  );
}
function ImportDialog({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [name, setName] = useState(""),
    [source, setSource] = useState(""),
    [licence, setLicence] = useState(""),
    [geography, setGeography] = useState(""),
    [evidence, setEvidence] = useState("synthetic"),
    [limitations, setLimitations] = useState(""),
    [preview, setPreview] = useState<{
      valid_rows?: number;
      invalid_rows?: number;
      source_total?: number;
      errors?: { row: number; error: string }[];
      committed?: boolean;
      duplicate?: boolean;
      row_count?: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const valid =
    !!file && !!name && !!source && !!licence && !!geography && !!limitations;
  async function run(dry: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("dry_run", String(dry));
      form.set(
        "metadata",
        JSON.stringify({
          name,
          source_url: source,
          licence,
          geography,
          evidence_type: evidence,
          units: "product_base_units",
          limitations: [limitations],
        }),
      );
      setPreview(await upload("/imports/demand", form));
      if (!dry) await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function change(setter: (x: string) => void, value: string) {
    setter(value);
    setPreview(null);
  }
  return (
    <Modal
      title="Import with a clear source"
      busy={busy}
      eyebrow="DEMAND DATA"
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <p className="body-muted">
          CSV / XLSX · up to 5 MB and 10,000 rows. Required columns: date,
          product_id, location_id, quantity, measure. Quantities must already be
          product base units.
        </p>
        <label className="upload-zone">
          <Upload size={25} />
          <strong>{file?.name || "Choose your demand file"}</strong>
          <span>
            Review and repair errors before committing any observations.
          </span>
          <input
            disabled={busy}
            aria-label="Demand data file"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <div className="form-grid">
          <label>
            Dataset name
            <input
              disabled={busy}
              value={name}
              onChange={(e) => change(setName, e.target.value)}
            />
          </label>
          <label>
            Source / reference
            <input
              disabled={busy}
              value={source}
              onChange={(e) => change(setSource, e.target.value)}
            />
          </label>
          <label>
            Licence / permission
            <input
              disabled={busy}
              value={licence}
              onChange={(e) => change(setLicence, e.target.value)}
            />
          </label>
          <label>
            Actual geography
            <input
              disabled={busy}
              value={geography}
              onChange={(e) => change(setGeography, e.target.value)}
            />
          </label>
          <label>
            Evidence type
            <select
              disabled={busy}
              value={evidence}
              onChange={(e) => change(setEvidence, e.target.value)}
            >
              <option value="synthetic">Synthetic</option>
              <option value="observed">Observed</option>
              <option value="derived">Derived</option>
            </select>
          </label>
          <label>
            Limitations
            <input
              disabled={busy}
              value={limitations}
              onChange={(e) => change(setLimitations, e.target.value)}
            />
          </label>
        </div>
        {preview && (
          <div
            className={`import-result ${preview.committed || preview.duplicate ? "success" : ""}`}
          >
            <h3>
              {preview.committed
                ? "Import committed"
                : preview.duplicate
                  ? "Already imported"
                  : `${number(preview.valid_rows)} valid · ${number(preview.invalid_rows)} invalid rows`}
            </h3>
            <p>
              {preview.committed || preview.duplicate
                ? "The source was recorded without duplicating observations. The dataset register is now refreshed."
                : `Source total: ${number(preview.source_total)} base units. Invalid files commit no partial records.`}
            </p>
            {preview.errors?.slice(0, 8).map((e) => (
              <div className="import-error" key={e.row}>
                <b>Row {e.row}</b>
                <span>{e.error}</span>
              </div>
            ))}
          </div>
        )}
        {error && <div className="inline-error">{error}</div>}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button
          className="button secondary"
          disabled={!valid || busy}
          onClick={() => run(true)}
        >
          Validate preview
        </button>
        <button
          className="button primary"
          disabled={
            !valid ||
            busy ||
            !preview ||
            !!preview.invalid_rows ||
            !preview.valid_rows ||
            preview.committed ||
            preview.duplicate
          }
          onClick={() => run(false)}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <FileCheck2 size={16} />
          )}
          Commit validated file
        </button>
      </footer>
    </Modal>
  );
}

export function ActivityWorkspace({ data }: { data: Data }) {
  const [search, setSearch] = useState("");
  const rows = [...data.audit]
    .reverse()
    .filter((x) =>
      `${x.action} ${x.reference}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FROM RECOMMENDATION TO RECEIPT</p>
          <h1>A record of every meaningful move.</h1>
          <p>Decisions, stock effects and exceptions stay connected.</p>
        </div>
        <Badge tone={data.reconciliation.ok ? "green" : "critical"}>
          <ShieldCheck size={13} />
          {data.reconciliation.ok ? "Ledger reconciled" : "Review needed"}
        </Badge>
      </div>
      <section className="panel">
        <SectionTitle
          title="Operations timeline"
          action={
            <label className="searchbox">
              <Search size={15} />
              <input
                aria-label="Search activity"
                placeholder="Search event or reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          }
        >
          Server-recorded audit events within your authorised scope.
        </SectionTitle>
        <div className="timeline">
          {rows.map((event, index) => (
            <div className="timeline-event" key={event.id}>
              <div
                className={`timeline-node ${event.action.includes("received") ? "received" : event.action.includes("approved") ? "approved" : ""}`}
              >
                {event.action.includes("received") ? (
                  <CheckCircle2 size={17} />
                ) : event.action.includes("approved") ? (
                  <ShieldCheck size={17} />
                ) : (
                  <Activity size={17} />
                )}
              </div>
              <div className="timeline-content">
                <div>
                  <strong>{title(event.action.replaceAll(".", " "))}</strong>
                  <time>
                    {parseInstant(event.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>
                  {event.details.reason
                    ? String(event.details.reason)
                    : event.details.quantity
                      ? `${number(Number(event.details.quantity))} units recorded`
                      : `Reference ${event.reference.slice(0, 8).toUpperCase()}`}
                </p>
                <div className="timeline-tags">
                  <span>{event.reference.slice(0, 8).toUpperCase()}</span>
                  {typeof event.details.version === "number" && (
                    <span>Version {event.details.version}</span>
                  )}
                  {event.details.as_of != null && (
                    <span>
                      Scenario {dateLabel(String(event.details.as_of))}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {!rows.length && (
          <Empty title="No audit events in this view">
            Actions will appear after execution, or when your role permits
            access.
          </Empty>
        )}
      </section>
    </>
  );
}
