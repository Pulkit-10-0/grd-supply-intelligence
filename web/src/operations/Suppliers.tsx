import { useEffect, useRef, useState } from "react";
import { ArrowRight, PackagePlus, Plus } from "lucide-react";
import type { Data } from "../types";
import type {
  SupplierPayload,
  Suggestion,
  Workflow,
} from "../../../shared/operations";
import { api, command } from "../api";
import { Empty, Modal, SectionTitle } from "../ui";
import {
  dateLabel,
  hasRole,
  number,
  shortLocation,
  shortProduct,
} from "../utils";
import { Field, Status, useOperation } from "./common";

export function Suppliers({
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
  const [orders, setOrders] = useState<Workflow<SupplierPayload>[]>([]),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Workflow<SupplierPayload> | null>(null),
    [product, setProduct] = useState(data.products[0]?.id || ""),
    [location, setLocation] = useState(
      data.locations.find((l) => l.kind !== "warehouse")?.id ||
        data.locations[0]?.id ||
        "",
    ),
    [supplier, setSupplier] = useState(""),
    [quantity, setQuantity] = useState("100"),
    [cost, setCost] = useState("0"),
    [suggestion, setSuggestion] = useState<Suggestion | null>(null),
    [reference, setReference] = useState(""),
    [promised, setPromised] = useState(asOf),
    [receiptQty, setReceiptQty] = useState("0"),
    [damaged, setDamaged] = useState("0"),
    [code, setCode] = useState(""),
    [expiry, setExpiry] = useState("");
  const quantityEdited = useRef(false);
  async function refresh() {
    const r = await api<{ items: Workflow<SupplierPayload>[] }>(
      "/operations/supplier_order",
    );
    setOrders(r.items);
    await onRefresh();
  }
  const { busy, error, setError, run, transition } = useOperation(
    refresh,
    notify,
  );
  useEffect(() => {
    void api<{ items: Workflow<SupplierPayload>[] }>(
      "/operations/supplier_order",
    )
      .then((r) => setOrders(r.items))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setSuggestion(null);
    quantityEdited.current = false;
    if (creating)
      void api<Suggestion>(
        `/suppliers/suggestion?product_id=${encodeURIComponent(product)}&location_id=${encodeURIComponent(location)}&as_of=${asOf}`,
      )
        .then((r) => {
          if (active) {
            setSuggestion(r);
            if (r.suggested_quantity !== null && !quantityEdited.current)
              setQuantity(String(r.suggested_quantity));
          }
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [product, location, asOf, creating]);
  const canPlan = hasRole(data, "planner", "manager"),
    canManage = hasRole(data, "manager");
  async function event(action: string) {
    if (!selected) return;
    await transition(selected, `/suppliers/orders/${selected.id}/events`, {
      action,
      as_of: asOf,
      reference,
      promised_on: action === "acknowledge" ? promised : null,
    });
    setSelected(null);
  }
  return (
    <>
      <SectionTitle
        eyebrow="EXTERNAL REPLENISHMENT"
        title="Order what the network still needs"
        action={
          <button
            className="button primary"
            disabled={!canPlan}
            onClick={() => {
              setCreating(true);
              setReference("");
            }}
          >
            <Plus size={16} />
            Draft supplier order
          </button>
        }
      >
        Track review, recorded supplier confirmation and physical receipts. No
        automatic purchase or external supplier connection.
      </SectionTitle>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!orders.length && (
        <Empty title="No supplier orders yet">
          Draft an order from an explained stock suggestion, then approve it
          before recording supplier acknowledgement.
        </Empty>
      )}
      <div className="ops-card-grid">
        {orders.map((o) => (
          <article className="ops-card" key={o.id}>
            <div className="ops-card-heading">
              <PackagePlus size={21} />
              <Status state={o.state} />
            </div>
            <h3>{o.payload.supplier}</h3>
            <p>
              {shortProduct(
                data.products.find((p) => p.id === o.payload.product_id)
                  ?.name || "",
              )}{" "}
              →{" "}
              {shortLocation(
                data.locations.find((l) => l.id === o.payload.location_id)
                  ?.name || "",
              )}
            </p>
            <div className="ops-big-number">
              {number(o.payload.quantity - o.payload.received)}
              <small>units outstanding</small>
            </div>
            <p>
              {number(o.payload.accepted)} accepted ·{" "}
              {o.payload.promised_on
                ? `Promised ${dateLabel(o.payload.promised_on)}`
                : "Supplier date unconfirmed"}
            </p>
            <button
              className="button secondary"
              onClick={() => {
                setSelected(o);
                setReference("");
                setReceiptQty(String(o.payload.quantity - o.payload.received));
                setDamaged("0");
                setCode("");
                setExpiry("");
              }}
            >
              Review order <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {creating && (
        <Modal
          title="Draft a replenishment order"
          eyebrow="EXPLAINED SUGGESTION · REVIEW REQUIRED"
          busy={busy}
          onClose={() => !busy && setCreating(false)}
          wide
        >
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await command("/suppliers/orders", {
                  product_id: product,
                  location_id: location,
                  supplier,
                  quantity: Number(quantity),
                  unit_cost_paise: Number(cost),
                  as_of: asOf,
                  reason: reference,
                  lead_days: 7,
                  coverage_days: 28,
                });
                setCreating(false);
                notify("Supplier order drafted. Manager approval is required.");
              });
            }}
          >
            {error && <div className="error-banner">{error}</div>}
            <div className="ops-form-row">
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
              <Field label="Receiving site">
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
            </div>
            {suggestion && (
              <div className="calculation-card">
                <strong>
                  Suggested: {number(suggestion.suggested_quantity)} units
                </strong>
                <div className="ops-metrics">
                  <span>
                    Eligible stock
                    <b>{number(suggestion.available_surviving_arrival)}</b>
                  </span>
                  <span>
                    Reserved<b>{number(suggestion.reserved)}</b>
                  </span>
                  <span>
                    Confirmed inbound
                    <b>{number(suggestion.confirmed_inbound)}</b>
                  </span>
                  <span>
                    Booked demand<b>{number(suggestion.commitments)}</b>
                  </span>
                </div>
                <small>
                  {suggestion.formula}. 7-day lead + 28-day coverage.{" "}
                  {suggestion.warning}
                </small>
              </div>
            )}
            <div className="ops-form-row">
              <Field label="Supplier name">
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </Field>
              <Field label="Quantity · pack multiples">
                <input
                  required
                  type="number"
                  min={
                    data.products.find((p) => p.id === product)?.pack_size || 1
                  }
                  step={
                    data.products.find((p) => p.id === product)?.pack_size || 1
                  }
                  value={quantity}
                  onChange={(e) => {
                    quantityEdited.current = true;
                    setQuantity(e.target.value);
                  }}
                />
              </Field>
              <Field label="Unit price · paise">
                <input
                  required
                  type="number"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Reason / proposed-quantity justification">
              <textarea
                required
                minLength={3}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <button className="button primary" disabled={busy}>
              Save draft for review
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.payload.supplier}
          eyebrow={`SUPPLIER ORDER ${selected.id.slice(0, 8)} · V${selected.version}`}
          busy={busy}
          onClose={() => !busy && setSelected(null)}
          wide
        >
          <div className="modal-body">
            <Status state={selected.state} />
            <p>
              {number(selected.payload.quantity)} ordered ·{" "}
              {number(selected.payload.received)} physically received ·{" "}
              {number(selected.payload.accepted)} usable
            </p>
            {error && <div className="error-banner">{error}</div>}
            <Field label="Document / confirmation / discrepancy reference">
              <input
                minLength={3}
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            {selected.state === "approved" && (
              <Field label="Supplier-confirmed promised arrival">
                <input
                  type="date"
                  min={asOf}
                  required
                  value={promised}
                  onChange={(e) => setPromised(e.target.value)}
                />
              </Field>
            )}
            <div className="ops-card-actions">
              {selected.state === "draft" && canManage && (
                <button
                  className="button primary"
                  disabled={busy || reference.length < 3}
                  onClick={() => run(() => event("approve"))}
                >
                  Approve order
                </button>
              )}
              {selected.state === "approved" && canPlan && (
                <button
                  className="button primary"
                  disabled={busy || reference.length < 3}
                  onClick={() => run(() => event("acknowledge"))}
                >
                  Record supplier acknowledgement
                </button>
              )}
              {!["received", "cancelled"].includes(selected.state) &&
                canManage && (
                  <button
                    className="button secondary"
                    disabled={busy || reference.length < 3}
                    onClick={() => run(() => event("cancel"))}
                  >
                    Cancel outstanding order
                  </button>
                )}
            </div>
            {["acknowledged", "partial"].includes(selected.state) &&
              hasRole(data, "operator", "manager") && (
                <form
                  className="receipt-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await transition(
                        selected,
                        `/suppliers/orders/${selected.id}/receipts`,
                        {
                          as_of: asOf,
                          quantity: Number(receiptQty),
                          damaged: Number(damaged),
                          code,
                          expiry,
                          reference,
                        },
                      );
                      setSelected(null);
                    });
                  }}
                >
                  <h3>Receive this consignment</h3>
                  <div className="ops-form-row">
                    <Field label="Accepted units">
                      <input
                        required
                        type="number"
                        min="0"
                        value={receiptQty}
                        onChange={(e) => setReceiptQty(e.target.value)}
                      />
                    </Field>
                    <Field label="Damaged units">
                      <input
                        required
                        type="number"
                        min="0"
                        value={damaged}
                        onChange={(e) => setDamaged(e.target.value)}
                      />
                    </Field>
                    <Field label="Batch code">
                      <input
                        required
                        maxLength={100}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </Field>
                    <Field label="Expiry">
                      <input
                        required
                        type="date"
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                      />
                    </Field>
                  </div>
                  <button
                    className="button primary"
                    disabled={busy || reference.length < 3}
                  >
                    Confirm physical receipt
                  </button>
                </form>
              )}
            <h3>Order trail</h3>
            {selected.payload.history.map((h, i) => (
              <p className="trail-line" key={i}>
                <b>{h.action}</b> {h.reference} {h.date && dateLabel(h.date)}
              </p>
            ))}
            <p className="ops-note">
              Acknowledgement is recorded by your team from a real or explicitly
              demonstrated supplier confirmation. No email, purchase or payment
              is sent by this platform.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
