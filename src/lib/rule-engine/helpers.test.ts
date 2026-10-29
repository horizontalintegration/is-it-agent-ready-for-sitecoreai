import { describe, expect, it } from "vitest";
import {
  ari,
  buildBreadcrumbJsonLd,
  buildFaqPageJsonLd,
  isGenericAnchor,
  normaliseUrl,
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
  it.each(["Click here", "Read more →", "learn more.", "Read more about pricing"])("flags %j", (text) => {
    expect(isGenericAnchor(text)).toBe(true);
  });

  // Note: the prefix rule also flags descriptive anchors such as "Download the 2026 report"
  // (see docs/SPIKE-FINDINGS.md). Revisit when P20 trust.anchor-text becomes scored.
  it.each(["Pricing for teams", "The 2026 content report", null, ""])("allows %j", (text) => {
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
