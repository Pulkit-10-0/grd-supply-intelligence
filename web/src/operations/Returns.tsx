import { useEffect, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { api, command } from "../api";
import type { Data } from "../types";
import type { ReturnPayload, Workflow } from "../../../shared/operations";
import { Empty, Modal, SectionTitle } from "../ui";
import { hasRole, number, shortLocation, title } from "../utils";
import { Field, Status, useOperation } from "./common";
import { NextStep, WorkflowProgress } from "../WorkflowProgress";
import { returnSteps, workflowStage } from "../../../shared/workflow";

export function Returns({
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
  const [returns, setReturns] = useState<Workflow<ReturnPayload>[]>([]),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Workflow<ReturnPayload> | null>(null),
    [lineId, setLineId] = useState(""),
    [batchId, setBatchId] = useState(""),
    [qty, setQty] = useState("1"),
    [reason, setReason] = useState("");
  async function fetchRows() {
    const r = await api<{ items: Workflow<ReturnPayload>[] }>(
      "/operations/return_transfer",
    );
    setReturns(r.items);
  }
  const { busy, error, setError, run, transition } = useOperation(async () => {
    await fetchRows();
    await onRefresh();
  }, notify);
  useEffect(() => {
    void fetchRows().catch((e) => setError(e.message));
  }, []);
  const loc = (id: string) =>
    shortLocation(data.locations.find((l) => l.id === id)?.name || id);
  const eligible = data.shipments.flatMap((s) =>
    s.lines
      .filter((l) => l.accepted > l.returned)
      .map((l) => ({ ...l, destination_id: s.destination_id })),
  );
  const line = eligible.find((l) => l.id === lineId);
  return (
    <>
      <SectionTitle
        eyebrow="REVERSE LOGISTICS"
        title="Return transfers"
        action={
          <button
            className="button primary"
            disabled={!hasRole(data, "operator", "manager") || !eligible.length}
            onClick={() => {
              setCreating(true);
              setReason("");
              setLineId(eligible[0]?.id || "");
              setBatchId("");
            }}
          >
            <Plus size={16} />
            Request return
          </button>
        }
      >
        Approve, send back and inspect returned stock.
      </SectionTitle>
      {error && <div className="error-banner">{error}</div>}
      {!returns.length && (
        <Empty title="No return transfers yet">
          A return must identify an accepted shipment line and the matching
          received batch.
        </Empty>
      )}
      <div className="ops-card-grid">
        {returns.map((w) => (
          <article className="ops-card" key={w.id}>
            <div className="ops-card-heading">
              <RotateCcw size={21} />
              <Status state={w.state} />
            </div>
            <h3>
              {loc(w.payload.source_id)} → {loc(w.payload.destination_id)}
            </h3>
            <p>
              {number(w.payload.quantity)} units · {w.payload.reason}
            </p>
            <WorkflowProgress
              steps={returnSteps}
              stage={workflowStage("return_transfer", w.state)}
              cancelled={w.state === "cancelled"}
              compact
              label="Return progress"
            />
            <button
              className="button secondary"
              onClick={() => {
                setSelected(w);
                setReason("");
              }}
            >
              Open return
            </button>
          </article>
        ))}
      </div>
      {creating && (
        <Modal
          title="Request return"
          onClose={() => !busy && setCreating(false)}
          busy={busy}
        >
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await command("/return-transfers", {
                  line_id: lineId,
                  batch_id: batchId,
                  quantity: Number(qty),
                  as_of: asOf,
                  reason,
                });
                setCreating(false);
                notify("Return requested; stock has not moved.");
              });
            }}
          >
            {error && <div className="error-banner">{error}</div>}
            <Field label="Accepted shipment line">
              <select
                value={lineId}
                onChange={(e) => {
                  setLineId(e.target.value);
                  setBatchId("");
                }}
              >
                {eligible.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.batch_code} · {loc(l.destination_id)} ·{" "}
                    {l.accepted - l.returned} unreturned
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Matching received batch">
              <select
                required
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              >
                <option value="">Select physical batch</option>
                {data.batches
                  .filter(
                    (b) =>
                      b.location_id === line?.destination_id &&
                      b.code === line?.batch_code &&
                      b.expiry === line?.expiry,
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.quantity - b.reserved} unreserved ·{" "}
                      {b.status}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Return units">
              <input
                required
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
            <Field label="Reason">
              <textarea
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button className="button primary" disabled={busy}>
              Request return review
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title="Return transfer"
          eyebrow={`RETURN ${selected.id.slice(0, 8)} · V${selected.version}`}
          busy={busy}
          onClose={() => !busy && setSelected(null)}
        >
          <div className="modal-body">
            <WorkflowProgress
              steps={returnSteps}
              stage={workflowStage("return_transfer", selected.state)}
              cancelled={selected.state === "cancelled"}
              label="Return progress"
            />
            <Status state={selected.state} />
            <NextStep
              title={
                ["closed", "cancelled"].includes(selected.state)
                  ? "Return closed"
                  : "Next step"
              }
              complete={selected.state === "closed"}
            >
              {selected.state === "requested"
                ? "Review and approve the return before sending goods back."
                : selected.state === "approved"
                  ? "Record the return dispatch when goods leave the sending location."
                  : selected.state === "in_transit"
                    ? "Confirm arrival at the receiving location."
                    : selected.state === "received_for_review"
                      ? "Inspect the returned goods, then release or quarantine them."
                      : "This return has no outstanding actions."}
            </NextStep>
            <p>
              {number(selected.payload.quantity)} units ·{" "}
              {loc(selected.payload.source_id)} →{" "}
              {loc(selected.payload.destination_id)}
            </p>
            {error && <div className="error-banner">{error}</div>}
            {!["closed", "cancelled"].includes(selected.state) && (
              <Field label="Action reference / reason">
                <textarea
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            <div className="ops-card-actions">
              {(selected.state === "requested" && hasRole(data, "manager")
                ? ["approve", "cancel"]
                : selected.state === "approved"
                  ? hasRole(data, "manager")
                    ? ["dispatch", "cancel"]
                    : hasRole(data, "operator")
                      ? ["dispatch"]
                      : []
                  : selected.state === "in_transit" &&
                      hasRole(data, "operator", "manager")
                    ? ["receive"]
                    : selected.state === "received_for_review" &&
                        hasRole(data, "steward", "manager")
                      ? ["release", "quarantine"]
                      : []
              ).map((action) => (
                <button
                  key={action}
                  className={
                    action === "cancel" || action === "quarantine"
                      ? "button secondary"
                      : "button primary"
                  }
                  disabled={busy || reason.trim().length < 3}
                  onClick={() =>
                    run(async () => {
                      const updated = await transition(
                        selected,
                        `/return-transfers/${selected.id}/events`,
                        { action, as_of: asOf, reason },
                      );
                      setSelected(updated);
                      setReason("");
                    })
                  }
                >
                  {action === "release"
                    ? "Release as usable"
                    : action === "quarantine"
                      ? "Close into quarantine"
                      : title(action)}
                </button>
              ))}
            </div>
            <p className="ops-note">
              Returned goods remain unavailable until inspection and release.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
