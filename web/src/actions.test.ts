import { expect, it } from "vitest";
import { buildActions } from "./actions";
import type { Data, Network, NetworkRow } from "./types";
const data = {
  locations: [
    { id: "a", name: "Site A" },
    { id: "b", name: "Site B" },
  ],
  products: [{ id: "p", name: "Medicine" }],
  plans: [],
  requests: [],
  cases: [],
} as unknown as Data;
const row = (id: string, date: string | null, status = "shortage") =>
  ({
    location_id: id,
    product_id: "p",
    status,
    shortage_date: date,
    balance: { known: status !== "unknown" },
    projected_expiry_units: 0,
    days_of_cover: 1,
  }) as NetworkRow;
it("turns missing stock into work rather than an all-clear queue", () => {
  const actions = buildActions(
    data,
    { table: [row("a", null, "unknown")] } as Network,
    "2026-11-01",
  );
  expect(actions).toHaveLength(1);
  expect(actions[0].kind).toBe("data");
  expect(actions[0].description).toContain("stock position is missing");
});
it("orders equally severe risks by the earlier shortage date", () => {
  const actions = buildActions(
    data,
    { table: [row("a", "2026-11-20"), row("b", "2026-11-06")] } as Network,
    "2026-11-01",
  );
  expect(actions.map((x) => x.ref)).toEqual(["b", "a"]);
});
