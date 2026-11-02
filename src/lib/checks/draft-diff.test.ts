import { describe, expect, it } from "vitest";
import { compareBlocks, draftDiffersFromLive } from "./draft-diff";
import type { BodyBlock } from "@/lib/rule-engine/types";

const RELATED = "authorable/articles/relatedarticles";
const b = (text: string, component: string | null = null): BodyBlock => ({ text, component });

// The BrandX Banking article: the Related Articles cards are fetched in the
// browser, so they're in the draft but not in the server HTML (SPIKE-FINDINGS §3).
const LIVE = [
  b("Banking Sector Earnings Point to Resilience"),
  b("Major banks reported steady earnings this quarter as lending held up across regions."),
  b("Related Articles", RELATED),
  b("© 2026 BrandX"),
];
const DRAFT = [
  b("Banking Sector Earnings Point to Resilience"),
  b("Major banks reported steady earnings this quarter as lending held up across regions."),
  b("Related Articles", RELATED),
  b("Retail Investor Participation Hits Record High", RELATED),
  b("Retail investors made up a record share of trading volume in March.", RELATED),
  b("March 3, 2026", RELATED),
  b("Read More", RELATED),
  b("© {{year}} BrandX"),
];

describe("compareBlocks", () => {
  it("finds the client-rendered Related Articles cards, skipping short blocks", () => {
    const diff = compareBlocks(DRAFT, LIVE);
    expect(diff.clientOnly.map((x) => x.text)).toEqual([
      "Retail Investor Participation Hits Record High",
      "Retail investors made up a record share of trading volume in March.",
    ]);
    expect(diff.clientOnly.every((x) => x.component === RELATED)).toBe(true);
    expect(diff.clientOnlyWords).toBe(18);
    expect(diff.edited).toEqual([]);
  });

  it("treats an edited heading as server content, not client-only", () => {
    const live = [b("Why does it matter to your firm?"), b("Some paragraph text that is unchanged here.")];
    const draft = [b("Why does it really matter to your firm?"), b("Some paragraph text that is unchanged here.")];
    const diff = compareBlocks(draft, live);
    expect(diff.clientOnly).toEqual([]);
    expect(diff.edited).toEqual([{ draft: "Why does it really matter to your firm?", live: "Why does it matter to your firm?" }]);
    expect(diff.serverWords).toBe(15);
  });

  it("ignores empty-state messages", () => {
    const diff = compareBlocks([b("No articles found"), b("Our latest market news and updates")], [b("Our latest market news and updates")]);
    expect(diff.clientOnly).toEqual([]);
    expect(diff.serverWords).toBe(6);
  });

  it("matches a {{…}} token to any word (BrandX footer: {{year}} in the draft, 2026 live)", () => {
    const diff = compareBlocks([b("© {{year}} Horizontal Digital. All rights reserved.")], [b("© 2026 Horizontal Digital. All rights reserved.")]);
    expect(diff).toMatchObject({ clientOnly: [], edited: [], liveOnly: [], serverWords: 7 });
  });

  it("matches text split into different blocks on each side", () => {
    const diff = compareBlocks([b("Plan your financial future")], [b("Plan your financial future with BrandX today")]);
    expect(diff.clientOnly).toEqual([]);
  });

  it("doesn't report published text missing from the draft as client-only", () => {
    const diff = compareBlocks([b("Short draft")], [b("Short draft"), b("Celebrate St. Patrick's Day with BrandX and friends")]);
    expect(diff.clientOnly).toEqual([]);
    expect(diff.liveOnly.map((x) => x.text)).toEqual(["Celebrate St. Patrick's Day with BrandX and friends"]);
  });
});

describe("draftDiffersFromLive", () => {
  const live = ["Title of the page", "Why does it matter?", "A paragraph of body text."].join("\n");

  it("is false when the only extra text is client-rendered", () => {
    const draft = [live, "Retail Investor Participation Hits Record High"].join("\n");
    expect(draftDiffersFromLive(draft, live)).toEqual({ differs: false, changed: 0, removed: 0 });
  });

  it("is true when a heading is edited", () => {
    const draft = live.replace("Why does it matter?", "Why does a content strategy matter?");
    expect(draftDiffersFromLive(draft, live)).toEqual({ differs: true, changed: 1, removed: 0 });
  });

  it("is true when published text was removed", () => {
    const draft = ["Title of the page", "A paragraph of body text."].join("\n");
    expect(draftDiffersFromLive(draft, live)).toEqual({ differs: true, changed: 0, removed: 1 });
  });

  it("is false for the same text", () => {
    expect(draftDiffersFromLive(live, live).differs).toBe(false);
  });
});
