import { describe, expect, it } from "vitest";
import { jsonLd, titleMeta } from "./understand";
import { runPageChecks } from "../engine";
import { buildPageContext } from "../context";
import { makeParsedHtml, makeTestPageData } from "@/lib/rule-engine/test-fixture";
import type { ParsedHtml } from "@/lib/rule-engine/types";
import type { PageContext, PageFields } from "../types";

const FIELDS: PageFields = { metaTitle: null, metaDescription: null, robotsMetaTag: null, updated: null };

function ctx(html: Partial<ParsedHtml> | null, over: Partial<PageContext> = {}): PageContext {
  return {
    pageUrl: "https://example.com/blog/post",
    isHomePage: false,
    templateName: null,
    fields: FIELDS,
    html: html === null ? null : makeParsedHtml(html),
    ai: null,
    psi: null,
    organization: { name: "BrandX", url: null, logo: null, description: null, sameAs: [] },
    ...over,
  };
}

const ok = (value: unknown) => ({ ok: true as const, value });
const outcome = (c: PageContext, id: string) => runPageChecks(c).outcomes.find((o) => o.check.id === id)!.result;

const BREADCRUMB = ok({
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://example.com/" },
    { "@type": "ListItem", position: 2, name: "Post", item: "https://example.com/blog/post" },
  ],
});
const QA = [
  { question: "What is it?", answer: "A long enough answer to be quoted by an assistant on its own." },
  { question: "Why does it matter?", answer: "Because agents quote answers like this one word for word." },
];

describe("P10 understand.json-ld (D2: real detection)", () => {
  it("no longer passes a page without JSON-LD", () => {
    const r = jsonLd.run(ctx({}));
    expect(r).toMatchObject({ state: "scored", credit: 0, status: "fail" });
    expect(r.codePreview).toContain('"@type": "BreadcrumbList"');
  });

  it("passes an inner page with a valid BreadcrumbList", () => {
    expect(jsonLd.run(ctx({ jsonLdScripts: [BREADCRUMB] })).credit).toBe(1);
  });

  it("expects FAQPage when the page has Q&A pairs, and checks its required properties", () => {
    const missing = jsonLd.run(ctx({ jsonLdScripts: [BREADCRUMB], qaPairs: QA }));
    expect(missing.credit).toBe(0.5);
    expect(missing.codePreview).toContain('"@type": "FAQPage"');

    const incomplete = jsonLd.run(
      ctx({ jsonLdScripts: [BREADCRUMB, ok({ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "What is it?" }] })], qaPairs: QA }),
    );
    expect(incomplete.credit).toBe(0.75);
    expect(incomplete.details.join(" ")).toContain("acceptedAnswer.text");
  });

  it("expects Article on article templates; subtypes count", () => {
    const article = { templateName: "Article Detail Page" };
    expect(jsonLd.run(ctx({ jsonLdScripts: [BREADCRUMB] }, article)).credit).toBe(0.5);
    const withPosting = ctx({ jsonLdScripts: [BREADCRUMB, ok({ "@type": "BlogPosting", headline: "Post" })] }, article);
    expect(jsonLd.run(withPosting).credit).toBe(1);
  });

  it("reads schema inside a @graph bundle", () => {
    expect(jsonLd.run(ctx({ jsonLdScripts: [ok({ "@graph": [BREADCRUMB.value] })] })).credit).toBe(1);
  });

  it("caps credit and fails when a block doesn't parse", () => {
    const r = jsonLd.run(ctx({ jsonLdScripts: [BREADCRUMB, { ok: false, error: "Unexpected token }" }] }));
    expect(r).toMatchObject({ credit: 0.5, status: "fail" });
    expect(r.details.join(" ")).toContain("Unexpected token");
  });

  it("is N/A on a home page that needs no page-level schema", () => {
    expect(jsonLd.run(ctx({}, { isHomePage: true })).state).toBe("not-applicable");
  });

  it("waits for the HTML", () => {
    expect(jsonLd.run(ctx(null)).state).toBe("not-checked");
  });
});

describe("P9 understand.title-meta", () => {
  it("grades the Sitecore field first, then the rendered tag", () => {
    const title = "A".repeat(55);
    const r = titleMeta.run(ctx({ title: "Short", metaDescription: "D".repeat(140) }, { fields: { ...FIELDS, metaTitle: title } }));
    expect(r.credit).toBe(1);
  });

  it("fails when either is missing", () => {
    const r = titleMeta.run(ctx({ title: "T".repeat(55) }));
    expect(r).toMatchObject({ credit: 0.5, status: "fail" });
  });
});

describe("N/A and not-checked page checks", () => {
  it("image alt is N/A with no images", () => {
    expect(outcome(ctx({}), "understand.image-alt").state).toBe("not-applicable");
  });

  it("anchor text is N/A with no links, and descriptive links pass (SPIKE §2)", () => {
    expect(outcome(ctx({}), "trust.anchor-text").state).toBe("not-applicable");
    const links = [{ anchorText: "Download the 2026 report", href: "/r" }, { anchorText: "Register for the webinar", href: "/w" }];
    expect(outcome(ctx({ links }), "trust.anchor-text").credit).toBe(1);
  });

  it("author applies only to article templates", () => {
    expect(outcome(ctx({}), "trust.author").state).toBe("not-applicable");
    const r = outcome(ctx({ metaAuthor: "Sam" }, { templateName: "article detail page" }), "trust.author");
    expect(r).toMatchObject({ state: "scored", credit: 0.5 });
  });

  it("author is linked through the Article JSON-LD", () => {
    const html = {
      jsonLdScripts: [ok({ "@type": "Article", headline: "H", author: { "@type": "Person", name: "Sam", url: "https://example.com/sam" } })],
    };
    expect(outcome(ctx(html, { templateName: "Article Detail Page" }), "trust.author").credit).toBe(1);
  });

  it("AI and PageSpeed checks are not checked until they run", () => {
    const c = ctx({});
    expect(outcome(c, "trust.uniqueness").state).toBe("not-checked");
    expect(outcome(c, "trust.follow-up-gaps").state).toBe("not-checked");
    expect(outcome(c, "read.speed").state).toBe("not-checked");
  });
});

describe("P18 trust.freshness", () => {
  it("falls back to Sitecore __Updated in its compact format", () => {
    const recent = new Date(Date.now() - 10 * 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const r = outcome(ctx({}, { fields: { ...FIELDS, updated: recent } }), "trust.freshness");
    expect(r.credit).toBe(1);
    expect(r.details).toEqual(["Source: Sitecore __Updated"]);
  });

  it("prefers the page's own modified date", () => {
    const old = new Date(Date.now() - 500 * 86_400_000).toISOString();
    const r = outcome(ctx({ articleModifiedTimeMeta: old }, { fields: { ...FIELDS, updated: new Date().toISOString() } }), "trust.freshness");
    expect(r.credit).toBe(0.25);
  });
});

describe("demo fixture page", () => {
  it("scores between 0 and 100 with every check reported", () => {
    const data = makeTestPageData();
    const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml }));
    expect(report.gate.blocked).toBe(false);
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.outcomes.map((o) => o.check.ref)).toEqual([
      "P2", "P4", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21",
    ]);
    for (const o of report.outcomes) {
      expect(o.points, o.check.id).toBeLessThanOrEqual(o.maxPoints + 1e-9);
    }
  });
});
