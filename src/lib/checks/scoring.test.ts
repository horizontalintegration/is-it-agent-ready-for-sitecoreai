import { describe, expect, it } from "vitest";
import { scoreResults } from "./scoring";
import { runGate } from "./gate";
import { runPageChecks } from "./engine";
import { buildPageContext } from "./context";
import { makeParsedHtml, makeTestPageData } from "@/lib/rule-engine/test-fixture";
import type { Category, CheckMeta, CheckResult, ResultState, Tier } from "./types";

let n = 0;
function item(
  tier: Tier,
  credit: number,
  opts: { state?: ResultState; weight?: number; category?: Category } = {},
): { check: CheckMeta; result: CheckResult } {
  n += 1;
  return {
    check: {
      id: `test.check-${n}`,
      ref: `T${n}`,
      title: `Check ${n}`,
      why: "",
      category: opts.category ?? "understand",
      tier,
      scope: "page",
      sources: ["live"],
      owner: "author",
      weight: opts.weight,
    },
    result: {
      state: opts.state ?? "scored",
      credit,
      status: "pass",
      value: "",
      message: "",
      fixSuggestion: "",
      details: [],
    },
  };
}

describe("scoreResults — pools", () => {
  it("splits the 80-point Essential and 20-point Recommended pools equally", () => {
    const out = scoreResults([item("essential", 1), item("essential", 0), item("recommended", 1), item("recommended", 1)]);
    expect(out.outcomes.map((o) => o.maxPoints)).toEqual([40, 40, 10, 10]);
    expect(out.outcomes.map((o) => o.points)).toEqual([40, 0, 10, 10]);
    expect(out.score).toBe(60);
    expect(out.tiers.essential).toEqual({ earned: 40, max: 80 });
    expect(out.tiers.recommended).toEqual({ earned: 20, max: 20 });
  });

  it("gives partial credit in proportion", () => {
    const out = scoreResults([item("essential", 0.5), item("recommended", 0.25)]);
    expect(out.outcomes[0].points).toBe(40);
    expect(out.outcomes[1].points).toBe(5);
    expect(out.score).toBe(45);
  });

  it("clamps credit to 0–1", () => {
    const out = scoreResults([item("essential", 1.7), item("recommended", -2)]);
    expect(out.outcomes.map((o) => o.points)).toEqual([80, 0]);
  });

  it("splits a pool by weight", () => {
    const out = scoreResults([
      item("essential", 1, { weight: 3 }),
      item("essential", 0, { weight: 1 }),
      item("recommended", 1),
    ]);
    expect(out.outcomes.map((o) => o.maxPoints)).toEqual([60, 20, 20]);
    expect(out.score).toBe(80);
  });

  it("rounds the score but keeps exact points", () => {
    const out = scoreResults([item("essential", 1), item("recommended", 1), item("recommended", 1), item("recommended", 0)]);
    expect(out.outcomes[1].maxPoints).toBeCloseTo(20 / 3);
    expect(out.score).toBe(Math.round(80 + 40 / 3));
  });
});

describe("scoreResults — N/A and not checked", () => {
  it("leaves N/A checks out of the pool instead of failing them", () => {
    const withNa = scoreResults([
      item("essential", 1),
      item("essential", 0, { state: "not-applicable" }),
      item("recommended", 1),
    ]);
    expect(withNa.score).toBe(100);
    expect(withNa.outcomes[1]).toMatchObject({ points: 0, maxPoints: 0 });
  });

  it("leaves not-checked results (AI pending, PSI not run) out the same way", () => {
    const out = scoreResults([item("essential", 0.5), item("recommended", 0, { state: "not-checked" }), item("recommended", 1)]);
    expect(out.outcomes[1].maxPoints).toBe(0);
    expect(out.outcomes[2].maxPoints).toBe(20);
    expect(out.score).toBe(60);
  });

  it("scales the remaining base pool up to 100 when a tier has nothing scored", () => {
    expect(scoreResults([item("essential", 1), item("essential", 0.5)]).score).toBe(75);
    expect(scoreResults([item("recommended", 1), item("recommended", 0)]).score).toBe(50);
  });

  it("has no score when nothing could be scored", () => {
    expect(scoreResults([]).score).toBeNull();
    expect(scoreResults([item("essential", 1, { state: "not-checked" })]).score).toBeNull();
    // Bonus alone has nothing to add to.
    expect(scoreResults([item("bonus", 1)]).score).toBeNull();
  });
});

describe("scoreResults — bonus", () => {
  it("adds up to 5 bonus points, split across bonus checks", () => {
    const out = scoreResults([item("essential", 0.5), item("recommended", 1), item("bonus", 1), item("bonus", 0)]);
    expect(out.outcomes.slice(2).map((o) => o.maxPoints)).toEqual([2.5, 2.5]);
    expect(out.score).toBe(63); // 40 + 20 + 2.5 = 62.5, rounded
  });

  it("caps the total at 100", () => {
    const out = scoreResults([item("essential", 1), item("recommended", 1), item("bonus", 1)]);
    expect(out.tiers.bonus.earned).toBe(5);
    expect(out.score).toBe(100);
  });
});

describe("scoreResults — categories", () => {
  it("sums earned and max points per category", () => {
    const out = scoreResults([
      item("essential", 1, { category: "reach" }),
      item("essential", 0, { category: "understand" }),
      item("recommended", 0.5, { category: "trust" }),
      item("recommended", 0, { category: "trust", state: "not-applicable" }),
    ]);
    expect(out.categories.reach).toEqual({ earned: 40, max: 40 });
    expect(out.categories.understand).toEqual({ earned: 0, max: 40 });
    expect(out.categories.trust).toEqual({ earned: 10, max: 20 });
    expect(out.categories.read).toEqual({ earned: 0, max: 0 });
  });
});

describe("gate (P1 reach.indexable)", () => {
  const fields = { metaTitle: null, metaDescription: null, robotsMetaTag: null, updated: null };

  it("passes an indexable page", () => {
    expect(runGate(fields, makeParsedHtml({ robotsMeta: "index, follow" }))).toEqual({ blocked: false, reason: "" });
  });

  it("blocks on the Sitecore Robots Meta Tag field even without HTML", () => {
    expect(runGate({ ...fields, robotsMetaTag: "noindex, follow" }, null).blocked).toBe(true);
  });

  it.each([
    ["robotsMeta", "noindex, follow"],
    ["robotsMeta", "max-snippet:0"],
    ["googlebotMeta", "nosnippet"],
  ] as const)("blocks on %s=%j", (key, value) => {
    expect(runGate(fields, makeParsedHtml({ [key]: value })).blocked).toBe(true);
  });

  it("shows the gate instead of a score", () => {
    const data = makeTestPageData();
    data.fields.robotsMetaTag = "noindex";
    const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));
    expect(report.gate.blocked).toBe(true);
    expect(report.score).toBeNull();
    expect(report.outcomes).toEqual([]);
  });
});
