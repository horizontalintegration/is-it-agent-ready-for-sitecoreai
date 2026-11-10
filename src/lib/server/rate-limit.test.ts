import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import {
  clientIp,
  type Counter,
  DEFAULT_LIMITS,
  limitResponse,
  limitsFor,
  MemoryCounter,
  PROBES_PER_SITE_PER_HOUR,
  RateLimiter,
  RedisCounter,
} from "./rate-limit";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** 2026-11-09 10:00 UTC */
const T0 = Date.UTC(2026, 10, 9, 10, 0, 0);

describe("limitsFor", () => {
  it("uses the defaults, sized for about $3 a day", () => {
    expect(limitsFor("ai-check", {})).toEqual({ ipHour: 100, day: 150 });
    expect(limitsFor("assist", {})).toEqual(DEFAULT_LIMITS.assist);
  });

  it("reads whole numbers from the env, 0 included, and ignores anything else", () => {
    expect(limitsFor("ai-check", { RATE_LIMIT_AI_CHECK_IP_HOUR: "5", RATE_LIMIT_AI_CHECK_DAY: "0" })).toEqual({ ipHour: 5, day: 0 });
    expect(limitsFor("generate-meta", { RATE_LIMIT_GENERATE_META_DAY: "lots" }).day).toBe(40);
    expect(limitsFor("psi-check", { RATE_LIMIT_PSI_CHECK_IP_HOUR: "-1" }).ipHour).toBe(20);
    expect(limitsFor("citation-probe", { RATE_LIMIT_CITATION_PROBE_DAY: " " }).day).toBe(30);
  });
});

describe("MemoryCounter", () => {
  it("counts in fixed windows aligned to the clock", async () => {
    const c = new MemoryCounter();
    expect(await c.take("k", 2, HOUR, T0)).toEqual({ ok: true, resetAt: T0 + HOUR });
    expect((await c.take("k", 2, HOUR, T0 + 1)).ok).toBe(true);
    expect(await c.take("k", 2, HOUR, T0 + 2)).toEqual({ ok: false, resetAt: T0 + HOUR });
    expect((await c.take("other", 2, HOUR, T0 + 2)).ok).toBe(true);
    // The next hour starts afresh.
    expect((await c.take("k", 2, HOUR, T0 + HOUR)).ok).toBe(true);
  });

  it("resets the daily window at 00:00 UTC", async () => {
    const c = new MemoryCounter();
    const midnight = Date.UTC(2026, 10, 10);
    expect(await c.take("d", 1, DAY, T0)).toEqual({ ok: true, resetAt: midnight });
    expect((await c.take("d", 1, DAY, midnight - 1)).ok).toBe(false);
    expect((await c.take("d", 1, DAY, midnight)).ok).toBe(true);
  });

  it("refuses everything at a limit of 0", async () => {
    expect((await new MemoryCounter().take("k", 0, HOUR, T0)).ok).toBe(false);
  });
});

describe("RateLimiter", () => {
  const env = { RATE_LIMIT_AI_CHECK_IP_HOUR: "2", RATE_LIMIT_AI_CHECK_DAY: "3" };

  it("applies the caller's hourly limit, then the route's daily ceiling", async () => {
    const limiter = new RateLimiter(new MemoryCounter(), env);
    expect(await limiter.take("ai-check", "1.1.1.1", T0)).toEqual({ ok: true });
    expect(await limiter.take("ai-check", "1.1.1.1", T0)).toEqual({ ok: true });
    expect(await limiter.take("ai-check", "1.1.1.1", T0)).toEqual({ ok: false, scope: "ip", resetAt: T0 + HOUR });
    // Another caller still has its hourly allowance, until the daily ceiling (3) is used up.
    expect(await limiter.take("ai-check", "2.2.2.2", T0)).toEqual({ ok: true });
    expect(await limiter.take("ai-check", "2.2.2.2", T0)).toEqual({ ok: false, scope: "daily", resetAt: Date.UTC(2026, 10, 10) });
  });

  it("doesn't spend the daily ceiling on a caller who is over their hourly limit", async () => {
    const limiter = new RateLimiter(new MemoryCounter(), env);
    for (let i = 0; i < 5; i++) await limiter.take("ai-check", "1.1.1.1", T0);
    expect(await limiter.take("ai-check", "2.2.2.2", T0)).toEqual({ ok: true });
  });

  it("keeps each route's counts apart", async () => {
    const limiter = new RateLimiter(new MemoryCounter(), { RATE_LIMIT_ASSIST_DAY: "0" });
    expect((await limiter.take("assist", "1.1.1.1", T0)).ok).toBe(false);
    expect((await limiter.take("generate-meta", "1.1.1.1", T0)).ok).toBe(true);
  });

  it("limits citation probes per site per hour", async () => {
    const limiter = new RateLimiter(new MemoryCounter(), {});
    for (let i = 0; i < PROBES_PER_SITE_PER_HOUR; i++) expect((await limiter.takeSite("a.example", T0)).ok).toBe(true);
    expect(await limiter.takeSite("a.example", T0)).toEqual({ ok: false, scope: "site", resetAt: T0 + HOUR });
    expect((await limiter.takeSite("b.example", T0)).ok).toBe(true);
  });
});

describe("RedisCounter", () => {
  /** A Redis client whose every command fails, as when Upstash can't be reached. */
  const failingRedis = () =>
    new Proxy({}, { get: (_, prop) => (prop === "addTelemetry" ? () => {} : () => Promise.reject(new Error("unreachable"))) }) as unknown as Redis;

  it("counts in memory when Redis fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback: Counter = { take: vi.fn(async () => ({ ok: true, resetAt: 1 })) };
    const counter = new RedisCounter(failingRedis(), fallback);
    expect(await counter.take("k", 5, HOUR, T0)).toEqual({ ok: true, resetAt: 1 });
    expect(fallback.take).toHaveBeenCalledWith("k", 5, HOUR, T0);
  });

  it("refuses at a limit of 0 without asking Redis", async () => {
    expect(await new RedisCounter(failingRedis()).take("k", 0, HOUR, T0)).toEqual({ ok: false, resetAt: T0 + HOUR });
  });
});

describe("limitResponse", () => {
  it("answers 429 with the scope and when to try again", async () => {
    const res = limitResponse({ ok: false, scope: "daily", resetAt: T0 + 90_500 }, T0);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("91");
    expect(await res.json()).toEqual({ error: "rate_limited", scope: "daily", retryAfter: 91 });
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("https://app.example/api/x", { headers });

  it("reads Vercel's headers", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.5");
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
