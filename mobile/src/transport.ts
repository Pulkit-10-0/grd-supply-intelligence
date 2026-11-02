export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class SessionChanged extends Error {}

export function serverOrigin(value: string) {
  const url = new URL(value.trim());
  const h = url.hostname;
  const local =
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "10.0.2.2" ||
    /^10\.\d+\.\d+\.\d+$/.test(h) ||
    /^192\.168\.\d+\.\d+$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error(
      "Enter only the server origin, such as https://grd.example.com.",
    );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error(
      "Use HTTPS for hosted servers. HTTP is allowed only for a local demo.",
    );
  return url.origin;
}

export class Transport {
  private epoch = 0;
  private token: string | null = null;
  constructor(
    public origin: string,
    private expired: () => void = () => {},
  ) {}
  authenticate(token: string | null) {
    this.epoch++;
    this.token = token;
  }
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
  ): Promise<T> {
    const epoch = this.epoch;
    const controller = new AbortController();
    // A free demo host can need about a minute to wake after inactivity.
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(this.origin + "/api/v1" + path, {
        method,
        signal: controller.signal,
        headers: {
          ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (epoch !== this.epoch) throw new SessionChanged();
      let result: { detail?: unknown };
      try {
        result = await response.json();
      } catch {
        if (epoch !== this.epoch) throw new SessionChanged();
        throw new ApiError(
          502,
          "Response unreadable. Keep the original command and retry to confirm its result.",
        );
      }
      if (epoch !== this.epoch) throw new SessionChanged();
      if (!response.ok) {
        if (response.status === 401) {
          this.authenticate(null);
          this.expired();
        }
        throw new ApiError(
          response.status,
          typeof result.detail === "string"
            ? result.detail
            : "Check the entered values and your access.",
        );
      }
      return result as T;
    } catch (error) {
      if (
        epoch !== this.epoch &&
        !(error instanceof ApiError && error.status === 401)
      )
        throw new SessionChanged();
      if (error instanceof Error && error.name === "AbortError")
        throw new Error(
          "The server did not respond in time. Check the connection and retry the saved action to confirm its result.",
        );
      if (error instanceof TypeError)
        throw new Error(
          "Cannot reach the server. Check its address and your connection; a sleeping demo server may need a moment to start.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async all<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    for (let offset = 0; offset < 20000; offset += 200) {
      const page = await this.request<{ items: T[]; total: number }>(
        `${path}${path.includes("?") ? "&" : "?"}offset=${offset}&limit=200`,
      );
      items.push(...page.items);
      if (items.length >= page.total) return items;
    }
    throw new Error("Too many records. Narrow your access scope.");
  }
}
