import { describe, expect, it } from "vitest";
import { buildPageContext } from "@/lib/checks/context";
import { runPageChecks, runSiteChecks } from "@/lib/checks/engine";
import { gradeNegotiation, negotiationTiles } from "@/lib/checks/markdown-negotiation";
import { makeParsedHtml, makeTestDraft, makeTestMarkdownCheck, makeTestPageData, makeTestSiteContext, makeTestSitePages } from "@/lib/rule-engine/test-fixture";
import { fixFirstGroups } from "@/lib/checks/view-model";
import { estimateTokens, frontMatter, toAgentMarkdown } from "./convert";
import { gradeMarkdownQuality, parseFrontMatter } from "./quality";
import type { MarkdownCheckData } from "./types";

describe("toAgentMarkdown (the local preview)", () => {
  const html = `<html><head><title>Home | BrandX</title><meta name="description" content="Plan your future."><script>x()</script></head><body>
    <header><nav><a href="/a">A</a></nav></header>
    <main><h1>Welcome</h1><p>Read <a href="/guide">the guide</a>.</p><span aria-hidden="true">★</span>
      <button aria-controls="faq-1" aria-expanded="false">Is it free?</button><div id="faq-1" aria-hidden="true"><p>Yes, always.</p></div>
      <style>.x{}</style></main>
    <footer>© BrandX</footer></body></html>`;

  it("keeps the main content, collapsed FAQ answers and absolute links; drops chrome, scripts and decorations", () => {
    const md = toAgentMarkdown(html, { url: "https://example.com/" });
    expect(md).toBe(
      "---\ntitle: Home | BrandX\ndescription: Plan your future.\nurl: https://example.com/\n---\n\n# Welcome\n\nRead [the guide](https://example.com/guide).\n\nIs it free?\n\nYes, always.\n",
    );
  });

  it("takes the body without header, nav and footer when there's no <main>", () => {
    const md = toAgentMarkdown("<body><header>Logo</header><nav>Menu</nav><h1>Hi</h1><footer>Foot</footer></body>", { title: "Hi", description: null });
    expect(md).toBe("---\ntitle: Hi\ndescription:\nurl:\n---\n\n# Hi\n");
  });

  it("quotes front matter values YAML would misread", () => {
    expect(frontMatter({ title: "Rates: what changed", description: '"Quoted"', url: "https://x.com/a#b" })).toBe(
      '---\ntitle: "Rates: what changed"\ndescription: "\\"Quoted\\""\nurl: https://x.com/a#b\n---\n',
    );
    expect(parseFrontMatter(`${frontMatter({ title: "Rates: what changed", description: null })}\n# x`).data).toEqual({
      title: "Rates: what changed",
      description: "",
      url: "",
    });
  });

  it("estimates tokens as characters ÷ 4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("converts the demo draft, unpublished edits included", () => {
    const md = toAgentMarkdown(makeTestDraft().source, { title: "T", description: null, url: "https://example.com/x" });
    expect(md).toContain("## Why does a content strategy matter?");
    expect(md).toContain("## Related articles");
    expect(md).not.toContain("Privacy policy");
  });
});

describe("gradeMarkdownQuality (P6)", () => {
  const html = makeParsedHtml({
    title: "Pricing | BrandX",
    headings: [{ level: 1, text: "Pricing" }, { level: 2, text: "Plans" }],
    paragraphs: ["Every plan includes support from our team of advisors."],
    qaPairs: [{ question: "Can I cancel?", answer: "Yes, at any time and without a fee." }],
    mainText: "Pricing\nPlans\nEvery plan includes support from our team of advisors.\nCan I cancel?\nYes, at any time and without a fee.",
    bodyBlocks: ["Home", "Pricing", "Contact us", "Pricing", "Plans", "© BrandX"].map((text) => ({ text, component: null })),
  });
  const fields = { metaTitle: "Pricing", metaDescription: "Plans and prices.", robotsMetaTag: null, updated: null };
  const body = "# Pricing\n\n## Plans\n\nEvery plan includes support from our team of advisors.\n\nCan I cancel?\n\nYes, at any time and without a fee.\n";

  it("gives full credit for complete Markdown with matching front matter", () => {
    const q = gradeMarkdownQuality({ markdown: `---\ntitle: Pricing | BrandX\ndescription: Plans and prices.\n---\n\n${body}`, fields, html });
    expect(q).toMatchObject({ coverage: 1, missing: [], chromeShare: 0, credit: 1 });
    expect(q.frontMatter.title.ok).toBe(true);
  });

  it("flags an empty Meta description field, missing content and menus", () => {
    const md = "---\ntitle: Pricing\ndescription: Found elsewhere\n---\n\n- [Home](/)\n- [Contact us](/contact)\n\n# Pricing\n\n## Plans\n";
    const q = gradeMarkdownQuality({ markdown: md, fields: { ...fields, metaDescription: null }, html });
    expect(q.frontMatter.description).toEqual({ value: "Found elsewhere", expected: null, ok: false });
    expect(q.coverage).toBeLessThan(0.75);
    expect(q.missing).toEqual(["Every plan includes support from our team of advisors.", "Yes, at any time and without a fee."]);
    expect(q.chromeShare).toBeGreaterThan(0.4);
    expect(q.credit).toBeCloseTo(1 / 6);
  });

  it("reads Markdown without front matter", () => {
    const q = gradeMarkdownQuality({ markdown: body, fields, html });
    expect(q.frontMatter.present).toBe(false);
    expect(q.credit).toBeCloseTo(2 / 3);
  });
});

