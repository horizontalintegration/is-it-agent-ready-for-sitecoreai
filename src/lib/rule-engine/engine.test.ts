import { describe, expect, it } from "vitest";
import { runGateCheck, runRuleEngine } from "./engine";
import { makeTestPageData } from "./test-fixture";
import { labelForPct } from "@/lib/site-aggregate";

describe("runGateCheck", () => {
  it("passes an indexable page", () => {
    const data = makeTestPageData();
    expect(runGateCheck(data.authoring, data.parsedHtml)).toEqual({ blocked: false, reason: "" });
  });

  it("blocks on the Sitecore noindex field even without HTML", () => {
    const data = makeTestPageData();
    const gate = runGateCheck({ ...data.authoring, noIndexField: true }, null);
    expect(gate.blocked).toBe(true);
  });

  it.each([
    ["robotsMeta", "noindex, follow"],
    ["robotsMeta", "max-snippet:0"],
    ["googlebotMeta", "nosnippet"],
  ] as const)("blocks on %s=%j", (key, value) => {
    const data = makeTestPageData();
    const gate = runGateCheck(data.authoring, { ...data.parsedHtml!, [key]: value });
    expect(gate.blocked).toBe(true);
  });
});

describe("runRuleEngine (demo fixture)", () => {
  it("scores the fixture page with the current 81-point model", () => {
    const out = runRuleEngine(makeTestPageData());
    expect(out.gate.blocked).toBe(false);
    expect(out.maxTotalScore).toBe(81);
    expect(out.totalScore).toBe(out.seoScore + out.aeoScore + out.contentQualityScore);
    expect(out.totalScore).toBe(out.results.reduce((s, r) => s + r.score, 0));
    expect(out.totalScore).toBeGreaterThan(0);
    expect(out.totalScore).toBeLessThanOrEqual(out.maxTotalScore);
  });

  it("returns no results and a zero score when the gate blocks", () => {
    const data = makeTestPageData();
    data.authoring.noIndexField = true;
    const out = runRuleEngine(data);
    expect(out.gate.blocked).toBe(true);
    expect(out.results).toEqual([]);
    expect(out.totalScore).toBe(0);
    expect(out.maxTotalScore).toBe(81);
  });

  it("never awards more than a check's maxScore", () => {
    for (const r of runRuleEngine(makeTestPageData()).results) {
      expect(r.score, r.id).toBeLessThanOrEqual(r.maxScore);
      expect(r.score, r.id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("labelForPct (dashboard thresholds, pre-v2)", () => {
  it.each([
    [0, "critical"],
    [39.9, "critical"],
    [40, "warning"],
    [70, "warning"],
    [70.1, "good"],
  ] as const)("%d%% → %s", (pct, label) => {
    expect(labelForPct(pct)).toBe(label);
  });
});
