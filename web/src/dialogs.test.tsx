// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ResolveDialog, ReceiptDialog, PlanDialog } from "./dialogs";
import type { Data, Plan, Shipment } from "./types";
import { api, command } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), command: vi.fn() }));
const explanation = {
  allocations: [],
  arrival_date: "2026-11-07",
  minimum_shelf_days: 7,
  source_available: 800,
  donor_protected: 50,
  cost_paise: 1000,
  policy_source: "Synthetic test policy",
};
const product = {
  id: "p",
  name: "Test medicine",
  pack_size: 10,
  base_unit: "tablet",
  unit_cost_paise: 100,
  transfer_allowed: true,
  provenance: {},
};
const plan: Plan = {
  id: "plan",
  source_id: "source",
  destination_id: "dest",
  product_id: "p",
  quantity: 60,
  request_id: "request",
  version: 2,
  status: "proposed",
  input_revision: 3,
  as_of: "2026-11-01",
  arrival_date: "2026-11-07",
  explanation,
  created_at: "2026-11-01",
};
const data: Data = {
  me: {
    id: "admin",
    role: "admin",
    email: "test@example.test",
    location_ids: [],
    organisation_id: "org",
    evidence_type: "synthetic",
    inventory_revision: 3,
    scenario_on: "2026-11-01",
  },
  products: [product],
  locations: [
    {
      id: "source",
      name: "Source",
      kind: "warehouse",
      district: "Assam",
      latitude: 26,
      longitude: 92,
      coordinate_source: "synthetic",
    },
    {
      id: "dest",
      name: "Destination",
      kind: "distributor",
      district: "Assam",
      latitude: 25,
      longitude: 93,
      coordinate_source: "synthetic",
    },
  ],
  plans: [],
  requests: [],
  shipments: [],
  batches: [],
  routes: [],
  cases: [],
  jobs: [],
  audit: [],
  datasets: [],
  reconciliation: { ok: true, batches: [] },
};
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("blocks proposal creation while a changed quantity is being checked, including failed lookups", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({
      options: [{ source_id: "source", feasible: true, evidence: explanation }],
    })
    .mockRejectedValueOnce(new Error("Supply lookup unavailable"));
  render(
    <ResolveDialog
      data={data}
      product={product}
      locationId="dest"
      asOf="2026-11-01"
      onClose={() => {}}
      onDone={async () => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "Create plan for review" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  fireEvent.change(screen.getByLabelText("Plan quantity"), {
    target: { value: 70 },
  });
  expect(button.hasAttribute("disabled")).toBe(true);
  await screen.findByText("Supply lookup unavailable");
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(command).not.toHaveBeenCalled();
});

it("withholds approval and cancellation from a manager who can only access the destination", () => {
  const scoped = {
    ...data,
    me: { ...data.me, role: "manager", location_ids: ["dest"] },
  };
  render(
    <PlanDialog
      data={scoped}
      plan={plan}
      asOf="2026-11-01"
      onClose={() => {}}
      onDone={async () => {}}
      onReceipt={() => {}}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Approve & reserve" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Cancel unshipped plan" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Revalidate proposal" }),
  ).toBeNull();
});

it("preserves a created request when proposal creation fails and is retried", async () => {
  vi.mocked(api).mockResolvedValue({
    options: [{ source_id: "source", feasible: true, evidence: explanation }],
  });
  vi.mocked(command)
    .mockResolvedValueOnce({ id: "request" })
    .mockRejectedValueOnce(new Error("Stock changed"))
    .mockResolvedValueOnce(plan);
  const onDone = vi.fn().mockResolvedValue(undefined);
  render(
    <ResolveDialog
      data={data}
      product={product}
      locationId="dest"
      asOf="2026-11-01"
      shortageDate="2026-11-03"
      onClose={() => {}}
      onDone={onDone}
    />,
  );
  const button = screen.getByRole("button", { name: "Create plan for review" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  expect(screen.getByText(/Delivery timing needs attention/)).toBeTruthy();
  fireEvent.click(button);
  await screen.findByText("Stock changed");
  fireEvent.click(button);
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(plan));
  expect(
    vi.mocked(command).mock.calls.filter((call) => call[0] === "/requests"),
  ).toHaveLength(1);
  expect(vi.mocked(command).mock.calls[2][1]).toMatchObject({
    request_id: "request",
  });
});

it("requires a damage reason and sends only quantities from the outstanding shipment", async () => {
  const shipment: Shipment = {
    id: "s",
    plan_id: "plan",
    source_id: "source",
    destination_id: "dest",
    expected_on: "2026-11-07",
    dispatched_on: "2026-11-01",
    received_on: null,
    created_at: "2026-11-01",
    lines: [
      {
        id: "line",
        source_batch_id: "b",
        quantity: 40,
        received: 10,
        accepted: 10,
        returned: 0,
      },
    ],
  };
  vi.mocked(command).mockResolvedValue({});
  render(
    <ReceiptDialog
      data={data}
      shipment={shipment}
      asOf="2026-11-01"
      onClose={() => {}}
      onDone={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  fireEvent.change(screen.getByLabelText("Accepted units 1"), {
    target: { value: 20 },
  });
  fireEvent.change(screen.getByLabelText("Damaged units 1"), {
    target: { value: 10 },
  });
  const confirm = screen.getByRole("button", { name: "Confirm receipt" });
  expect(confirm.hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Damage / discrepancy reason"), {
    target: { value: "Damaged packaging" },
  });
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith("/shipments/s/receipts", {
      as_of: "2026-11-01",
      lines: [
        {
          line_id: "line",
          accepted: 20,
          damaged: 10,
          reason: "Damaged packaging",
        },
      ],
    }),
  );
});

it("offers a scoped operator dispatch while withholding manager approval", () => {
  const scoped = {
    ...data,
    me: { ...data.me, role: "operator", location_ids: ["source"] },
  };
  const { rerender } = render(
    <PlanDialog
      data={scoped}
      plan={plan}
      asOf="2026-11-01"
      onClose={() => {}}
      onDone={async () => {}}
      onReceipt={() => {}}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Approve & reserve" }),
  ).toBeNull();
  rerender(
    <PlanDialog
      data={scoped}
      plan={{ ...plan, status: "approved" }}
      asOf="2026-11-01"
      onClose={() => {}}
      onDone={async () => {}}
      onReceipt={() => {}}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Dispatch stock" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
