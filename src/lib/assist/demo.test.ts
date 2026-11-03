import { afterEach, describe, expect, it, vi } from "vitest";
import { fixFirstGroups, metaDescriptionGroup } from "@/lib/checks/view-model";
import { makeTestAssist, makeTestPageData, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import { requestAssist, requestMeta } from "./client";
import { demoAnswers } from "./demo";
import { matchImages } from "./images";

afterEach(() => vi.restoreAllMocks());

describe("demo mode makes no requests", () => {
  const demo = demoAnswers(makeTestAssist());
  const page = { pageTitle: "Content strategy", mainText: "…" };

  it("answers every AI Assist kind and the bulk meta from the fixture", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const src = makeTestPageData().parsedHtml!.images[1].src;
    const alt = await requestAssist({ kind: "alt", ...page, image: { src, currentAlt: null } }, demo);
    const faq = await requestAssist({ kind: "faq-answers", ...page, pairs: makeTestAssist().faqSources.map((s) => ({ id: s.itemId, question: s.question, answer: s.answer })) }, demo);
    const headings = await requestAssist({ kind: "question-headings", ...page, headings: ["Building your audit framework", "What is a content strategy?"] }, demo);
    const summary = await requestAssist({ kind: "summary", ...page }, demo);
    const meta = await requestMeta({ field: "metaDescription", pageTitle: "About", currentValue: "", pageUrl: "https://example.com/about" }, demo);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(alt).toMatchObject({ kind: "alt", alt: "Bar chart of page scores from a content audit, grouped by relevance" });
    expect(faq.kind === "faq-answers" && faq.answers.every((a) => a.inRange)).toBe(true);
    expect(headings).toEqual({ kind: "question-headings", headings: [{ before: "Building your audit framework", after: "How do you build a content audit framework?" }] });
    expect(summary.kind).toBe("summary");
    expect(meta.value).toMatch(/^Who we are/);
  });

  it("maps every demo image to a field: a page field, a local component and a shared one", () => {
    const d = makeTestAssist();
    const targets = matchImages(makeTestPageData().parsedHtml!.images, d.imageFields);
    expect(targets.map((t) => [t.status, t.field?.owner, t.field?.shared])).toEqual([
      ["missing", "item", false],
      ["ok", "page", false],
      ["ok", "item", true],
    ]);
  });
});

describe("Fix first: meta description missing", () => {
  it("groups the demo pages without a description, with the points it adds", () => {
    const pages = makeTestSitePages();
    const group = metaDescriptionGroup(pages);
    expect(group).toMatchObject({ id: "meta-description-missing", bulk: "meta-description", display: "fix", owner: "author" });
    expect(group!.pageIds.sort()).toEqual(["p1", "p3", "p4"]);
    expect(group!.gainEach).toBeGreaterThanOrEqual(1);
    expect(fixFirstGroups(null, pages).some((g) => g.id === "meta-description-missing")).toBe(true);
  });

  it("leaves out pages that have a description, are blocked, or aren't scanned", () => {
    const pages = makeTestSitePages().map((p) => (p.id === "p1" ? { ...p, score: null } : p));
    expect(metaDescriptionGroup(pages)!.pageIds).not.toContain("p1");
    expect(metaDescriptionGroup(pages.filter((p) => !["p3", "p4"].includes(p.id)))).toBeNull();
  });
});
