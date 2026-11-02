import { useState, type ReactNode } from "react";
import { command } from "../api";
import type { Workflow } from "../../../shared/operations";
import { Badge } from "../ui";
import { title } from "../utils";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="ops-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Status({ state }: { state: string }) {
  return (
    <Badge
      tone={
        ["approved", "received", "closed", "recorded"].includes(state)
          ? "green"
          : ["review", "in_transit", "partial", "open"].includes(state)
            ? "amber"
            : "neutral"
      }
    >
      {title(state)}
    </Badge>
  );
}
export function useOperation(
  refresh: () => Promise<void>,
  notify: (s: string) => void,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transition(
    w: Pick<Workflow, "id" | "version">,
    path: string,
    body: Record<string, unknown>,
  ) {
    await command(path, { version: w.version, ...body });
    notify("Action recorded. Inventory and worklists refreshed.");
  }
  return { busy, error, setError, run, transition };
}
