// ────────────────────────────────────────────────────────────────────────────
// Rate limits for the routes that spend money (plan Phase 12, SPIKE-FINDINGS
// section 10.4): per IP per hour, then a daily ceiling for all callers of the
// route. Only calls that reach Claude (or PageSpeed) are counted: a cache hit
// is free and never limited.
//
// The counts live in Upstash Redis (UPSTASH_KV_REST_API_URL and _TOKEN, from
// the Vercel Marketplace), so they hold across Vercel instances. Without
// Redis (local dev), or when Redis doesn't answer, they're kept in this
// instance's memory instead.
//
// Fixed windows aligned to the clock, as Upstash counts them: the hourly limit
// resets on the hour and the daily ceiling at 00:00 UTC.
//
// Each limit can be changed with an env var (a whole number, 0 refuses all),
// e.g. RATE_LIMIT_AI_CHECK_IP_HOUR=100 and RATE_LIMIT_AI_CHECK_DAY=150.
// ────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type LimitedRoute = "ai-check" | "assist" | "generate-meta" | "citation-probe" | "psi-check";
/** `ip`: this caller's hourly limit; `daily`: the route's ceiling for everyone; `site`: probes per site per hour. */
export type LimitScope = "ip" | "daily" | "site";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Sized for a $25 monthly Anthropic limit: at most about $3 a day if every ceiling is reached. */
export const DEFAULT_LIMITS: Record<LimitedRoute, { ipHour: number; day: number }> = {
  "ai-check": { ipHour: 100, day: 150 },
  "generate-meta": { ipHour: 20, day: 40 },
  assist: { ipHour: 10, day: 20 },
  "citation-probe": { ipHour: 20, day: 30 },
  "psi-check": { ipHour: 20, day: 200 },
};

/** Citation probes per site per hour, whoever runs them. */
export const PROBES_PER_SITE_PER_HOUR = 40;

const envName = (route: LimitedRoute, which: "IP_HOUR" | "DAY") =>
  `RATE_LIMIT_${route.replace(/-/g, "_").toUpperCase()}_${which}`;

function envNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** The route's limits, from the env vars or the defaults. */
export function limitsFor(route: LimitedRoute, env: Record<string, string | undefined> = process.env) {
  const d = DEFAULT_LIMITS[route];
  return {
    ipHour: envNumber(env[envName(route, "IP_HOUR")], d.ipHour),
    day: envNumber(env[envName(route, "DAY")], d.day),
  };
}

export interface Take {
  ok: boolean;
  /** When the window ends (ms since the epoch). */
  resetAt: number;
}

/** Counts calls per key in fixed windows. */
export interface Counter {
  take(key: string, limit: number, windowMs: number, now?: number): Promise<Take>;
}

const windowEnd = (now: number, windowMs: number) => (Math.floor(now / windowMs) + 1) * windowMs;

/** This instance's memory: local dev, and the fallback when Redis fails. */
export class MemoryCounter implements Counter {
  private windows = new Map<string, { end: number; count: number }>();

  async take(key: string, limit: number, windowMs: number, now = Date.now()): Promise<Take> {
    const end = windowEnd(now, windowMs);
    const w = this.windows.get(`${key}:${windowMs}`);
    const count = w && w.end === end ? w.count : 0;
    if (count >= limit) return { ok: false, resetAt: end };
    this.windows.set(`${key}:${windowMs}`, { end, count: count + 1 });
    if (this.windows.size > 10_000) this.prune(now);
    return { ok: true, resetAt: end };
  }

  private prune(now: number) {
    for (const [k, w] of this.windows) if (w.end <= now) this.windows.delete(k);
  }
}

/** Upstash Redis, shared by every instance. Falls back to memory when Redis fails. */
export class RedisCounter implements Counter {
  private limiters = new Map<string, Ratelimit>();
  private warned = false;

  constructor(
    private readonly redis: Redis,
    private readonly fallback: Counter = new MemoryCounter(),
  ) {}

  async take(key: string, limit: number, windowMs: number, now = Date.now()): Promise<Take> {
    if (limit <= 0) return { ok: false, resetAt: windowEnd(now, windowMs) };
    const id = `${limit}:${windowMs}`;
    let limiter = this.limiters.get(id);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: this.redis,
        limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
        // Production and previews share the counts (a preview URL is no way
        // round the limits); local runs keep their own.
        prefix: process.env.VERCEL ? "iiar:rl" : "iiar:rl:local",
        // A caller over the limit is turned away from memory, with no Redis call.
        ephemeralCache: new Map(),
        // Redis slow: let the call through rather than hold up the app.
        timeout: 1500,
        analytics: false,
      });
      this.limiters.set(id, limiter);
    }
    try {
      const res = await limiter.limit(key);
      return { ok: res.success, resetAt: res.reset };
    } catch (err) {
      if (!this.warned) {
        console.warn(`[rate-limit] Redis failed, counting in memory: ${err instanceof Error ? err.message : err}`);
        this.warned = true;
      }
      return this.fallback.take(key, limit, windowMs, now);
    }
  }
}

function redisFromEnv(env: Record<string, string | undefined> = process.env): Redis | null {
  const url = env.UPSTASH_KV_REST_API_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_KV_REST_API_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  // No SDK and platform headers on our requests to Upstash.
  return url && token ? new Redis({ url, token, enableTelemetry: false }) : null;
}

export type LimitResult = { ok: true } | { ok: false; scope: LimitScope; resetAt: number };

export class RateLimiter {
  constructor(
    private readonly counter: Counter,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  /** Counts one call to the route: the caller's hourly limit first, then the daily ceiling. */
  async take(route: LimitedRoute, ip: string, now = Date.now()): Promise<LimitResult> {
    const { ipHour, day } = limitsFor(route, this.env);
    const perIp = await this.counter.take(`${route}:ip:${ip}`, ipHour, HOUR_MS, now);
    if (!perIp.ok) return { ok: false, scope: "ip", resetAt: perIp.resetAt };
    const daily = await this.counter.take(`${route}:day`, day, DAY_MS, now);
    if (!daily.ok) return { ok: false, scope: "daily", resetAt: daily.resetAt };
    return { ok: true };
  }

  /** Counts one citation probe for the site. */
  async takeSite(site: string, now = Date.now()): Promise<LimitResult> {
    const res = await this.counter.take(`citation-probe:site:${site}`, PROBES_PER_SITE_PER_HOUR, HOUR_MS, now);
    return res.ok ? { ok: true } : { ok: false, scope: "site", resetAt: res.resetAt };
  }
}

const redis = redisFromEnv();
export const rateLimiter = new RateLimiter(redis ? new RedisCounter(redis) : new MemoryCounter());

/** The caller's IP. On Vercel, `x-real-ip` and `x-forwarded-for` are set by Vercel itself. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** The 429 for a refused call: `scope` and `retryAfter` (seconds) let the page say which limit and until when. */
export function limitResponse(result: Extract<LimitResult, { ok: false }>, now = Date.now()): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "rate_limited", scope: result.scope, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

/** Counts one call to the route for this request's caller: null to go on, or the 429. */
export async function limitCall(route: LimitedRoute, req: Request): Promise<NextResponse | null> {
  const res = await rateLimiter.take(route, clientIp(req));
  if (res.ok) return null;
  console.info(`[rate-limit] ${route}: ${res.scope} limit reached`);
  return limitResponse(res);
}
