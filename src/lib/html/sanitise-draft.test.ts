import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isEmptyStateMessage, sanitiseDraftHtml } from "./sanitise-draft";
import { extractParsedHtml } from "./extract-html";

// getPageHTML output starts with an empty <head> and has no scripts (SPIKE-FINDINGS §3).
const draft = (body: string) => `<head></head><body><div class="editing-mode">${body}</div></body>`;
const parsed = (body: string) => extractParsedHtml(sanitiseDraftHtml(draft(body)).html);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

// Page Builder's help text, as in the BrandX captures.
const PLAIN = `data-component="helpers/fieldwrappers/plaintextwrapper"`;
const fallback = (value: string) =>
  `<div class="undefined ee-help-text-block">Fallback:<!-- --> <span ${PLAIN}>${value}</span></div>`;
const placeholderLabel = (name: string) =>
  `<div class="undefined ee-help-text-block"><div class="flex justify-center"><svg data-icon="chevron-down"></svg>Placeholder: ${name}<svg data-icon="chevron-down"></svg></div></div>`;

describe("sanitiseDraftHtml on the BrandX FAQ capture", () => {
  const result = sanitiseDraftHtml(fixture("brandx-faq-draft.html"));
  const page = extractParsedHtml(result.html);

  it("leaves no editor text in the page", () => {
    expect(result.html).not.toMatch(/Fallback:|Placeholder:|\[No text in field\]|contenteditable|editing-mode/);
    expect(result.removed).toEqual({
      fallbackHints: 1,
      editorLabels: 6, // "Placeholder: …" labels
      emptyFields: 2,
      editorAttributes: 8, // 6 contenteditable + 2 editing-mode
    });
  });

  it("reads the headings as the published page shows them", () => {
    expect(page.headings).toEqual([
      { level: 1, text: "Frequently Asked Questions" },
      { level: 2, text: "FAQ" },
      { level: 3, text: "Is the initial consultation really free?" },
      { level: 3, text: "What topics will we cover in the consultation?" },
      { level: 3, text: "Do I need to prepare anything before we meet?" },
    ]);
  });

  it("finds the Q&A pairs and the main text, without the breadcrumb", () => {
    expect(page.qaPairs.map((q) => q.question)).toEqual([
      "Is the initial consultation really free?",
      "What topics will we cover in the consultation?",
      "Do I need to prepare anything before we meet?",
    ]);
    expect(page.mainText.split("\n").slice(0, 4)).toEqual([
      "Frequently Asked Questions",
      "Honest answers to the questions we hear most often — so you can move forward with clarity and confidence.",
      "FAQ",
      "Expand All",
    ]);
  });
});

const EDITOR_TEXT = /Fallback:|Placeholder:|\[No text in field\]|contenteditable|editing-mode|scEmpty/;

describe("sanitiseDraftHtml on the BrandX Banking article capture", () => {
  const result = sanitiseDraftHtml(fixture("brandx-article-draft.html"));
  const page = extractParsedHtml(result.html);

  it("leaves no editor text, and keeps the fallback h1 (the field is empty)", () => {
    expect(result.html).not.toMatch(EDITOR_TEXT);
    expect(page.headings[0]).toEqual({ level: 1, text: "Banking Sector Earnings Point to Resilience" });
    expect(page.headings.filter((h) => h.level === 1)).toHaveLength(1);
  });

  it("keeps the client-rendered Related Articles cards (they're content, for P3)", () => {
    expect(page.headings.map((h) => h.text)).toContain("Retail Investor Participation Hits Record High");
  });
});

describe("sanitiseDraftHtml on the BrandX St. Patrick's Day capture", () => {
  const result = sanitiseDraftHtml(fixture("brandx-stpatricks-draft.html"));
  const page = extractParsedHtml(result.html);

  it("leaves no editor text", () => {
    expect(result.html).not.toMatch(EDITOR_TEXT);
  });

  it("handles both fallbacks: on its own (page title) and next to a value (hero)", () => {
    expect(page.headings.filter((h) => h.level === 1)).toEqual([
      { level: 1, text: "St. Patrick’s Day 2026" },
      { level: 1, text: "Luck looks good on you." },
    ]);
  });

  it("removes the empty hero image's placeholder (scEmptyImage, alt=\"\")", () => {
    expect(page.images.map((i) => i.alt)).toEqual(["brand x logo", "logo"]);
  });
});

