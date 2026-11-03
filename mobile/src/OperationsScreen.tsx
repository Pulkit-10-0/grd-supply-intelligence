import {
  supplierSteps,
  returnSteps,
  countSteps,
  workflowStage,
} from "../../shared/workflow";
import React, { useState } from "react";
import { ScrollView, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type {
  CountPayload,
  ExceptionPayload,
  ReturnPayload,
  StockCard,
  SupplierPayload,
  Workflow,
} from "../../shared/operations";
import {
  dateLabel,
  hasRole,
  number,
  shortLocation,
  title,
} from "../../shared/utils";
import { useSession } from "./session";
import { quantity } from "./queue";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Page,
  s,
  Txt,
  WorkflowProgress,
} from "./ui";

export function OperationsScreen() {
  const session = useSession();
  const { data, api, asOf, busy, offline } = session;
  const [tab, setTab] = useState("exception"),
    [selected, setSelected] = useState<Workflow<unknown> | null>(null),
    [reason, setReason] = useState(""),
    [values, setValues] = useState<Record<string, string>>({}),
    [stockCard, setStockCard] = useState<StockCard | null>(null);
  if (!data) return null;
  const loc = (id: string) =>
    shortLocation(data.locations.find((l) => l.id === id)?.name || id);
  const all = data.operations || [],
    canManage = hasRole(data, "manager"),
    canSteward = hasRole(data, "steward", "manager"),
    canExecute = hasRole(data, "operator", "manager"),
    canPlan = hasRole(data, "planner", "manager");
  async function safely(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      session.setError((e as Error).message);
    }
  }
  async function event(
    path: string,
    body: Record<string, unknown>,
    label: string,
  ) {
    if (await session.post(path, body, label)) {
      if (selected && api)
        setSelected(
          await api.request<Workflow<unknown>>(
            `/operations/record/${selected.id}`,
          ),
        );
      setReason("");
      setValues({});
    }
  }
  const base = { version: selected?.version, as_of: asOf, reason };
  const field = (label: string, key: string, numeric = false) => (
    <Field
      key={key}
      label={label}
      value={values[key] || ""}
      onChangeText={(v) => setValues({ ...values, [key]: v })}
      numeric={numeric}
    />
  );
  const tabs = [
    { id: "exception", label: "Inbox" },
    { id: "count_session", label: "Counts" },
    { id: "supplier_order", label: "Suppliers" },
    { id: "return_transfer", label: "Returns" },
    { id: "evidence", label: "Stock card" },
  ];
  return (
    <Page title="Operations desk" eyebrow="Worklists">
      <Button
        title="← Back to workspace"
        secondary
        onPress={() => router.back()}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              setTab(t.id);
              setSelected(null);
            }}
            style={[s.chip, tab === t.id && { backgroundColor: "#C6DA8D" }]}
          >
            <Text style={s.small}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {offline && (
        <Card>
          <Badge text="Offline snapshot · provisional actions" tone="warning" />
          <Txt small>
            These are last-authorised records, retained securely until your
            session expires. Changes queue locally and revalidate on the server.
            Pull to refresh after reconnecting.
          </Txt>
        </Card>
      )}
      {tab === "exception" && (
        <>
          <Button
            title="Check current exceptions"
            secondary
            disabled={
              busy ||
              offline ||
              !hasRole(data, "operator", "planner", "steward", "manager")
            }
            onPress={() =>
              void safely(() =>
                session.post(
                  "/inbox/refresh",
                  { version: 1, as_of: asOf },
                  "Refresh exception inbox",
                ),
              )
            }
          />
        </>
      )}
      {tab !== "evidence" &&
        !selected &&
        all
          .filter((w) => w.kind === tab)
          .map((w) => {
            const p = w.payload as Record<string, unknown>;
            return (
              <Card key={w.id}>
                <Badge text={title(w.state)} />
                <Heading>
                  {String(
                    p.title ||
                      p.supplier ||
                      loc(
                        String(
                          p.location_id || p.source_id || w.location_ids[0],
                        ),
                      ),
                  )}
                </Heading>
                <Txt>
                  {w.kind === "return_transfer"
                    ? `${loc(String(p.source_id))} → ${loc(String(p.destination_id))} · ${p.quantity} units`
                    : w.kind === "supplier_order"
                      ? `${p.quantity} ordered · ${p.received} received`
                      : w.kind === "count_session"
                        ? `Count round ${p.round} · due ${p.due_on}`
                        : String(p.kind || "")}
                </Txt>
                <Txt small>
                  Record {w.id.slice(0, 8)} · version {w.version}
                </Txt>
                <Button
                  title="Open work item"
                  secondary
                  onPress={() => {
                    setSelected(w);
                    setReason("");
                    setValues({});
                  }}
                />
              </Card>
            );
          })}
      {tab !== "evidence" && !selected && !all.some((w) => w.kind === tab) && (
        <Empty text="No work items. Pull to refresh or check the inbox." />
      )}
      {selected && (
        <>
          <Button
            title="← All work items"
            secondary
            onPress={() => setSelected(null)}
          />
          <Card>
            {selected.kind !== "exception" && (
              <WorkflowProgress
                steps={
                  selected.kind === "supplier_order"
                    ? supplierSteps
                    : selected.kind === "return_transfer"
                      ? returnSteps
                      : countSteps
                }
                stage={workflowStage(selected.kind, selected.state)}
              />
            )}
            <Badge text={title(selected.state)} />
            <Heading>{title(selected.kind)}</Heading>
            <Txt small>
              {selected.id} · version {selected.version}
            </Txt>
            <Field
              label="Action evidence / reference"
              value={reason}
              onChangeText={setReason}
              multiline
            />
          </Card>
          {selected.kind === "exception" &&
            (() => {
              const p = selected.payload as ExceptionPayload;
              return (
                <>
                  <Card>
                    <Heading>{p.title}</Heading>
                    <Txt>
                      Due {dateLabel(p.due_on)} ·{" "}
                      {p.owner_id === data.me.id
                        ? "Assigned to you"
                        : p.owner_id || "Unassigned"}
                    </Txt>
                    {p.comments.map((c, i) => (
                      <Txt small key={i}>
                        {c.text}
                      </Txt>
                    ))}
                    {["late_shipment", "short_receipt"].includes(p.kind) && (
                      <Button
                        title="Open shipment"
                        secondary
                        onPress={() =>
                          router.push({
                            pathname: "/detail",
                            params: { kind: "shipment", id: p.reference },
                          })
                        }
                      />
                    )}
                  </Card>
                  {[
                    "acknowledge",
                    ...(canSteward
                      ? [selected.state === "resolved" ? "reopen" : "resolve"]
                      : []),
                  ].map((action) => (
                    <Button
                      key={action}
                      title={title(action) + " & assign to me"}
                      disabled={busy || reason.trim().length < 3}
                      onPress={() =>
                        void safely(() =>
                          event(
                            `/inbox/${selected.id}/events`,
                            {
                              version: selected.version,
                              action,
                              owner_id: data.me.id,
                              due_on: asOf,
                              reason,
                            },
                            `${action} exception ${selected.id.slice(0, 8)}`,
                          ),
                        )
                      }
                    />
                  ))}
                </>
              );
            })()}
          {selected.kind === "count_session" &&
            (() => {
              const p = selected.payload as CountPayload;
              return (
                <>
                  <Card>
                    <Heading>
                      {loc(p.location_id)} · round {p.round}
                    </Heading>
                    <Txt small>
                      Snapshot counts stay unchanged until manager approval.
                    </Txt>
                    {p.snapshot.map((b) => (
                      <View
                        key={b.batch_id}
                        style={{ gap: 8, paddingVertical: 10 }}
                      >
                        <Txt>
                          {b.code} · snapshot {b.recorded}
                        </Txt>
                        <Txt small>
                          Captured {new Date(b.updated_at).toLocaleString()}
                        </Txt>
                        {selected.state === "counting" ? (
                          field("Physical units counted", b.batch_id, true)
                        ) : (
                          <Txt>
                            Counted {p.counts?.[b.batch_id]} · variance{" "}
                            {p.variances?.[b.batch_id]}
                          </Txt>
                        )}
                      </View>
                    ))}
                  </Card>
                  {selected.state === "counting" &&
                    (p.owner_id === data.me.id || canManage) && (
                      <Button
                        title="Submit count for review"
                        disabled={
                          busy ||
                          reason.length < 3 ||
                          p.batch_ids.some(
                            (id) => !/^\d+$/.test(values[id] || ""),
                          )
                        }
                        onPress={() =>
                          void safely(() =>
                            event(
                              `/count-sessions/${selected.id}/events`,
                              {
                                ...base,
                                action: "submit",
                                lines: p.batch_ids.map((batch_id) => ({
                                  batch_id,
                                  quantity: quantity(values[batch_id], 1, true),
                                })),
                              },
                              "Submit physical count",
                            ),
                          )
                        }
                      />
                    )}{" "}
                  {selected.state === "review" && canManage && (
                    <Button
                      title="Approve ledger adjustments"
                      disabled={busy || reason.length < 3}
                      onPress={() =>
                        void safely(() =>
                          event(
                            `/count-sessions/${selected.id}/events`,
                            { ...base, action: "approve", lines: [] },
                            "Approve count session",
                          ),
                        )
                      }
                    />
                  )}{" "}
                  {!["approved", "cancelled"].includes(selected.state) &&
                    canSteward && (
                      <Button
                        title="Request fresh recount snapshot"
                        secondary
                        disabled={busy || offline || reason.length < 3}
                        onPress={() =>
                          void safely(() =>
                            event(
                              `/count-sessions/${selected.id}/events`,
                              { ...base, action: "recount", lines: [] },
                              "Request recount",
                            ),
                          )
                        }
                      />
                    )}
                </>
              );
            })()}
          {selected.kind === "supplier_order" &&
            (() => {
              const p = selected.payload as SupplierPayload;
              return (
                <>
                  <Card>
                    <Heading>{p.supplier}</Heading>
                    <Txt>
                      {loc(p.location_id)} · {p.quantity - p.received}{" "}
                      outstanding · {p.accepted} accepted
                    </Txt>
                    <Txt small>
                      Confirmation is manually recorded; no external purchase is
                      sent.
                    </Txt>
                    {selected.state === "approved" &&
                      field(
                        "Supplier-promised arrival · YYYY-MM-DD",
                        "promised",
                      )}
                    {["acknowledged", "partial"].includes(selected.state) && (
                      <>
                        {field("Accepted units", "quantity", true)}
                        {field("Damaged / quarantined units", "damaged", true)}
                        {field("Batch code", "code")}
                        {field("Expiry · YYYY-MM-DD", "expiry")}
                      </>
                    )}
                  </Card>
                  {selected.state === "draft" && canManage && (
                    <Button
                      title="Approve supplier order"
                      disabled={busy || reason.length < 3}
                      onPress={() =>
                        void safely(() =>
                          event(
                            `/suppliers/orders/${selected.id}/events`,
                            {
                              version: selected.version,
                              as_of: asOf,
                              action: "approve",
                              reference: reason,
                            },
                            "Approve supplier order",
                          ),
                        )
                      }
                    />
                  )}{" "}
                  {selected.state === "approved" && canPlan && (
                    <Button
                      title="Record supplier acknowledgement"
                      disabled={
                        busy ||
                        reason.length < 3 ||
                        !/^\d{4}-\d{2}-\d{2}$/.test(values.promised || "")
                      }
                      onPress={() =>
                        void safely(() =>
                          event(
                            `/suppliers/orders/${selected.id}/events`,
                            {
                              version: selected.version,
                              as_of: asOf,
                              action: "acknowledge",
                              promised_on: values.promised,
                              reference: reason,
                            },
                            "Record supplier confirmation",
                          ),
                        )
                      }
                    />
                  )}{" "}
                  {["acknowledged", "partial"].includes(selected.state) &&
                    canExecute && (
                      <Button
                        title="Confirm supplier receipt"
                        disabled={
                          busy ||
                          reason.length < 3 ||
                          !values.code ||
                          !values.expiry
                        }
                        onPress={() =>
                          void safely(() =>
                            event(
                              `/suppliers/orders/${selected.id}/receipts`,
                              {
                                version: selected.version,
                                as_of: asOf,
                                quantity: quantity(
                                  values.quantity || "0",
                                  1,
                                  true,
                                ),
                                damaged: quantity(
                                  values.damaged || "0",
                                  1,
                                  true,
                                ),
                                code: values.code,
                                expiry: values.expiry,
                                reference: reason,
                              },
                              "Receive supplier delivery",
                            ),
                          )
                        }
                      />
                    )}
                </>
              );
            })()}
          {selected.kind === "return_transfer" &&
            (() => {
              const p = selected.payload as ReturnPayload;
              const actions =
                selected.state === "requested" && canManage
                  ? ["approve", "cancel"]
                  : selected.state === "approved"
                    ? canManage
                      ? ["dispatch", "cancel"]
                      : canExecute
                        ? ["dispatch"]
                        : []
                    : selected.state === "in_transit" && canExecute
                      ? ["receive"]
                      : selected.state === "received_for_review" && canSteward
                        ? ["release", "quarantine"]
                        : [];
              return (
                <>
                  <Card>
                    <Heading>
                      {loc(p.source_id)} → {loc(p.destination_id)}
                    </Heading>
                    <Txt>
                      {number(p.quantity)} units · {p.reason}
                    </Txt>
                    <Txt small>
                      Reverse transit is separate from receiving. Returned stock
                      cannot be reused until disposition.
                    </Txt>
                  </Card>
                  {actions.map((action) => (
                    <Button
                      key={action}
                      title={title(action) + " return"}
                      disabled={busy || reason.length < 3}
                      onPress={() =>
                        void safely(() =>
                          event(
                            `/return-transfers/${selected.id}/events`,
                            { ...base, action },
                            `${action} return transfer`,
                          ),
                        )
                      }
                    />
                  ))}
                </>
              );
            })()}
        </>
      )}
      {tab === "evidence" && (
        <>
          <Card>
            <Heading>Stock card · selected medicine</Heading>
            <Txt small>
              Choose a site to trace its physical, reserved and available
              balances.
            </Txt>
            {data.locations.map((l) => (
              <Button
                key={l.id}
                title={loc(l.id)}
                secondary
                disabled={busy || offline}
                onPress={() =>
                  void safely(async () =>
                    setStockCard(
                      await api!.request<StockCard>(
                        `/inventory/stock-card?product_id=${encodeURIComponent(session.product)}&location_id=${encodeURIComponent(l.id)}&as_of=${asOf}`,
                      ),
                    ),
                  )
                }
              />
            ))}
          </Card>
          {stockCard && (
            <Card>
              <Heading>
                {stockCard.reconciled
                  ? "Ledger balanced"
                  : "Review stock ledger"}
              </Heading>
              <Txt>
                {stockCard.opening} opening +{" "}
                {stockCard.receipts_and_positive_adjustments} incoming −{" "}
                {stockCard.issues_and_negative_adjustments} outgoing ={" "}
                {stockCard.calculated_physical} physical
              </Txt>
              <Txt>
                {stockCard.balance.usable} usable · {stockCard.balance.reserved}{" "}
                reserved · {stockCard.balance.available} available
              </Txt>
              {stockCard.movements.slice(-30).map((m) => (
                <View key={m.id}>
                  <Txt>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta} · {title(m.reason)}
                  </Txt>
                  <Txt small>
                    {m.reference} · {new Date(m.created_at).toLocaleString()}
                  </Txt>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
