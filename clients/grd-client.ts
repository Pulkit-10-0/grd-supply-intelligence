/** Shared transport for web and React Native. Store tokens using the platform's secure storage. */
export class GrdError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`GRD request failed (${status})`);
  }
}

export class GrdClient {
  constructor(private baseUrl: string, private getToken: () => Promise<string | null>) {}

  async request<T>(path: string, method = "GET", body?: unknown, eventId?: string): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(eventId ? { "Idempotency-Key": eventId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new GrdError(response.status, result.detail);
    return result as T;
  }
}

export interface QueuedCommand {
  /** Persist before sending. Reuse unchanged after timeout/restart; never generate on each retry. */
  eventId: string;
  path: string;
  body: unknown;
  deviceCreatedAt: string;
}

/** 409: stop and show reconciliation. 401: reauthenticate. Network failure: retain provisional queue. */
export async function replay<T>(client: GrdClient, command: QueuedCommand): Promise<T> {
  return client.request<T>(command.path, "POST", command.body, command.eventId);
}
