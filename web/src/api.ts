import type { Data, Me } from "./types";

let accessToken: string | null = null;
// Optional hosted API for a separate Vercel frontend. Same-origin stays the default.
const apiOrigin = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let sessionVersion = 0;
const pendingKeys = new Map<string, string>();
export const getSessionVersion = () => sessionVersion;
export class SessionChangedError extends Error {
  constructor() {
    super("The signed-in session changed.");
  }
}
export function setToken(value: string | null) {
  sessionVersion++;
  pendingKeys.clear();
  accessToken = value;
}
function checkSession(version: number) {
  if (version !== sessionVersion) throw new SessionChangedError();
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const version = sessionVersion;
  const response = await fetch(`${apiOrigin}/api/v1${path}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return readResponse<T>(response, version);
}
async function readResponse<T>(
  response: Response,
  version: number,
): Promise<T> {
  checkSession(version);
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    checkSession(version);
    if (response.ok)
      throw new ApiError(
        502,
        "The service returned an unreadable response. Retry to confirm the recorded result.",
      );
    result = { detail: "The service returned an unreadable response." };
  }
  checkSession(version);
  if (!response.ok) {
    if (response.status === 401) {
      setToken(null);
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("grd:unauthorised"));
    }
    const detail =
      result && typeof result === "object" && "detail" in result
        ? result.detail
        : null;
    throw new ApiError(
      response.status,
      typeof detail === "string"
        ? detail
        : response.status === 422
          ? "Please check quantities, dates and required fields."
          : "The action could not be completed.",
    );
  }
  return result as T;
}
export async function all<T>(path: string): Promise<T[]> {
  let offset = 0,
    items: T[] = [];
  for (let n = 0; n < 100; n++) {
    const page = await api<{ items: T[]; total: number }>(
      `${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=200`,
    );
    items = items.concat(page.items);
    if (items.length >= page.total) return items;
    offset += 200;
  }
  throw new Error("Too many records to load. Narrow the scope.");
}
export async function loadData(): Promise<Data> {
  const version = sessionVersion;
  const me = await api<Me>("/me");
  const admin = ["admin", "manager", "steward"].includes(me.role);
  const [
    products,
    locations,
    batches,
    requests,
    plans,
    shipments,
    cases,
    jobs,
    audit,
    datasets,
    reconciliation,
  ] = await Promise.all([
    all<Data["products"][number]>("/products"),
    all<Data["locations"][number]>("/locations"),
    all<Data["batches"][number]>("/inventory/batches"),
    all<Data["requests"][number]>("/requests"),
    all<Data["plans"][number]>("/plans"),
    all<Data["shipments"][number]>("/shipments"),
    all<Data["cases"][number]>("/cases"),
    all<Data["jobs"][number]>("/jobs"),
    admin ? all<Data["audit"][number]>("/audit") : Promise.resolve([]),
    admin ? all<Data["datasets"][number]>("/datasets") : Promise.resolve([]),
    api<Data["reconciliation"]>("/inventory/reconciliation"),
  ]);
  const routes = await api<{ items: Data["routes"] }>("/routes");
  checkSession(version);
  return {
    me,
    products,
    locations,
    routes: routes.items,
    batches,
    requests,
    plans,
    shipments,
    cases,
    jobs,
    audit,
    datasets,
    reconciliation,
  };
}
// Keys remain stable across retry of an identical operation in this browser session.
export async function command<T>(path: string, body: unknown): Promise<T> {
  const identity = path + JSON.stringify(body);
  if (!pendingKeys.has(identity))
    pendingKeys.set(identity, crypto.randomUUID());
  const value = await api<T>(path, "POST", body, pendingKeys.get(identity));
  pendingKeys.delete(identity);
  return value;
}
export async function localDemo() {
  const response = await fetch("/__local-demo", { method: "POST" });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.detail || "Local demo is unavailable.");
  setToken(value.access_token);
}
export async function upload<T>(path: string, body: FormData): Promise<T> {
  const version = sessionVersion;
  const response = await fetch(apiOrigin + "/api/v1" + path, {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body,
  });
  return readResponse<T>(response, version);
}
