import { afterEach, describe, expect, it, vi } from "vitest";
import { api, command, setToken, upload, SessionChangedError } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  setToken(null);
});

it("discards an old response after signing out", async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((r) => (resolve = r))),
  );
  setToken("old-session");
  const rejected = expect(api("/me")).rejects.toBeInstanceOf(
    SessionChangedError,
  );
  setToken(null);
  resolve(new Response(JSON.stringify({ id: "private-old-user" })));
  await rejected;
});

it("an old 401 cannot sign out a newly authenticated user", async () => {
  let resolve!: (r: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)))
    .mockImplementation(
      async () => new Response(JSON.stringify({ id: "new-user" })),
    );
  vi.stubGlobal("fetch", fetcher);
  setToken("old-token");
  const rejected = expect(api("/me")).rejects.toBeInstanceOf(
    SessionChangedError,
  );
  setToken("new-token");
  resolve(
    new Response(JSON.stringify({ detail: "Old token revoked" }), {
      status: 401,
    }),
  );
  await rejected;
  await api("/me");
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
    "Bearer new-token",
  );
});

it("keeps the stock command key when a successful response is unreadable", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("truncated-json"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    command("/test-unreadable", { quantity: 10 }),
  ).rejects.toMatchObject({ status: 502 });
  await command("/test-unreadable", { quantity: 10 });
  expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
    fetcher.mock.calls[1][1].headers["Idempotency-Key"],
  );
});

it("clears an expired upload session just like a JSON request", async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Session revoked" }), {
        status: 401,
      }),
    ),
  );
  setToken("expired");
  await expect(upload("/imports/demand", new FormData())).rejects.toMatchObject(
    { status: 401 },
  );
  expect(dispatchEvent).toHaveBeenCalledOnce();
});

describe("authenticated stock commands", () => {
  it("reuses the command key after a lost response, then creates a new key for a new action", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    setToken("session-token");
    await expect(
      command("/test-stock-command", { quantity: 20 }),
    ).rejects.toThrow("Connection lost");
    await command("/test-stock-command", { quantity: 20 });
    await command("/test-stock-command", { quantity: 20 });
    const options = fetcher.mock.calls.map((call) => call[1]);
    expect(options[0].headers["Idempotency-Key"]).toBe(
      options[1].headers["Idempotency-Key"],
    );
    expect(options[2].headers["Idempotency-Key"]).not.toBe(
      options[1].headers["Idempotency-Key"],
    );
    expect(options[0].headers.Authorization).toBe("Bearer session-token");
  });
  it("reports a server conflict without claiming success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Stale plan version" }), {
          status: 409,
        }),
      ),
    );
    await expect(
      api("/plans/p/approve", "POST", { version: 1 }),
    ).rejects.toMatchObject({ status: 409, message: "Stale plan version" });
  });
});
