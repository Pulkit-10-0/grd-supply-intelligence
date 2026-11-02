import type { Store } from "./queue";

const PREFIX = "GRD-CHUNKS-1:";
// Stay below historic platform keychain limits, including multi-byte UTF-8.
export function chunks(value: string, limit = 1300): string[] {
  const result: string[] = [];
  let part = "",
    bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    const size = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    if (bytes + size > limit) {
      result.push(part);
      part = "";
      bytes = 0;
    }
    part += char;
    bytes += size;
  }
  result.push(part);
  return result;
}
interface Head {
  generation: string;
  count: number;
}
function head(raw: string | null): Head | null {
  if (!raw?.startsWith(PREFIX)) return null;
  const parsed = JSON.parse(raw.slice(PREFIX.length)) as Head;
  if (
    !Number.isInteger(parsed.count) ||
    parsed.count < 1 ||
    parsed.count > 1500 ||
    !/^[\w-]+$/.test(parsed.generation)
  )
    throw new Error(
      "Secure record manifest is invalid. Reconnect to refresh records.",
    );
  return parsed;
}
/** Each chunk is encrypted by the underlying OS vault. Commit the head last so
 * a crash cannot expose half of a new snapshot; retain the old value until then.
 * Reads and writes of the same record are serialised, including cleanup.
 */
export class ChunkStore implements Store {
  private tails = new Map<string, Promise<unknown>>();
  private counter = 0;
  constructor(private raw: Store) {}
  private serial<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(key) || Promise.resolve()).then(work, work);
    const tail = result.catch(() => {});
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }
  private chunk(key: string, h: Head, i: number) {
    return `${key}.part.${h.generation}.${i}`;
  }
  get(key: string) {
    return this.serial(key, async () => {
      const raw = await this.raw.get(key),
        h = head(raw);
      if (!h) return raw;
      const parts: string[] = [];
      for (let i = 0; i < h.count; i++) {
        const part = await this.raw.get(this.chunk(key, h, i));
        if (part === null)
          throw new Error("Incomplete secure record; reconnect before acting.");
        parts.push(part);
      }
      return parts.join("");
    });
  }
  set(key: string, value: string) {
    return this.serial(key, async () => {
      if (value.length > 1_000_000)
        throw new Error(
          "Secure snapshot is too large; narrow your location scope.",
        );
      const old = head(await this.raw.get(key));
      const parts = chunks(value),
        h = {
          generation: `${Date.now()}-${++this.counter}-${Math.random().toString(36).slice(2)}`,
          count: parts.length,
        };
      if (parts.length > 1500)
        throw new Error(
          "Secure snapshot is too large; narrow your location scope.",
        );
      const written: string[] = [];
      try {
        for (let i = 0; i < parts.length; i++) {
          const partKey = this.chunk(key, h, i);
          await this.raw.set(partKey, parts[i]);
          written.push(partKey);
        }
        await this.raw.set(key, PREFIX + JSON.stringify(h));
      } catch (error) {
        for (const partKey of written)
          await this.raw.remove(partKey).catch(() => {});
        throw error;
      }
      // Cleanup failure must not turn a committed write into an uncertain command.
      if (old)
        for (let i = 0; i < old.count; i++)
          await this.raw.remove(this.chunk(key, old, i)).catch(() => {});
    });
  }
  remove(key: string) {
    return this.serial(key, async () => {
      const old = head(await this.raw.get(key));
      await this.raw.remove(key);
      if (old)
        for (let i = 0; i < old.count; i++)
          await this.raw.remove(this.chunk(key, old, i)).catch(() => {});
    });
  }
}
