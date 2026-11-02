import { describe, expect, it } from "vitest";
import { jsonLd, titleMeta } from "./understand";
import { resolveSources, runPageChecks } from "../engine";
import { buildPageContext } from "../context";
import { makeParsedHtml, makeTestDraft, makeTestPageData } from "@/lib/rule-engine/test-fixture";
import type { BodyBlock, ParsedHtml } from "@/lib/rule-engine/types";
import type { DraftHtml, PageContext, PageFields } from "../types";

const FIELDS: PageFields = { metaTitle: null, metaDescription: null, robotsMetaTag: null, updated: null };

function ctx(html: Partial<ParsedHtml> | null, over: Partial<PageContext> = {}): PageContext {
  const live = html === null ? null : makeParsedHtml(html);
  return {
    pageUrl: "https://example.com/blog/post",
    isHomePage: false,
    templateName: null,
    fields: FIELDS,
    html: live,
    draft: null,
    draftUnavailable: false,
    body: live,
    bodySource: "live",
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
      "P2", "P3", "P4", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21",
    ]);
    for (const o of report.outcomes) {
      expect(o.points, o.check.id).toBeLessThanOrEqual(o.maxPoints + 1e-9);
    }
  });
});

// ── Phase 4: draft vs live ────────────────────────────────────────────────────

const withDraft = (live: Partial<ParsedHtml> | null, draft: Partial<ParsedHtml>, emptyStates: string[] = []): PageContext => {
  const d: DraftHtml = { html: makeParsedHtml(draft), emptyStates };
  return ctx(live, { draft: d, body: d.html, bodySource: "draft" });
};
const blocks = (...texts: string[]): BodyBlock[] => texts.map((text) => ({ text, component: null }));
const RELATED = "authorable/articles/relatedarticles";
const ARTICLE = blocks(
  "Banking Sector Earnings Point to Resilience",
  "Major banks reported steady earnings this quarter as lending held up across regions and deposits stayed stable.",
  "Analysts expect the trend to continue into next year, with credit quality holding firm across most loan books.",
);

describe("P3 read.no-js-content", () => {
  it("isn't checked without a draft (the dashboard)", () => {
    const r = outcome(ctx({ bodyBlocks: ARTICLE }), "read.no-js-content");
    expect(r.state).toBe("not-checked");
    expect(r.value).toBe("Page Builder only");
  });

  it("in the panel, says the draft couldn't be read when getPageHTML failed", () => {
    const c = buildPageContext({
      pageUrl: "https://example.com/blog/post",
      route: "/blog/post",
      templateName: null,
      fields: FIELDS,
      html: makeParsedHtml({ bodyBlocks: ARTICLE }),
      draft: null,
      draftUnavailable: true,
      ai: null,
      psi: null,
      organization: { name: "BrandX", url: null, logo: null, description: null, sameAs: [] },
    });
    expect(outcome(c, "read.no-js-content")).toMatchObject({ state: "not-checked", value: "Draft not available" });
  });

  it("isn't checked without the published page", () => {
    expect(outcome(withDraft(null, { bodyBlocks: ARTICLE }), "read.no-js-content").state).toBe("not-checked");
  });

  it("passes when all the draft's text is in the server HTML", () => {
    const r = outcome(withDraft({ bodyBlocks: ARTICLE }, { bodyBlocks: ARTICLE }), "read.no-js-content");
    expect(r).toMatchObject({ state: "scored", credit: 1, status: "pass" });
  });

  it("flags client-rendered Related Articles cards by component (BrandX Banking article)", () => {
    const cards: BodyBlock[] = [
      { text: "Retail Investor Participation Hits Record High", component: RELATED },
      { text: "Retail investors made up a record share of trading volume in March, led by younger savers.", component: RELATED },
      { text: "Read More", component: RELATED },
    ];
    const r = outcome(withDraft({ bodyBlocks: ARTICLE }, { bodyBlocks: [...ARTICLE, ...cards] }), "read.no-js-content");
    // 38 server words, 22 client-only → 63% → 0
    expect(r).toMatchObject({ state: "scored", credit: 0, status: "fail" });
    expect(r.flaggedItems).toEqual(['relatedarticles: 22 words, e.g. "Retail Investor Participation Hits Record High"']);
  });

  it("gives half credit at 80–95% in the server HTML", () => {
    const card = [{ text: "Retail Investor Participation Hits Record High", component: RELATED }];
    const r = outcome(withDraft({ bodyBlocks: ARTICLE }, { bodyBlocks: [...ARTICLE, ...card] }), "read.no-js-content");
    expect(r).toMatchObject({ credit: 0.5, status: "warning" });
  });

  it("doesn't count an edited heading or an editor empty state against the page", () => {
    const draft = [...blocks("Banking Sector Earnings Point to Real Resilience"), ...ARTICLE.slice(1)];
    const r = outcome(withDraft({ bodyBlocks: ARTICLE }, { bodyBlocks: draft }, ["No articles found"]), "read.no-js-content");
    expect(r).toMatchObject({ credit: 1, status: "pass" });
    expect(r.details.join(" ")).toContain('Couldn\'t render in the editor, not counted: "No articles found"');
    expect(r.details.join(" ")).toContain("1 block edited in the draft");
  });
});

describe("body checks read the draft; head checks read live", () => {
  it("scores headings from the draft and the canonical from live", () => {
    const c = withDraft(
      { canonicalHref: "https://example.com/blog/post", headings: [{ level: 1, text: "Live" }, { level: 1, text: "Two" }] },
      { canonicalHref: null, headings: [{ level: 1, text: "Draft" }] },
    );
    expect(outcome(c, "understand.headings").credit).toBe(1);
    expect(outcome(c, "reach.canonical").credit).toBe(1);
  });

  it("an unpublished page (no live HTML) still scores its body checks from the draft", () => {
    const c = withDraft(null, { headings: [{ level: 1, text: "New page" }], paragraphs: ["word ".repeat(900)] });
    const report = runPageChecks(c);
    expect(report.score).not.toBeNull();
    expect(outcome(c, "trust.depth").state).toBe("scored");
    expect(outcome(c, "reach.canonical").state).toBe("not-checked");
  });

  it("resolves the source chips", () => {
    expect(resolveSources(["draft"], "draft")).toEqual(["draft"]);
    expect(resolveSources(["draft"], "live")).toEqual(["live"]);
    expect(resolveSources(["draft", "live"], "live")).toEqual(["live"]);
    expect(resolveSources(["ai"], "draft")).toEqual(["ai", "draft"]);
    expect(resolveSources(["fields", "live"], "draft")).toEqual(["fields", "live"]);
  });
});

describe("demo draft (makeTestDraft)", () => {
  const data = makeTestPageData();
  const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml, draft: makeTestDraft() }));
  const find = (id: string) => report.outcomes.find((o) => o.check.id === id)!;

  it("shows a P3 warning for the client-rendered Related Articles cards", () => {
    expect(find("read.no-js-content").result).toMatchObject({ state: "scored", status: "warning" });
    expect(find("read.no-js-content").result.flaggedItems?.[0]).toMatch(/^relatedarticles: /);
  });

  it("marks body checks Draft and head checks Live", () => {
    expect(find("understand.headings").sources).toEqual(["draft"]);
    expect(find("reach.canonical").sources).toEqual(["live"]);
    expect(find("trust.uniqueness").sources).toEqual(["ai", "draft"]);
  });
});
