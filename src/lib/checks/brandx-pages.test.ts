// The draft pipeline on real BrandX pages: a getPageHTML() capture from Page
// Builder and the published server HTML of the same page (fixtures in
// src/lib/html/fixtures, captured 2026-11-01). Sanitise and parse the draft as
// usePageHtml does, parse live as preview-fetch does, then score.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractParsedHtml } from "@/lib/html/extract-html";
import { sanitiseDraftHtml } from "@/lib/html/sanitise-draft";
import { buildPageContext } from "./context";
import { draftDiffersFromLive } from "./draft-diff";
import { runPageChecks } from "./engine";

const fixture = (name: string) => readFileSync(new URL(`../html/fixtures/${name}`, import.meta.url), "utf8");

function load(page: string) {
  const clean = sanitiseDraftHtml(fixture(`brandx-${page}-draft.html`));
  const draft = extractParsedHtml(clean.html);
  const live = extractParsedHtml(fixture(`brandx-${page}-live.html`));
  const input = {
    pageUrl: "https://example.com/page",
    route: "/page",
    templateName: null,
    fields: null,
    ai: null,
    psi: null,
    organization: { name: null, url: null, logo: null, description: null, sameAs: [] },
    html: live,
  };
  const withDraft = runPageChecks(buildPageContext({ ...input, draft: { html: draft, source: clean.html, emptyStates: clean.emptyStates } }));
  const liveOnly = runPageChecks(buildPageContext(input));
  const result = (id: string, report = withDraft) => report.outcomes.find((o) => o.check.id === id)!.result;
  return { draft, live, withDraft, liveOnly, result };
}

describe("BrandX Banking article (Related Articles cards are fetched in the browser)", () => {
  const page = load("article");

  it("P3 flags the Related Articles cards: 44 of 522 words need JavaScript → half credit", () => {
    expect(page.result("read.no-js-content")).toMatchObject({
      state: "scored",
      credit: 0.5,
      status: "warning",
      value: "44 of 522 words need JavaScript (91% in the server HTML)",
    });
    expect(page.result("read.no-js-content").flaggedItems).toEqual([
      'relatedarticles: 44 words, e.g. "Q1 FY25 results from major private and PSU banks suggest that credit …"',
    ]);
  });

  it("doesn't count the footer's © {{year}} as an edit", () => {
    expect(page.result("read.no-js-content").details.join(" ")).not.toContain("edited");
  });

  it("shows no 'Draft differs' banner: the extra text is client-rendered, not edited", () => {
    expect(draftDiffersFromLive(page.draft.mainText, page.live.mainText).differs).toBe(false);
  });

  it("scores the same headings as the published page, plus the cards'", () => {
    expect(page.result("understand.headings")).toMatchObject({ credit: 1 });
    expect(page.result("understand.headings", page.liveOnly)).toMatchObject({ credit: 1 });
  });

  it("P20 counts the cards' Read More links in the draft (body checks read the draft)", () => {
    expect(page.result("trust.anchor-text").value).toBe("2 of 7 links are generic");
    expect(page.result("trust.anchor-text", page.liveOnly).value).toBe("No generic anchors found");
  });
});

describe("BrandX St. Patrick's Day", () => {
  const page = load("stpatricks");

  it("P3 passes: no client-only text (the listing's empty field is removed)", () => {
    expect(page.result("read.no-js-content")).toMatchObject({ credit: 1, status: "pass" });
  });

  it("the empty hero image isn't counted as an image without alt text", () => {
    expect(page.result("understand.image-alt")).toEqual(page.result("understand.image-alt", page.liveOnly));
  });

  it("shows the banner: the published page-title description isn't in the draft", () => {
    // Either the field was emptied after publishing, or the published page
    // falls back to another field without the editor saying so (open item 7).
    expect(draftDiffersFromLive(page.draft.mainText, page.live.mainText)).toEqual({ differs: true, changed: 0, removed: 1 });
  });
});
