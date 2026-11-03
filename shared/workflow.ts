import type { Data, Plan } from "./types";
import { canLocation, hasRole } from "./utils";

export const supplySteps = [
  "Request",
  "Review",
  "Dispatch",
  "Receive",
  "Complete",
];
export const supplierSteps = [
  "Draft",
  "Approve",
  "Confirm date",
  "Receive",
  "Complete",
];
export const returnSteps = [
  "Request",
  "Approve",
  "Send back",
  "Inspect",
  "Complete",
];
export const countSteps = ["Assign", "Count", "Review", "Complete"];

export function workflowStage(kind: string, state: string) {
  if (state === "cancelled") return -1;
  const stages: Record<string, Record<string, number>> = {
    supplier_order: {
      draft: 1,
      approved: 2,
      acknowledged: 3,
      partial: 3,
      received: 4,
    },
    return_transfer: {
      requested: 1,
      approved: 2,
      in_transit: 3,
      received_for_review: 3,
      closed: 4,
    },
    count_session: {
      assigned: 1,
      counting: 1,
      recount: 1,
      submitted: 2,
      review: 2,
      closed: 3,
      approved: 3,
    },
  };
  return stages[kind]?.[state] ?? 0;
}

export function supplyFlow(data: Data, plan: Plan) {
  const shipments = data.shipments.filter((s) => s.plan_id === plan.id);
  const lines = shipments.flatMap((s) => s.lines);
  const dispatched = lines.reduce((n, l) => n + l.quantity, 0);
  const received = lines.reduce((n, l) => n + l.received, 0);
  const accepted = lines.reduce((n, l) => n + l.accepted, 0);
  const outstanding = Math.max(0, dispatched - received);
  const unshipped = Math.max(0, plan.quantity - dispatched);
  const cancelled = plan.status === "cancelled";
  const stage =
    outstanding > 0 && (cancelled || unshipped === 0)
      ? 3
      : cancelled
        ? -1
        : plan.status === "completed"
          ? 4
          : plan.status === "proposed"
            ? 1
            : unshipped > 0
              ? 2
              : outstanding > 0
                ? 3
                : 4;
  const receivable = shipments.filter((s) =>
    s.lines.some((l) => l.received < l.quantity),
  );
  const receipt = receivable.find(
    (s) =>
      hasRole(data, "operator", "manager") &&
      canLocation(data, s.destination_id),
  );
  const canApprove =
    plan.status === "proposed" &&
    hasRole(data, "manager") &&
    canLocation(data, plan.source_id) &&
    canLocation(data, plan.destination_id);
  const canDispatch =
    !cancelled &&
    ["approved", "partial", "dispatched"].includes(plan.status) &&
    unshipped > 0 &&
    hasRole(data, "operator", "manager") &&
    canLocation(data, plan.source_id);
  const next = canApprove
    ? "approve"
    : receipt
      ? "receive"
      : canDispatch
        ? "dispatch"
        : "wait";
  const label = cancelled
    ? outstanding
      ? "Cancelled · delivery pending"
      : "Cancelled"
    : plan.status === "proposed"
      ? "Awaiting approval"
      : stage === 4
        ? "Completed"
        : outstanding && unshipped
          ? "Part dispatched"
          : outstanding
            ? "In transit"
            : "Ready to dispatch";
  const instruction = canApprove
    ? "Review the quantity and route, then approve the plan."
    : receipt
      ? "Check the delivery and record the quantities received."
      : canDispatch
        ? "Enter the quantity leaving the source, then record dispatch."
        : cancelled
          ? outstanding
            ? "Unshipped stock was released. The dispatched delivery still needs a receipt."
            : "Unshipped stock has been released."
          : stage === 4
            ? "All dispatched quantities have been received."
            : plan.status === "proposed"
              ? "Waiting for a manager to approve this plan."
              : outstanding
                ? "Waiting for the destination team to confirm delivery."
                : "Waiting for the source team to dispatch stock.";
  return {
    stage: next === "receive" ? 3 : stage,
    partialDispatch: !cancelled && dispatched > 0 && unshipped > 0,
    label,
    instruction,
    next,
    receipt,
    canDispatch,
    canApprove,
    cancelled,
    dispatched,
    received,
    accepted,
    damaged: received - accepted,
    outstanding,
    unshipped,
    shipments,
  };
}

// Select real catalogue records rather than naming a demonstration medicine or town.
export function initialProduct(
  data: Pick<Data, "products" | "requests">,
  current = "",
) {
  if (data.products.some((p) => p.id === current)) return current;
  const open = data.requests.find(
    (r) => r.quantity > r.fulfilled + r.cancelled,
  );
  return (
    data.products.find((p) => p.id === open?.product_id)?.id ||
    data.products[0]?.id ||
    ""
  );
}
export function initialLocation(
  data: Pick<Data, "locations" | "requests">,
  product: string,
  current = "",
) {
  if (data.locations.some((l) => l.id === current)) return current;
  const open = data.requests.find(
    (r) => r.product_id === product && r.quantity > r.fulfilled + r.cancelled,
  );
  return (
    data.locations.find((l) => l.id === open?.destination_id)?.id ||
    data.locations.find((l) => l.kind !== "warehouse")?.id ||
    data.locations[0]?.id ||
    ""
  );
}
