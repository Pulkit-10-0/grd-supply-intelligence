import React, { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Option } from "../../shared/types";
import { supplyFlow, supplySteps } from "../../shared/workflow";
import {
  canLocation,
  dateLabel,
  hasRole,
  money,
  number,
  remainingDispatch,
  shortLocation,
  shortProduct,
  title,
} from "../../shared/utils";
import { useSession } from "./session";
import { quantity } from "./queue";
import {
  Badge,
  Disclosure,
  WorkflowProgress,
  Button,
  Card,
  detail,
  Empty,
  Field,
  Heading,
  Page,
  s,
  Txt,
} from "./ui";

export function DetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  return <DetailContent key={`${kind}:${id}`} kind={kind} id={id} />;
}

function DetailContent({ kind, id }: { kind: string; id: string }) {
  const session = useSession();
  const { data, network, product, api, busy, asOf } = session;
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [comparisonIdentity, setComparisonIdentity] = useState("");
  const identity = `${id}|${product}|${qty}|${data?.me.inventory_revision}`;
  const visibleOptions = comparisonIdentity === identity ? options : null;
  const [receipt, setReceipt] = useState<
    Record<string, { accepted: string; damaged: string; reason: string }>
  >({});
  const [receiver, setReceiver] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [shortLines, setShortLines] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  // Keep the original batch snapshot even if a pull-to-refresh occurs while entering a count.
  const [countBaseline] = useState(
    () => data?.batches.find((b) => b.id === id)?.updated_at,
  );
  if (!data) return null;
  const loc = (value: string) =>
    shortLocation(data.locations.find((l) => l.id === value)?.name || value);
  const prod = (value: string) =>
    shortProduct(data.products.find((p) => p.id === value)?.name || value);
  const canPlan = hasRole(data, "manager", "planner");
  const canApprove = hasRole(data, "manager");
  const canExecute = hasRole(data, "manager", "operator");
  async function safely(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      session.setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    }
  }
  const post = async (path: string, body: unknown, label: string) => {
    const saved = await session.post(path, body, label);
    if (saved && kind === "plan") return;
    if (saved && kind === "shipment") {
      const shipment = data?.shipments.find((s) => s.id === id);
      if (shipment) {
        router.replace({
          pathname: "/detail",
          params: { kind: "plan", id: shipment.plan_id },
        });
        return;
      }
    }
    if (saved) router.back();
  };
  const lead = (
    <Button
      title="← Back to workspace"
      secondary
      onPress={() => router.back()}
    />
  );
  if (kind === "location" || kind === "request") {
    const request =
      kind === "request" ? data.requests.find((r) => r.id === id) : null;
    const destination = request?.destination_id || id;
    const productId = request?.product_id || product;
    const item = data.products.find((p) => p.id === productId);
    const row = network?.table.find(
      (r) => r.location_id === destination && r.product_id === productId,
    );
    const location = data.locations.find((l) => l.id === destination);
    if (!location || !item)
      return (
        <Page title="Record unavailable" eyebrow="Details">
          {lead}
          <Empty text="Refresh the workspace and reopen this record." />
        </Page>
      );
    return (
      <Page
        title={loc(destination)}
        eyebrow={
          kind === "request"
            ? "Stock request / eligible supply"
            : "Site intelligence / act with evidence"
        }
      >
        {lead}
        <Card>
          <Text style={s.label}>{prod(productId)}</Text>
          <Heading>
            {row?.balance.known
              ? number(row.balance.available) + " units available"
              : "Stock projection not available"}
          </Heading>
          <Txt>
            {row
              ? `${number(row.days_of_cover, 1)} days nominal cover · ${number(row.inbound_units)} inbound`
              : "Select this medicine on the network to see its projection."}
          </Txt>
          <Txt small>
            {location.coordinate_source} · {location.district}
          </Txt>
          {row?.action_deadline && (
            <Txt>
              Act by {dateLabel(row.action_deadline.latest_action_on)} ·{" "}
              {row.action_deadline.slack_days} days of slack (delivery +
              approval buffer counted once).
            </Txt>
          )}
          {row && (
            <>
              <Txt small>
                Projection: {row.projection_method} · History {row.history_days}{" "}
                days · Measure {row.rate_measure || "Unknown"}
              </Txt>
              <Badge
                text={
                  row.shortage_date
                    ? "Projected shortage " + dateLabel(row.shortage_date)
                    : title(row.status)
                }
                tone={row.shortage_date ? "warning" : "neutral"}
              />
            </>
          )}
          {request && (
            <Txt>
              {number(request.quantity - request.fulfilled - request.cancelled)}{" "}
              units unfulfilled · Needed {dateLabel(request.needed_by)} ·{" "}
              {request.reason}
            </Txt>
          )}
        </Card>
        {canPlan && canLocation(data, destination) && (
          <Card>
            <Heading>Compare eligible sources</Heading>
            <Txt small>
              Enter whole packs of {item.pack_size} {item.base_unit}s. Stock is
              reserved after approval.
            </Txt>
            <Field
              label="Required units"
              value={qty}
              onChangeText={setQty}
              numeric
            />
            <Button
              title={comparing ? "Checking eligibility…" : "Compare sources"}
              disabled={busy || comparing}
              onPress={() => {
                void safely(async () => {
                  const value = quantity(qty, item.pack_size);
                  setComparing(true);
                  setSelected(null);
                  try {
                    const result = await api!.request<{ options: Option[] }>(
                      `/planning/options?product_id=${encodeURIComponent(productId)}&destination_id=${encodeURIComponent(destination)}&quantity=${value}&as_of=${asOf}`,
                    );
                    setOptions(result.options);
                    setComparisonIdentity(identity);
                  } finally {
                    setComparing(false);
                  }
                });
              }}
            />
            {visibleOptions?.map((o) => (
              <Card key={o.source_id}>
                <View style={s.between}>
                  <Heading>{loc(o.source_id)}</Heading>
                  <Badge
                    text={o.feasible ? "Eligible" : "Blocked"}
                    tone={o.feasible ? "healthy" : "warning"}
                  />
                </View>
                {o.reason && <Txt>{o.reason}</Txt>}
                {o.evidence && (
                  <>
                    <Txt>
                      Arrival {dateLabel(o.evidence.arrival_date)} ·{" "}
                      {o.evidence.minimum_shelf_days}+ days shelf life
                    </Txt>
                    <Txt small>
                      {number(o.evidence.source_available)} source available ·{" "}
                      {number(o.evidence.donor_protected)} donor-protected ·{" "}
                      {money(o.evidence.cost_paise)}
                    </Txt>
                    <Txt small>{o.evidence.policy_source}</Txt>
                    {(row?.shortage_date || request?.needed_by) &&
                      o.evidence.arrival_date >
                        (row?.shortage_date || request!.needed_by) && (
                        <>
                          <Badge
                            text="Arrival after the required date"
                            tone="critical"
                          />
                          <Txt small>
                            This transfer cannot prevent the first projected gap
                            or meet the recorded due date. Review earlier supply
                            or escalate the shortage.
                          </Txt>
                        </>
                      )}
                  </>
                )}
                {o.feasible && (
                  <Button
                    title={
                      selected === o.source_id ? "Selected" : "Choose source"
                    }
                    secondary
                    onPress={() => setSelected(o.source_id)}
                  />
                )}
              </Card>
            ))}
            {visibleOptions?.length === 0 && (
              <Txt>
                No source options were returned. Review stock or route policies.
              </Txt>
            )}
            {selected && visibleOptions && comparisonIdentity === identity && (
              <Button
                title="Create proposed supply plan"
                disabled={busy}
                onPress={() => {
                  void safely(() =>
                    post(
                      "/plans",
                      {
                        product_id: productId,
                        destination_id: destination,
                        source_id: selected,
                        quantity: quantity(qty, item.pack_size),
                        as_of: asOf,
                        ...(request ? { request_id: request.id } : {}),
                      },
                      `Propose ${qty} units to ${loc(destination)}`,
                    ),
                  );
                }}
              />
            )}
            {!request && (
              <>
                <Field
                  label="Request reason"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Why is stock needed?"
                />
                <Button
                  title="Record a replenishment request"
                  secondary
                  disabled={busy || reason.trim().length < 3}
                  onPress={() => {
                    void safely(() =>
                      post(
                        "/requests",
                        {
                          product_id: productId,
                          destination_id: destination,
                          quantity: quantity(qty, item.pack_size),
                          needed_by: row?.shortage_date || asOf,
                          reason: reason.trim(),
                        },
                        `Request ${qty} units for ${loc(destination)}`,
                      ),
                    );
                  }}
                />
              </>
            )}
          </Card>
        )}
        {hasRole(data, "manager", "planner") && (
          <Card>
            <Heading>Forecast this lane</Heading>
            <Txt small>
              Run a demand forecast. Find the results under More → Forecasts.
            </Txt>
            <Button
              title="Run evaluated forecast"
              disabled={busy}
              onPress={() => {
                void safely(() =>
                  post(
                    "/jobs/forecast",
                    {
                      product_id: productId,
                      location_id: destination,
                      as_of: asOf,
                      measure: "requested",
                      horizons: [1, 2, 4],
                    },
                    `Forecast ${loc(destination)}`,
                  ),
                );
              }}
            />
          </Card>
        )}
        <Heading>Site batches</Heading>
        {data.batches
          .filter(
            (b) => b.location_id === destination && b.product_id === productId,
          )
          .map((b) => (
            <Card key={b.id}>
              <Heading>{b.code}</Heading>
              <Txt>
                {number(b.quantity)} physical · {number(b.reserved)} reserved ·
                Exp {dateLabel(b.expiry)}
              </Txt>
              <Button
                title="Open batch record"
                secondary
                onPress={() => detail("batch", b.id)}
              />
            </Card>
          ))}
      </Page>
    );
  }
  if (kind === "plan") {
    const p = data.plans.find((p) => p.id === id);
    if (!p)
      return (
        <Page title="Plan unavailable" eyebrow="Supply execution">
          {lead}
          <Empty text="Refresh and reopen this plan." />
        </Page>
      );
    const flow = supplyFlow(data, p);
    const sourceAccess = canLocation(data, p.source_id),
      destAccess = canLocation(data, p.destination_id);
    const pack =
      data.products.find((x) => x.id === p.product_id)?.pack_size || 1;
    return (
      <Page title="Supply plan" eyebrow="Orders">
        {lead}
        <WorkflowProgress
          steps={supplySteps}
          stage={flow.stage}
          partialStep={flow.partialDispatch ? 2 : undefined}
        />
        <Card>
          <Badge text={flow.label} />
          <Heading>{prod(p.product_id)}</Heading>
          <Txt>
            {loc(p.source_id)} → {loc(p.destination_id)}
          </Txt>
          <Text style={s.title}>{number(p.quantity)} units</Text>
          <Txt>
            Arrival {dateLabel(p.arrival_date)} · Version {p.version}
          </Txt>
          <Txt>
            {number(flow.cancelled ? 0 : flow.unshipped)} to dispatch ·{" "}
            {number(flow.outstanding)} in transit · {number(flow.received)}{" "}
            received
          </Txt>
        </Card>
        <Card style={{ backgroundColor: "#EDF3E6" }}>
          <Heading>
            {flow.stage === 4 ? "Delivery complete" : "Next step"}
          </Heading>
          <Txt>{flow.instruction}</Txt>
        </Card>
        <Disclosure title="Batch allocation & planning details">
          <Card>
            <Heading>Why this source?</Heading>
            <Txt>
              {p.explanation.minimum_shelf_days}+ days minimum shelf life on
              arrival
            </Txt>
            <Txt>
              {number(p.explanation.source_available)} source available ·{" "}
              {number(p.explanation.donor_protected)} donor-protected
            </Txt>
            <Txt>
              {money(p.explanation.cost_paise)} illustrative transport cost
            </Txt>
            <Txt small>{p.explanation.policy_source}</Txt>
            <Txt small>
              Exact batch allocations:{" "}
              {p.explanation.allocations
                .map((a) => `${a.batch_id}: ${a.quantity}`)
                .join(" · ")}
            </Txt>
            <Txt small>
              Approval revalidates the recorded version and inputs. A stale
              proposal must be reviewed again.
            </Txt>
          </Card>
        </Disclosure>
        {p.status === "proposed" &&
          canApprove &&
          sourceAccess &&
          destAccess && (
            <Button
              title="Approve & reserve"
              disabled={busy}
              onPress={() => {
                void safely(() =>
                  post(
                    `/plans/${p.id}/approve`,
                    { version: p.version, as_of: asOf },
                    `Approve plan ${p.id.slice(0, 8)}`,
                  ),
                );
              }}
            />
          )}
        {["approved", "partial", "dispatched"].includes(p.status) &&
          canExecute &&
          sourceAccess &&
          remainingDispatch(data, p) > 0 && (
            <Card>
              <Heading>Dispatch stock</Heading>
              <Txt>
                {number(remainingDispatch(data, p))} units remain unshipped ·
                Pack size {pack}
              </Txt>
              <Field
                label="Units leaving the source"
                value={qty}
                onChangeText={setQty}
                numeric
              />
              <Button
                title="Record dispatch"
                disabled={busy}
                onPress={() => {
                  void safely(async () => {
                    const value = quantity(qty, pack);
                    if (value > remainingDispatch(data, p))
                      throw new Error(
                        "Quantity exceeds remaining unshipped units.",
                      );
                    await post(
                      `/plans/${p.id}/dispatch`,
                      { quantity: value, as_of: asOf },
                      `Dispatch ${value} units from ${loc(p.source_id)}`,
                    );
                  });
                }}
              />
            </Card>
          )}
        <Heading>Linked shipments</Heading>
        {data.shipments
          .filter((sh) => sh.plan_id === p.id)
          .map((sh) => (
            <Card key={sh.id}>
              <Txt>
                Dispatched {dateLabel(sh.dispatched_on)} · Expected{" "}
                {dateLabel(sh.expected_on)}
              </Txt>
              <Txt>
                {number(
                  sh.lines.reduce((n, l) => n + l.quantity - l.received, 0),
                )}{" "}
                units still in transit
              </Txt>
              <Button
                title="View receipt & batch lines"
                secondary
                onPress={() => detail("shipment", sh.id)}
              />
            </Card>
          ))}
        {canApprove &&
          sourceAccess &&
          destAccess &&
          ["proposed", "approved", "partial", "dispatched"].includes(
            p.status,
          ) && (
            <Disclosure title="Cancel unshipped stock">
              <Card>
                <Heading>Cancel unshipped allocation</Heading>
                <Txt small>
                  Shipped stock remains tracked through receipt. Cancellation
                  releases only unshipped reservations.
                </Txt>
                <Field
                  label="Cancellation reason"
                  value={reason}
                  onChangeText={setReason}
                />
                <Button
                  title={
                    confirm ? "Confirm cancellation" : "Review cancellation…"
                  }
                  secondary
                  disabled={busy || reason.trim().length < 3}
                  onPress={() => {
                    if (!confirm) {
                      setConfirm(true);
                      return;
                    }
                    void safely(() =>
                      post(
                        `/plans/${p.id}/cancel`,
                        { reason },
                        `Cancel plan ${p.id.slice(0, 8)}`,
                      ),
                    );
                  }}
                />
              </Card>
            </Disclosure>
          )}
      </Page>
    );
  }
  if (kind === "shipment") {
    const sh = data.shipments.find((x) => x.id === id);
    if (!sh)
      return (
        <Page title="Shipment unavailable" eyebrow="Receipt">
          {lead}
          <Empty text="Refresh and reopen this shipment." />
        </Page>
      );
    const shipmentPlan = data.plans.find((p) => p.id === sh.plan_id);
    const canReceive =
      !!shipmentPlan && canExecute && canLocation(data, sh.destination_id);
    return (
      <Page title="Record delivery" eyebrow="Receiving">
        {lead}
        <WorkflowProgress
          steps={supplySteps}
          stage={sh.lines.some((l) => l.received < l.quantity) ? 3 : 4}
        />
        <Card>
          <Text style={s.label}>Medicine being received</Text>
          <Heading>
            {shipmentPlan
              ? prod(shipmentPlan.product_id)
              : "Refresh to load the medicine record"}
          </Heading>
          <Txt>
            {loc(sh.source_id)} → {loc(sh.destination_id)}
          </Txt>
          <Txt>
            Dispatched {dateLabel(sh.dispatched_on)} · Expected{" "}
            {dateLabel(sh.expected_on)}
          </Txt>
          <Txt small>Shipment {sh.id}</Txt>
        </Card>
        {sh.lines.map((line) => {
          const input = receipt[line.id] || {
            accepted: "0",
            damaged: "0",
            reason: "",
          };
          const update = (key: string, value: string) =>
            setReceipt((prev) => ({
              ...prev,
              [line.id]: { ...input, [key]: value },
            }));
          return (
            <Card key={line.id}>
              <Heading>{line.batch_code || line.source_batch_id}</Heading>
              <Txt>
                {number(line.quantity - line.received)} remaining · Exp{" "}
                {dateLabel(line.expiry, true)}
              </Txt>
              <Txt small>
                {number(line.accepted)} accepted previously ·{" "}
                {number(line.received - line.accepted)} quarantined ·{" "}
                {number(line.returned)} returned to source
              </Txt>
              {canReceive && line.quantity > line.received && (
                <>
                  <Field
                    label="Accepted units"
                    value={input.accepted}
                    onChangeText={(v) => update("accepted", v)}
                    numeric
                  />
                  <Field
                    label="Damaged / quarantined units"
                    value={input.damaged}
                    onChangeText={(v) => update("damaged", v)}
                    numeric
                  />
                  {Number(input.damaged) > 0 && (
                    <Field
                      label="Damage reason"
                      value={input.reason}
                      onChangeText={(v) => update("reason", v)}
                    />
                  )}
                </>
              )}
            </Card>
          );
        })}
        {canReceive && sh.lines.some((l) => l.quantity > l.received) && (
          <>
            <Card>
              <Txt>
                Accepted units become usable at the destination. Damaged units
                enter quarantine and open a discrepancy case. Pending entries
                never increase confirmed stock.
              </Txt>
              <Txt small>
                The native app securely retains an unconfirmed receipt if
                connectivity fails. Retry the original entry from More.
              </Txt>
            </Card>
            <Card>
              <Field
                label="Receiver name"
                value={receiver}
                onChangeText={setReceiver}
              />
              <Field
                label="Delivery document reference"
                value={deliveryReference}
                onChangeText={setDeliveryReference}
              />
              {sh.lines
                .filter((l) => l.received < l.quantity)
                .map((l) => (
                  <Button
                    key={l.id}
                    secondary
                    title={`${shortLines.includes(l.id) ? "✓ Short / investigate" : "Mark short / investigate"} · ${l.batch_code || l.id}`}
                    onPress={() =>
                      setShortLines(
                        shortLines.includes(l.id)
                          ? shortLines.filter((x) => x !== l.id)
                          : [...shortLines, l.id],
                      )
                    }
                  />
                ))}
              <Button
                secondary
                title={
                  confirm
                    ? "✓ Batch, expiry and quantities checked"
                    : "Confirm batch, expiry and physical quantities"
                }
                onPress={() => setConfirm(!confirm)}
              />
            </Card>
            <Button
              title="Record delivery proof & receipt"
              disabled={busy}
              onPress={() => {
                void safely(async () => {
                  const lines = sh.lines
                    .map((l) => {
                      const input = receipt[l.id] || {
                        accepted: "0",
                        damaged: "0",
                        reason: "",
                      };
                      const accepted = quantity(input.accepted, 1, true),
                        damaged = quantity(input.damaged, 1, true);
                      if (accepted + damaged > l.quantity - l.received)
                        throw new Error(
                          `Receipt exceeds units in transit for ${l.batch_code || l.id}.`,
                        );
                      if (damaged > 0 && input.reason.trim().length < 3)
                        throw new Error(
                          "Add a damage reason for every quarantined line.",
                        );
                      return {
                        line_id: l.id,
                        accepted,
                        damaged,
                        reason: input.reason.trim(),
                      };
                    })
                    .filter((l) => l.accepted + l.damaged > 0);
                  if (!lines.length && !shortLines.length)
                    throw new Error(
                      "Enter received units or identify a short delivery.",
                    );
                  if (
                    !confirm ||
                    receiver.trim().length < 2 ||
                    deliveryReference.trim().length < 3
                  )
                    throw new Error(
                      "Confirm the physical check, receiver and delivery document reference.",
                    );
                  await post(
                    `/shipments/${sh.id}/proof`,
                    {
                      as_of: asOf,
                      lines,
                      receiver: receiver.trim(),
                      reference: deliveryReference.trim(),
                      confirmed: true,
                      short_lines: shortLines,
                    },
                    `Receive shipment ${sh.id.slice(0, 8)} at ${loc(sh.destination_id)}`,
                  );
                });
              }}
            />
          </>
        )}
      </Page>
    );
  }
  if (kind === "batch") {
    const b = data.batches.find((b) => b.id === id);
    if (!b)
      return (
        <Page title="Batch unavailable" eyebrow="Traceability">
          {lead}
          <Empty text="Refresh or verify your site access before opening this batch." />
        </Page>
      );
    return (
      <Page title={b.code} eyebrow="Verified batch / stock integrity">
        {lead}
        <Card>
          <Badge text={title(b.status)} />
          <Heading>{prod(b.product_id)}</Heading>
          <Txt>{loc(b.location_id)}</Txt>
          <Text style={s.title}>{number(b.quantity)} units</Text>
          <Txt>
            {number(b.reserved)} reserved · Expiry {dateLabel(b.expiry, true)}
          </Txt>
          <Txt small>Internal QR payload: GRD:BATCH:{b.id}</Txt>
        </Card>
        {hasRole(data, "operator", "manager", "steward") &&
          canLocation(data, b.location_id) && (
            <Card>
              <Heading>Record a physical count</Heading>
              <Txt small>
                Creates a discrepancy case for review. It does not silently
                overwrite stock. The original batch snapshot must still match
                when it reaches the server; otherwise a recount is required. An
                authorised reviewer posts the adjustment separately.
              </Txt>
              <Field
                label="Counted physical units"
                value={qty}
                onChangeText={setQty}
                numeric
              />
              <Field
                label="Count reason"
                value={reason}
                onChangeText={setReason}
              />
              <Button
                title="Submit count for review"
                disabled={busy || reason.trim().length < 3 || !countBaseline}
                onPress={() => {
                  void safely(() =>
                    post(
                      `/inventory/batches/${b.id}/count`,
                      {
                        quantity: quantity(qty, 1, true),
                        reason: reason.trim(),
                        expected_updated_at: countBaseline,
                      },
                      `Count batch ${b.code}`,
                    ),
                  );
                }}
              />
            </Card>
          )}
      </Page>
    );
  }
  if (kind === "case") {
    const item = data.cases.find((c) => c.id === id);
    if (!item)
      return (
        <Page title="Case unavailable" eyebrow="Stock integrity">
          {lead}
        </Page>
      );
    return (
      <Page
        title={title(item.kind)}
        eyebrow="Discrepancy / accountable follow-up"
      >
        {lead}
        <Card>
          <Badge text={title(item.status)} tone="warning" />
          <Txt>
            {loc(item.location_id)} · {item.reference}
          </Txt>
          {Object.entries(item.details).map(([key, value]) => (
            <View key={key} style={{ gap: 4 }}>
              <Text style={s.label}>{title(key)}</Text>
              <Txt>
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              </Txt>
            </View>
          ))}
          {item.comments.map((c, i) => (
            <Txt key={i}>{c.text}</Txt>
          ))}
        </Card>
        <Txt small>
          Review and resolve this case in the website action centre. Count
          adjustments and return dispositions require explicit review; the
          mobile app never resolves them automatically.
        </Txt>
      </Page>
    );
  }
  if (kind === "job") {
    const j = data.jobs.find((x) => x.id === id);
    if (!j)
      return (
        <Page title="Job unavailable" eyebrow="Evidence">
          {lead}
        </Page>
      );
    const result = j.result;
    return (
      <Page
        title={title(j.kind) + " evidence"}
        eyebrow="Evaluation / reproducible results"
      >
        {lead}
        <Badge text={title(j.status)} />
        <Txt>
          {loc(j.payload.location_id)} · {prod(j.payload.product_id)} · As of{" "}
          {j.payload.as_of}
        </Txt>
        {j.error && (
          <Card>
            <Txt>{j.error}</Txt>
          </Card>
        )}
        <Card>
          <Heading>
            {result.selected_model
              ? title(result.selected_model)
              : title(j.kind)}
          </Heading>
          <Txt>
            {result.selection ||
              result.reason ||
              "Review the recorded job result below."}
          </Txt>
          <Txt small>
            Model version: {result.model_version || "Not supplied"} · Complete
            weeks: {number(result.complete_weeks)}
          </Txt>
          <Txt small>
            Source cutoff: {result.source_cutoff || j.payload.as_of} · Evidence:{" "}
            {String(result.evidence_type || data.me.evidence_type)}
          </Txt>
        </Card>
        {(result.operational_forecast || result.forecast || []).map((p) => (
          <Card key={p.weeks_ahead}>
            <Text style={s.label}>
              Week {p.weeks_ahead} · Ending {dateLabel(p.week_ending)}
            </Text>
            <Text style={s.title}>{number(p.quantity)} units</Text>
            <Txt>
              Interval {number(p.lower)} – {number(p.upper)}
            </Txt>
          </Card>
        ))}
        {result.interval_note && <Txt small>{result.interval_note}</Txt>}
        {Object.entries(result.test_metrics_by_horizon || {}).map(
          ([horizon, models]) => (
            <Card key={horizon}>
              <Heading>Held-out evaluation · {horizon} week(s)</Heading>
              {Object.entries(models).map(([model, metric]) => (
                <View key={model} style={{ gap: 5 }}>
                  <Txt>{title(model)}</Txt>
                  <Txt small>
                    WAPE {number(metric.wape_pct, 2)}% · Bias{" "}
                    {number(metric.bias_pct, 2)}% · MAE {number(metric.mae, 2)}{" "}
                    · {metric.observations} observations
                  </Txt>
                  {metric.interval_coverage != null && (
                    <Txt small>
                      Interval coverage:{" "}
                      {number(metric.interval_coverage * 100, 1)}%
                    </Txt>
                  )}
                </View>
              ))}
            </Card>
          ),
        )}
        {result.baseline && result.proposed && (
          <Card>
            <Heading>Policy comparison</Heading>
            <View style={s.between}>
              <Text style={s.label}>Measure</Text>
              <Text style={s.label}>Baseline → Proposed</Text>
            </View>
            {Object.entries(result.baseline).map(([key, value]) => (
              <View key={key} style={s.between}>
                <Text style={[s.small, { flex: 1 }]}>{title(key)}</Text>
                <Txt>
                  {number(value, 2)} → {number(result.proposed?.[key], 2)}
                </Txt>
              </View>
            ))}
          </Card>
        )}
        {(result.assumptions || []).map((a, i) => (
          <Txt small key={i}>
            {a}
          </Txt>
        ))}
        <Txt small>
          Simulation outcomes are generated policy comparisons. Forecast metrics
          describe held-out source data, not measured future performance.
          Dataset references:{" "}
          {(result.dataset_ids || []).join(", ") ||
            "See dataset provenance in More."}
        </Txt>
      </Page>
    );
  }
  return (
    <Page title="Record unavailable" eyebrow="Details">
      {lead}
      <Empty
        text={`Refresh the workspace and reopen this ${kind || "record"}.`}
      />
    </Page>
  );
}
