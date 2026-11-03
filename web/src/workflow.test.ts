import { describe, expect, it } from "vitest";
import type { Data, Plan, Shipment } from "./types";
import {
  initialLocation,
  initialProduct,
  supplyFlow,
  workflowStage,
} from "../../shared/workflow";
const plan = {
  id: "p",
  status: "proposed",
  source_id: "a",
  destination_id: "b",
  product_id: "m",
  quantity: 100,
} as Plan;
const data = {
  me: { role: "admin", location_ids: [] },
  locations: [
    { id: "a", kind: "warehouse" },
    { id: "b", kind: "distributor" },
  ],
  products: [{ id: "m" }],
  plans: [],
  shipments: [],
  requests: [],
} as unknown as Data;
const shipment = (quantity: number, received = 0, accepted = received) =>
  ({
    id: "s",
    plan_id: "p",
    source_id: "a",
    destination_id: "b",
    lines: [{ quantity, received, accepted }],
  }) as Shipment;
describe("stock fulfilment journey", () => {
  it("advances from review through dispatch and receipt without inventing delivery", () => {
    expect(supplyFlow(data, plan)).toMatchObject({
      stage: 1,
      next: "approve",
      received: 0,
    });
    expect(supplyFlow(data, { ...plan, status: "approved" })).toMatchObject({
      stage: 2,
      next: "dispatch",
      unshipped: 100,
    });
    expect(
      supplyFlow(
        { ...data, shipments: [shipment(100)] },
        { ...plan, status: "dispatched" },
      ),
    ).toMatchObject({
      stage: 3,
      next: "receive",
      outstanding: 100,
      received: 0,
    });
    expect(
      supplyFlow(
        { ...data, shipments: [shipment(100, 100, 90)] },
        { ...plan, status: "completed" },
      ),
    ).toMatchObject({ stage: 4, next: "wait", accepted: 90, damaged: 10 });
  });
  it("keeps partial dispatch and receipt quantities separate", () => {
    expect(
      supplyFlow(
        { ...data, shipments: [shipment(60, 20)] },
        { ...plan, status: "partial" },
      ),
    ).toMatchObject({
      unshipped: 40,
      outstanding: 40,
      received: 20,
      canDispatch: true,
      next: "receive",
    });
  });
  it("continues receiving an in-transit shipment after cancellation", () => {
    expect(
      supplyFlow(
        { ...data, shipments: [shipment(60)] },
        { ...plan, status: "cancelled" },
      ),
    ).toMatchObject({
      stage: 3,
      cancelled: true,
      canDispatch: false,
      next: "receive",
      outstanding: 60,
    });
    expect(supplyFlow(data, { ...plan, status: "cancelled" })).toMatchObject({
      stage: -1,
      next: "wait",
      cancelled: true,
    });
  });
  it("shows only the next action permitted at the user's site", () => {
    const operator = {
      ...data,
      me: { ...data.me, role: "operator", location_ids: ["a"] },
    };
    expect(supplyFlow(operator, plan).canApprove).toBe(false);
    expect(
      supplyFlow(
        { ...operator, shipments: [shipment(60)] },
        { ...plan, status: "partial" },
      ).next,
    ).toBe("dispatch");
    const receiver = {
      ...operator,
      me: { ...operator.me, location_ids: ["b"] },
      shipments: [shipment(60)],
    };
    expect(supplyFlow(receiver, { ...plan, status: "partial" })).toMatchObject({
      next: "receive",
      canDispatch: false,
    });
  });
  it("recognises the existing supplier, return and count backend states", () => {
    expect(workflowStage("supplier_order", "partial")).toBe(3);
    expect(workflowStage("count_session", "counting")).toBe(1);
    expect(workflowStage("count_session", "review")).toBe(2);
    expect(workflowStage("count_session", "approved")).toBe(3);
    expect(workflowStage("return_transfer", "received_for_review")).toBe(3);
    expect(workflowStage("return_transfer", "cancelled")).toBe(-1);
  });
  it("uses real request/catalogue identifiers instead of particular town or medicine names", () => {
    const current = {
      ...data,
      products: [{ id: "different" }, { id: "urgent" }],
      requests: [
        {
          product_id: "urgent",
          destination_id: "b",
          quantity: 10,
          fulfilled: 0,
          cancelled: 0,
        },
      ],
    } as unknown as Data;
    expect(initialProduct(current)).toBe("urgent");
    expect(initialProduct(current, "different")).toBe("different");
    expect(initialLocation(current, "urgent")).toBe("b");
    expect(initialLocation(data, "m")).toBe("b");
  });
});
