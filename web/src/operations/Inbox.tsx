import { Details } from "../WorkflowProgress";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, Clock3, RefreshCw } from "lucide-react";
import { api, command } from "../api";
import type { Data } from "../types";
import type { ExceptionPayload, Workflow } from "../../../shared/operations";
import { Badge, Empty, Modal, SectionTitle } from "../ui";
import { dateLabel, hasRole, shortLocation, title } from "../utils";
import { Field, Status, useOperation } from "./common";

export function Inbox({
  data,
  asOf,
  notify,
  onOpen,
}: {
  data: Data;
  asOf: string;
  notify: (s: string) => void;
  onOpen: (kind: string, id: string) => void;
}) {
  const [items, setItems] = useState<Workflow<ExceptionPayload>[]>([]),
    [selected, setSelected] = useState<Workflow<ExceptionPayload> | null>(null),
    [filter, setFilter] = useState("active"),
    [owner, setOwner] = useState(""),
    [due, setDue] = useState(asOf),
    [reason, setReason] = useState("");
  async function refresh() {
    const r = await api<{ items: Workflow<ExceptionPayload>[] }>(
      "/operations/exception",
    );
    setItems(r.items);
  }
  const { busy, error, setError, run, transition } = useOperation(
    refresh,
    notify,
  );
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  const [team, setTeam] = useState<
    { id: string; email: string; role: string }[]
  >([]);
  useEffect(() => {
    let active = true;
    if (selected?.location_ids[0])
      void api<{ items: typeof team }>(
        `/team?location_id=${encodeURIComponent(selected.location_ids[0])}`,
      )
        .then((r) => {
          if (active) setTeam(r.items);
        })
        .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [selected?.id]);
  const canWork = hasRole(data, "operator", "planner", "steward", "manager");
  return (
    <>
      <SectionTitle
        eyebrow="ONE OPERATIONAL QUEUE"
        title="Nothing important falls between teams"
        action={
          <button
            className="button secondary"
            disabled={busy || !canWork}
            onClick={() =>
              run(async () => {
                await command("/inbox/refresh", { version: 1, as_of: asOf });
                notify(
                  "Conditions checked; duplicate alerts kept as the same work item.",
                );
              })
            }
          >
            <RefreshCw size={15} />
            Check current exceptions
          </button>
        }
      >
        Deadlines, late shipments, holds, count variances and sync conflicts.
        Acknowledgement preserves the record and its owner.
      </SectionTitle>
      {error && <div className="error-banner">{error}</div>}
      <div className="ops-metrics inbox-metrics">
        <span>
          <Bell size={19} />
          Open exceptions<b>{items.filter((w) => w.state === "open").length}</b>
        </span>
        <span>
          <Clock3 size={19} />
          Due by operating date
          <b>
            {
              items.filter(
                (w) =>
                  w.state !== "resolved" &&
                  w.payload.due_on &&
                  w.payload.due_on <= asOf,
              ).length
            }
          </b>
        </span>
        <span>
          <CheckCheck size={19} />
          Acknowledged
          <b>{items.filter((w) => w.state === "acknowledged").length}</b>
        </span>
      </div>
      <div className="segmented ops-tabs">
        {["active", "mine", "resolved", "all"].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {title(f)}
          </button>
        ))}
      </div>
      {!items.length && (
        <Empty title="Check the network for exceptions">
          Use “Check current exceptions” to create durable work items from
          current conditions.
        </Empty>
      )}
      <div className="inbox-list">
        {items
          .filter((w) =>
            filter === "all" || filter === "mine"
              ? filter === "all" || w.payload.owner_id === data.me.id
              : filter === "resolved"
                ? w.state === "resolved"
                : w.state !== "resolved",
          )
          .map((w) => (
            <button
              className={`inbox-row ${w.state}`}
              key={w.id}
              onClick={() => {
                setSelected(w);
                setOwner(w.payload.owner_id || data.me.id);
                setDue(w.payload.due_on || asOf);
                setReason("");
              }}
            >
              <span className="inbox-priority">
                <Bell size={18} />
              </span>
              <span>
                <strong>{w.payload.title}</strong>
                <small>
                  {w.location_ids
                    .map((id) =>
                      shortLocation(
                        data.locations.find((l) => l.id === id)?.name || id,
                      ),
                    )
                    .join(", ")}{" "}
                  ·{" "}
                  {w.payload.owner_id === data.me.id
                    ? "Assigned to you"
                    : w.payload.owner_id
                      ? "Assigned"
                      : "Unassigned"}
                </small>
              </span>
              <span>
                {w.payload.due_on ? dateLabel(w.payload.due_on) : "No due date"}
                <small>{title(w.payload.kind)}</small>
              </span>
              <Status state={w.state} />
            </button>
          ))}
      </div>
      <Details title="How this is calculated & recorded">
        <p className="ops-note">
          In-app alerts are available now. Android push is not configured.
          Exception checks run on demand; Free hosting can sleep, so continuous
          background escalation is not guaranteed.
        </p>
      </Details>
      {selected && (
        <Modal
          title={selected.payload.title}
          eyebrow={`EXCEPTION ${selected.id.slice(0, 8)} · V${selected.version}`}
          onClose={() => !busy && setSelected(null)}
          busy={busy}
        >
          <div className="modal-body">
            <Status state={selected.state} />
            <p>
              {title(selected.payload.kind)} ·{" "}
              {selected.payload.active
                ? "Condition currently active"
                : "Underlying condition cleared"}
            </p>
            <button
              className="button secondary"
              onClick={() => {
                onOpen(selected.payload.kind, selected.payload.reference);
                setSelected(null);
              }}
            >
              Open linked record
            </button>
            {error && <div className="error-banner">{error}</div>}
            <div className="ops-form-row">
              <Field label="Assigned owner">
                <select
                  value={owner}
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
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Comment / resolution evidence">
              <textarea
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <div className="ops-card-actions">
              {[
                "assign",
                "acknowledge",
                ...(hasRole(data, "steward", "manager")
                  ? [selected.state === "resolved" ? "reopen" : "resolve"]
                  : []),
              ].map((action) => (
                <button
                  className={
                    action === "acknowledge"
                      ? "button primary"
                      : "button secondary"
                  }
                  disabled={busy || !canWork || reason.length < 3 || !owner}
                  key={action}
                  onClick={() =>
                    run(async () => {
                      await transition(
                        selected,
                        `/inbox/${selected.id}/events`,
                        {
                          action,
                          owner_id: owner,
                          due_on: due || null,
                          reason,
                        },
                      );
                      setSelected(null);
                    })
                  }
                >
                  {action === "assign" ? "Save owner & date" : title(action)}
                </button>
              ))}
            </div>
            {selected.payload.comments.map((c, i) => (
              <div className="trail-line" key={i}>
                <b>{c.actor_id === data.me.id ? "You" : c.actor_id}</b>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
