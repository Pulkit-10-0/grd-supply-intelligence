import { supplySteps } from "../../shared/workflow";
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import {
  ArrowUpRight,
  Box,
  CheckCheck,
  MapPin,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { buildActions, type Action } from "../../shared/actions";
import {
  dateLabel,
  hasRole,
  number,
  parseInstant,
  riskLevel,
  shortLocation,
  shortProduct,
  title,
} from "../../shared/utils";
import { useSession } from "./session";
import {
  Badge,
  Disclosure,
  WorkflowProgress,
  Button,
  c,
  Card,
  detail,
  Empty,
  Field,
  Go,
  Heading,
  Page,
  s,
  Txt,
} from "./ui";
import { NetworkMap } from "./NetworkMap";

export function ProductSelector() {
  const { data, product, setProduct } = useSession();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {data?.products.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          accessibilityState={{ selected: product === p.id }}
          onPress={() => setProduct(p.id)}
          style={[s.chip, product === p.id && { backgroundColor: c.ink }]}
        >
          <Text
            style={[s.small, { color: product === p.id ? c.white : c.ink }]}
          >
            {shortProduct(p.name)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
function ActionCard({ action }: { action: Action }) {
  const kind = ["risk", "expiry", "data"].includes(action.kind)
    ? "location"
    : action.kind;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => detail(kind, action.ref)}
    >
      <Card>
        <View style={s.between}>
          <Badge text={action.label} tone={action.severity} />
          <ArrowUpRight size={18} color={c.dim} />
        </View>
        <Heading>{action.title}</Heading>
        <Txt>{action.description}</Txt>
        {action.progress !== undefined && (
          <WorkflowProgress
            steps={supplySteps}
            stage={action.progress}
            partialStep={action.partialDispatch ? 2 : undefined}
          />
        )}
        <Text style={s.small}>
          {action.product} · {action.metric}
        </Text>
      </Card>
    </Pressable>
  );
}
export function HomeScreen() {
  const { data, network, asOf } = useSession();
  if (!data) return null;
  const actions = buildActions(data, network, asOf);
  const critical = network?.table.filter(
    (x) => riskLevel(x, asOf) === "critical",
  ).length;
  const available = network?.table.reduce(
    (a, x) => a + (x.balance.known ? x.balance.available : 0),
    0,
  );
  const inbound = data.shipments.filter((x) =>
    x.lines.some((l) => l.quantity > l.received),
  );
  return (
    <Page title="Today" eyebrow="Supply intelligence / field workspace">
      <LinearGradient
        colors={["#244D3B", "#173B31"]}
        style={{ borderRadius: 26, padding: 23, gap: 20 }}
      >
        <View style={s.between}>
          <Text style={[s.label, { color: "#BED49D" }]}>
            Your network, in focus
          </Text>
          <ShieldCheck size={21} color={c.green} />
        </View>
        <Text
          style={[s.title, { color: c.white, fontSize: 31, lineHeight: 39 }]}
        >
          {network
            ? critical
              ? `${critical} site${critical === 1 ? " needs" : "s need"}\nyour attention.`
              : "A clearer picture.\nA better next move."
            : "Checking the\nstock position…"}
        </Text>
        <Text style={[s.text, { color: "#DEE7D6" }]}>
          Spot a shortage. Move eligible stock. Follow every action through
          receipt.
        </Text>
        <View style={{ height: 1, backgroundColor: "#426451" }} />
        <View style={s.between}>
          <View>
            <Text style={[s.title, { color: c.green }]}>
              {number(available)}
            </Text>
            <Text style={[s.small, { color: "#DEE7D6" }]}>
              available units*
            </Text>
          </View>
          <View>
            <Text style={[s.title, { color: c.white }]}>{inbound.length}</Text>
            <Text style={[s.small, { color: "#DEE7D6" }]}>
              shipments awaiting receipt
            </Text>
          </View>
        </View>
        <Text style={[s.small, { color: "#C5D3BE", fontSize: 10 }]}>
          *Selected medicine · Known stock positions only
        </Text>
      </LinearGradient>
      <ProductSelector />
      <NetworkMap />
      <View style={s.between}>
        <Heading>Next best actions</Heading>
        <Pressable onPress={() => router.navigate("/actions")}>
          <Text style={[s.small, { color: c.ink }]}>View all →</Text>
        </Pressable>
      </View>
      {actions.slice(0, 3).map((a) => (
        <ActionCard key={a.id} action={a} />
      ))}
      {!actions.length && (
        <Empty
          text={
            network
              ? "No open actions in this view."
              : "Loading the selected medicine’s supply projection…"
          }
        />
      )}
      <Card>
        <View style={s.row}>
          <CheckCheck size={22} color={c.ink} />
          <Heading>Stock integrity</Heading>
        </View>
        <Txt>
          {data.reconciliation.ok
            ? "Recorded batch quantities reconcile with the movement ledger."
            : "A ledger discrepancy needs review before relying on stock."}
        </Txt>
        <Badge
          text={data.reconciliation.ok ? "Reconciled" : "Needs review"}
          tone={data.reconciliation.ok ? "healthy" : "critical"}
        />
      </Card>
    </Page>
  );
}
export function NetworkScreen() {
  const { data, network, asOf } = useSession();
  if (!data) return null;
  return (
    <Page title="Network" eyebrow="Location intelligence / 21-day horizon">
      <ProductSelector />
      <NetworkMap large />
      <Heading>Operating locations</Heading>
      {data.locations.map((l) => {
        const row = network?.table.find((r) => r.location_id === l.id);
        return (
          <Pressable
            accessibilityRole="button"
            key={l.id}
            onPress={() => detail("location", l.id)}
          >
            <Card>
              <View style={s.between}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.label}>{l.kind}</Text>
                  <Heading>{shortLocation(l.name)}</Heading>
                </View>
                <MapPin size={21} color={c.dim} />
              </View>
              <View style={s.between}>
                <Text style={s.text}>
                  {row?.balance.known
                    ? number(row.balance.available) + " available"
                    : "Stock unknown"}
                </Text>
                <Badge
                  text={
                    row
                      ? row.shortage_date
                        ? "Shortage " + dateLabel(row.shortage_date)
                        : row.status === "unknown"
                          ? "Missing data"
                          : "Covered in horizon"
                      : "Loading"
                  }
                  tone={row ? riskLevel(row, asOf) : "unknown"}
                />
              </View>
              <Txt small>
                {row
                  ? `${number(row.days_of_cover, 1)} days nominal cover · ${number(row.inbound_units)} inbound`
                  : l.district}
              </Txt>
            </Card>
          </Pressable>
        );
      })}
      <Txt small>
        Cover is a projection from the declared demand measure. Missing stock
        and missing demand stay unknown. Shelf life, route permissions and donor
        protection are checked before a transfer is proposed.
      </Txt>
    </Page>
  );
}
export function ActionsScreen() {
  const { data, network, asOf } = useSession();
  const [filter, setFilter] = useState("All");
  if (!data) return null;
  const actions = buildActions(data, network, asOf);
  const shown = actions.filter(
    (a) =>
      filter === "All" ||
      (filter === "Review"
        ? a.kind === "request" || a.progress === 1
        : filter === "Dispatch"
          ? a.progress === 2 || a.pendingDispatch
          : filter === "Receive"
            ? a.progress === 3 || a.pendingReceipt
            : filter === "Risks"
              ? ["risk", "expiry", "data"].includes(a.kind)
              : a.kind === "case"),
  );
  const inbound = data.shipments.filter((x) =>
    x.lines.some((l) => l.quantity > l.received),
  );
  return (
    <Page title="Action centre" eyebrow="Action centre / from risk to receipt">
      <ProductSelector />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {["All", "Review", "Dispatch", "Receive", "Risks", "Cases"].map((f) => (
          <Pressable
            accessibilityRole="button"
            key={f}
            onPress={() => setFilter(f)}
            style={[s.chip, filter === f && { backgroundColor: c.ink }]}
          >
            <Text style={[s.text, { color: filter === f ? c.white : c.ink }]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {inbound.length > 0 && (
        <>
          <Heading>Incoming shipments</Heading>
          {inbound.map((x) => (
            <Pressable
              accessibilityRole="button"
              key={x.id}
              onPress={() => detail("shipment", x.id)}
            >
              <Card>
                <View style={s.row}>
                  <Truck size={22} color={c.ink} />
                  <Heading>Receipt pending</Heading>
                </View>
                <Txt>
                  {shortLocation(
                    data.locations.find((l) => l.id === x.destination_id)
                      ?.name || "Destination",
                  )}{" "}
                  ·{" "}
                  {number(
                    x.lines.reduce((a, l) => a + l.quantity - l.received, 0),
                  )}{" "}
                  units in transit
                </Txt>
                <Txt small>
                  Expected {dateLabel(x.expected_on)} · Record accepted and
                  quarantined units
                </Txt>
              </Card>
            </Pressable>
          ))}
        </>
      )}
      <Heading>
        {shown.length} open action{shown.length === 1 ? "" : "s"}
      </Heading>
      {shown.map((a) => (
        <ActionCard key={a.id} action={a} />
      ))}
      {!shown.length && <Empty text="No open actions match this filter." />}
    </Page>
  );
}
export function StockScreen() {
  const { data, product } = useSession();
  const [search, setSearch] = useState("");
  if (!data) return null;
  const rows = data.batches.filter(
    (b) =>
      b.product_id === product &&
      `${b.code} ${data.locations.find((l) => l.id === b.location_id)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Page title="Inventory" eyebrow="Batch ledger / traceable by design">
      <Button
        title="Scan an internal batch label"
        onPress={() => router.push("/scan")}
        secondary
      />
      <ProductSelector />
      <Field
        label="Find a batch or location"
        value={search}
        onChangeText={setSearch}
        placeholder="Search batch code…"
      />
      <View style={s.between}>
        <Heading>{rows.length} batches</Heading>
        <Box size={20} color={c.dim} />
      </View>
      {rows.map((b) => (
        <Pressable
          accessibilityRole="button"
          key={b.id}
          onPress={() => detail("batch", b.id)}
        >
          <Card>
            <View style={s.between}>
              <Heading>{b.code}</Heading>
              <Badge
                text={title(b.status)}
                tone={b.status === "usable" ? "healthy" : "warning"}
              />
            </View>
            <Txt>
              {shortLocation(
                data.locations.find((l) => l.id === b.location_id)?.name ||
                  b.location_id,
              )}
            </Txt>
            <View style={s.between}>
              <Txt>
                {number(b.quantity)} physical · {number(b.reserved)} reserved
              </Txt>
              <Text style={s.small}>Exp {dateLabel(b.expiry, true)}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
      {!rows.length && <Empty text="No batches match this selection." />}
    </Page>
  );
}
export function MoreScreen() {
  const session = useSession();
  const { data, product, pending, api, busy } = session;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    citations?: {
      type?: string;
      title?: string;
      quote?: string;
      id?: string;
      version?: number;
    }[];
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [remove, setRemove] = useState("");
  const [mode, setMode] = useState<"policy" | "operations">("policy");
  const [reference, setReference] = useState("");
  const jobs = useMemo(
    () =>
      data?.jobs
        .filter((j) => j.payload.product_id === product)
        .slice()
        .reverse() || [],
    [data, product],
  );
  if (!data) return null;
  async function safely(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      session.setError(
        e instanceof Error ? e.message : "Unable to complete action.",
      );
    }
  }
  return (
    <Page title="More" eyebrow="Evidence / assistant / account">
      <Disclosure title="Data sources & map attribution">
        <Card>
          <View style={s.row}>
            <ShieldCheck size={23} color={c.ink} />
            <Heading>Data sources</Heading>
          </View>
          <Txt>
            {data.me.evidence_type === "synthetic"
              ? "Generated demand and fictional Assam locations support the operating scenario. Public-data forecast benchmarks are separate."
              : "Review dataset provenance and approved operating policies before acting."}
          </Txt>
          <Txt small>
            Map: geoBoundaries / DataMeet / Election Commission of India, 2011 ·
            CC BY 2.5 India. Paths are simplified for mobile. Route lines are
            illustrative.
          </Txt>
        </Card>
      </Disclosure>
      <Button
        title="Operations desk"
        onPress={() => router.push("/operations")}
      />
      <Heading>Pending actions · {pending.length}</Heading>
      <Txt small>
        {Platform.OS === "web"
          ? "Browser preview: actions survive in this tab’s memory only. Use the native app for secure persistence."
          : "Waiting for server confirmation. Retry after reconnecting."}
      </Txt>
      {pending.map((p) => (
        <Card key={p.id}>
          <Badge
            text={
              p.state === "conflict"
                ? "Needs reconciliation"
                : "Awaiting confirmation"
            }
            tone={p.state}
          />
          <Heading>{p.label}</Heading>
          <Txt small>
            {new Date(p.created).toLocaleString()} · Reference{" "}
            {p.id.slice(0, 8)}
          </Txt>
          <PendingSummary body={p.body} />
          {p.error && <Txt>{p.error}</Txt>}
          {p.state === "pending" && (
            <Button
              title="Retry original action"
              disabled={busy}
              onPress={() => {
                void safely(() => session.retry(p));
              }}
            />
          )}
          <Txt small>
            Before removing an unconfirmed action, refresh and check the server
            record. Removing a local entry does not undo a recorded stock
            movement.
          </Txt>
          <Button
            secondary
            disabled={busy}
            title={
              remove === p.id
                ? "Confirm removal from this device"
                : "Remove local entry…"
            }
            onPress={() => {
              if (remove === p.id) {
                void safely(() => session.discard(p.id));
                setRemove("");
              } else setRemove(p.id);
            }}
          />
        </Card>
      ))}
      {!pending.length && (
        <Card>
          <View style={s.row}>
            <CheckCheck size={20} color={c.ink} />
            <Txt>No pending actions on this account.</Txt>
          </View>
        </Card>
      )}
      <Disclosure title="Forecasts & policy simulations">
        <ProductSelector />
        {jobs.slice(0, 6).map((j) => {
          const points =
            j.result.operational_forecast || j.result.forecast || [];
          const max = Math.max(1, ...points.map((p) => p.upper || p.quantity));
          const path = points
            .map(
              (p, i) =>
                `${i ? "L" : "M"}${12 + (i * 260) / Math.max(1, points.length - 1)},${76 - (p.quantity / max) * 60}`,
            )
            .join(" ");
          return (
            <Card key={j.id}>
              <View style={s.between}>
                <Heading>{title(j.kind)}</Heading>
                <Badge
                  text={title(j.status)}
                  tone={j.status === "failed" ? "critical" : "neutral"}
                />
              </View>
              <Txt>
                {shortLocation(
                  data.locations.find((l) => l.id === j.payload.location_id)
                    ?.name || j.payload.location_id,
                )}
              </Txt>
              {j.error && <Txt>{j.error}</Txt>}
              {j.result.selected_model && (
                <Txt small>
                  Selected model: {title(j.result.selected_model)} · Cutoff{" "}
                  {j.result.source_cutoff}
                </Txt>
              )}
              {points.length > 0 && (
                <>
                  <Svg width="100%" height="90" viewBox="0 0 290 90">
                    <Path d={path} stroke={c.ink} strokeWidth="3" fill="none" />
                  </Svg>
                  <Txt small>
                    {points
                      .map(
                        (p) =>
                          `W${p.weeks_ahead}: ${number(p.quantity)} [${number(p.lower)}–${number(p.upper)}]`,
                      )
                      .join(" · ")}
                  </Txt>
                </>
              )}
              {j.result.selection && <Txt small>{j.result.selection}</Txt>}
              {j.result.service_change_percentage_points != null && (
                <Txt>
                  Simulated service change:{" "}
                  {number(j.result.service_change_percentage_points, 2)}{" "}
                  percentage points. Synthetic scenario, not measured impact.
                </Txt>
              )}
              <Go kind="job" id={j.id} />
            </Card>
          );
        })}
        {!jobs.length && (
          <Empty text="No jobs for this medicine. Open a network location to run a forecast." />
        )}
      </Disclosure>
      <Disclosure title="Supply assistant">
        <Card>
          <View style={s.row}>
            <Sparkles size={21} color={c.ink} />
            <Heading>Supply assistant</Heading>
          </View>
          <Txt small>
            Read-only retrieval from approved policy passages or a recorded
            plan. Unsupported questions receive an explicit limitation.
          </Txt>
          <View style={s.row}>
            {(["policy", "operations"] as const).map((m) => (
              <Pressable
                accessibilityRole="button"
                key={m}
                onPress={() => {
                  setMode(m);
                  setAnswer(null);
                }}
                style={s.chip}
              >
                <Text style={[s.small, { color: mode === m ? c.ink : c.dim }]}>
                  {mode === m ? "● " : ""}
                  {title(m)}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === "operations" && (
            <Field
              label="Recorded plan ID"
              value={reference}
              onChangeText={setReference}
            />
          )}
          <Field
            label="Your question"
            value={question}
            onChangeText={setQuestion}
            multiline
            placeholder="Which transfer policy applies?"
          />
          <Button
            title={asking ? "Checking sources…" : "Ask with sources"}
            disabled={
              asking ||
              question.trim().length < 3 ||
              (mode === "operations" && !reference.trim())
            }
            onPress={() => {
              setAsking(true);
              void safely(async () => {
                const result = await api!.request<typeof answer>(
                  "/assistant",
                  "POST",
                  {
                    mode,
                    question,
                    as_of: session.asOf,
                    ...(reference ? { reference_id: reference.trim() } : {}),
                  },
                );
                setAnswer(result);
              }).finally(() => setAsking(false));
            }}
          />
          {answer && (
            <>
              <Txt>{answer.answer}</Txt>
              {answer.citations?.map((citation, index) => (
                <View key={index} style={{ gap: 5 }}>
                  <Text style={s.label}>
                    {citation.title || title(citation.type || "Source")} ·
                    Version {citation.version || "—"}
                  </Text>
                  {citation.quote && <Txt>{citation.quote}</Txt>}
                  {citation.type === "plan" && citation.id && (
                    <Button
                      title="Open the recorded plan evidence"
                      secondary
                      onPress={() => detail("plan", citation.id!)}
                    />
                  )}
                </View>
              ))}
            </>
          )}
        </Card>
      </Disclosure>
      <Disclosure title="Recent activity & datasets">
        {data.audit
          .slice(-8)
          .reverse()
          .map((a) => (
            <Card key={a.id}>
              <Txt>{title(a.action)}</Txt>
              <Txt small>
                {parseInstant(a.created_at).toLocaleString()} · {a.reference}
              </Txt>
            </Card>
          ))}
        {hasRole(data, "manager", "steward") &&
          data.datasets.map((d) => (
            <Card key={d.id}>
              <Text style={s.label}>Dataset provenance</Text>
              <Heading>{d.name}</Heading>
              <Txt small>
                {number(d.row_count)} records · {d.digest.slice(0, 12)}
              </Txt>
              <Txt small>
                {String(d.provenance.evidence_type || "")} ·{" "}
                {String(d.provenance.source_url || "")}
              </Txt>
            </Card>
          ))}
      </Disclosure>
      <Card>
        <Heading>Connected account</Heading>
        <Txt>
          {data.me.email} · {title(data.me.role)}
        </Txt>
        <Txt small>Server: {session.origin}</Txt>
        <Txt small>
          Sign out before changing servers. Signing out revokes this user’s
          existing sessions, including the website. Credentials are never
          bundled with this app.
        </Txt>
        <Button
          title="Sign out"
          secondary
          disabled={busy}
          onPress={() => {
            void safely(session.logout);
          }}
        />
      </Card>
    </Page>
  );
}

function PendingSummary({ body }: { body: unknown }) {
  const value = body as {
    quantity?: number;
    reason?: string;
    as_of?: string;
    lines?: { accepted: number; damaged: number; reason?: string }[];
  };
  return (
    <View style={{ gap: 4 }}>
      {value.quantity != null && <Txt>{number(value.quantity)} units</Txt>}
      {value.reason && <Txt small>{value.reason}</Txt>}
      {value.as_of && (
        <Txt small>Effective date {dateLabel(value.as_of, true)}</Txt>
      )}
      {value.lines?.map((line, i) => (
        <Txt small key={i}>
          Line {i + 1}: {number(line.accepted)} accepted ·{" "}
          {number(line.damaged)} quarantined
          {line.reason ? " · " + line.reason : ""}
        </Txt>
      ))}
    </View>
  );
}