describe("P5 and P6 on the demo page", () => {
  const data = makeTestPageData();
  const run = (markdown: MarkdownCheckData | null) => {
    const report = runPageChecks(buildPageContext({ ...data, html: data.parsedHtml, markdown }));
    const get = (ref: string) => report.outcomes.find((o) => o.check.ref === ref)!;
    return { report, p5: get("P5"), p6: get("P6") };
  };

  it("a page that serves Markdown passes 4 of 4, and P6 is graded (accept-when)", () => {
    const { p5, p6 } = run(makeTestMarkdownCheck({ serves: true }));
    expect(p5.result).toMatchObject({ state: "scored", credit: 1, status: "pass", value: "4 of 4 checks pass" });
    expect(p5.check.tier).toBe("essential");
    expect(p6.result).toMatchObject({ state: "scored", credit: 1, status: "pass" });
    const g = gradeNegotiation(makeTestMarkdownCheck({ serves: true }));
    expect(negotiationTiles(g, "text/markdown", "text/html").map((t) => t.status)).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("a page that doesn't serve Markdown gets no credit, an estimated saving, and P6 waits (accept-when)", () => {
    const check = makeTestMarkdownCheck();
    const { p5, p6 } = run(check);
    expect(p5.result).toMatchObject({ state: "scored", credit: 0, status: "fail" });
    expect(p5.result.message).toMatch(/^The page returned text\/html for Accept: text\/markdown\. Converted, it would be about \d+% fewer tokens\.$/);
    expect(p5.result.fixSuggestion).toContain("npx accept-md init");
    expect(p6.result.state).toBe("not-applicable");
    expect(check.preview!.tokens).toBeLessThan(check.html.tokens);
    const g = gradeNegotiation(check);
    expect(negotiationTiles(g, "text/html", "text/html").map((t) => t.status)).toEqual(["fail", "pass", "fail", "na"]);
  });

  it("is left out of the score until it's checked, and for a page that isn't published", () => {
    expect(run(null).p5.result.state).toBe("not-checked");
    expect(run(null).p6.result.state).toBe("not-checked");
    const missing = makeTestMarkdownCheck();
    missing.html.status = 404;
    missing.markdown.status = 404;
    expect(run(missing).p5.result).toMatchObject({ state: "not-checked", value: "Published page not found" });
  });

  it("gives partial credit for Markdown without Vary: Accept", () => {
    const check = makeTestMarkdownCheck({ serves: true });
    check.markdown.vary = null;
    const { p5 } = run(check);
    expect(p5.result).toMatchObject({ credit: 0.5 + 0.5 * (2 / 3), status: "warning", value: "3 of 4 checks pass" });
    expect(p5.result.message).toContain("Missing: a Vary: Accept header.");
  });
});

describe("S3 with the dashboard's pages", () => {
  it("adds how many scanned pages serve Markdown, without changing the credit", () => {
    const ctx = makeTestSiteContext();
    const s3 = (c: typeof ctx) => runSiteChecks(c).outcomes.find((o) => o.check.ref === "S3")!.result;
    expect(s3(ctx).message).toBe("The home page returned text/html for Accept: text/markdown.");
    expect(s3({ ...ctx, markdownPages: { served: 3, checked: 12 } })).toMatchObject({
      credit: 0,
      message: "The home page returned text/html for Accept: text/markdown. Markdown on 3 of 12 scanned pages.",
    });
    expect(s3(makeTestSiteContext({ servesMarkdown: true }))).toMatchObject({ credit: 1, status: "pass" });
  });
});

describe("Fix first lists Markdown once", () => {
  it("P5's page row stands in for S3 once pages have been checked, right after the site issues", () => {
    const site = runSiteChecks(makeTestSiteContext()).outcomes;
    const groups = fixFirstGroups(site, makeTestSitePages());
    const ids = groups.map((g) => g.id);
    expect(ids).not.toContain("read.markdown-site");
    const p5 = groups.find((g) => g.id === "read.markdown-page")!;
    expect(p5).toMatchObject({ scope: "page", display: "fix" });
    expect(p5.pageIds).toHaveLength(11);
    expect(ids.indexOf("read.markdown-page")).toBe(groups.filter((g) => g.scope === "site").length);
  });

  it("keeps S3 before any page is checked, and drops both when the site serves Markdown", () => {
    expect(fixFirstGroups(runSiteChecks(makeTestSiteContext()).outcomes, []).map((g) => g.id)).toContain("read.markdown-site");
    const served = fixFirstGroups(runSiteChecks(makeTestSiteContext({ servesMarkdown: true })).outcomes, makeTestSitePages({ servesMarkdown: true }));
    expect(served.map((g) => g.id).filter((id) => id.startsWith("read.markdown"))).toEqual([]);
  });
});
