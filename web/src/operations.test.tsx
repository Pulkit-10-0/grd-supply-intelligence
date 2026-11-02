// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Suppliers } from "./operations/Suppliers";
import { Documents } from "./operations/Documents";
import { api, command } from "./api";
import type { Data } from "./types";
vi.mock("./api", () => ({ api: vi.fn(), command: vi.fn() }));
const data: Data = {
  me: {
    id: "admin",
    email: "test@example.test",
    role: "admin",
    location_ids: [],
    organisation_id: "org",
    evidence_type: "synthetic",
    inventory_revision: 1,
    scenario_on: "2026-11-01",
  },
  products: [
    {
      id: "P",
      name: "Test medicine",
      pack_size: 10,
      base_unit: "tablet",
      unit_cost_paise: 100,
      transfer_allowed: true,
      provenance: {},
    },
  ],
  locations: [
    {
      id: "DEST",
      name: "Destination",
      kind: "distributor",
      district: "Assam",
      latitude: 26,
      longitude: 92,
      coordinate_source: "synthetic",
    },
  ],
  routes: [],
  batches: [],
  plans: [],
  requests: [],
  cases: [],
  jobs: [],
  audit: [],
  datasets: [],
  shipments: [],
  reconciliation: { ok: true, batches: [] },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith("/suppliers/suggestion")
      ? {
          suggested_quantity: 100,
          available_surviving_arrival: 0,
          reserved: 0,
          confirmed_inbound: 0,
          commitments: 0,
          formula: "Test formula",
          lead_days: 7,
          coverage_days: 28,
        }
      : { items: [] },
  );
  vi.mocked(command).mockResolvedValue({ id: "saved" });
});
afterEach(cleanup);
it("a whole pack passes browser validity and submits the reviewed supplier quantity", async () => {
  render(
    <Suppliers
      data={data}
      asOf="2026-11-01"
      onRefresh={async () => {}}
      notify={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Draft supplier order" }));
  await screen.findByText("Suggested: 100 units");
  const input = screen.getByLabelText(
    "Quantity · pack multiples",
  ) as HTMLInputElement;
  expect(input.checkValidity()).toBe(true);
  fireEvent.change(input, { target: { value: "101" } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Supplier name"), {
    target: { value: "Test supplier" },
  });
  fireEvent.change(
    screen.getByLabelText("Reason / proposed-quantity justification"),
    { target: { value: "Replenish after review" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save draft for review" }),
  );
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(
      "/suppliers/orders",
      expect.objectContaining({
        quantity: 100,
        supplier: "Test supplier",
        location_id: "DEST",
      }),
    ),
  );
});
it("delivery handoff needs receiver confirmation and posts checked quantities to proof endpoint", async () => {
  const shipped = {
    ...data,
    shipments: [
      {
        id: "SHIP",
        plan_id: "PLAN",
        expected_on: "2026-11-03",
        dispatched_on: "2026-11-01",
        received_on: null,
        source_id: "SOURCE",
        destination_id: "DEST",
        created_at: "2026-11-01",
        lines: [
          {
            id: "LINE",
            source_batch_id: "B",
            batch_code: "LOT",
            expiry: "2027-01-01",
            quantity: 20,
            received: 0,
            accepted: 0,
            returned: 0,
          },
        ],
      },
    ],
  };
  render(
    <Documents
      data={shipped}
      asOf="2026-11-01"
      onRefresh={async () => {}}
      notify={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm handoff" }));
  expect(
    screen
      .getByRole("button", { name: "Record proof & receive stock" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Receiver name"), {
    target: { value: "Warehouse receiver" },
  });
  fireEvent.change(
    screen.getByLabelText("Delivery document / discrepancy reference"),
    { target: { value: "POD-001" } },
  );
  fireEvent.click(
    screen.getByLabelText(
      "I checked batch, expiry and physical quantities with the receiver.",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Record proof & receive stock" }),
  );
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(
      "/shipments/SHIP/proof",
      expect.objectContaining({
        receiver: "Warehouse receiver",
        confirmed: true,
        reference: "POD-001",
        lines: [{ line_id: "LINE", accepted: 20, damaged: 0, reason: "" }],
      }),
    ),
  );
});
