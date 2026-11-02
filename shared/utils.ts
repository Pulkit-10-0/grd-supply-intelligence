import type { Data, Plan, NetworkRow } from "./types";
export const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(
        value,
      );
export const money = (paise: number | null | undefined) =>
  paise == null
    ? "Not supplied"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(paise / 100);
export const dateLabel = (value: string | null | undefined, year = false) =>
  value
    ? new Date(value.slice(0, 10) + "T12:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...(year ? { year: "numeric" } : {}),
      })
    : "—";
export const parseInstant = (value: string) =>
  new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + "Z");
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(b.slice(0, 10) + "T12:00:00").getTime() -
      new Date(a.slice(0, 10) + "T12:00:00").getTime()) /
      86400000,
  );
export const shortLocation = (name: string) =>
  name
    .replace(" central demo warehouse", " Central")
    .replace(" demo distributor", "")
    .replace(" demo warehouse", "");
export const shortProduct = (name: string) =>
  name.replace(" demo presentation", "").replace(" demo product", " product");
export const title = (name: string) =>
  name.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());
export const hasRole = (data: Data, ...roles: string[]) =>
  data.me.role === "admin" || roles.includes(data.me.role);
export const canLocation = (data: Data, id: string) =>
  data.me.role === "admin" || data.me.location_ids.includes(id);
export function remainingDispatch(data: Data, p: Plan) {
  return Math.max(
    0,
    p.quantity -
      data.shipments
        .filter((x) => x.plan_id === p.id)
        .reduce(
          (a, x) => a + x.lines.reduce((n, line) => n + line.quantity, 0),
          0,
        ),
  );
}
export function riskLevel(row: NetworkRow, asOf: string) {
  return row.status === "unknown"
    ? "unknown"
    : row.shortage_date && daysBetween(asOf, row.shortage_date) <= 3
      ? "critical"
      : row.shortage_date
        ? "warning"
        : "healthy";
}

export type Observation = { date: string; quantity: number; measure: string };
export function weeklyHistory(rows: Observation[], asOf: string) {
  const groups = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.date > asOf || row.measure !== "requested") continue;
    const day = new Date(row.date + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7));
    const end = day.toISOString().slice(0, 10);
    const days = groups.get(end) || new Map<string, number>();
    days.set(row.date, row.quantity);
    groups.set(end, days);
  }
  return [...groups]
    .filter(([date, days]) => date <= asOf && days.size === 7)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, days]) => ({
      date,
      actual: [...days.values()].reduce((a, b) => a + b, 0),
    }));
}
