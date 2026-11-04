import { afterEach, describe, expect, it, vi } from "vitest";
import { fixFirstGroups, metaDescriptionGroup } from "@/lib/checks/view-model";
import { makeTestAssist, makeTestPageData, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import { requestAssist, requestMeta } from "./client";
import { demoAnswers } from "./demo";
import { matchImages } from "./images";

afterEach(() => vi.restoreAllMocks());

describe("demo mode makes no requests", () => {
  const demo = demoAnswers(makeTestAssist());
  const page = { pageTitle: "Retirement planning in your 40s", mainText: "…" };

  it("answers every AI Assist kind and the bulk meta from the fixture", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const src = makeTestPageData().parsedHtml!.images[1].src;
    const alt = await requestAssist({ kind: "alt", ...page, image: { src, currentAlt: null } }, demo);
    const faq = await requestAssist({ kind: "faq-answers", ...page, pairs: makeTestAssist().faqSources.map((s) => ({ id: s.itemId, question: s.question, answer: s.answer })) }, demo);
    const headings = await requestAssist({ kind: "question-headings", ...page, headings: ["Building your savings plan", "Why do your 40s matter?"] }, demo);
    const summary = await requestAssist({ kind: "summary", ...page }, demo);
    const meta = await requestMeta({ field: "metaDescription", pageTitle: "About us", currentValue: "", pageUrl: "https://example.com/about-us" }, demo);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(alt).toMatchObject({ kind: "alt", alt: "Line chart of retirement savings growing from age 40 to 65" });
    expect(faq.kind === "faq-answers" && faq.answers.every((a) => a.inRange)).toBe(true);
    expect(headings).toEqual({ kind: "question-headings", headings: [{ before: "Building your savings plan", after: "How do you build a retirement savings plan?" }] });
    expect(summary.kind).toBe("summary");
    expect(meta.value).toMatch(/^Meet BrandX/);
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
