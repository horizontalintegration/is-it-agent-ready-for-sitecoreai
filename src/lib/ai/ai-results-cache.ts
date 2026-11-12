// ─────────────────────────────────────────────────────────────────────────────
// Browser cache of /api/ai-check results, keyed by a hash of the page title and
// main text (plan section 9, defects D8 / D10). The panel and the dashboard
// share it, so Claude is only called again when the page content changes.
//
// The key doesn't include the server's model: after changing ANTHROPIC_MODEL or
// ANTHROPIC_MODEL_BULK, bump AI_CHECK_VERSION to drop results cached in
// browsers under the old model.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiResults } from "@/lib/rule-engine/types";
import { activeLimit, readLimit } from "@/lib/api/limits";
import { AI_CHECK_VERSION, contentKey } from "./content-key";

const STORAGE_KEY = `aiDiscovery:ai-results:${AI_CHECK_VERSION}`;
/** Oldest entries are dropped past this many pages. */
const MAX_ENTRIES = 500;

interface CachedAiResult {
  result: AiResults;
  cachedAt: string;
}

/** Minimal Storage interface so tests can pass an in-memory store. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): KeyValueStore | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readAll(store: KeyValueStore): Record<string, CachedAiResult> {
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CachedAiResult>) : {};
  } catch {
    return {};
  }
}

export function aiResultKey(pageTitle: string, bodyText: string): Promise<string> {
  return contentKey(["ai-check", AI_CHECK_VERSION, pageTitle, bodyText]);
}

export function readAiResult(key: string, store = defaultStore()): AiResults | null {
  if (!store) return null;
  return readAll(store)[key]?.result ?? null;
}

export function writeAiResult(key: string, result: AiResults, store = defaultStore()): void {
  if (!store) return;
  try {
    const all = readAll(store);
    all[key] = { result, cachedAt: new Date().toISOString() };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => all[a].cachedAt.localeCompare(all[b].cachedAt))
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete all[k]);
    }
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore quota errors
  }
}

/**
 * AI check results for a page: from the cache when the content is unchanged,
 * otherwise from /api/ai-check. `force` skips the browser and server caches
 * (the panel's AI-only re-run). Returns null when the request fails, and
 * without asking while the ai-check rate limit is in force (`activeLimit`).
 */
export async function fetchAiResults(
  pageTitle: string,
  bodyText: string,
  opts: { force?: boolean } = {},
): Promise<AiResults | null> {
  const key = await aiResultKey(pageTitle, bodyText);
  if (!opts.force) {
    const hit = readAiResult(key);
    if (hit) {
      console.info(`[ai-cache] hit ${key.slice(0, 8)}: content unchanged, skipping ai-check`);
      return hit;
    }
  }
  if (activeLimit("ai-check")) {
    console.info(`[ai-cache] miss ${key.slice(0, 8)}: ai-check limit reached, skipped`);
    return null;
  }
  console.info(`[ai-cache] ${opts.force ? "forced re-run" : "miss"} ${key.slice(0, 8)}: calling ai-check`);

  try {
    const res = await fetch("/api/ai-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageTitle, bodyText, ...(opts.force ? { force: true } : {}) }),
    });
    if (!res.ok) {
      await readLimit("ai-check", res);
      return null;
    }
    const result = (await res.json()) as AiResults;
    writeAiResult(key, result);
    return result;
  } catch {
    return null;
  }
}
