import { useEffect, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { api, command } from "../api";
import type { Data } from "../types";
import type { CountPayload, Workflow } from "../../../shared/operations";
import { Empty, Modal, SectionTitle } from "../ui";
import { dateLabel, hasRole, number, shortLocation } from "../utils";
import { Field, Status, useOperation } from "./common";

export function Counts({
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
  const [sessions, setSessions] = useState<Workflow<CountPayload>[]>([]),
    [creating, setCreating] = useState(false),
    [selected, setSelected] = useState<Workflow<CountPayload> | null>(null),
    [location, setLocation] = useState(data.locations[0]?.id || ""),
    [owner, setOwner] = useState(data.me.id),
    [due, setDue] = useState(asOf),
    [reason, setReason] = useState(""),
    [counts, setCounts] = useState<Record<string, string>>({}),
    [batches, setBatches] = useState<string[]>([]);
  async function fetchRows() {
    const r = await api<{ items: Workflow<CountPayload>[] }>(
      "/operations/count_session",
    );
    setSessions(r.items);
  }
  const { busy, error, setError, run, transition } = useOperation(async () => {
    await fetchRows();
    await onRefresh();
  }, notify);
  useEffect(() => {
    void fetchRows().catch((e) => setError(e.message));
  }, []);
  const [team, setTeam] = useState<
    { id: string; email: string; role: string }[]
  >([]);
  useEffect(() => {
    let active = true;
    void api<{ items: typeof team }>(
      `/team?location_id=${encodeURIComponent(location)}`,
    )
      .then((r) => {
        if (active) setTeam(r.items);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [location]);
  const canManage = hasRole(data, "steward", "manager");
  async function event(action: string) {
    if (!selected) return;
    await transition(selected, `/count-sessions/${selected.id}/events`, {
      action,
      as_of: asOf,
      reason,
      lines:
        action === "submit"
          ? selected.payload.batch_ids.map((batch_id) => ({
              batch_id,
              quantity: Number(counts[batch_id]),
            }))
          : [],
    });
    setSelected(null);
  }
  return (
    <>
      <SectionTitle
        eyebrow="COUNT WITH CONFIDENCE"
        title="A worklist, a recount, a reviewed result"
        action={
          <button
            className="button primary"
            disabled={!canManage}
            onClick={() => {
              setCreating(true);
              setReason("");
              setBatches([]);
            }}
          >
            <Plus size={16} />
            Assign a count
          </button>
        }
      >
        Physical counts remain provisional until reviewed. Stock changes after
        the snapshot require a fresh recount.
      </SectionTitle>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!sessions.length && (
        <Empty title="No count sessions yet">
          Choose batches and an authorised counter. Every round preserves its
          original balances and timestamps.
        </Empty>
      )}
      <div className="ops-card-grid">
        {sessions.map((s) => (
          <article className="ops-card" key={s.id}>
            <div className="ops-card-heading">
              <ClipboardCheck size={22} />
              <Status state={s.state} />
            </div>
            <h3>
              {shortLocation(
                data.locations.find((l) => l.id === s.payload.location_id)
                  ?.name || "",
              )}
            </h3>
            <p>
              {s.payload.batch_ids.length} batches · round {s.payload.round} ·
              due {dateLabel(s.payload.due_on)}
            </p>
            <small>
              Assigned to{" "}
              {s.payload.owner_id === data.me.id ? "you" : s.payload.owner_id}
            </small>
            <p>{s.payload.reason}</p>
            <button
              className="button secondary"
              onClick={() => {
                setSelected(s);
                setReason("");
                setCounts(
                  Object.fromEntries(
                    s.payload.snapshot.map((b) => [b.batch_id, ""]),
                  ),
                );
              }}
            >
              Open count worklist
            </button>
          </article>
        ))}
      </div>
      {creating && (
        <Modal
          title="Assign a count worklist"
          eyebrow="SNAPSHOT AT CREATION"
          wide
          busy={busy}
          onClose={() => !busy && setCreating(false)}
        >
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await command("/count-sessions", {
                  location_id: location,
                  batch_ids: batches,
                  owner_id: owner,
                  due_on: due,
                  reason,
                });
                setCreating(false);
                notify("Count assigned with original stock snapshots.");
              });
            }}
          >
            {error && <div className="error-banner">{error}</div>}
            <div className="ops-form-row">
              <Field label="Location">
                <select
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setBatches([]);
                  }}
                >
                  {data.locations.map((l) => (
                    <option value={l.id} key={l.id}>
                      {shortLocation(l.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assigned counter">
                <select
                  value={owner}
                  required
                  onChange={(e) => setOwner(e.target.value)}
                >
                  {team.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.email} · {person.role}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  required
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
            </div>
            <p className="ops-note">
              Your account is selected initially. Assigned users must be active
              and authorised for this location.
            </p>
            <div className="batch-checklist">
              {data.batches
                .filter((b) => b.location_id === location)
                .map((b) => (
                  <label className="check-field" key={b.id}>
                    <input
                      type="checkbox"
                      checked={batches.includes(b.id)}
                      onChange={(e) =>
                        setBatches(
                          e.target.checked
                            ? [...batches, b.id]
                            : batches.filter((x) => x !== b.id),
                        )
                      }
                    />
                    <span>
                      <b>{b.code}</b> · {number(b.quantity)} recorded ·{" "}
                      {b.status}
                    </span>
                  </label>
                ))}
            </div>
            <Field label="Count reason">
              <input
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button
              className="button primary"
              disabled={busy || !batches.length}
            >
              Create assigned worklist
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title="Physical count worklist"
          eyebrow={`ROUND ${selected.payload.round} · V${selected.version}`}
          wide
          busy={busy}
          onClose={() => !busy && setSelected(null)}
        >
          <div className="modal-body">
            {error && <div className="error-banner">{error}</div>}
            <Status state={selected.state} />
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Snapshot</th>
                  <th>Physical count</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {selected.payload.snapshot.map((b) => (
                  <tr key={b.batch_id}>
                    <td>
                      {b.code}
                      <small>
                        Snapshot{" "}
                        {new Date(b.updated_at).toLocaleString("en-IN")}
                      </small>
                    </td>
                    <td>{b.recorded}</td>
                    <td>
                      {selected.state === "counting" ? (
                        <input
                          aria-label={`Count ${b.code}`}
                          type="number"
                          min="0"
                          step="1"
                          required
                          value={counts[b.batch_id] ?? ""}
                          onChange={(e) =>
                            setCounts({
                              ...counts,
                              [b.batch_id]: e.target.value,
                            })
                          }
                        />
                      ) : (
                        (selected.payload.counts?.[b.batch_id] ?? "—")
                      )}
                    </td>
                    <td>
                      {selected.payload.variances?.[b.batch_id] ??
                        "Pending submission"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Field label="Submission / recount / review reason">
              <textarea
                minLength={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="ops-card-actions">
              {selected.state === "counting" &&
                (selected.payload.owner_id === data.me.id ||
                  hasRole(data, "manager")) && (
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      reason.length < 3 ||
                      selected.payload.batch_ids.some(
                        (id) => !/^\d+$/.test(counts[id] || ""),
                      )
                    }
                    onClick={() => run(() => event("submit"))}
                  >
                    Submit for review
                  </button>
                )}
              {selected.state === "review" && hasRole(data, "manager") && (
                <button
                  className="button primary"
                  disabled={busy || reason.length < 3}
                  onClick={() => run(() => event("approve"))}
                >
                  Approve ledger adjustments
                </button>
              )}
              {!["approved", "cancelled"].includes(selected.state) &&
                canManage && (
                  <>
                    <button
                      className="button secondary"
                      disabled={busy || reason.length < 3}
                      onClick={() => run(() => event("recount"))}
                    >
                      Request a fresh recount
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy || reason.length < 3}
                      onClick={() => run(() => event("cancel"))}
                    >
                      Cancel session
                    </button>
                  </>
                )}
            </div>
            <p className="ops-note">
              No stock is changed by recording or submitting a count. Approval
              posts a traceable adjustment only if the original balance and
              update timestamp still match.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
