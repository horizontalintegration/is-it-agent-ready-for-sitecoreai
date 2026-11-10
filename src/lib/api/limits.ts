import { useEffect, useSyncExternalStore } from "react";
import type { LimitedRoute, LimitScope } from "@/lib/server/rate-limit";

export type { LimitedRoute, LimitScope };

// ─────────────────────────────────────────────────────────────────────────────
// Browser side of the API rate limits (plan Phase 12; the server side is
// src/lib/server/rate-limit.ts). A 429 from one of our routes is remembered
// until its limit resets, so the dashboard stops asking, and the panel and
// dashboard say which limit it is and until when (LimitBanner).
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiLimit {
  route: LimitedRoute;
  scope: LimitScope;
  /** When the limit resets (ms since the epoch). */
  until: number;
}

const limits = new Map<LimitedRoute, ApiLimit>();
const listeners = new Set<() => void>();
let snapshot: ApiLimit[] = [];

function changed() {
  snapshot = [...limits.values()];
  for (const l of listeners) l();
}

function expire(now = Date.now()) {
  let any = false;
  for (const [route, l] of limits) {
    if (l.until <= now) {
      limits.delete(route);
      any = true;
    }
  }
  if (any) changed();
}

/**
 * Reads a 429 from one of our routes and remembers the limit. Returns null for
 * any other response (Anthropic being busy is a 503 `ai_busy`, not a limit).
 */
export async function readLimit(route: LimitedRoute, res: Response, now = Date.now()): Promise<ApiLimit | null> {
  if (res.status !== 429) return null;
  const body = (await res.clone().json().catch(() => ({}))) as { error?: string; scope?: string; retryAfter?: number };
  if (body.error !== "rate_limited") return null;
  const scope: LimitScope = body.scope === "daily" || body.scope === "site" ? body.scope : "ip";
  const retryAfter = Number(body.retryAfter ?? res.headers.get("Retry-After")) || 60;
  const limit: ApiLimit = { route, scope, until: now + retryAfter * 1000 };
  limits.set(route, limit);
  changed();
  return limit;
}

/** The route's limit while it lasts, or null. */
export function activeLimit(route: LimitedRoute, now = Date.now()): ApiLimit | null {
  expire(now);
  return limits.get(route) ?? null;
}

/** Forgets every limit (tests). */
export function clearLimits() {
  limits.clear();
  changed();
}

/** "7:00 PM", or "tomorrow at 1:00 AM" when the reset is on another day. */
export function resetTime(until: number, now = Date.now()): string {
  const at = new Date(until);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return at.toDateString() === new Date(now).toDateString() ? time : `tomorrow at ${time}`;
}

const isAi = (route: LimitedRoute) => route !== "psi-check";

/** One sentence: which limit, and when to try again. */
export function limitMessage(limit: ApiLimit, now = Date.now()): string {
  const what = isAi(limit.route) ? "AI" : "PageSpeed";
  const when = resetTime(limit.until, now);
  switch (limit.scope) {
    case "daily":
      return `Daily ${what} limit reached. Try again after ${when}.`;
    case "site":
      return `Too many citation probes for this site this hour. Try again after ${when}.`;
    default:
      return `Too many ${what} requests from your network this hour. Try again after ${when}.`;
  }
}

/** What the limit holds back, for the banner. */
export function limitEffect(route: LimitedRoute): string {
  switch (route) {
    case "ai-check":
      return "Until then the AI checks (unique value, follow-up questions) are left out of the score.";
    case "assist":
    case "generate-meta":
      return "Until then AI Assist can't write new suggestions.";
    case "citation-probe":
      return "Until then AI citations can't run new probes.";
    case "psi-check":
      return "Until then PageSpeed can't be checked.";
  }
}

/** Shown when Anthropic itself is busy (`ai_busy`, a 503). */
export const AI_BUSY_MESSAGE = "Claude is busy right now. Try again in a minute.";

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The limits in force, updated when one is hit and when one resets. */
export function useApiLimits(): ApiLimit[] {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  useEffect(() => {
    if (current.length === 0) return;
    const next = Math.min(...current.map((l) => l.until));
    const id = setTimeout(() => expire(), Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [current]);
  return current;
}
