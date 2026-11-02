import { describe, expect, it } from "vitest";
import {
  weeklyHistory,
  riskLevel,
  remainingDispatch,
  type Observation,
  parseInstant,
} from "./utils";
import type { Data, NetworkRow, Plan } from "./types";

it("reads naive SQLite UTC and aware PostgreSQL India timestamps as the same instant", () => {
  expect(parseInstant("2026-11-01T08:00:00").getTime()).toBe(
    parseInstant("2026-11-01T13:30:00+05:30").getTime(),
  );
});

describe("decision evidence", () => {
  const week: Observation[] = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${String(26 + i).padStart(2, "0")}`,
    quantity: 10,
    measure: "requested",
  }));
  // Monday 26 October through Sunday 1 November.
  week[6].date = "2026-11-01";
  it("uses requested demand only and keeps complete Monday-Sunday weeks", () => {
    const supplied = week.map((x) => ({
      ...x,
      quantity: 4,
      measure: "supplied",
    }));
    expect(weeklyHistory([...week, ...supplied], "2026-11-01")).toEqual([
      { date: "2026-11-01", actual: 70 },
    ]);
    expect(weeklyHistory(week.slice(1), "2026-11-01")).toEqual([]);
    expect(weeklyHistory(week, "2026-10-31")).toEqual([]);
  });
  it("never treats a missing position as a healthy one", () => {
    expect(
      riskLevel(
        { status: "unknown", shortage_date: null } as NetworkRow,
        "2026-11-01",
      ),
    ).toBe("unknown");
    expect(
      riskLevel(
        { status: "shortage", shortage_date: "2026-11-03" } as NetworkRow,
        "2026-11-01",
      ),
    ).toBe("critical");
  });
  it("dispatches only the unshipped part, regardless of how much has been received", () => {
    const data = {
      shipments: [{ plan_id: "p", lines: [{ quantity: 40, received: 20 }] }],
    } as Data;
    expect(remainingDispatch(data, { id: "p", quantity: 60 } as Plan)).toBe(20);
  });
});
