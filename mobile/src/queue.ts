import type { Transport } from "./transport";
import { ApiError } from "./transport";

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface Command {
  id: string;
  path: string;
  body: unknown;
  label: string;
  created: string;
  state: "pending" | "conflict";
  error?: string;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

/** Encrypted native outbox: commands and index use atomically committed vault chunks.
 * Persist the original key/body before transmission. Refresh authoritative records
 * after receipt. Offline entries never alter displayed server balances.
 */
export class Outbox {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private store: Store,
    private scope: string,
  ) {}
  private key(id: string) {
    return `grd.outbox.${this.scope}.${id}`;
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => {});
    return next;
  }
  private async ids(): Promise<string[]> {
    return JSON.parse((await this.store.get(this.key("index"))) || "[]");
  }
  async list(): Promise<Command[]> {
    await this.tail;
    const rows = await Promise.all(
      (await this.ids()).map((id) => this.store.get(this.key(id))),
    );
    return rows
      .filter((s): s is string => s !== null)
      .map((s) => JSON.parse(s));
  }
  add(command: Command) {
    return this.serial(async () => {
      const ids = await this.ids();
      const recorded = await Promise.all(
        ids.map((id) => this.store.get(this.key(id))),
      );
      if (
        recorded.some((raw) => {
          if (!raw) return false;
          const existing = JSON.parse(raw) as Command;
          return (
            existing.path === command.path &&
            canonical(existing.body) === canonical(command.body)
          );
        })
      )
        throw new Error(
          "A matching action already needs confirmation or reconciliation. Review the original in Pending actions.",
        );
      if (ids.length >= 100)
        throw new Error(
          "Sync or resolve the 100 pending actions before recording more.",
        );
      const bytes = [...JSON.stringify(command)].reduce((n, char) => {
        const point = char.codePointAt(0)!;
        return n + (point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4);
      }, 0);
      if (bytes > 25000)
        throw new Error(
          "This action is too large for the secure offline outbox. Record fewer lines (25 KB command limit).",
        );
      if (ids.includes(command.id))
        throw new Error(
          "Command already recorded. Retry it from Pending actions.",
        );
      await this.store.set(this.key(command.id), JSON.stringify(command));
      await this.store.set(
        this.key("index"),
        JSON.stringify([...ids, command.id]),
      );
    });
  }
  remove(id: string) {
    return this.serial(async () => {
      const ids = await this.ids();
      await this.store.set(
        this.key("index"),
        JSON.stringify(ids.filter((x) => x !== id)),
      );
      await this.store.remove(this.key(id));
    });
  }
  async send(client: Transport, command: Command) {
    // Read the persisted command rather than a possibly edited UI object.
    const saved = (await this.list()).find((x) => x.id === command.id);
    if (!saved || saved.state === "conflict")
      throw new Error("Review the pending action before continuing.");
    try {
      const result = await client.request(
        saved.path,
        "POST",
        saved.body,
        saved.id,
      );
      await this.remove(saved.id);
      return result;
    } catch (err) {
      if (
        err instanceof ApiError &&
        [400, 403, 404, 409, 422].includes(err.status)
      ) {
        await this.serial(() =>
          this.store.set(
            this.key(saved.id),
            JSON.stringify({
              ...saved,
              state: "conflict",
              error: err.message.slice(0, 60),
            }),
          ),
        );
      }
      throw err;
    }
  }
}

export function batchLabel(value: string) {
  const raw = value.trim();
  if (
    !raw.startsWith("GRD:BATCH:") ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(raw.slice(10))
  )
    throw new Error(
      "Use a GRD internal batch QR label (GRD:BATCH:batch-id). A product barcode cannot verify a batch or expiry.",
    );
  return raw;
}
export function quantity(value: string, pack = 1, allowZero = false) {
  if (!/^\d+$/.test(value)) throw new Error("Enter a whole-number quantity.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n % pack !== 0)
    throw new Error(
      `Use ${allowZero ? "zero or " : ""}positive quantities in packs of ${pack}.`,
    );
  return n;
}

export function internalLabel(value: string) {
  const raw = value.trim();
  if (!/^GRD:(BATCH|SHIPMENT):[A-Za-z0-9_-]{1,80}$/.test(raw))
    throw new Error("Use a GRD internal batch or shipment QR identifier.");
  return raw;
}
