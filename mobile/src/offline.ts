import type { Data, Network } from "../../shared/types";
import type { Store } from "./queue";

export interface CachedWorkspace {
  scope: string;
  origin: string;
  tokenFingerprint: string;
  data: Data;
  savedAt: string;
  expiresAt: string;
  network?: Network;
}
export async function saveWorkspace(store: Store, cache: CachedWorkspace) {
  // Cached records have already passed server authorisation. Limit bulky history;
  // operating batches, requests and receipts remain complete for the authorised scope.
  const data = {
    ...cache.data,
    audit: cache.data.audit.slice(-100),
    jobs: cache.data.jobs.slice(-30),
  };
  await store.set(
    `grd.workspace.${cache.scope}`,
    JSON.stringify({ ...cache, data }),
  );
  await store.set("grd.workspace.active", cache.scope);
}
export async function restoreWorkspace(
  store: Store,
  origin: string,
  fingerprint: string,
  now = Date.now(),
): Promise<CachedWorkspace | null> {
  const scope = await store.get("grd.workspace.active");
  if (!scope) return null;
  const raw = await store.get(`grd.workspace.${scope}`);
  if (!raw) return null;
  const cache = JSON.parse(raw) as CachedWorkspace;
  if (
    cache.origin !== origin ||
    cache.tokenFingerprint !== fingerprint ||
    Date.parse(cache.expiresAt) <= now ||
    cache.scope !== scope
  )
    return null;
  return cache;
}
