import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ChunkStore, chunks } from "../src/chunkStore";
import { Outbox, type Store, type Command } from "../src/queue";
import {
  restoreWorkspace,
  saveWorkspace,
  type CachedWorkspace,
} from "../src/offline";
import type { Data } from "../../shared/types";
import type { Transport } from "../src/transport";

function disk() {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      get: async (k: string) => values.get(k) ?? null,
      set: async (k: string, v: string) => {
        assert.ok(Buffer.byteLength(v) < 1500);
        values.set(k, v);
      },
      remove: async (k: string) => {
        values.delete(k);
      },
    } satisfies Store,
  };
}
test("50 encrypted-chunk commands survive restart, lost reply and exact replay", async () => {
  const raw = disk(),
    vault = new ChunkStore(raw.store),
    box = new Outbox(vault, "origin-org-user");
  const commands: Command[] = Array.from({ length: 50 }, (_, i) => ({
    id: `event-${i}`,
    path: `/count-sessions/session-${i}/events`,
    body: {
      version: 1,
      action: "submit",
      reason: "Count " + "Assam ✓ ".repeat(300),
      lines: [{ batch_id: `batch-${i}`, quantity: i }],
    },
    label: "Count session",
    created: "2026-11-02T00:00:00Z",
    state: "pending",
  }));
  for (const c of commands) await box.add(c);
  const restarted = new Outbox(new ChunkStore(raw.store), "origin-org-user");
  assert.deepEqual(await restarted.list(), commands);
  assert.deepEqual(
    await new Outbox(new ChunkStore(raw.store), "another-org").list(),
    [],
  );
  const calls: unknown[][] = [];
  let lost = true;
  const transport = {
    request: async (...args: unknown[]) => {
      calls.push(args);
      if (lost) {
        lost = false;
        throw new Error("Reply lost after commit");
      }
      return { ok: true };
    },
  } as unknown as Transport;
  await assert.rejects(restarted.send(transport, commands[0]));
  const again = new Outbox(new ChunkStore(raw.store), "origin-org-user");
  for (const c of await again.list()) await again.send(transport, c);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls.length, 51);
  assert.equal((await again.list()).length, 0);
});
test("failed chunk head commit keeps previous complete record and legacy values migrate", async () => {
  const raw = disk();
  await raw.store.set("key", "old-legacy");
  let reject = false;
  const store = {
    ...raw.store,
    set: async (k: string, v: string) => {
      if (k === "key" && reject) throw new Error("Disk failure");
      await raw.store.set(k, v);
    },
  };
  const vault = new ChunkStore(store);
  assert.equal(await vault.get("key"), "old-legacy");
  await vault.set("key", "large🙂".repeat(500));
  const old = await vault.get("key");
  reject = true;
  await assert.rejects(vault.set("key", "new".repeat(700)));
  assert.equal(await new ChunkStore(raw.store).get("key"), old);
  for (const c of chunks("🙂अ".repeat(2000)))
    assert.ok(Buffer.byteLength(c) <= 1300);
});
test("cached authorised records restore only for same origin, token and unexpired session", async () => {
  const raw = disk(),
    store = new ChunkStore(raw.store);
  const cache: CachedWorkspace = {
    scope: "a",
    origin: "https://demo.example",
    tokenFingerprint: "hashed-token",
    data: { audit: [], jobs: [] } as unknown as Data,
    savedAt: "2026-11-02T01:00:00Z",
    expiresAt: "2026-11-02T02:00:00Z",
  };
  await saveWorkspace(store, cache);
  assert.equal(
    (
      await restoreWorkspace(
        store,
        cache.origin,
        cache.tokenFingerprint,
        Date.parse("2026-11-02T01:30:00Z"),
      )
    )?.scope,
    "a",
  );
  assert.equal(
    await restoreWorkspace(
      store,
      "https://other.example",
      cache.tokenFingerprint,
      0,
    ),
    null,
  );
  assert.equal(
    await restoreWorkspace(store, cache.origin, "other-token", 0),
    null,
  );
  assert.equal(
    await restoreWorkspace(
      store,
      cache.origin,
      cache.tokenFingerprint,
      Date.parse("2026-11-02T03:00:00Z"),
    ),
    null,
  );
});
