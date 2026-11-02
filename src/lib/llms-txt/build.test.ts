import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "./build";
import { makeTestSitePages } from "@/lib/rule-engine/test-fixture";

const opts = { siteDomain: "https://example.com", siteName: "Demo Site", tagline: "A demo site", scoreThreshold: null };

describe("buildLlmsTxt", () => {
  it("adds a When to use this site section after the summary", () => {
    const { content } = buildLlmsTxt(makeTestSitePages(), { ...opts, whenToUse: "  Use this site for CMS guidance.  " });
    expect(content).toContain("> A demo site\n\n## When to use this site\nUse this site for CMS guidance.\n\n## ");
  });

  it("leaves the section out when the text is empty", () => {
    expect(buildLlmsTxt(makeTestSitePages(), { ...opts, whenToUse: " " }).content).not.toContain("When to use");
  });

  it("drops pages below the score threshold and blocked pages", () => {
    const pages = makeTestSitePages();
    const { includedCount, excludedCount } = buildLlmsTxt(pages, { ...opts, scoreThreshold: 60 });
    const expected = pages.filter((p) => !p.score?.blocked && (p.score?.score ?? 100) >= 60).length;
    expect(includedCount).toBe(expected);
    expect(excludedCount).toBe(pages.length - expected);
  });
});
