import { buildActions, type Action } from "./actions";
import {
  initialProduct,
  initialLocation,
  supplyFlow,
  supplySteps,
} from "../../shared/workflow";
import { Details, WorkflowProgress } from "./WorkflowProgress";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  LayoutDashboard,
  Layers as LayersIcon,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";
import {
  api,
  command,
  loadData,
  localDemo,
  setToken,
  getSessionVersion,
  SessionChangedError,
} from "./api";
import type {
  Batch,
  Case,
  Data,
  Network,
  NetworkRow,
  Plan,
  Product,
  Shipment,
  View,
} from "./types";
import {
  canLocation,
  dateLabel,
  daysBetween,
  exportCsv,
  hasRole,
  number,
  riskLevel,
  shortLocation,
  shortProduct,
  title,
} from "./utils";
import { Badge, Empty, Loading, Modal, SectionTitle, Stat } from "./ui";
import NetworkMap from "./NetworkMap";
import {
  PlanningStudio,
  RiskGrid,
  TimelineEvidence,
} from "./operations/PlanningStudio";
import { OperationsDesk } from "./operations/OperationsDesk";
import { EvidenceWorkspace } from "./operations/Evidence";
import {
  PlanDialog,
  ReceiptDialog,
  ResolveDialog,
  RescueDialog,
  StockDialog,
  CaseDialog,
  AssistantDialog,
} from "./dialogs";
import {
  ForecastWorkspace,
  InventoryWorkspace,
  SourceWorkspace,
  ActivityWorkspace,
} from "./workspaces";

export type Dialog =
  | {
      type: "resolve";
      locationId: string;
      productId?: string;
      requestId?: string;
    }
  | { type: "rescue"; locationId: string }
  | { type: "plan"; plan: Plan }
  | { type: "receipt"; shipment: Shipment }
  | { type: "stock"; batch: Batch }
  | { type: "case"; item: Case }
  | { type: "location"; locationId: string }
  | { type: "assistant" }
  | { type: "help" }
  | { type: "timeline"; row: NetworkRow }
  | null;
let demoAttempt: Promise<void> | undefined;
const nav = [
  { id: "overview", label: "Network", icon: LayoutDashboard },
  { id: "actions", label: "Action centre", icon: Target },
  { id: "planning", label: "Planning", icon: LayersIcon },
  { id: "operations", label: "Operations desk", icon: Truck },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "forecasts", label: "Forecasts", icon: Activity },
  { id: "evidence", label: "Stock & evidence", icon: ShieldCheck },
  { id: "activity", label: "Operations log", icon: FileCheck2 },
  { id: "sources", label: "Data sources", icon: Database },
] as const;

