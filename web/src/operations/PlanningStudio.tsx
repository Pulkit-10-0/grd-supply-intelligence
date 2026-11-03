import { Details } from "../WorkflowProgress";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  GitCompareArrows,
  Layers,
  Waves,
} from "lucide-react";
import { api, command } from "../api";
import NetworkMap from "../NetworkMap";
import type { Data, Network, NetworkRow } from "../types";
import type {
  ComparisonPayload,
  Projection,
  ScenarioPayload,
  Workflow,
} from "../../../shared/operations";
import { Badge, Empty, Modal, SectionTitle } from "../ui";
import {
  dateLabel,
  hasRole,
  number,
  shortLocation,
  shortProduct,
} from "../utils";

export function RiskGrid({
  rows,
  onCell,
}: {
  rows: NetworkRow[];
  onCell: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="panel risk-matrix">
      <SectionTitle eyebrow="THE DAYS AHEAD" title="Stock-risk timeline">
        Same medicine, sites, operating date and horizon as the map. Select a
        day to inspect its site and supply options.
      </SectionTitle>
      <div className="matrix-scroll">
        <table>
          <thead>
            <tr>
              <th>Location / action deadline</th>
              {rows[0].timeline?.map((day) => (
                <th key={day.date}>
                  {day.date.slice(8)}
                  <small>{dateLabel(day.date).split(" ")[1]}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.location_id}>
                <th>
                  <strong>{shortLocation(row.name)}</strong>
                  <small>
                    {row.input_status === "stale"
                      ? "Stale stock · reconcile first"
                      : row.action_deadline
                        ? `Act by ${dateLabel(row.action_deadline.latest_action_on)} · ${row.action_deadline.slack_days}d slack`
                        : "No deadline / insufficient route evidence"}
                  </small>
                </th>
                {row.timeline?.map((day) => (
                  <td key={day.date}>
                    <button
                      className={`risk-cell ${row.input_status === "stale" ? "stale" : day.status}`}
                      aria-label={`${shortLocation(row.name)}, ${day.date}: ${day.status}, ${day.balance ?? "unknown"} units`}
                      title={`${dateLabel(day.date)} · ${number(day.balance)} left · ${number(day.unserved)} unserved`}
                      onClick={() => onCell(row.location_id)}
                    >
                      {day.balance === null
                        ? "?"
                        : day.unserved
                          ? "!"
                          : Math.round(day.balance)}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="matrix-legend">
        <span>
          <i className="covered" />
          Covered
        </span>
        <span>
          <i className="shortage" />
          Unserved demand
        </span>
        <span>
          <i className="stale" />
          Stale
        </span>
        <span>
          <i className="unknown" />
          Unknown
        </span>
        <span>Central estimate · planned arrivals</span>
      </div>
    </section>
  );
}

export function ProjectionTable({
  projection,
  baseline,
}: {
  projection: Projection;
  baseline?: Projection;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Location</th>
            <th>First service gap</th>
            <th>Unserved unit-days</th>
            <th>Change vs no action</th>
            <th>Last-day stock</th>
          </tr>
        </thead>
        <tbody>
          {projection.rows.map((row) => {
            const before = baseline?.rows.find(
              (b) => b.location_id === row.location_id,
            );
            const change =
              before?.service_gap_units != null && row.service_gap_units != null
                ? row.service_gap_units - before.service_gap_units
                : null;
            return (
              <tr key={row.location_id}>
                <td>
                  {shortLocation(row.name)}
                  <small>{row.input_status}</small>
                </td>
                <td>
                  {row.shortage_date
                    ? dateLabel(row.shortage_date)
                    : row.service_gap_units === null
                      ? "Unknown"
                      : "Covered"}
                </td>
                <td>{number(row.service_gap_units)}</td>
                <td
                  className={change !== null && change < 0 ? "good-number" : ""}
                >
                  {change === null
                    ? "—"
                    : `${change > 0 ? "+" : ""}${number(change)}`}
                </td>
                <td>{number(row.timeline.at(-1)?.balance)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlanningStudio({
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
  notify: (s: string) => void;
}) {
  const [comparisons, setComparisons] = useState<Workflow<ComparisonPayload>[]>(
      [],
    ),
    [scenarios, setScenarios] = useState<Workflow<ScenarioPayload>[]>([]),
    [selected, setSelected] = useState<Workflow<ComparisonPayload> | null>(
      null,
    ),
    [quantity, setQuantity] = useState("100"),
    [choice, setChoice] = useState(0),
    [shock, setShock] = useState<Workflow<ScenarioPayload> | null>(null),
    [delay, setDelay] = useState("3"),
    [uplift, setUplift] = useState("20"),
    [reduction, setReduction] = useState("0"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canPlan = hasRole(data, "planner", "manager");
  async function refresh() {
    const [a, b] = await Promise.all([
      api<{ items: Workflow<ComparisonPayload>[] }>("/operations/comparison"),
      api<{ items: Workflow<ScenarioPayload>[] }>("/operations/scenario"),
    ]);
    setComparisons(a.items);
    setScenarios(b.items);
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const variants =
    shock?.payload.alternatives || selected?.payload.alternatives || [];
  const active = variants[choice] || variants[0];
  const projectedRows: NetworkRow[] = (
    selected?.payload.snapshot.locations || []
  ).map((row) => {
    const projected = active?.projection.rows.find(
      (r) => r.location_id === row.location_id,
    );
    const balance = projected?.timeline.at(-1)?.balance;
    return {
      ...row,
      shortage_date: projected?.shortage_date || null,
      status:
        projected?.service_gap_units === null
          ? "unknown"
          : projected?.shortage_date
            ? "shortage"
            : "covered",
      balance: {
        ...row.balance,
        available: balance ?? 0,
        known: balance !== null,
      },
      days_of_cover: null,
    };
  });
  const scenarioNetwork: Network = {
    type: "FeatureCollection",
    table: projectedRows,
    features: [],
    as_of: selected?.payload.as_of || asOf,
    horizon_days: 28,
    inventory_revision: selected?.payload.snapshot.inventory_revision || 0,
    evidence_type: "hypothetical_scenario",
  };
  return (
    <div className="operations-space">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLAN BEFORE YOU COMMIT</p>
          <h1>Planning studio</h1>
          <p>Compare sources and delivery impact before approval.</p>
        </div>
        <Badge tone="demo">
          <Layers size={14} />
          Frozen scenarios
        </Badge>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="panel studio-controls">
        <SectionTitle title="Compare supply options">
          A comparison never posts stock movements. Approval rechecks and
          reserves every source atomically.
        </SectionTitle>
        <div className="ops-form-row">
          <label>
            Medicine
            <select
              value={productId}
              onChange={(e) => onProduct(e.target.value)}
            >
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortProduct(p.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Receiving location
            <select
              value={locationId}
              onChange={(e) => onLocation(e.target.value)}
            >
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {shortLocation(l.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity · base units
            <input
              type="number"
              min={
                data.products.find((p) => p.id === productId)?.pack_size || 1
              }
              step={
                data.products.find((p) => p.id === productId)?.pack_size || 1
              }
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !canPlan}
            onClick={() =>
              run(async () => {
                const c = await command<Workflow<ComparisonPayload>>(
                  "/planning/comparisons",
                  {
                    product_id: productId,
                    destination_id: locationId,
                    quantity: Number(quantity),
                    as_of: asOf,
                    name: "Supply comparison",
                    horizon: 28,
                  },
                );
                setSelected(c);
                setShock(null);
                setChoice(0);
              })
            }
          >
            <GitCompareArrows size={16} />
            {busy ? "Working…" : "Compare options"}
          </button>
        </div>
      </section>
      <div className="studio-layout">
        <aside className="panel saved-scenarios">
          <SectionTitle title="Decision library" />
          <p className="muted">Saved, versioned and reproducible.</p>
          {comparisons.map((c) => (
            <button
              key={c.id}
              className={`scenario-link ${selected?.id === c.id && !shock ? "active" : ""}`}
              onClick={() => {
                setSelected(c);
                setShock(null);
                setChoice(0);
              }}
            >
              <GitCompareArrows size={16} />
              <span>
                {shortProduct(
                  data.products.find((p) => p.id === c.payload.product_id)
                    ?.name || c.payload.product_id,
                )}
                <small>
                  {dateLabel(c.payload.as_of)} · {c.state} · v{c.version}
                </small>
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
          {scenarios.map((s) => (
            <button
              key={s.id}
              className={`scenario-link ${shock?.id === s.id ? "active" : ""}`}
              onClick={() => {
                setShock(s);
                setSelected(
                  comparisons.find((c) => c.id === s.payload.base_id) || null,
                );
                setChoice(0);
              }}
            >
              <Waves size={16} />
              <span>
                {s.payload.name}
                <small>
                  Scenario {s.id.slice(0, 8)} · v{s.version}
                </small>
              </span>
            </button>
          ))}
          {!comparisons.length && (
            <p className="muted">Create your first comparison above.</p>
          )}
        </aside>
        <section className="panel comparison-panel">
          {!selected && !shock ? (
            <Empty title="Choose a comparison">
              No action, single-source and feasible split-source options will
              appear here, including every donor and residual service gap.
            </Empty>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">
                    {shock ? "DISRUPTION SCENARIO" : "FROZEN COMPARISON"}
                  </p>
                  <h2>{shock?.payload.name || selected?.payload.name}</h2>
                  <p>
                    Base{" "}
                    {selected?.id.slice(0, 8) ||
                      shock?.payload.base_id.slice(0, 8)}{" "}
                    ·{" "}
                    {selected?.payload.snapshot.digest.slice(0, 12) ||
                      shock?.payload.snapshot_digest.slice(0, 12)}
                  </p>
                </div>
                <Badge>{shock ? "Simulation only" : selected?.state}</Badge>
              </div>
              <div className="comparison-options">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    className={choice === i ? "active" : ""}
                    onClick={() => setChoice(i)}
                  >
                    <span>
                      {v.name}{" "}
                      {i === 0
                        ? ""
                        : "· " +
                          v.legs
                            .map((l) =>
                              shortLocation(
                                data.locations.find((x) => x.id === l.source_id)
                                  ?.name || l.source_id,
                              ),
                            )
                            .join(" + ")}
                    </span>
                    <strong>{number(v.projection.total_service_gap)}</strong>
                    <small>
                      projected gap · unit-days ·{" "}
                      {v.projection.unsupported_locations} unknown sites
                    </small>
                  </button>
                ))}
              </div>
              {active && (
                <>
                  <div className="route-summary">
                    {active.legs.length ? (
                      active.legs.map((leg) => (
                        <span key={leg.source_id}>
                          <b>{number(leg.quantity)}</b> from{" "}
                          {shortLocation(
                            data.locations.find((l) => l.id === leg.source_id)
                              ?.name || leg.source_id,
                          )}{" "}
                          <ArrowRight size={12} /> arrives{" "}
                          {dateLabel(leg.evidence.arrival_date)}
                        </span>
                      ))
                    ) : (
                      <span>
                        No transfer; existing inbound remains in the baseline.
                      </span>
                    )}
                  </div>
                  {projectedRows.length > 0 && (
                    <div className="scenario-map">
                      <p className="eyebrow">
                        SCENARIO MAP · PROJECTED FINAL-DAY BALANCE
                      </p>
                      <NetworkMap
                        data={data}
                        network={scenarioNetwork}
                        selected={locationId}
                        onSelect={onLocation}
                        layer="risk"
                        filtered={projectedRows.map((r) => r.location_id)}
                        scenario
                      />
                      <Details title="How this is calculated & recorded">
                        <p className="ops-note">
                          Pins show projected end-of-horizon stock and any
                          shortage in this frozen scenario. These are planning
                          estimates, not current physical balances.
                        </p>
                      </Details>
                    </div>
                  )}
                  <ProjectionTable
                    projection={active.projection}
                    baseline={variants[0].projection}
                  />
                  <Details title="How this is calculated & recorded">
                    <p className="ops-note">
                      {active.projection.note} Delays, reduced supply and demand
                      shocks are hypothetical; missing evidence stays unknown.
                    </p>
                  </Details>
                </>
              )}
              {selected && canPlan && !shock && (
                <div className="panel-footer">
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      choice === 0 ||
                      selected.state !== "draft" ||
                      selected.payload.snapshot.inventory_revision !==
                        data.me.inventory_revision
                    }
                    onClick={() =>
                      run(async () => {
                        const approved = await command<
                          Workflow<ComparisonPayload>
                        >(`/planning/comparisons/${selected.id}/approve`, {
                          version: selected.version,
                          as_of: asOf,
                          alternative: choice,
                        });
                        setSelected(approved);
                        await onRefresh();
                        notify(
                          "Sources approved and reserved. Dispatch each plan from the Action centre.",
                        );
                      })
                    }
                  >
                    <CheckCircle2 size={16} />
                    Approve selected sources
                  </button>
                  <small>Old snapshots require a fresh comparison.</small>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {selected && canPlan && (
        <section className="panel disruption-builder">
          <SectionTitle eyebrow="WHAT IF?" title="Test a disruption">
            Create a separate scenario from exactly the same frozen base. The
            receiving location is the affected site.
          </SectionTitle>
          <div className="ops-form-row">
            <label>
              Extra delivery days
              <input
                type="number"
                min="0"
                max="60"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </label>
            <label>
              Demand uplift %
              <input
                type="number"
                min="0"
                max="300"
                value={uplift}
                onChange={(e) => setUplift(e.target.value)}
              />
            </label>
            <label>
              Supply reduction %
              <input
                type="number"
                min="0"
                max="100"
                value={reduction}
                onChange={(e) => setReduction(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const s = await command<Workflow<ScenarioPayload>>(
                    `/planning/comparisons/${selected.id}/scenarios`,
                    {
                      name: `Delay ${delay}d · demand +${uplift}%`,
                      delay_days: Number(delay),
                      demand_uplift_pct: Number(uplift),
                      supply_reduction_pct: Number(reduction),
                      location_ids: [selected.payload.destination_id],
                    },
                  );
                  setShock(s);
                  setChoice(0);
                })
              }
            >
              <Waves size={16} />
              Save disruption
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export function TimelineEvidence({
  row,
  onClose,
  onPlan,
}: {
  row: NetworkRow;
  onClose: () => void;
  onPlan: () => void;
}) {
  return (
    <Modal
      title={shortLocation(row.name) + " · stock timeline"}
      eyebrow="SAME NETWORK EVIDENCE"
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="deadline-card">
          <Clock3 size={24} />
          <div>
            <h3>
              {row.action_deadline
                ? `Act by ${dateLabel(row.action_deadline.latest_action_on)}`
                : "No supported action deadline"}
            </h3>
            <p>
              {row.action_deadline
                ? `${row.action_deadline.slack_days} days of slack · ${row.action_deadline.lead_days_upper} delivery days + ${row.action_deadline.approval_handling_days} approval/handling day(s)`
                : "Demand, stock or approved route evidence is missing."}
            </p>
            <small>{row.action_deadline?.assumption}</small>
          </div>
        </div>
        <ProjectionTable
          projection={{
            rows: [
              {
                ...row,
                timeline: row.timeline || [],
                service_gap_units: row.service_gap_units ?? null,
                input_status: row.input_status || "unknown",
              },
            ],
            total_service_gap: row.service_gap_units || 0,
            unsupported_locations: 0,
            note: row.projection_method,
          }}
        />
        <Details title="How this is calculated & recorded">
          <p className="ops-note">
            {row.projection_method}. Source age:{" "}
            {row.stock_age_hours === null
              ? "unknown"
              : `${number(row.stock_age_hours)} hours`}
            .
          </p>
        </Details>
        <button className="button primary" onClick={onPlan}>
          Review supply options <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
