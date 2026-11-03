import { describe, expect, it } from "vitest";
import { buildPageContext } from "./context";
import { runPageChecks } from "./engine";
import {
  developerNote,
  displayStatus,
  fixButton,
  fixesToReady,
  groupPageIssues,
  needsWork,
  pageVerdict,
  rankedFixes,
  summarisePageReport,
  toCheckRow,
  topFixes,
  type CheckRowModel,
  type PageScoreSummary,
} from "./view-model";
import { makeTestPageData } from "@/lib/rule-engine/test-fixture";

function row(id: string, gain: number, extra: Partial<CheckRowModel> = {}): CheckRowModel {
  return {
    id,
    ref: "P0",
    title: id,
    why: "",
    category: "understand",
    tier: "recommended",
    owner: "author",
    state: "scored",
    status: "warning",
    display: "improve",
    points: 0,
    maxPoints: gain,
    gain,
    gainPts: Math.round(gain),
    value: "",
    message: "",
    fixSuggestion: "",
    details: [],
    runner: null,
    sources: ["live"],
    ...extra,
  };
}

describe("displayStatus", () => {
  it.each([
    ["scored", "pass", "pass"],
    ["scored", "warning", "improve"],
    ["scored", "fail", "fix"],
    ["not-applicable", "info", "na"],
    ["not-checked", "info", "not-checked"],
  ] as const)("%s/%s → %s", (state, status, out) => {
    expect(displayStatus(state, status)).toBe(out);
  });
});

describe("fixes", () => {
  const rows = [
    row("small", 0.4),
    row("mid", 5),
    row("big", 8, { status: "fail", display: "fix" }),
    row("pass", 0, { status: "pass", display: "pass" }),
    row("na", 0, { state: "not-applicable", display: "na" }),
    row("tie-dev", 3, { owner: "developer" }),
    row("tie-author", 3),
  ];

  it("ranks by gain, drops fixes worth under 1 point, and breaks ties for the author", () => {
    expect(rankedFixes(rows).map((r) => r.id)).toEqual(["big", "mid", "tie-author", "tie-dev"]);
    expect(topFixes(rows).map((r) => r.id)).toEqual(["big", "mid", "tie-author"]);
  });

  it("counts how many of the biggest fixes reach 80", () => {
    expect(fixesToReady(85, rows)).toBe(0);
    expect(fixesToReady(72, rows)).toBe(1);
    expect(fixesToReady(70, rows)).toBe(2);
    expect(fixesToReady(40, rows)).toBeNull();
  });

  it("writes the verdict sentence from the same numbers", () => {
    expect(pageVerdict(70, rows)).toMatchObject({ label: "almost-there", text: "Almost there", sentence: "2 fixes would make this page agent-ready." });
    expect(pageVerdict(72, rows).sentence).toBe("1 fix would make this page agent-ready.");
    expect(pageVerdict(40, rows)).toMatchObject({ text: "Not ready", sentence: "5 checks need work. Start with the top fixes below." });
    expect(pageVerdict(90, [row("p", 0, { status: "pass", display: "pass" })]).sentence).toBe("Every check passes. Nothing to fix.");
  });

  it("picks a verb button per fix", () => {
    expect(fixButton({ id: "understand.title-meta", fix: "generate", owner: "author" })).toBe("generate");
    // Alt text has a generate fix, but the generator can't write it until Phase 9.
    expect(fixButton({ id: "understand.image-alt", fix: "generate", owner: "author" })).toBe("generate");
    expect(fixButton({ id: "understand.faq-quality", fix: "generate", owner: "author" })).toBe("generate");
    expect(fixButton({ id: "trust.author", fix: "apply-field", owner: "author" })).toBe("apply");
    expect(fixButton({ id: "understand.json-ld", fix: "copy-snippet", owner: "developer", codePreview: "{}" })).toBe("copy-snippet");
    expect(fixButton({ id: "understand.json-ld", fix: "copy-snippet", owner: "developer" })).toBe("send-to-developer");
    expect(fixButton({ id: "reach.canonical", fix: "send-to-developer", owner: "developer" })).toBe("send-to-developer");
    expect(fixButton({ id: "understand.headings", owner: "author" })).toBe("show-how");
  });

  it("writes a developer note with the page and the fix", () => {
    const note = developerNote(row("x", 2, { title: "Canonical points to this page", message: "No canonical.", fixSuggestion: "Add one." }), "https://example.com/a");
    expect(note).toContain("Canonical points to this page");
    expect(note).toContain("Page: https://example.com/a");
    expect(note).toContain("Fix: Add one.");
  });
});

describe("demo page", () => {
  const data = makeTestPageData();
  const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));

  it("summary keeps the page's issues with their gains", () => {
    const summary = summarisePageReport(report);
    const open = report.outcomes.map(toCheckRow).filter(needsWork);
    expect(summary.issues.map((i) => i.id).sort()).toEqual(open.map((r) => r.id).sort());
    for (const issue of summary.issues) expect(issue.gain).toBeGreaterThanOrEqual(0);
  });

  it("the verdict agrees with the score label", () => {
    const rows = report.outcomes.map(toCheckRow);
    expect(pageVerdict(report.score!, rows).label).toBe(summarisePageReport(report).label);
  });
});

describe("groupPageIssues", () => {
  const summary = (issues: PageScoreSummary["issues"]): PageScoreSummary => ({
    score: 50,
    label: "not-ready",
    blocked: false,
    gateReason: "",
    categories: { reach: { earned: 0, max: 0 }, read: { earned: 0, max: 0 }, understand: { earned: 0, max: 0 }, trust: { earned: 0, max: 0 } },
    servesMarkdown: null,
    issues,
  });

  it("groups by check, most total points first, worst status wins", () => {
    const groups = groupPageIssues([
      { id: "a", score: summary([{ id: "understand.title-meta", status: "warning", gain: 5 }, { id: "trust.author", status: "fail", gain: 3 }]) },
      { id: "b", score: summary([{ id: "understand.title-meta", status: "fail", gain: 7 }]) },
      { id: "c", score: null },
    ]);
    expect(groups.map((g) => [g.id, g.pageIds, g.gainEach, g.display])).toEqual([
      ["understand.title-meta", ["a", "b"], 6, "fix"],
      ["trust.author", ["a"], 3, "fix"],
    ]);
    expect(groups[0].title).toBe("Title and description are set");
  });
});