describe("sanitiseDraftHtml", () => {
  it("removes a Fallback hint shown next to the field's value", () => {
    const { headings } = parsed(`<main><h1><span ${PLAIN} contenteditable="false">Frequently Asked Questions</span>${fallback("Frequently Asked Questions")}</h1></main>`);
    expect(headings).toEqual([{ level: 1, text: "Frequently Asked Questions" }]);
  });

  it("keeps the fallback's value, without the label, when the field is empty", () => {
    const { headings } = parsed(`<main><h1><span ${PLAIN} contenteditable="false"></span>${fallback("Banking Sector Earnings Point to Resilience")}</h1></main>`);
    expect(headings).toEqual([{ level: 1, text: "Banking Sector Earnings Point to Resilience" }]);
  });

  it("removes Placeholder labels", () => {
    const { mainText } = parsed(`<main>${placeholderLabel("custom-headless-hero")}<p>Body text.</p>${placeholderLabel("custom-headless-hero")}</main>`);
    expect(mainText).toBe("Body text.");
  });

  it("drops [No text in field] placeholders, so they don't count as headings", () => {
    const { headings, paragraphs } = parsed(
      `<main><h1>Home</h1><h2 class="scEmptyText">[No text in field]</h2><p>[No text in field]</p><p>Real text.</p></main>`,
    );
    expect(headings).toEqual([{ level: 1, text: "Home" }]);
    expect(paragraphs).toEqual(["Real text."]);
  });

  it("removes empty-state messages and reports them", () => {
    const result = sanitiseDraftHtml(
      draft(`<main><section data-component="authorable/articles/articlelisting"><h2>Latest news</h2><div><p>No articles found</p></div></section></main>`),
    );
    expect(result.emptyStates).toEqual(["No articles found"]);
    expect(extractParsedHtml(result.html).mainText).toBe("Latest news");
  });

  it("keeps {{…}} template tokens: the draft/live comparison matches them to any word", () => {
    expect(sanitiseDraftHtml(draft(`<footer><p>© {{year}} BrandX</p></footer>`)).html).toContain("© {{year}} BrandX");
  });

  it("removes contenteditable and editor-only classes, keeping the site's own", () => {
    const { html, removed } = sanitiseDraftHtml(
      draft(`<div class="hero placeholder" contenteditable="true" data-component="authorable/hero">Hi</div>`),
    );
    expect(html).not.toMatch(/contenteditable|placeholder|editing-mode/);
    expect(html).toContain('class="hero"');
    expect(html).toContain('data-component="authorable/hero"');
    expect(removed.editorAttributes).toBe(3); // contenteditable, placeholder, editing-mode
  });

  it("removes an empty field's placeholder element whole", () => {
    const { html, removed } = sanitiseDraftHtml(
      draft(`<div><img class="scEmptyImage w-full" alt="" src="data:image/svg+xml,%3Csvg%3E"><p>Text</p></div>`),
    );
    expect(html).not.toContain("<img");
    expect(removed.emptyFields).toBe(1);
  });

  it("leaves ordinary text alone", () => {
    const body = `<main><h1>Plan your future</h1><p>No two clients are alike, so no two plans are either.</p></main>`;
    const result = sanitiseDraftHtml(draft(body));
    expect(extractParsedHtml(result.html).mainText).toBe("Plan your future\nNo two clients are alike, so no two plans are either.");
    expect(result.emptyStates).toEqual([]);
  });
});

describe("isEmptyStateMessage", () => {
  it.each(["No articles found", "No results found.", "No upcoming events available", "Nothing to show", "Loading…", "No results"])(
    "%s → empty state",
    (text) => expect(isEmptyStateMessage(text)).toBe(true),
  );

  it.each(["No two plans are alike", "Not found what you need? Contact us.", "Articles found in our archive"])(
    "%s → content",
    (text) => expect(isEmptyStateMessage(text)).toBe(false),
  );
});