export default function App() {
  const [data, setData] = useState<Data | null>(null),
    [network, setNetwork] = useState<Network | null>(null),
    [view, setView] = useState<View>("overview"),
    [productId, setProductId] = useState(""),
    [selected, setSelected] = useState(""),
    [horizon, setHorizon] = useState(21),
    [layer, setLayer] = useState("risk"),
    [search, setSearch] = useState(""),
    [scope, setScope] = useState("all"),
    [dialog, setDialog] = useState<Dialog>(null),
    [busy, setBusy] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [tick, setTick] = useState(0),
    [mobileMenu, setMobileMenu] = useState(false),
    [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshSequence = useRef(0);
  const resetWorkspace = useCallback(() => {
    refreshSequence.current++;
    setData(null);
    setNetwork(null);
    setDialog(null);
    setProductId("");
    setSelected("");
    setSearch("");
    setScope("all");
    setView("overview");
    setToast("");
    setError("");
    setMobileMenu(false);
    setLastRefresh(null);
    setRefreshing(false);
    setBusy(false);
  }, []);
  const notify = useCallback((value: string) => setToast(value), []);
  const reload = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const version = getSessionVersion();
    const current = () =>
      sequence === refreshSequence.current && version === getSessionVersion();
    setRefreshing(true);
    try {
      const next = await loadData();
      if (!current()) return;
      setData(next);
      setProductId((current) => initialProduct(next, current));
      setSelected((current) =>
        initialLocation(next, initialProduct(next), current),
      );
      setError("");
      setLastRefresh(new Date());
      setTick((x) => x + 1);
    } catch (e) {
      if (current() && !(e instanceof SessionChangedError))
        setError((e as Error).message);
    } finally {
      if (current()) {
        setRefreshing(false);
        setBusy(false);
      }
    }
  }, []);
  const finish = useCallback(
    async (message: string) => {
      const version = getSessionVersion();
      await reload();
      if (version !== getSessionVersion()) throw new SessionChangedError();
      notify(message);
    },
    [reload, notify],
  );
  useEffect(() => {
    if (import.meta.env.DEV) {
      demoAttempt ??= localDemo().catch((e) => {
        demoAttempt = undefined;
        throw e;
      });
      demoAttempt.then(reload).catch(() => setBusy(false));
    } else setBusy(false);
    window.addEventListener("grd:unauthorised", resetWorkspace);
    return () => window.removeEventListener("grd:unauthorised", resetWorkspace);
  }, [reload, resetWorkspace]);
  const asOf =
    data?.me.scenario_on ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  useEffect(() => {
    if (!data || !productId) return;
    let cancelled = false;
    api<Network>(
      `/network?product_id=${encodeURIComponent(productId)}&as_of=${asOf}&horizon=${horizon}`,
    )
      .then((value) => {
        if (!cancelled) {
          setNetwork(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, horizon, asOf, tick, data?.me.id]);
  useEffect(() => {
    if (!data?.jobs.some((j) => ["queued", "running"].includes(j.status)))
      return;
    const timeout = setTimeout(reload, 2200);
    return () => clearTimeout(timeout);
  }, [data, reload]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);
  const product = data?.products.find((p) => p.id === productId);
  const currentNetwork =
    network &&
    network.horizon_days === horizon &&
    network.as_of === asOf &&
    (!network.table.length || network.table[0]?.product_id === productId)
      ? network
      : null;
  const rows = useMemo(
    () =>
      currentNetwork?.table.filter(
        (row) =>
          (scope === "all" ||
            (scope === "risk"
              ? row.status === "shortage"
              : scope === "warehouse"
                ? row.kind === "warehouse"
                : row.projected_expiry_units > 0)) &&
          `${row.name} ${row.district}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) || [],
    [currentNetwork, scope, search],
  );
  const activeRow = rows.find((x) => x.location_id === selected) || rows[0];
  const selectLocation = (id: string) => {
    setSelected(id);
  };
  const navigate = (id: View) => {
    setView(id);
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const actions = useMemo(
    () =>
      data
        ? buildActions(
            data,
            currentNetwork ? { ...currentNetwork, table: rows } : null,
            asOf,
          )
        : [],
    [data, currentNetwork, rows, asOf],
  );
  async function logout() {
    const revocation = api("/auth/logout", "POST").catch(() => undefined);
    setToken(null);
    resetWorkspace();
    demoAttempt = undefined;
    await revocation;
  }
  if (busy && !data)
    return (
      <div className="boot">
        <Brand />
        <Loading label="Connecting your supply network" />
      </div>
    );
  if (!data) return <Login onReady={reload} connectionError={error} />;
  const openRisk = (row: NetworkRow) => {
    setSelected(row.location_id);
    setDialog({ type: "resolve", locationId: row.location_id });
  };
  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <Brand />
        <button
          className="icon-button mobile-close-nav"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        >
          <X size={19} />
        </button>
        <div className="workspace-label">OPERATIONS WORKSPACE</div>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "actions" && actions.length > 0 && (
                <b>{actions.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="assistant-link"
            onClick={() => setDialog({ type: "assistant" })}
          >
            <span className="assistant-orb">
              <Sparkles size={18} />
            </span>
            <span>
              Supply assistant<small>Answers with evidence</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <div className="sidebar-system">
            <span className={`live-dot ${error ? "offline" : ""}`} />
            <span>
              {error ? "Connection needs attention" : "Connected"}
              <small>
                {data.reconciliation.ok
                  ? "Inventory ledger reconciled"
                  : "Reconciliation needs attention"}
              </small>
            </span>
          </div>
          <button className="user-profile" onClick={logout} title="Sign out">
            <span className="avatar">GR</span>
            <span>
              {data.me.email}
              <small>{title(data.me.role)} · Sign out</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="mobile-nav-scrim"
          aria-label="Close navigation overlay"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Toggle navigation"
              onClick={() => setMobileMenu((x) => !x)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={13} />
            <strong>{nav.find((x) => x.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="header-date">{dateLabel(asOf, true)}</span>
            <button
              className="icon-button"
              aria-label="Refresh all workspace records"
              disabled={refreshing}
              onClick={reload}
            >
              <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            </button>
            <button
              className="icon-button"
              aria-label="Open help"
              onClick={() => setDialog({ type: "help" })}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Open action notifications"
              onClick={() => navigate("operations")}
            >
              <Bell size={18} />
              {actions.length > 0 && <i />}
            </button>
            <span className="avatar light">GR</span>
          </div>
        </header>
        <main id="main" className="workspace" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={17} />
              <span>{error} Displaying the last confirmed records.</span>
              <button onClick={reload}>Reconnect</button>
            </div>
          )}
          {(view === "overview" || view === "actions") && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">NORTH EAST · CONNECTED SUPPLY</p>
                  <h1>
                    {view === "overview" ? "Network overview" : "Action centre"}
                  </h1>
                  <p>
                    {view === "overview"
                      ? "See where medicine is needed. Know what to do next."
                      : "Review, dispatch and receive your supply orders."}
                  </p>
                </div>
                <div className="page-actions">
                  <button
                    className={`button secondary ${refreshing ? "is-loading" : ""}`}
                    onClick={reload}
                    disabled={refreshing}
                  >
                    <RefreshCw size={15} className={refreshing ? "spin" : ""} />
                    {refreshing ? "Syncing" : "Refresh"}
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      setDialog({
                        type: "resolve",
                        locationId: activeRow?.location_id || selected,
                      })
                    }
                    disabled={!product || !hasRole(data, "planner", "manager")}
                  >
                    <Plus size={17} />
                    Create supply plan
                  </button>
                </div>
              </div>
              <div className="filterbar">
                <label className="product-select">
                  <span className="filter-icon">
                    <Boxes size={18} />
                  </span>
                  <span>
                    <small>MEDICINE</small>
                    <select
                      aria-label="Select medicine"
                      value={productId}
                      onChange={(e) => setProductId(e.target.value)}
                    >
                      {data.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {shortProduct(p.name)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <ChevronDown size={15} />
                </label>
                <span className="filter-divider" />
                <label className="scope-select">
                  <MapPin size={16} />
                  <select
                    aria-label="Filter network"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="all">All locations</option>
                    <option value="risk">Shortage risk</option>
                    <option value="expiry">Expiry exposure</option>
                    <option value="warehouse">Warehouses</option>
                  </select>
                </label>
                <label className="searchbox">
                  <Search size={16} />
                  <input
                    aria-label="Search locations"
                    placeholder="Search a location or district…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Clear location search"
                      onClick={() => setSearch("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <div className="filter-status">
                  <span className="live-dot" />
                  Updated{" "}
                  {lastRefresh?.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="stats-grid">
                <Stat
                  label="Available stock"
                  value={
                    <>
                      {number(
                        currentNetwork && rows.some((r) => r.balance.known)
                          ? rows
                              .filter((r) => r.balance.known)
                              .reduce((n, r) => n + r.balance.available, 0)
                          : null,
                      )}
                      <em>{product?.base_unit}s</em>
                    </>
                  }
                  detail={`${rows.filter((r) => r.balance.known).length}/${rows.length} known locations · after reservations`}
                  icon={<Boxes size={19} />}
                />
                <Stat
                  label="Critical locations"
                  value={number(
                    currentNetwork
                      ? rows.filter((r) => riskLevel(r, asOf) === "critical")
                          .length
                      : null,
                  )}
                  detail="Projected shortage within 3 days"
                  icon={<TriangleAlert size={19} />}
                  tone="coral"
                />
                <Stat
                  label="Expiry exposure"
                  value={
                    <>
                      {number(
                        currentNetwork &&
                          !rows.some((r) => r.status === "unknown")
                          ? rows.reduce(
                              (n, r) => n + r.projected_expiry_units,
                              0,
                            )
                          : null,
                      )}
                      <em>units</em>
                    </>
                  }
                  detail={
                    rows.some((r) => r.status === "unknown")
                      ? "Stock or demand coverage is incomplete"
                      : `Projected unconsumed · ${horizon} days`
                  }
                  icon={<Clock3 size={19} />}
                  tone="amber"
                />
                <Stat
                  label="Open actions"
                  value={number(actions.length)}
                  detail="Medicine risks + network execution"
                  icon={<Target size={19} />}
                  tone="blue"
                />
              </div>
              {view === "overview" ? (
                <>
                  <div className="overview-grid">
                    <section className="panel map-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            Network pulse{" "}
                            <span className="tiny-count">
                              {rows.length} sites
                            </span>
                          </h2>
                          <p>One network. Every stock decision connected.</p>
                        </div>
                        <div className="segmented" aria-label="Map layer">
                          {[
                            ["risk", "Stock risk"],
                            ["expiry", "Expiry"],
                            ["freshness", "Freshness"],
                          ].map(([id, label]) => (
                            <button
                              key={id}
                              className={layer === id ? "active" : ""}
                              onClick={() => setLayer(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {currentNetwork ? (
                        <NetworkMap
                          data={data}
                          network={currentNetwork}
                          selected={activeRow?.location_id || selected}
                          onSelect={selectLocation}
                          layer={layer}
                          filtered={rows.map((x) => x.location_id)}
                        />
                      ) : (
                        <div className="map-placeholder">
                          <Loading label="Loading network positions" />
                        </div>
                      )}
                      <div className="horizon-control">
                        <span>
                          <Clock3 size={15} />
                          Planning horizon
                        </span>
                        <input
                          aria-label="Planning horizon in days"
                          type="range"
                          min="7"
                          max="28"
                          step="7"
                          value={horizon}
                          onChange={(e) => setHorizon(Number(e.target.value))}
                        />
                        <b>{horizon} days</b>
                        <span className="horizon-label">
                          {dateLabel(asOf)} —{" "}
                          {dateLabel(
                            new Date(
                              new Date(asOf + "T12:00:00").getTime() +
                                horizon * 86400000,
                            ).toISOString(),
                          )}
                        </span>
                      </div>
                      {activeRow ? (
                        <LocationStrip
                          row={activeRow}
                          product={product!}
                          asOf={asOf}
                          onEvidence={() =>
                            setDialog({
                              type: "location",
                              locationId: activeRow.location_id,
                            })
                          }
                          onResolve={() => openRisk(activeRow)}
                          allowed={hasRole(data, "planner", "manager")}
                        />
                      ) : (
                        <Empty title="No locations match">
                          Try another network filter or search.
                        </Empty>
                      )}
                    </section>
                    <section className="panel attention-panel">
                      <div className="panel-heading">
                        <div>
                          <p className="eyebrow">YOUR NEXT MOVE</p>
                          <h2>
                            Needs attention{" "}
                            <span className="tiny-count">{actions.length}</span>
                          </h2>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="See all actions"
                          onClick={() => navigate("actions")}
                        >
                          <ArrowRight size={18} />
                        </button>
                      </div>
                      <div className="attention-list">
                        {actions.slice(0, 4).map((item) => (
                          <ActionCard
                            key={item.id}
                            item={item}
                            onClick={() =>
                              handleAction(item, data, setDialog, setSelected)
                            }
                          />
                        ))}
                        {!actions.length && (
                          <Empty title="All clear">
                            No pending work in this view.
                          </Empty>
                        )}
                      </div>
                      <div className="attention-footer">
                        <span>
                          <ShieldCheck size={16} />
                          Every action stays traceable.
                        </span>
                        <button onClick={() => navigate("actions")}>
                          View action centre <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <section className="panel location-table-panel">
                    <SectionTitle
                      title="Every location, in focus"
                      action={
                        <button
                          className="text-button"
                          onClick={() =>
                            exportCsv(
                              "grd-network.csv",
                              rows.map((r) => ({
                                location: shortLocation(r.name),
                                medicine: product?.name,
                                evidence_type: r.evidence_type,
                                as_of: asOf,
                                available: r.balance.available,
                                reserved: r.balance.reserved,
                                shortage_date: r.shortage_date,
                                projected_expiry_units:
                                  r.projected_expiry_units,
                              })),
                            )
                          }
                        >
                          <ArrowDownToLine size={15} />
                          Export view
                        </button>
                      }
                    >
                      Availability and risk for{" "}
                      {product && shortProduct(product.name)}.
                    </SectionTitle>
                    <NetworkTable
                      rows={rows}
                      selected={activeRow?.location_id || ""}
                      asOf={asOf}
                      onSelect={selectLocation}
                      onResolve={openRisk}
                      canPlan={hasRole(data, "planner", "manager")}
                    />
                  </section>
                  <div className="trust-strip">
                    <span>
                      <ShieldCheck size={16} />
                      {data.reconciliation.ok
                        ? "Ledger reconciled"
                        : "Reconciliation requires review"}
                    </span>

                    <button onClick={() => navigate("sources")}>
                      Data sources <ExternalLink size={13} />
                    </button>
                  </div>
                </>
              ) : (
                <ActionCentre
                  data={data}
                  actions={actions}
                  onAction={(item) =>
                    handleAction(item, data, setDialog, setSelected)
                  }
                  onReceipt={(shipment) =>
                    setDialog({ type: "receipt", shipment })
                  }
                />
              )}
            </>
          )}
          {view === "inventory" && (
            <InventoryWorkspace
              data={data}
              asOf={asOf}
              onBatch={(batch) => setDialog({ type: "stock", batch })}
            />
          )}
          {view === "overview" && currentNetwork && (
            <Details title="Daily stock timeline">
              <RiskGrid
                rows={rows}
                onCell={(id) => {
                  const row = rows.find((r) => r.location_id === id);
                  if (row) {
                    setSelected(id);
                    setDialog({ type: "timeline", row });
                  }
                }}
              />
            </Details>
          )}
          {view === "planning" && (
            <PlanningStudio
              data={data}
              productId={productId}
              onProduct={setProductId}
              locationId={selected}
              onLocation={setSelected}
              asOf={asOf}
              onRefresh={reload}
              notify={notify}
            />
          )}
          {view === "operations" && (
            <OperationsDesk
              data={data}
              asOf={asOf}
              onRefresh={reload}
              notify={notify}
              onOpen={(kind, id) => {
                if (kind === "case") {
                  const item = data.cases.find((c) => c.id === id);
                  if (item) setDialog({ type: "case", item });
                } else if (kind === "hold" || kind === "stale_stock") {
                  const batch = data.batches.find((b) => b.id === id);
                  if (batch) setDialog({ type: "stock", batch });
                } else if (
                  kind === "late_shipment" ||
                  kind === "short_receipt"
                ) {
                  const shipment = data.shipments.find((s) => s.id === id);
                  if (shipment) setDialog({ type: "receipt", shipment });
                } else if (kind === "deadline") {
                  setProductId(id);
                  navigate("overview");
                } else
                  notify(
                    "Review the referenced record in its operations workspace.",
                  );
              }}
            />
          )}
          {view === "evidence" && (
            <EvidenceWorkspace
              data={data}
              asOf={asOf}
              onRefresh={reload}
              notify={notify}
            />
          )}
          {view === "forecasts" && (
            <ForecastWorkspace
              data={data}
              productId={productId}
              onProduct={setProductId}
              locationId={selected}
              onLocation={setSelected}
              asOf={asOf}
              onRefresh={reload}
              notify={notify}
            />
          )}
          {view === "activity" && <ActivityWorkspace data={data} />}
          {view === "sources" && (
            <SourceWorkspace data={data} onRefresh={reload} />
          )}
          <footer className="workspace-footer">
            <span>
              GRD Supply Intelligence <i />
              Built for the North East.
            </span>
            <span>
              NESFIC · I-09 <span className="footer-leaf">✳</span>
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {dialog?.type === "timeline" && (
        <TimelineEvidence
          row={dialog.row}
          onClose={() => setDialog(null)}
          onPlan={() =>
            setDialog({
              type: "resolve",
              locationId: dialog.row.location_id,
              productId: dialog.row.product_id,
            })
          }
        />
      )}
      {dialog?.type === "resolve" && product && (
        <ResolveDialog
          data={data}
          product={
            data.products.find((p) => p.id === dialog.productId) || product
          }
          shortageDate={
            currentNetwork?.table.find(
              (r) =>
                r.location_id === dialog.locationId &&
                r.product_id === (dialog.productId || product.id),
            )?.shortage_date
          }
          requestId={dialog.requestId}
          locationId={dialog.locationId}
          asOf={asOf}
          onClose={() => {
            setDialog(null);
            reload();
          }}
          onDone={async (p) => {
            await finish("Supply plan created. Ready for review.");
            setDialog({ type: "plan", plan: p });
          }}
        />
      )}
      {dialog?.type === "rescue" && product && (
        <RescueDialog
          data={data}
          product={product}
          locationId={dialog.locationId}
          asOf={asOf}
          onClose={() => setDialog(null)}
          onDone={async (p) => {
            await finish("Expiry rescue plan created for review.");
            setDialog({ type: "plan", plan: p });
          }}
        />
      )}
      {dialog?.type === "plan" && (
        <PlanDialog
          data={data}
          plan={dialog.plan}
          asOf={asOf}
          onClose={() => setDialog(null)}
          onDone={finish}
          onReceipt={(shipment) => setDialog({ type: "receipt", shipment })}
        />
      )}
      {dialog?.type === "receipt" && (
        <ReceiptDialog
          data={data}
          shipment={dialog.shipment}
          asOf={asOf}
          onClose={() => {
            const plan = data.plans.find(
              (p) => p.id === dialog.shipment.plan_id,
            );
            setDialog(plan ? { type: "plan", plan } : null);
          }}
          onDone={finish}
        />
      )}
      {dialog?.type === "stock" && (
        <StockDialog
          data={data}
          batch={dialog.batch}
          asOf={asOf}
          onClose={() => setDialog(null)}
          onDone={finish}
        />
      )}
      {dialog?.type === "case" && (
        <CaseDialog
          data={data}
          item={dialog.item}
          onClose={() => setDialog(null)}
          onDone={finish}
        />
      )}
      {dialog?.type === "location" &&
        product &&
        currentNetwork?.table.find(
          (r) => r.location_id === dialog.locationId,
        ) && (
          <LocationDialog
            data={data}
            row={currentNetwork.table.find(
              (r) => r.location_id === dialog.locationId,
            )!}
            product={product}
            asOf={asOf}
            onClose={() => setDialog(null)}
            onForecast={() => {
              setSelected(dialog.locationId);
              setDialog(null);
              navigate("forecasts");
            }}
          />
        )}
      {dialog?.type === "assistant" && (
        <AssistantDialog
          data={data}
          asOf={asOf}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "help" && <Help onClose={() => setDialog(null)} />}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-symbol">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>
          GRD<span> /</span>
        </strong>
        <small>SUPPLY INTELLIGENCE</small>
      </div>
    </div>
  );
}
function Login({
  onReady,
  connectionError,
}: {
  onReady: () => Promise<void>;
  connectionError: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function signIn(demo = false) {
    setBusy(true);
    setError("");
    try {
      if (demo) await localDemo();
      else {
        const result = await api<{ access_token: string }>(
          "/auth/login",
          "POST",
          { email, password },
        );
        setToken(result.access_token);
      }
      await onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-story">
        <Brand />
        <div className="login-grid-art">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="orbit three" />
          <span className="art-dot d1" />
          <span className="art-dot d2" />
          <span className="art-dot d3" />
          <span className="art-dot d4" />
          <div className="art-centre">
            <HeartPulse size={43} />
          </div>
          <span className="art-label">CONNECTED CARE, EVERYWHERE.</span>
        </div>
        <div className="login-copy">
          <p className="eyebrow">FROM VISIBILITY TO AVAILABILITY</p>
          <h1>
            Every medicine.
            <br />
            In the right place.
          </h1>
          <p>
            A connected view of demand, stock and the decisions that keep your
            network moving.
          </p>
        </div>
        <span className="login-footer">
          Built for the North East. Designed for every mile.
        </span>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <Badge tone="green">GRD OPERATIONS WORKSPACE</Badge>
          <h2>
            Welcome to a<br />
            clearer picture.
          </h2>
          <p>Sign in to your supply intelligence workspace.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organisation.in"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>
            {(error || connectionError) && (
              <div className="inline-error" role="alert">
                {error || connectionError}
              </div>
            )}
            <button className="button primary large" disabled={busy}>
              {busy ? "Connecting…" : "Sign in to workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          {import.meta.env.DEV && (
            <>
              <div className="login-divider">
                <span />
                or explore the product
                <span />
              </div>
              <button
                className="button secondary large"
                disabled={busy}
                onClick={() => signIn(true)}
              >
                <Sparkles size={17} />
                Open local workspace
                <ArrowRight size={16} />
              </button>
              <small className="login-note">Local development workspace.</small>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function handleAction(
  item: Action,
  data: Data,
  setDialog: (x: Dialog) => void,
  setSelected: (x: string) => void,
) {
  if (item.kind === "data") {
    setSelected(item.ref);
    setDialog({ type: "location", locationId: item.ref });
  } else if (item.kind === "plan") {
    const plan = data.plans.find((x) => x.id === item.ref);
    if (plan) setDialog({ type: "plan", plan });
  } else if (item.kind === "case") {
    const c = data.cases.find((x) => x.id === item.ref);
    if (c) setDialog({ type: "case", item: c });
  } else if (item.kind === "request") {
    const r = data.requests.find((x) => x.id === item.ref);
    if (r) {
      setSelected(r.destination_id);
      setDialog({
        type: "resolve",
        locationId: r.destination_id,
        productId: r.product_id,
        requestId: r.id,
      });
    }
  } else {
    setSelected(item.ref);
    setDialog({
      type: item.kind === "expiry" ? "rescue" : "resolve",
      locationId: item.ref,
    });
  }
}
function ActionCard({ item, onClick }: { item: Action; onClick: () => void }) {
  return (
    <button className={`action-card ${item.severity}`} onClick={onClick}>
      <div className="action-card-top">
        <Badge tone={item.severity}>{item.label}</Badge>
        <span>{item.metric}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      {item.progress !== undefined && (
        <WorkflowProgress
          steps={supplySteps}
          stage={item.progress}
          partialStep={item.partialDispatch ? 2 : undefined}
          compact
          label="Order progress"
        />
      )}
      <div className="action-card-bottom">
        <span>{item.product}</span>
        <strong>
          {item.nextLabel || "Review"} <ArrowRight size={14} />
        </strong>
      </div>
    </button>
  );
}
function LocationStrip({
  row,
  product,
  asOf,
  onResolve,
  onEvidence,
  allowed,
}: {
  row: NetworkRow;
  product: Product;
  asOf: string;
  onResolve: () => void;
  onEvidence: () => void;
  allowed: boolean;
}) {
  return (
    <div className="location-strip">
      <div className="location-strip-name">
        <span className={`location-icon ${riskLevel(row, asOf)}`}>
          <MapPin size={20} />
        </span>
        <span>
          <strong>{shortLocation(row.name)}</strong>
          <small>
            {row.kind === "warehouse"
              ? "Central warehouse"
              : `${row.district} · Distributor`}
          </small>
        </span>
      </div>
      <div>
        <small>AVAILABLE</small>
        <strong>
          {row.balance.known ? number(row.balance.available) : "Unknown"}{" "}
          <em>{row.balance.known && product.base_unit + "s"}</em>
        </strong>
      </div>
      <div>
        <small>NOMINAL COVER</small>
        <strong>
          {row.days_of_cover == null
            ? "—"
            : `${number(row.days_of_cover, 1)} days`}
        </strong>
      </div>
      <div>
        <small>NEXT SHORTAGE</small>
        <strong className={row.shortage_date ? "text-coral" : ""}>
          {row.shortage_date
            ? dateLabel(row.shortage_date)
            : row.status === "unknown"
              ? "Unknown"
              : "No risk projected"}
        </strong>
      </div>
      <button
        className="button primary compact"
        onClick={onResolve}
        disabled={!allowed}
      >
        Find supply
        <ArrowRight size={15} />
      </button>
      <button
        className="icon-button"
        title="Location stock and projection evidence"
        aria-label="Location stock and projection evidence"
        onClick={onEvidence}
      >
        <CircleHelp size={18} />
      </button>
    </div>
  );
}
function NetworkTable({
  rows,
  selected,
  asOf,
  onSelect,
  onResolve,
  canPlan,
}: {
  rows: NetworkRow[];
  selected: string;
  asOf: string;
  onSelect: (id: string) => void;
  onResolve: (row: NetworkRow) => void;
  canPlan: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Location</th>
            <th>Available</th>
            <th>Reserved</th>
            <th>Nominal cover</th>
            <th>Supply outlook</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.location_id}
              className={selected === r.location_id ? "selected-row" : ""}
            >
              <td>
                <button
                  className="location-cell"
                  onClick={() => onSelect(r.location_id)}
                >
                  <span className={`site-dot ${riskLevel(r, asOf)}`} />
                  <span>
                    <strong>{shortLocation(r.name)}</strong>
                    <small>
                      {r.kind === "warehouse"
                        ? "Central warehouse"
                        : r.district}
                    </small>
                  </span>
                </button>
              </td>
              <td className="number-cell">
                {r.balance.known ? number(r.balance.available) : "Unknown"}
              </td>
              <td>{number(r.balance.reserved)}</td>
              <td>
                {r.days_of_cover == null ? "—" : number(r.days_of_cover, 1)}
                {r.days_of_cover != null && (
                  <span className="unit-muted"> days</span>
                )}
              </td>
              <td>
                <Badge tone={riskLevel(r, asOf)}>
                  {r.status === "unknown"
                    ? "Missing data"
                    : r.shortage_date
                      ? `Risk ${dateLabel(r.shortage_date)}`
                      : "Covered"}
                </Badge>
              </td>
              <td>
                <button
                  className="row-action"
                  disabled={!canPlan}
                  onClick={() => onResolve(r)}
                >
                  Review
                  <ArrowRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty title="No matching locations">
          Clear the filters to see your network.
        </Empty>
      )}
    </div>
  );
}
function ActionCentre({
  data,
  actions,
  onAction,
  onReceipt,
}: {
  data: Data;
  actions: Action[];
  onAction: (x: Action) => void;
  onReceipt: (x: Shipment) => void;
}) {
  const [filter, setFilter] = useState("all");
  const completed: Action[] = data.plans
    .filter((p) => p.status === "completed")
    .map((p) => ({
      id: p.id,
      ref: p.id,
      kind: "plan",
      title: `${shortLocation(data.locations.find((l) => l.id === p.source_id)?.name || "Source")} → ${shortLocation(data.locations.find((l) => l.id === p.destination_id)?.name || "Destination")}`,
      description: `${number(p.quantity)} units received`,
      location: p.destination_id,
      product: shortProduct(
        data.products.find((x) => x.id === p.product_id)?.name || "Medicine",
      ),
      severity: "neutral",
      label: "Completed",
      metric: "Delivery complete",
      progress: 4,
      nextLabel: "View record",
    }));
  const shown =
    filter === "complete"
      ? completed
      : actions.filter(
          (x) =>
            filter === "all" ||
            (filter === "review"
              ? x.kind === "request" || x.progress === 1
              : filter === "dispatch"
                ? x.progress === 2 || x.pendingDispatch
                : filter === "receive"
                  ? x.progress === 3 || x.pendingReceipt
                  : filter === "critical"
                    ? x.severity === "critical"
                    : x.kind === filter),
        );
  const incoming = data.shipments.filter((s) =>
    s.lines.some((x) => x.received < x.quantity),
  );
  return (
    <>
      <section className="panel">
        <SectionTitle
          eyebrow="PRIORITISED WORK"
          title="Your next actions"
          action={<Badge>{actions.length} open items</Badge>}
        >
          Select an order to continue from its current step.
        </SectionTitle>
        <div className="order-lanes" aria-label="Filter orders by next step">
          {[
            ["all", "All actions"],
            ["review", "Review"],
            ["dispatch", "Dispatch"],
            ["receive", "Receive"],
            ["complete", "Completed"],
            ["case", "Exceptions"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="action-grid">
          {shown.map((item) => (
            <ActionCard
              key={item.id}
              item={item}
              onClick={() => onAction(item)}
            />
          ))}
        </div>
        {!shown.length && (
          <Empty title="Nothing waiting here">
            Other work is available in the All actions tab.
          </Empty>
        )}
      </section>
      <section className="panel">
        <SectionTitle
          title="Deliveries awaiting receipt"
          action={<Truck size={21} />}
        >
          Check physical quantities before confirming delivery.
        </SectionTitle>
        {incoming.length ? (
          <div className="shipment-grid">
            {incoming.map((s) => (
              <div className="shipment-card" key={s.id}>
                <div>
                  <Badge tone="blue">In transit</Badge>
                  <span className="mono">{s.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <h3>
                  {shortLocation(
                    data.locations.find((x) => x.id === s.source_id)?.name ||
                      "Source",
                  )}
                  <ArrowRight size={16} />
                  {shortLocation(
                    data.locations.find((x) => x.id === s.destination_id)
                      ?.name || "Destination",
                  )}
                </h3>
                <p>
                  {number(
                    s.lines.reduce((a, x) => a + x.quantity - x.received, 0),
                  )}{" "}
                  units to confirm · expected {dateLabel(s.expected_on)}
                </p>
                <button
                  className="button secondary"
                  disabled={
                    !hasRole(data, "operator", "manager") ||
                    !canLocation(data, s.destination_id)
                  }
                  onClick={() => onReceipt(s)}
                >
                  <PackageCheck size={16} />
                  Record receipt
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No receipts waiting">
            Dispatched shipments will appear here until their quantities are
            confirmed.
          </Empty>
        )}
      </section>
    </>
  );
}
function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="A connected operating picture"
      eyebrow="QUICK GUIDE"
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="guide-steps">
          {[
            [
              "01",
              "See the risk",
              "Choose a medicine, horizon and location on the map.",
            ],
            [
              "02",
              "Review a response",
              "Compare sources, quantity, arrival and batch eligibility.",
            ],
            [
              "03",
              "Approve and execute",
              "Approval reserves stock. Dispatch moves it into transit.",
            ],
            [
              "04",
              "Close the loop",
              "Record receipt, resolve damage and verify the ledger.",
            ],
          ].map(([n, t, p]) => (
            <div key={n}>
              <b>{n}</b>
              <span>
                <strong>{t}</strong>
                <p>{p}</p>
              </span>
            </div>
          ))}
        </div>
        <div className="notice">
          <Database size={18} />
          <p>
            Use Data sources to inspect the origin of records. Use Operations
            log to trace stock changes.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function LocationDialog({
  data,
  row,
  product,
  asOf,
  onClose,
  onForecast,
}: {
  data: Data;
  row: NetworkRow;
  product: Product;
  asOf: string;
  onClose: () => void;
  onForecast: () => void;
}) {
  const batches = data.batches.filter(
    (b) => b.location_id === row.location_id && b.product_id === product.id,
  );
  return (
    <Modal
      title={shortLocation(row.name)}
      eyebrow="LOCATION · STOCK & EVIDENCE"
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="medicine-callout">
          <PackageCheck size={24} />
          <div>
            <strong>{shortProduct(product.name)}</strong>
            <span>
              {row.district} · {row.kind}
            </span>
          </div>
          <Badge tone={riskLevel(row, asOf)}>
            {row.status === "unknown"
              ? "Missing data"
              : row.shortage_date
                ? "Risk projected"
                : "Covered"}
          </Badge>
        </div>
        <div className="detail-grid">
          <div>
            <small>Physical units</small>
            <strong>
              {row.balance.known ? number(row.balance.physical) : "Unknown"}
            </strong>
          </div>
          <div>
            <small>Available after reservations</small>
            <strong>
              {row.balance.known ? number(row.balance.available) : "Unknown"}
            </strong>
          </div>
          <div>
            <small>Reserved units</small>
            <strong>{number(row.balance.reserved)}</strong>
          </div>
          <div>
            <small>Confirmed in transit</small>
            <strong>{number(row.inbound_units)} units</strong>
          </div>
          <div>
            <small>Historical daily demand</small>
            <strong>{number(row.daily_rate, 1)} units</strong>
          </div>
          <div>
            <small>Projected shortage</small>
            <strong>
              {row.shortage_date
                ? dateLabel(row.shortage_date, true)
                : row.status === "unknown"
                  ? "Unknown"
                  : "None in horizon"}
            </strong>
          </div>
        </div>
        <div className="notice">
          <ShieldCheck size={18} />
          <p>
            <strong>Projection basis</strong>
            <br />
            {row.projection_method}. Nominal cover divides current availability
            by historical daily demand; expiry and dated arrivals can cause an
            earlier shortage. {row.history_days} history days · stock age{" "}
            {number(row.stock_age_hours, 1)} hours.
          </p>
        </div>
        <div className="subsection-heading">
          <h3>Batch position</h3>
          <span>Snapshot {dateLabel(asOf, true)}</span>
        </div>
        <div className="batch-summary">
          {batches.map((b) => (
            <div key={b.id}>
              <span>{b.code}</span>
              <span>
                {number(b.quantity)} units · {number(b.reserved)} reserved
              </span>
              <span>
                {b.expiry <= asOf ? "Expired" : title(b.status)} · expiry{" "}
                {dateLabel(b.expiry)}
              </span>
            </div>
          ))}
          {!batches.length && (
            <Empty title="No declared batch position">
              Missing stock is not interpreted as zero.
            </Empty>
          )}
        </div>
        <p className="body-muted location-provenance">
          {row.coordinate_source}. {title(row.evidence_type)} operating data.
        </p>
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Close
        </button>
        <button className="button primary" onClick={onForecast}>
          Open forecast evidence
          <ArrowRight size={16} />
        </button>
      </footer>
    </Modal>
  );
}
