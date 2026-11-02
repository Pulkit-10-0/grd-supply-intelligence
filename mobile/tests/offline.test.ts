import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  Outbox,
  batchLabel,
  quantity,
  type Command,
  type Store,
} from "../src/queue";
import {
  ApiError,
  serverOrigin,
  SessionChanged,
  Transport,
} from "../src/transport";

function store(): Store {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => {
      map.set(k, v);
    },
    remove: async (k) => {
      map.delete(k);
    },
  };
}
const command = (id = "key-before-send"): Command => ({
  id,
  path: "/shipments/test/receipts",
  body: {
    as_of: "2026-11-01",
    lines: [
      {
        line_id: "line-a",
        accepted: 20,
        damaged: 10,
        reason: "Damaged packaging",
      },
    ],
  },
  label: "Receipt at destination",
  created: "2026-11-01T12:00:00Z",
  state: "pending",
});

test("lost response survives restart and replays the original key/body exactly", async () => {
  const disk = store();
  const original = command();
  const box = new Outbox(disk, "user-a");
  await box.add(original);
  const sent: unknown[][] = [];
  const client = {
    request: async (...args: unknown[]) => {
      sent.push(args);
      if (sent.length === 1) throw new Error("Response lost after commit");
      return { id: "recorded-once" };
    },
  } as unknown as Transport;
  await assert.rejects(box.send(client, original));
  const restarted = new Outbox(disk, "user-a");
  const restored = (await restarted.list())[0];
  assert.deepEqual(restored, original);
  await restarted.send(client, { ...restored, body: { maliciousEdit: 999 } });
  assert.deepEqual(sent[0], sent[1]);
  assert.deepEqual(await restarted.list(), []);
});
test("conflicts stop replay and remain for explicit reconciliation", async () => {
  const box = new Outbox(store(), "a");
  const original = command();
  await box.add(original);
  let count = 0;
  const client = {
    request: async () => {
      count++;
      throw new ApiError(409, "Stock version changed");
    },
  } as unknown as Transport;
  await assert.rejects(box.send(client, original));
  assert.equal((await box.list())[0].state, "conflict");
  await assert.rejects(box.send(client, original));
  assert.equal(count, 1);
});

test("reopening an unconfirmed form cannot create the same action with a new key", async () => {
  const box = new Outbox(store(), "account");
  await box.add(command("original"));
  const duplicate = command("new-key");
  duplicate.body = {
    lines: [
      {
        damaged: 10,
        reason: "Damaged packaging",
        accepted: 20,
        line_id: "line-a",
      },
    ],
    as_of: "2026-11-01",
  };
  await assert.rejects(box.add(duplicate), /matching action already/);
  assert.equal((await box.list()).length, 1);
});
test("pending actions are isolated by server/account and concurrent records preserve both", async () => {
  const disk = store(),
    a = new Outbox(disk, "server-a-user-a"),
    b = new Outbox(disk, "server-b-user-a");
  await Promise.all([
    a.add(command("one")),
    a.add({ ...command("two"), path: "/shipments/another/receipts" }),
  ]);
  assert.equal((await a.list()).length, 2);
  assert.deepEqual(await b.list(), []);
});
test("failed persistence and capacity limits prevent new commands from being recorded", async () => {
  const disk = store();
  const broken = new Outbox(
    {
      ...disk,
      set: async () => {
        throw new Error("Secure storage unavailable");
      },
    },
    "a",
  );
  await assert.rejects(broken.add(command()));
  assert.deepEqual(await broken.list(), []);
  const box = new Outbox(disk, "a");
  for (let i = 0; i < 100; i++)
    await box.add({
      ...command("event-" + i),
      path: `/shipments/delivery-${i}/receipts`,
    });
  await assert.rejects(box.add(command("overflow")), /100 pending/);
});
test("internal QR verification rejects generic barcodes, URLs and unsafe identifiers", () => {
  assert.equal(batchLabel("GRD:BATCH:batch-123"), "GRD:BATCH:batch-123");
  for (const value of [
    "890123456",
    "https://example.com",
    "GRD:BATCH:../other",
    "GRD:BATCH:",
  ])
    assert.throws(() => batchLabel(value));
});
test("pack validation rejects fractional, negative, unsafe and misaligned quantities", () => {
  assert.equal(quantity("20", 10), 20);
  assert.equal(quantity("0", 1, true), 0);
  for (const value of ["-10", "1.5", "21", "0", "9007199254740992"])
    assert.throws(() => quantity(value, 10));
});
test("hosted endpoints require HTTPS and cannot hide credentials, paths or query data", () => {
  assert.equal(
    serverOrigin("https://demo.example.com/"),
    "https://demo.example.com",
  );
  assert.equal(serverOrigin("http://10.0.2.2:8011"), "http://10.0.2.2:8011");
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/api/v1",
    "https://example.com/?token=x",
  ])
    assert.throws(() => serverOrigin(url));
});
test("an old unauthorised response cannot expire a newer session", async () => {
  const originalFetch = globalThis.fetch;
  let respond!: (r: Response) => void;
  let expired = false;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      respond = resolve;
    });
  try {
    const api = new Transport("https://demo.example.com", () => {
      expired = true;
    });
    api.authenticate("old");
    const pending = api.request("/me");
    api.authenticate("new");
    respond(
      new Response(JSON.stringify({ detail: "Expired old token" }), {
        status: 401,
      }),
    );
    await assert.rejects(pending, SessionChanged);
    assert.equal(expired, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unreadable response from a signed-out session is discarded", async () => {
  const originalFetch = globalThis.fetch;
  let respond!: (r: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      respond = resolve;
    });
  try {
    const api = new Transport("https://demo.example.com");
    api.authenticate("old");
    const pending = api.request("/inventory/batches");
    api.authenticate(null);
    respond(new Response("old private response", { status: 200 }));
    await assert.rejects(pending, SessionChanged);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
