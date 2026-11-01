import { describe, expect, it } from "vitest";
import {
  ari,
  buildBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  isGenericAnchor,
  normaliseUrl,
  parseDate,
  sentenceCount,
  stripHtml,
  wordCount,
} from "./helpers";

describe("stripHtml", () => {
  it("removes tags, decodes basic entities and collapses whitespace", () => {
    expect(stripHtml("<p>Fish &amp; chips</p>\n<p>&lt;b&gt;&nbsp;ok</p>")).toBe("Fish & chips <b> ok");
  });
});

describe("wordCount / sentenceCount", () => {
  it("counts words and treats blank text as zero", () => {
    expect(wordCount("  one two   three ")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });

  it("counts sentences, defaulting to 1 when no terminator", () => {
    expect(sentenceCount("One. Two! Three?")).toBe(3);
    expect(sentenceCount("no terminator")).toBe(1);
  });
});

describe("ari", () => {
  it("returns 0 for empty text", () => {
    expect(ari("")).toBe(0);
  });

  it("scores long words and sentences higher than short ones", () => {
    const simple = "The cat sat. The dog ran. We had fun.";
    const dense =
      "Comprehensive organisational transformation necessitates multidisciplinary stakeholder collaboration throughout implementation.";
    expect(ari(dense)).toBeGreaterThan(ari(simple));
  });
});

describe("isGenericAnchor", () => {
  it.each([
    "Click here",
    "Read more →",
    "learn more.",
    "Download",
    "Read more about pricing",
    "Click here to download the report",
  ])("flags %j", (text) => {
    expect(isGenericAnchor(text)).toBe(true);
  });

  // The prefix rule is limited to "click here …" / "read more …" style phrases,
  // so descriptive anchors that start with a blocklisted word pass (SPIKE-FINDINGS §2).
  it.each([
    "Pricing for teams",
    "The 2026 content report",
    "Download the 2026 report",
    "Register for the webinar",
    "Learn more about retirement planning",
    null,
    "",
  ])("allows %j", (text) => {
    expect(isGenericAnchor(text)).toBe(false);
  });
});

describe("normaliseUrl", () => {
  it("lowercases, strips trailing slash, query and hash", () => {
    expect(normaliseUrl("HTTPS://Example.com/About/?a=1#top")).toBe("https://example.com/about");
  });

  it("falls back for relative URLs", () => {
    expect(normaliseUrl("/About/")).toBe("/about");
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("builds a trail from path segments", () => {
    const { trail, script } = buildBreadcrumbJsonLd("https://example.com/blog/blue-widgets");
    expect(trail).toEqual(["Home", "Blog", "Blue Widgets"]);
    const json = JSON.parse(script.replace(/<\/?script[^>]*>/g, ""));
    expect(json["@type"]).toBe("BreadcrumbList");
    expect(json.itemListElement.at(-1).item).toBe("https://example.com/blog/blue-widgets");
  });

  it("never fails on a missing URL", () => {
    expect(buildBreadcrumbJsonLd("").trail).toEqual(["Home"]);
  });
});

describe("buildFaqPageJsonLd", () => {
  it("emits one Question per FAQ item", () => {
    const script = buildFaqPageJsonLd([
      { question: "What is it?", answer: "A thing." },
      { question: "Why?", answer: "Because." },
    ]);
    const json = JSON.parse(script.replace(/<\/?script[^>]*>/g, ""));
    expect(json.mainEntity).toHaveLength(2);
    expect(json.mainEntity[0].acceptedAnswer.text).toBe("A thing.");
  });
});

describe("parseDate", () => {
  it("reads ISO dates and Sitecore's compact format", () => {
    expect(parseDate("2026-10-31T12:00:00Z")?.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(parseDate("20261031T120000Z")?.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});
