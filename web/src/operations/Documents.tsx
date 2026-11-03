import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, QrCode, Truck } from "lucide-react";
import { api } from "../api";
import { Badge, Empty, Modal, SectionTitle } from "../ui";
import type { Data, Shipment } from "../types";
import { dateLabel, hasRole, number, shortLocation, title } from "../utils";
import { useOperation } from "./common";
import { ReceiptDialog } from "../dialogs";

interface PickDoc {
  plan_id: string;
  version: number;
  status: string;
  source_id: string;
  destination_id: string;
  product_id: string;
  instruction: string;
  lines: {
    batch_id: string;
    batch_code: string;
    expiry: string;
    approved: number;
    to_pick: number;
    dispatched: number;
    status: string;
  }[];
}
interface Note {
  shipment: Shipment;
  label: string;
  plan_version: number;
  proofs: {
    id: string;
    payload: {
      receiver: string;
      reference: string;
      as_of: string;
      short_lines: string[];
    };
  }[];
}
export function Documents({
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
  const [pick, setPick] = useState<PickDoc | null>(null),
    [note, setNote] = useState<Note | null>(null),
    [receiving, setReceiving] = useState<Shipment | null>(null);
  const { busy, error, run } = useOperation(onRefresh, notify);
  const loc = (id: string) =>
    shortLocation(data.locations.find((l) => l.id === id)?.name || id);
  return (
    <>
      <SectionTitle eyebrow="WAREHOUSE → RECEIVER" title="Dispatch & delivery">
        Approved documents identify the exact plan version. A delivery proof
        records the actual receiver and quantities.
      </SectionTitle>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="ops-card-grid">
        {data.plans
          .filter((p) =>
            ["approved", "partial", "dispatched", "completed"].includes(
              p.status,
            ),
          )
          .map((p) => (
            <article className="ops-card" key={p.id}>
              <Badge>{title(p.status)}</Badge>
              <h3>
                {loc(p.source_id)} → {loc(p.destination_id)}
              </h3>
              <p>
                {number(p.quantity)} units · plan v{p.version}
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    setPick(await api<PickDoc>(`/plans/${p.id}/documents`)),
                  )
                }
              >
                <Printer size={15} />
                Pick & packing lists
              </button>
            </article>
          ))}
      </div>
      <SectionTitle title="Shipments & delivery evidence" />
      {!data.shipments.length && (
        <Empty title="No dispatched shipments yet">
          Approve and dispatch a plan from the Action centre.
        </Empty>
      )}
      <div className="ops-card-grid">
        {data.shipments.map((s) => (
          <article className="ops-card" key={s.id}>
            <div className="ops-card-heading">
              <Truck size={20} />
              <Badge tone={s.received_on ? "green" : "amber"}>
                {s.received_on ? "Received" : "In transit"}
              </Badge>
            </div>
            <h3>
              {loc(s.source_id)} → {loc(s.destination_id)}
            </h3>
            <p>
              Expected {dateLabel(s.expected_on)} ·{" "}
              {number(s.lines.reduce((n, l) => n + l.quantity - l.received, 0))}{" "}
              outstanding
            </p>
            <small>Shipment {s.id.slice(0, 8)}</small>
            <div className="ops-card-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    setNote(await api<Note>(`/shipments/${s.id}/document`)),
                  )
                }
              >
                <QrCode size={15} />
                Delivery note / QR
              </button>
              {!s.received_on && hasRole(data, "operator", "manager") && (
                <button
                  className="button primary"
                  onClick={() => setReceiving(s)}
                >
                  Confirm handoff
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {pick && (
        <Modal
          title="Approved pick & packing lists"
          eyebrow={`PLAN ${pick.plan_id.slice(0, 8)} · VERSION ${pick.version}`}
          onClose={() => setPick(null)}
          wide
        >
          <div className="modal-body printable-document">
            <p>
              {loc(pick.source_id)} → {loc(pick.destination_id)} ·{" "}
              {data.products.find((p) => p.id === pick.product_id)?.name}
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Verify</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Approved</th>
                  <th>To pick / pack</th>
                  <th>Dispatched</th>
                  <th>Current state</th>
                </tr>
              </thead>
              <tbody>
                {pick.lines.map((l) => (
                  <tr key={l.batch_id}>
                    <td>☐ Picked ☐ Packed</td>
                    <td>{l.batch_code}</td>
                    <td>{dateLabel(l.expiry)}</td>
                    <td>{l.approved}</td>
                    <td>{l.to_pick}</td>
                    <td>{l.dispatched}</td>
                    <td>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ops-note">{pick.instruction}</p>
            <p>
              Picker: ____________________ Packer: ____________________ Checked
              at: ____________________
            </p>
            <button
              className="button secondary print-button"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print documents
            </button>
          </div>
        </Modal>
      )}
      {note && (
        <Modal
          title="Shipment delivery note"
          eyebrow={`SHIPMENT ${note.shipment.id.slice(0, 8)} · PLAN V${note.plan_version}`}
          onClose={() => setNote(null)}
          wide
        >
          <div className="modal-body printable-document">
            <div className="delivery-qr">
              <QRCodeSVG value={note.label} size={140} />
              <div>
                <h3>
                  {loc(note.shipment.source_id)} →{" "}
                  {loc(note.shipment.destination_id)}
                </h3>
                <p>Expected {dateLabel(note.shipment.expected_on)}</p>
                <code>{note.label}</code>
                <small>
                  Internal identifier; receiver authentication is still
                  required.
                </small>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Dispatched</th>
                  <th>Received</th>
                  <th>Accepted</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {note.shipment.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.batch_code}</td>
                    <td>{dateLabel(l.expiry || "")}</td>
                    <td>{l.quantity}</td>
                    <td>{l.received}</td>
                    <td>{l.accepted}</td>
                    <td>{l.quantity - l.received}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {note.proofs.map((p) => (
              <div className="proof-stamp" key={p.id}>
                Confirmed by {p.payload.receiver} · {dateLabel(p.payload.as_of)}{" "}
                · {p.payload.reference} · proof {p.id.slice(0, 8)}
              </div>
            ))}
            <p>
              Receiver: ____________________ Signature / document:
              ____________________
            </p>
            <button
              className="button secondary print-button"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print delivery note
            </button>
          </div>
        </Modal>
      )}
      {receiving && (
        <ReceiptDialog
          data={data}
          shipment={receiving}
          asOf={asOf}
          onClose={() => setReceiving(null)}
          onDone={async (message) => {
            await onRefresh();
            notify(message);
          }}
        />
      )}
    </>
  );
}
