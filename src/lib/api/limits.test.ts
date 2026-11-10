import { beforeEach, describe, expect, it } from "vitest";
import { activeLimit, clearLimits, limitEffect, limitMessage, readLimit, resetTime } from "./limits";

beforeEach(() => clearLimits());

const T0 = new Date(2026, 10, 9, 14, 0, 0).getTime();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("readLimit", () => {
  it("remembers a 429 from our routes until it resets", async () => {
    const limit = await readLimit("ai-check", json(429, { error: "rate_limited", scope: "daily", retryAfter: 600 }), T0);
    expect(limit).toEqual({ route: "ai-check", scope: "daily", until: T0 + 600_000 });
    expect(activeLimit("ai-check", T0 + 599_000)).toEqual(limit);
    expect(activeLimit("assist", T0)).toBeNull();
    expect(activeLimit("ai-check", T0 + 600_000)).toBeNull();
  });

  it("leaves the body readable for the caller", async () => {
    const res = json(429, { error: "rate_limited", scope: "ip", retryAfter: 60 });
    await readLimit("assist", res, T0);
    expect(await res.json()).toMatchObject({ error: "rate_limited" });
  });

  it("ignores anything that isn't one of our limits", async () => {
    expect(await readLimit("ai-check", json(503, { error: "ai_busy" }), T0)).toBeNull();
    expect(await readLimit("ai-check", json(200, {}), T0)).toBeNull();
    expect(await readLimit("ai-check", json(429, { error: "something_else" }), T0)).toBeNull();
    expect(activeLimit("ai-check", T0)).toBeNull();
  });
});

describe("limitMessage", () => {
  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  it("names the limit and when to try again", () => {
    const later = T0 + 3 * 60 * 60 * 1000;
    expect(limitMessage({ route: "ai-check", scope: "daily", until: later }, T0)).toBe(`Daily AI limit reached. Try again after ${time(later)}.`);
    expect(limitMessage({ route: "assist", scope: "ip", until: later }, T0)).toBe(
      `Too many AI requests from your network this hour. Try again after ${time(later)}.`,
    );
    expect(limitMessage({ route: "psi-check", scope: "daily", until: later }, T0)).toBe(`Daily PageSpeed limit reached. Try again after ${time(later)}.`);
    expect(limitMessage({ route: "citation-probe", scope: "site", until: later }, T0)).toContain("Too many citation probes for this site");
  });

  it("says tomorrow when the reset is on another day", () => {
    const tomorrow = new Date(2026, 10, 10, 1, 0, 0).getTime();
    expect(resetTime(tomorrow, T0)).toBe(`tomorrow at ${time(tomorrow)}`);
  });

  it("says what the limit holds back", () => {
    expect(limitEffect("ai-check")).toContain("left out of the score");
  });
});
