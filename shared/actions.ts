import type { Data, Network } from "./types";
import { supplyFlow } from "./workflow";
import {
  dateLabel,
  number,
  riskLevel,
  shortLocation,
  shortProduct,
  title,
} from "./utils";
export interface Action {
  id: string;
  kind: "risk" | "expiry" | "plan" | "request" | "case" | "data";
  ref: string;
  title: string;
  description: string;
  location: string;
  product: string;
  severity: string;
  label: string;
  metric: string;
  progress?: number;
  nextLabel?: string;
  pendingReceipt?: boolean;
  pendingDispatch?: boolean;
  partialDispatch?: boolean;
}
export function buildActions(
  data: Data,
  network: Network | null,
  asOf: string,
): Action[] {
  const loc = (id: string) =>
      shortLocation(
        data.locations.find((x) => x.id === id)?.name || "Location",
      ),
    prod = (id: string) =>
      shortProduct(data.products.find((x) => x.id === id)?.name || "Medicine");
  const items: Action[] = [];
  for (const row of network?.table || []) {
    if (row.status === "unknown")
      items.push({
        id: "data-" + row.location_id,
        kind: "data",
        ref: row.location_id,
        title: `${loc(row.location_id)} needs a data check`,
        description: !row.balance.known
          ? "The stock position is missing. Verify inventory before relying on a supply projection."
          : "Demand history is missing. Import a declared source before relying on a supply projection.",
        location: loc(row.location_id),
        product: prod(row.product_id),
        severity: "warning",
        label: "Missing data",
        metric: "Review evidence",
      });
    if (row.shortage_date)
      items.push({
        id: "risk-" + row.location_id,
        kind: "risk",
        ref: row.location_id,
        title: `${loc(row.location_id)} needs replenishment`,
        description: `Projected shortage on ${dateLabel(row.shortage_date)}. Review an eligible source before it happens.`,
        location: loc(row.location_id),
        product: prod(row.product_id),
        severity: riskLevel(row, asOf) === "critical" ? "critical" : "warning",
        label: riskLevel(row, asOf) === "critical" ? "Critical" : "At risk",
        metric: `${number(row.days_of_cover, 1)} days nominal cover`,
      });
    if (row.projected_expiry_units > 0)
      items.push({
        id: "expiry-" + row.location_id,
        kind: "expiry",
        ref: row.location_id,
        title: `Expiry exposure in ${loc(row.location_id)}`,
        description: `${number(row.projected_expiry_units)} units may remain unused within the planning horizon.`,
        location: loc(row.location_id),
        product: prod(row.product_id),
        severity: "warning",
        label: "Expiry risk",
        metric: "Review stock",
      });
  }
  for (const p of data.plans.filter(
    (p) =>
      ["proposed", "approved", "partial", "dispatched"].includes(p.status) ||
      supplyFlow(data, p).outstanding > 0,
  )) {
    const flow = supplyFlow(data, p);
    items.push({
      id: p.id,
      kind: "plan",
      ref: p.id,
      title: `${loc(p.source_id)} → ${loc(p.destination_id)}`,
      description: `${number(p.quantity)} units · ${flow.label}`,
      location: loc(p.destination_id),
      product: prod(p.product_id),
      severity: "neutral",
      label: flow.label,
      metric: flow.outstanding
        ? `${number(flow.outstanding)} in transit`
        : `${number(flow.unshipped)} to dispatch`,
      progress: flow.stage,
      pendingReceipt: flow.outstanding > 0,
      pendingDispatch: flow.canDispatch,
      partialDispatch: flow.partialDispatch,
      nextLabel:
        flow.next === "approve"
          ? "Review plan"
          : flow.next === "receive"
            ? "Record receipt"
            : flow.next === "dispatch"
              ? "Prepare dispatch"
              : "View plan",
    });
  }
  for (const r of data.requests.filter(
    (x) =>
      x.quantity > x.fulfilled + x.cancelled &&
      !data.plans.some(
        (p) =>
          p.request_id === x.id &&
          ["proposed", "approved", "partial", "dispatched"].includes(p.status),
      ),
  ))
    items.push({
      id: r.id,
      kind: "request",
      ref: r.id,
      title: `Open request from ${loc(r.destination_id)}`,
      description: `${number(r.quantity - r.fulfilled - r.cancelled)} units remain unfulfilled. Needed by ${dateLabel(r.needed_by)}.`,
      location: loc(r.destination_id),
      product: prod(r.product_id),
      severity: "neutral",
      label: "Request",
      metric: "Review request",
    });
  for (const c of data.cases.filter((x) => x.status === "open"))
    items.push({
      id: c.id,
      kind: "case",
      ref: c.id,
      title: title(c.kind),
      description: `${loc(c.location_id)} · Review the discrepancy and record its resolution.`,
      location: loc(c.location_id),
      product: "Stock integrity",
      severity: "warning",
      label: "Needs review",
      metric: "Open case",
    });
  return items.sort((a, b) => {
    const priority: Record<string, number> = {
      critical: 0,
      warning: 1,
      neutral: 2,
    };
    const severity = (priority[a.severity] ?? 3) - (priority[b.severity] ?? 3);
    if (severity) return severity;
    const dateFor = (x: Action) =>
      x.kind === "risk"
        ? network?.table.find((r) => r.location_id === x.ref)?.shortage_date ||
          "9999"
        : x.kind === "request"
          ? data.requests.find((r) => r.id === x.ref)?.needed_by || "9999"
          : "9999";
    return dateFor(a).localeCompare(dateFor(b));
  });
}
