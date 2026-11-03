import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  PackageCheck,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Truck,
  XCircle,
} from "lucide-react";
import { api, command } from "./api";
import type {
  Batch,
  Case,
  Data,
  Explanation,
  Option,
  Plan,
  Product,
  Shipment,
} from "./types";
import {
  canLocation,
  dateLabel,
  daysBetween,
  hasRole,
  money,
  number,
  remainingDispatch,
  shortLocation,
  shortProduct,
  title,
} from "./utils";
import { Badge, Empty, Loading, Modal } from "./ui";
import { Details, NextStep, WorkflowProgress } from "./WorkflowProgress";
import { supplyFlow, supplySteps } from "../../shared/workflow";

type Base = {
  data: Data;
  asOf: string;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
};
export function ResolveDialog({
  data,
  product,
  locationId,
  asOf,
  onClose,
  onDone,
  requestId,
  shortageDate,
}: {
  data: Data;
  product: Product;
  locationId: string;
  asOf: string;
  onClose: () => void;
  onDone: (p: Plan) => Promise<void>;
  requestId?: string;
  shortageDate?: string | null;
}) {
  const existing = data.requests.find((x) => x.id === requestId);
  const [dest, setDest] = useState(locationId),
    [quantity, setQuantity] = useState(
      existing
        ? existing.quantity - existing.fulfilled - existing.cancelled
        : product.pack_size,
    ),
    [needed, setNeeded] = useState(
      existing?.needed_by ||
        shortageDate ||
        new Date(new Date(asOf + "T12:00:00").getTime() + 7 * 86400000)
          .toISOString()
          .slice(0, 10),
    ),
    [reason, setReason] = useState(
      existing?.reason || "Replenishment to address projected shortage",
    ),
    [options, setOptions] = useState<Option[]>([]),
    [optionsFor, setOptionsFor] = useState(""),
    [source, setSource] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [createdRequest, setCreatedRequest] = useState<string | null>(null);
  const eligible =
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    quantity % product.pack_size === 0;
  const optionsKey = JSON.stringify([product.id, dest, quantity, asOf]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOptions([]);
    setOptionsFor("");
    const timeout = setTimeout(() => {
      if (!eligible) {
        setOptions([]);
        setLoading(false);
        return;
      }
      api<{ options: Option[] }>(
        `/planning/options?product_id=${encodeURIComponent(product.id)}&destination_id=${encodeURIComponent(dest)}&quantity=${quantity}&as_of=${asOf}`,
      )
        .then((r) => {
          if (cancelled) return;
          setOptions(r.options);
          setOptionsFor(optionsKey);
          setSource((previous) =>
            r.options.some((x) => x.source_id === previous && x.feasible)
              ? previous
              : r.options.find(
                  (x) =>
                    x.feasible &&
                    data.locations.find((l) => l.id === x.source_id)?.kind !==
                      "warehouse",
                )?.source_id ||
                r.options.find((x) => x.feasible)?.source_id ||
                "",
          );
          setError("");
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [dest, quantity, eligible, product.id, asOf, data.locations]);
  const choice =
    !loading && optionsFor === optionsKey
      ? options.find((x) => x.source_id === source && x.feasible)
      : undefined;
  const destination = data.locations.find((x) => x.id === dest);
  const sourceLocation = data.locations.find((x) => x.id === source);
  async function create() {
    if (!choice) return;
    setBusy(true);
    setError("");
    try {
      let requestId = existing?.id || createdRequest;
      if (!requestId) {
        const request = await command<{ id: string }>("/requests", {
          product_id: product.id,
          destination_id: dest,
          quantity,
          needed_by: needed,
          reason,
        });
        requestId = request.id;
        setCreatedRequest(request.id);
      }
      const plan = await command<Plan>("/plans", {
        source_id: source,
        destination_id: dest,
        product_id: product.id,
        quantity,
        as_of: asOf,
        request_id: requestId,
      });
      await onDone(plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      busy={busy}
      title="Create supply plan"
      eyebrow="NEW SUPPLY PLAN"
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <WorkflowProgress
          steps={supplySteps}
          stage={0}
          label="Supply progress"
        />
        <div className="medicine-callout">
          <span className="medicine-icon">
            <PackageOpen size={23} />
          </span>
          <div>
            <strong>{shortProduct(product.name)}</strong>
            <span>
              {product.base_unit} · {product.pack_size} per pack
            </span>
          </div>
        </div>
        <div className="form-grid three">
          <label>
            Destination
            <select
              value={dest}
              disabled={busy || !!existing || !!createdRequest}
              onChange={(e) => setDest(e.target.value)}
            >
              {data.locations
                .filter((x) => canLocation(data, x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {shortLocation(x.name)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Quantity · {product.base_unit}s
            <input
              aria-label="Plan quantity"
              disabled={busy || !!createdRequest}
              type="number"
              min={product.pack_size}
              step={product.pack_size}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label>
            Needed by
            <input
              type="date"
              disabled={busy || !!createdRequest || !!existing}
              min={asOf}
              value={needed}
              onChange={(e) => setNeeded(e.target.value)}
            />
          </label>
        </div>
        {!eligible && (
          <div className="inline-error">
            Enter a positive quantity in multiples of {product.pack_size}.
          </div>
        )}
        {choice?.evidence &&
          ((shortageDate && choice.evidence.arrival_date > shortageDate) ||
            choice.evidence.arrival_date > needed) && (
            <div className="notice delivery-risk">
              <TriangleAlert size={18} />
              <p>
                <strong>Delivery timing needs attention.</strong> Arrival is
                estimated for {dateLabel(choice.evidence.arrival_date)}
                {shortageDate
                  ? `, after the projected shortage on ${dateLabel(shortageDate)}`
                  : `; your requested date is ${dateLabel(needed)}`}
                . Arrange earlier supply for the uncovered period.
              </p>
            </div>
          )}
        <div className="subsection-heading">
          <h3>Compare available sources</h3>
          <span>Checked against stock, shelf life and route rules</span>
        </div>
        {loading ? (
          <Loading label="Checking feasible sources" />
        ) : (
          <div className="source-options">
            {options.map((option) => {
              const loc = data.locations.find((x) => x.id === option.source_id);
              return (
                <button
                  key={option.source_id}
                  className={`source-option ${source === option.source_id ? "chosen" : ""} ${!option.feasible ? "unavailable" : ""}`}
                  disabled={busy || !option.feasible}
                  onClick={() => setSource(option.source_id)}
                >
                  <span className="radio-dot">
                    {source === option.source_id && <Check size={12} />}
                  </span>
                  <div>
                    <strong>{shortLocation(loc?.name || "Source")}</strong>
                    <span>
                      {option.feasible
                        ? `${loc?.kind === "warehouse" ? "Warehouse replenishment" : "Distributor transfer"} · ${option.evidence?.minimum_shelf_days}+ days shelf life on arrival`
                        : option.reason}
                    </span>
                  </div>
                  {option.feasible ? (
                    <div className="source-estimate">
                      <strong>
                        {dateLabel(option.evidence?.arrival_date)}
                      </strong>
                      <span>estimated arrival</span>
                    </div>
                  ) : (
                    <XCircle size={18} />
                  )}
                </button>
              );
            })}
            {!options.length && eligible && (
              <Empty title="No sources available">
                Check the location, quantity and authorised network.
              </Empty>
            )}
          </div>
        )}
        {choice?.evidence && (
          <div className="decision-summary">
            <div>
              <small>PROPOSED MOVEMENT</small>
              <strong>
                {shortLocation(sourceLocation?.name || "Source")}
                <ArrowRight size={15} />
                {shortLocation(destination?.name || "Destination")}
              </strong>
            </div>
            <div>
              <small>INDICATIVE COST</small>
              <strong>{money(choice.evidence.cost_paise)}</strong>
            </div>
            <div>
              <small>DONOR PROTECTED</small>
              <strong>{number(choice.evidence.donor_protected)} units</strong>
            </div>
          </div>
        )}
        <label className="full-label">
          Reason for this request
          <textarea
            disabled={busy || !!createdRequest || !!existing}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </label>
        <div className="notice">
          <ShieldCheck size={18} />
          <p>Next: a manager reviews and approves this plan.</p>
        </div>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          onClick={create}
          disabled={
            loading ||
            !choice ||
            !eligible ||
            busy ||
            reason.trim().length < 3 ||
            !needed
          }
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <FileCheck2 size={16} />
          )}
          Create plan for review
          <ArrowRight size={16} />
        </button>
      </footer>
    </Modal>
  );
}

export function RescueDialog({
  data,
  locationId,
  product,
  asOf,
  onClose,
  onDone,
}: {
  data: Data;
  locationId: string;
  product: Product;
  asOf: string;
  onClose: () => void;
  onDone: (p: Plan) => Promise<void>;
}) {
  const createdRequests = useRef(new Map<string, string>());
  const [candidates, setCandidates] = useState<
      {
        source_id: string;
        destination_id: string;
        product_id: string;
        quantity: number;
        expiry: string;
        evidence: Explanation;
      }[]
    >([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let done = false;
    api<{ candidates: typeof candidates }>(
      `/planning/expiry-rescue?as_of=${asOf}&within_days=60`,
    )
      .then((x) => {
        if (!done)
          setCandidates(
            x.candidates.filter(
              (c) => c.source_id === locationId && c.product_id === product.id,
            ),
          );
      })
      .catch((e) => {
        if (!done) setError(e.message);
      })
      .finally(() => {
        if (!done) setLoading(false);
      });
    return () => {
      done = true;
    };
  }, [asOf, locationId, product.id]);
  async function create(c: (typeof candidates)[number]) {
    setBusy(true);
    try {
      const identity = JSON.stringify(c);
      let requestId = createdRequests.current.get(identity);
      if (!requestId) {
        const r = await command<{ id: string }>("/requests", {
          product_id: product.id,
          destination_id: c.destination_id,
          quantity: c.quantity,
          needed_by: c.evidence.arrival_date,
          reason:
            "Expiry rescue: transfer eligible stock to a location with forecast use",
        });
        requestId = r.id;
        createdRequests.current.set(identity, r.id);
      }
      const p = await command<Plan>("/plans", {
        source_id: c.source_id,
        destination_id: c.destination_id,
        product_id: product.id,
        quantity: c.quantity,
        as_of: asOf,
        request_id: requestId,
      });
      await onDone(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      busy={busy}
      title="Give short-dated stock a useful destination"
      eyebrow="EXPIRY RESCUE"
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <p className="body-muted">
          {shortProduct(product.name)} ·{" "}
          {shortLocation(
            data.locations.find((x) => x.id === locationId)?.name || "Source",
          )}
          . Candidates protect donor needs and account for recipient stock and
          remaining shelf life.
        </p>
        {loading ? (
          <Loading label="Checking eligible recipients" />
        ) : candidates.length ? (
          <div className="rescue-list">
            {candidates.map((c, i) => (
              <div className="rescue-card" key={i}>
                <div>
                  <Badge tone="green">Eligible transfer</Badge>
                  <h3>
                    {shortLocation(
                      data.locations.find((x) => x.id === c.destination_id)
                        ?.name || "Recipient",
                    )}
                  </h3>
                  <p>
                    {number(c.quantity)} units · arrive{" "}
                    {dateLabel(c.evidence.arrival_date)} · batch expiry{" "}
                    {dateLabel(c.expiry)}
                  </p>
                  <span>
                    Donor protection: {number(c.evidence.donor_protected)} units
                    · {money(c.evidence.cost_paise)}
                  </span>
                </div>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => create(c)}
                >
                  Create rescue plan
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No eligible rescue transfer found">
            Current demand, donor protection, route or shelf-life constraints
            prevent a supported transfer. Review the stock; do not move it
            solely to improve a metric.
          </Empty>
        )}
        {error && <div className="inline-error">{error}</div>}
        <div className="notice">
          <ShieldCheck size={18} />
          <p>
            These are alternatives, not reserved commitments. Each proposal is
            revalidated before approval.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function PlanDialog({
  data,
  plan,
  asOf,
  onClose,
  onDone,
  onReceipt,
}: Base & { plan: Plan; onReceipt: (s: Shipment) => void }) {
  const current = data.plans.find((x) => x.id === plan.id) || plan;
  const flow = supplyFlow(data, current);
  const [quantity, setQuantity] = useState(flow.unshipped),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cancelling, setCancelling] = useState(false),
    [reason, setReason] = useState("");
  const product = data.products.find((x) => x.id === current.product_id),
    source = data.locations.find((x) => x.id === current.source_id),
    dest = data.locations.find((x) => x.id === current.destination_id);
  const managerAccess =
    hasRole(data, "manager") &&
    canLocation(data, current.source_id) &&
    canLocation(data, current.destination_id);
  useEffect(() => setQuantity(flow.unshipped), [flow.unshipped]);
  async function run(action: "approve" | "dispatch" | "cancel" | "revise") {
    setBusy(true);
    setError("");
    try {
      await command(
        `/plans/${current.id}/${action}`,
        action === "revise"
          ? {
              source_id: current.source_id,
              destination_id: current.destination_id,
              product_id: current.product_id,
              quantity: current.quantity,
              request_id: current.request_id,
              as_of: asOf,
            }
          : action === "approve"
            ? { version: current.version, as_of: asOf }
            : action === "dispatch"
              ? { quantity, as_of: asOf }
              : { reason },
      );
      await onDone(
        action === "revise"
          ? "Plan updated. Review and approve the new version."
          : action === "approve"
            ? "Plan approved. Ready to dispatch."
            : action === "dispatch"
              ? "Dispatch recorded. Next: confirm delivery at the destination."
              : "Unshipped stock released. Dispatched deliveries remain tracked.",
      );
      setCancelling(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const validQuantity =
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    quantity <= flow.unshipped &&
    quantity % (product?.pack_size || 1) === 0;
  return (
    <Modal
      busy={busy}
      title="Supply plan"
      eyebrow={`PLAN ${current.id.slice(0, 8).toUpperCase()}`}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <WorkflowProgress
          steps={supplySteps}
          stage={flow.stage}
          partialStep={flow.partialDispatch ? 2 : undefined}
          cancelled={flow.cancelled}
          label="Supply progress"
        />
        <div className="plan-route">
          <div>
            <small>FROM</small>
            <strong>{shortLocation(source?.name || "Source")}</strong>
          </div>
          <span className="route-arrow">
            <ArrowRight size={22} />
          </span>
          <div>
            <small>TO</small>
            <strong>{shortLocation(dest?.name || "Destination")}</strong>
          </div>
          <Badge
            tone={
              flow.stage === 4 ? "green" : flow.cancelled ? "neutral" : "blue"
            }
          >
            {flow.label}
          </Badge>
        </div>
        <div className="plan-medicine">
          <PackageOpen size={22} />
          <strong>{shortProduct(product?.name || "Medicine")}</strong>
          <span>{number(current.quantity)} units</span>
        </div>
        <div className="fulfilment-totals">
          <div>
            <small>To dispatch</small>
            <strong>{number(flow.cancelled ? 0 : flow.unshipped)}</strong>
          </div>
          <div>
            <small>In transit</small>
            <strong>{number(flow.outstanding)}</strong>
          </div>
          <div>
            <small>Received</small>
            <strong>{number(flow.received)}</strong>
            {flow.damaged > 0 && (
              <small>
                {number(flow.accepted)} usable · {number(flow.damaged)}{" "}
                quarantined
              </small>
            )}
          </div>
          <div>
            <small>Expected arrival</small>
            <strong>{dateLabel(current.arrival_date)}</strong>
          </div>
        </div>
        <NextStep
          title={
            flow.stage === 4
              ? "Delivery complete"
              : flow.cancelled && !flow.outstanding
                ? "Plan cancelled"
                : "Next step"
          }
          complete={flow.stage === 4}
        >
          {flow.instruction}
        </NextStep>
        {flow.canDispatch && (
          <label className="full-label dispatch-field">
            Dispatch quantity
            <input
              aria-label="Dispatch quantity"
              type="number"
              min={product?.pack_size || 1}
              step={product?.pack_size || 1}
              max={flow.unshipped}
              value={quantity}
              disabled={busy}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
            <small>
              {number(flow.unshipped)} units available to dispatch · packs of{" "}
              {product?.pack_size || 1}
            </small>
            {!validQuantity && (
              <span className="text-coral">
                Enter whole packs within the remaining quantity.
              </span>
            )}
          </label>
        )}
        {!!flow.shipments.length && (
          <div className="shipment-trail">
            {flow.shipments.map((shipment) => {
              const outstanding = shipment.lines.reduce(
                (n, l) => n + l.quantity - l.received,
                0,
              );
              return (
                <div key={shipment.id}>
                  <span className="trail-icon">
                    <Truck size={17} />
                  </span>
                  <div>
                    <strong>
                      Delivery {shipment.id.slice(0, 8).toUpperCase()}
                    </strong>
                    <small>
                      {outstanding
                        ? `${number(outstanding)} units awaiting receipt`
                        : "All quantities received"}{" "}
                      · {dateLabel(shipment.expected_on)}
                    </small>
                  </div>
                  {outstanding ? (
                    <button
                      className="button secondary compact"
                      disabled={
                        busy ||
                        !hasRole(data, "operator", "manager") ||
                        !canLocation(data, shipment.destination_id)
                      }
                      onClick={() => onReceipt(shipment)}
                    >
                      Record receipt <ArrowRight size={14} />
                    </button>
                  ) : (
                    <Badge tone="green">Received</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {data.requests.some(
          (r) =>
            r.id === current.request_id && current.arrival_date > r.needed_by,
        ) && (
          <div className="notice delivery-risk">
            <TriangleAlert size={18} />
            <p>
              Arrival is after the requested date. Arrange earlier supply for
              the uncovered period.
            </p>
          </div>
        )}
        <Details title="Batch allocation & planning details">
          <div className="detail-grid">
            <div>
              <small>Minimum arrival shelf life</small>
              <strong>{current.explanation.minimum_shelf_days} days</strong>
            </div>
            <div>
              <small>Protected at source</small>
              <strong>
                {number(current.explanation.donor_protected)} units
              </strong>
            </div>
            <div>
              <small>Indicative cost</small>
              <strong>{money(current.explanation.cost_paise)}</strong>
            </div>
            <div>
              <small>Plan version</small>
              <strong>{current.version}</strong>
            </div>
          </div>
          <div className="batch-summary">
            {current.explanation.allocations.map((a) => {
              const batch = data.batches.find((b) => b.id === a.batch_id);
              return (
                <div key={a.batch_id}>
                  <span>{batch?.code || a.batch_id.slice(0, 8)}</span>
                  <span>{number(a.quantity)} units</span>
                  <span>Expires {dateLabel(batch?.expiry)}</span>
                </div>
              );
            })}
          </div>
          <p className="body-muted">{current.explanation.policy_source}</p>
        </Details>
        {!flow.cancelled && flow.stage !== 4 && (
          <Details title="Change or cancel this plan">
            {current.status === "proposed" &&
              hasRole(data, "planner", "manager") &&
              canLocation(data, current.source_id) &&
              canLocation(data, current.destination_id) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => run("revise")}
                >
                  Revalidate proposal
                </button>
              )}
            {managerAccess && (
              <div className="exception-actions">
                <p>
                  Cancellation releases unshipped stock. Deliveries already
                  dispatched still need a receipt.
                </p>
                {!cancelling ? (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => setCancelling(true)}
                  >
                    Cancel unshipped plan
                  </button>
                ) : (
                  <>
                    <label className="full-label">
                      Reason for cancellation
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why is the remaining plan being cancelled?"
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setCancelling(false)}
                    >
                      Keep plan
                    </button>
                    <button
                      className="button danger"
                      disabled={busy || reason.trim().length < 3}
                      onClick={() => run("cancel")}
                    >
                      Confirm cancellation
                    </button>
                  </>
                )}
              </div>
            )}
          </Details>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
            {error.toLowerCase().includes("stale") && (
              <p>
                Refresh, then revalidate the proposal under “Change or cancel
                this plan”.
              </p>
            )}
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
        <div className="footer-buttons">
          {flow.next === "receive" && flow.canDispatch && (
            <button
              className="button secondary"
              disabled={busy || cancelling || !validQuantity}
              onClick={() => run("dispatch")}
            >
              Dispatch remaining stock
            </button>
          )}
          {flow.next === "approve" && (
            <button
              className="button primary"
              disabled={busy || cancelling}
              onClick={() => run("approve")}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ShieldCheck size={17} />
              )}
              Approve & reserve
            </button>
          )}
          {flow.next === "dispatch" && (
            <button
              className="button primary"
              disabled={busy || cancelling || !validQuantity}
              onClick={() => run("dispatch")}
            >
              <Truck size={16} />
              Dispatch stock
            </button>
          )}
          {flow.next === "receive" && flow.receipt && (
            <button
              className="button primary"
              disabled={busy || cancelling}
              onClick={() => onReceipt(flow.receipt!)}
            >
              <PackageCheck size={17} />
              Record receipt
            </button>
          )}
        </div>
      </footer>
    </Modal>
  );
}

export function ReceiptDialog({
  data,
  shipment,
  asOf,
  onClose,
  onDone,
}: Base & { shipment: Shipment }) {
  const current = data.shipments.find((x) => x.id === shipment.id) || shipment;
  const [lines, setLines] = useState(
      current.lines
        .filter((x) => x.quantity > x.received)
        .map((x) => ({
          line_id: x.id,
          accepted: x.quantity - x.received,
          damaged: 0,
          reason: "",
        })),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receiver, setReceiver] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [shortLines, setShortLines] = useState<string[]>([]);
  const dest = data.locations.find((x) => x.id === current.destination_id);
  const valid =
    confirmed &&
    receiver.trim().length >= 2 &&
    reference.trim().length >= 3 &&
    hasRole(data, "operator", "manager") &&
    canLocation(data, current.destination_id) &&
    (lines.some((x) => x.accepted + x.damaged > 0) || shortLines.length > 0) &&
    shortLines.every((id) => {
      const line = lines.find((l) => l.line_id === id),
        original = current.lines.find((l) => l.id === id);
      return (
        line &&
        original &&
        line.accepted + line.damaged < original.quantity - original.received
      );
    }) &&
    lines.every(
      (x) =>
        Number.isSafeInteger(x.accepted) &&
        Number.isSafeInteger(x.damaged) &&
        x.accepted >= 0 &&
        x.damaged >= 0 &&
        x.accepted + x.damaged <=
          current.lines.find((l) => l.id === x.line_id)!.quantity -
            current.lines.find((l) => l.id === x.line_id)!.received &&
        (!x.damaged || x.reason.trim().length >= 3),
    );
  function update(index: number, key: string, value: string | number) {
    setLines((prev) =>
      prev.map((x, i) => (i === index ? { ...x, [key]: value } : x)),
    );
  }
  async function receive() {
    setBusy(true);
    try {
      await command(`/shipments/${current.id}/proof`, {
        receiver: receiver.trim(),
        reference: reference.trim(),
        confirmed,
        short_lines: shortLines,
        as_of: asOf,
        lines: lines.filter((x) => x.accepted + x.damaged > 0),
      });
      await onDone(
        "Receipt recorded. Accepted stock and quarantined damage are reconciled.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      busy={busy}
      title="Record delivery"
      eyebrow="RECEIPT CONFIRMATION"
      onClose={onClose}
    >
      <div className="modal-body">
        <WorkflowProgress
          steps={supplySteps}
          stage={3}
          label="Supply progress"
        />
        <div className="receipt-destination">
          <span className="location-icon healthy">
            <PackageCheck size={25} />
          </span>
          <div>
            <small>RECEIVING AT</small>
            <h3>{shortLocation(dest?.name || "Destination")}</h3>
            <p>
              Shipment {current.id.slice(0, 8).toUpperCase()} · expected{" "}
              {dateLabel(current.expected_on)}
            </p>
          </div>
        </div>
        <NextStep title="Check the delivery">
          Enter the quantities physically received at this location.
        </NextStep>
        {lines.map((line, index) => {
          const source = current.lines.find((x) => x.id === line.line_id)!;
          const batch = data.batches.find(
            (x) => x.id === source.source_batch_id,
          );
          return (
            <div className="receipt-line" key={line.line_id}>
              <div>
                <strong>
                  {source.batch_code || batch?.code || line.line_id.slice(0, 8)}
                </strong>
                <Badge>
                  {number(source.quantity - source.received)} remaining
                </Badge>
              </div>
              <div className="form-grid">
                <label>
                  Accepted units
                  <input
                    aria-label={`Accepted units ${index + 1}`}
                    type="number"
                    min="0"
                    max={source.quantity - source.received}
                    value={line.accepted}
                    onChange={(e) =>
                      update(index, "accepted", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Damaged / quarantined
                  <input
                    aria-label={`Damaged units ${index + 1}`}
                    type="number"
                    min="0"
                    value={line.damaged}
                    onChange={(e) =>
                      update(index, "damaged", Number(e.target.value))
                    }
                  />
                </label>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={shortLines.includes(line.line_id)}
                  onChange={(e) =>
                    setShortLines((prev) =>
                      e.target.checked
                        ? [...prev, line.line_id]
                        : prev.filter((id) => id !== line.line_id),
                    )
                  }
                />
                Report a short delivery
              </label>
              {line.damaged > 0 && (
                <label className="full-label">
                  Damage / discrepancy reason
                  <textarea
                    rows={2}
                    value={line.reason}
                    onChange={(e) => update(index, "reason", e.target.value)}
                    placeholder="Describe the discrepancy"
                  />
                </label>
              )}
            </div>
          );
        })}
        <div className="form-grid">
          <label>
            Receiver name
            <input
              value={receiver}
              maxLength={120}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="Who checked the delivery?"
            />
          </label>
          <label>
            Delivery document / discrepancy reference
            <input
              value={reference}
              maxLength={120}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Delivery note or reference"
            />
          </label>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I checked batch, expiry and physical quantities with the receiver.
        </label>
        <div className="notice">
          <LockKeyhole size={18} />
          <p>
            Accepted units enter stock. Damaged units go to quarantine.
            Unreceived units stay in transit.
          </p>
        </div>
        <div className="receipt-summary" aria-live="polite">
          <strong>
            {number(lines.reduce((n, l) => n + l.accepted, 0))} accepted
          </strong>
          <span>
            {number(lines.reduce((n, l) => n + l.damaged, 0))} damaged
          </span>
          <span>
            {number(
              Math.max(
                0,
                current.lines.reduce((n, l) => n + l.quantity - l.received, 0) -
                  lines.reduce((n, l) => n + l.accepted + l.damaged, 0),
              ),
            )}{" "}
            still in transit
          </span>
        </div>
        {!valid && (
          <p className="validation-hint">
            Complete receiver details and check quantities before confirming.
          </p>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Back
        </button>
        <button
          className="button primary"
          disabled={!valid || busy}
          onClick={receive}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <CheckCircle2 size={17} />
          )}
          Confirm receipt
        </button>
      </footer>
    </Modal>
  );
}

export function StockDialog({
  data,
  batch,
  asOf,
  onClose,
  onDone,
}: Base & { batch: Batch }) {
  const current = data.batches.find((x) => x.id === batch.id) || batch;
  const [status, setStatus] = useState(current.status),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"status" | "count">("status"),
    [count, setCount] = useState(current.quantity);
  const p = data.products.find((x) => x.id === current.product_id);
  async function submit() {
    setBusy(true);
    try {
      await command(
        `/inventory/batches/${current.id}/${mode}`,
        mode === "status" ? { status, reason } : { quantity: count, reason },
      );
      await onDone(
        mode === "status"
          ? "Batch disposition updated. Planning will use the new eligibility."
          : "Physical count recorded as a review case. Stock was not silently overwritten.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      busy={busy}
      title="Batch detail & control"
      eyebrow={current.code}
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="medicine-callout">
          <PackageOpen size={24} />
          <div>
            <strong>{shortProduct(p?.name || "Medicine")}</strong>
            <span>
              {shortLocation(
                data.locations.find((x) => x.id === current.location_id)
                  ?.name || "Location",
              )}
            </span>
          </div>
          <Badge tone={current.status === "usable" ? "green" : "warning"}>
            {title(current.status)}
          </Badge>
        </div>
        <div className="detail-grid">
          <div>
            <small>Physical stock</small>
            <strong>{number(current.quantity)}</strong>
          </div>
          <div>
            <small>Reserved</small>
            <strong>{number(current.reserved)}</strong>
          </div>
          <div>
            <small>Expiry date</small>
            <strong>{dateLabel(current.expiry, true)}</strong>
          </div>
          <div>
            <small>Remaining shelf life</small>
            <strong>{daysBetween(asOf, current.expiry)} days</strong>
          </div>
        </div>
        <div className="tabs">
          <button
            className={mode === "status" ? "active" : ""}
            onClick={() => setMode("status")}
          >
            Disposition
          </button>
          <button
            className={mode === "count" ? "active" : ""}
            onClick={() => setMode("count")}
          >
            Physical count
          </button>
        </div>
        {mode === "status" ? (
          <label className="full-label">
            Batch disposition
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {[
                "usable",
                "quarantined",
                "damaged",
                "return_pending",
                "blocked",
              ].map((x) => (
                <option value={x} key={x}>
                  {title(x)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="full-label">
            Physically counted units
            <input
              type="number"
              min="0"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
        )}
        <label className="full-label">
          Reason
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Record a clear reason for the audit trail"
          />
        </label>
        <div className="notice">
          <ShieldCheck size={18} />
          <p>
            {mode === "count"
              ? "A count difference creates a case. An authorised manager must review any stock adjustment."
              : "Held, quarantined and expired stock stays outside usable availability. Existing actions are rechecked before dispatch."}
          </p>
        </div>
        {error && <div className="inline-error">{error}</div>}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
        <button
          className="button primary"
          disabled={
            busy ||
            reason.trim().length < 3 ||
            (mode === "count" && (!Number.isSafeInteger(count) || count < 0)) ||
            !(mode === "count"
              ? hasRole(data, "operator", "steward", "manager")
              : hasRole(data, "steward", "manager")) ||
            !canLocation(data, current.location_id)
          }
          onClick={submit}
        >
          Save {mode === "status" ? "disposition" : "count"}
        </button>
      </footer>
    </Modal>
  );
}

export function CaseDialog({
  data,
  item,
  onClose,
  onDone,
}: Omit<Base, "asOf"> & { item: Case }) {
  const current = data.cases.find((x) => x.id === item.id) || item;
  const [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(resolve = false) {
    setBusy(true);
    try {
      await api(`/cases/${current.id}`, "PATCH", { comment, resolve });
      await onDone(
        resolve
          ? "Case resolved with a recorded explanation."
          : "Case comment saved.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adjust() {
    setBusy(true);
    try {
      await command("/inventory/adjustments", {
        case_id: current.id,
        reason: comment,
      });
      await onDone(
        "Count difference reconciled with an attributable adjustment.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      busy={busy}
      title={title(current.kind)}
      eyebrow="RECONCILIATION CASE"
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="case-meta">
          <Badge tone={current.status === "open" ? "warning" : "green"}>
            {title(current.status)}
          </Badge>
          <span>
            {shortLocation(
              data.locations.find((x) => x.id === current.location_id)?.name ||
                "Location",
            )}
          </span>
        </div>
        <div className="facts-list">
          {Object.entries(current.details)
            .filter(([key]) => !key.endsWith("_id"))
            .map(([key, value]) => (
              <div key={key}>
                <span>{title(key)}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
        </div>
        {current.comments.map((c, i) => (
          <div className="comment" key={i}>
            {c.text}
          </div>
        ))}
        {current.status === "open" && (
          <label className="full-label">
            Review note
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add your review and next step"
            />
          </label>
        )}
        {error && <div className="inline-error">{error}</div>}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Close
        </button>
        {current.status === "open" && (
          <>
            <button
              className="button secondary"
              disabled={
                busy ||
                comment.trim().length < 3 ||
                !hasRole(data, "operator", "planner", "manager", "steward")
              }
              onClick={() => save(false)}
            >
              Add note
            </button>
            {current.kind === "count_difference" && hasRole(data, "manager") ? (
              <button
                className="button primary"
                disabled={busy || comment.trim().length < 3}
                onClick={adjust}
              >
                Approve adjustment
              </button>
            ) : (
              !["count_difference", "return_disposition"].includes(
                current.kind,
              ) &&
              hasRole(data, "manager", "steward") && (
                <button
                  className="button primary"
                  disabled={busy || comment.trim().length < 3}
                  onClick={() => save(true)}
                >
                  Resolve case
                </button>
              )
            )}
          </>
        )}
      </footer>
    </Modal>
  );
}

export function AssistantDialog({ data, asOf, onClose }: Omit<Base, "onDone">) {
  const [mode, setMode] = useState<"operations" | "policy">("operations"),
    [question, setQuestion] = useState("Why is this supply plan feasible?"),
    [reference, setReference] = useState(data.plans.at(-1)?.id || ""),
    [answer, setAnswer] = useState<{
      answer: string;
      facts?: { status: string; quantity: number; explanation: Explanation };
      citations: {
        title?: string;
        version?: string;
        quote?: string;
        id: string;
        type: string;
      }[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function ask() {
    setBusy(true);
    setAnswer(null);
    setError("");
    try {
      setAnswer(
        await api("/assistant", "POST", {
          mode,
          question,
          reference_id: mode === "operations" ? reference : null,
          as_of: asOf,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Answers with a source of truth"
      eyebrow="SUPPLY ASSISTANT"
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="tabs">
          <button
            disabled={busy}
            className={mode === "operations" ? "active" : ""}
            onClick={() => {
              setMode("operations");
              setAnswer(null);
            }}
          >
            Operational evidence
          </button>
          <button
            disabled={busy}
            className={mode === "policy" ? "active" : ""}
            onClick={() => {
              setMode("policy");
              setAnswer(null);
            }}
          >
            Approved policies
          </button>
        </div>
        {mode === "operations" && (
          <label className="full-label">
            Supply plan
            <select
              value={reference}
              disabled={busy}
              onChange={(e) => {
                setReference(e.target.value);
                setAnswer(null);
              }}
            >
              <option value="">Select a recorded plan</option>
              {data.plans.map((p) => (
                <option value={p.id} key={p.id}>
                  {shortProduct(
                    data.products.find((x) => x.id === p.product_id)?.name ||
                      "Medicine",
                  )}{" "}
                  · {title(p.status)} · {p.id.slice(0, 6)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="full-label">
          Your question
          <textarea
            rows={2}
            value={question}
            disabled={busy}
            onChange={(e) => {
              setQuestion(e.target.value);
              setAnswer(null);
            }}
          />
        </label>
        <button
          className="button primary"
          disabled={
            busy || question.length < 3 || (mode === "operations" && !reference)
          }
          onClick={ask}
        >
          <Sparkles size={16} />
          {busy ? "Finding evidence…" : "Find supporting evidence"}
        </button>
        {answer && (
          <div className="assistant-answer">
            <span className="assistant-answer-label">
              <Sparkles size={15} />
              GROUNDED RESPONSE
            </span>
            <h3>{answer.answer}</h3>
            {answer.facts && (
              <div className="facts-list">
                <div>
                  <span>Plan state</span>
                  <strong>{title(answer.facts.status)}</strong>
                </div>
                <div>
                  <span>Quantity</span>
                  <strong>{number(answer.facts.quantity)} units</strong>
                </div>
                <div>
                  <span>Source protection</span>
                  <strong>
                    {number(answer.facts.explanation.donor_protected)} units
                  </strong>
                </div>
                <div>
                  <span>Arrival estimate</span>
                  <strong>
                    {dateLabel(answer.facts.explanation.arrival_date)}
                  </strong>
                </div>
                <p>{answer.facts.explanation.policy_source}</p>
              </div>
            )}
            {answer.citations.map((c, i) => (
              <div className="citation" key={i}>
                <FileCheck2 size={16} />
                <div>
                  <strong>
                    {c.title || "Recorded plan"} · version{" "}
                    {c.version ||
                      data.plans.find((p) => p.id === c.id)?.version ||
                      "—"}
                  </strong>
                  {c.quote && <p>{c.quote}</p>}
                  <span>Source {c.id.slice(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <div className="inline-error">{error}</div>}
        <div className="notice">
          <LockKeyhole size={17} />
          <p>
            Read-only, grounded retrieval. The assistant cannot approve plans,
            change stock or invent an operating policy.
          </p>
        </div>
      </div>
    </Modal>
  );
}
