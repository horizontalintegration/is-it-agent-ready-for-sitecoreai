import { describe, expect, it } from "vitest";
import { extractParsedHtml, MAIN_TEXT_MAX_CHARS } from "./extract-html";

const page = (body: string) => `<!doctype html><html><head><title>T</title>
<script type="application/ld+json">{"@type":"Organization"}</script></head><body>${body}</body></html>`;

describe("extractParsedHtml mainText", () => {
  it("takes the text of <main>, one block per line, entities decoded", () => {
    const { mainText } = extractParsedHtml(
      page(`<header><nav>Home About</nav></header>
        <main>
          <article>
            <header><h1>Fish&nbsp;&amp; chips</h1><p>By Sam</p></header>
            <h2>Why it matters</h2>
            <p>Crispy <b>batter</b>, soft fish.</p>
            <ul><li>Cod</li><li>Haddock</li></ul>
            <script>var x = "not content";</script>
            <style>.a{}</style>
            <nav>Related: A B</nav>
            <div hidden>Hidden text</div>
            <span aria-hidden="true">icon</span>
          </article>
        </main>
        <footer>© BrandX</footer>`),
    );
    expect(mainText).toBe(
      ["Fish & chips", "By Sam", "Why it matters", "Crispy batter, soft fish.", "Cod", "Haddock"].join("\n"),
    );
  });

  it("falls back to <body> without header, nav and footer when there's no <main>", () => {
    const { mainText } = extractParsedHtml(
      page(`<header>Logo Menu</header><nav>Links</nav><div><h1>Title</h1><p>Body text.</p></div><footer>Legal</footer>`),
    );
    expect(mainText).toBe("Title\nBody text.");
  });

  it("is empty for a page with no readable text", () => {
    expect(extractParsedHtml(page("<main><script>1</script></main>")).mainText).toBe("");
  });

  it("is capped", () => {
    const { mainText } = extractParsedHtml(page(`<main><p>${"word ".repeat(10_000)}</p></main>`));
    expect(mainText.length).toBe(MAIN_TEXT_MAX_CHARS);
  });
});

describe("extractParsedHtml qaPairs", () => {
  it("reads accordion toggles and their aria-controls panels (BrandX FAQ markup), including collapsed panels", () => {
    const { qaPairs } = extractParsedHtml(
      page(`<main><section data-component="authorable/shared/lists/accordion">
        <button type="button" aria-label="Expand all accordion items">Expand All</button>
        <div data-component="authorable/shared/lists/accordionitem"><div>
          <button aria-expanded="false" type="button" aria-controls="accordion-item-1"><h3>Is the initial consultation really free?</h3><span><svg></svg></span></button>
          <div id="accordion-item-1" role="region" aria-hidden="true"><div><p>Yes. Our first meeting is completely complimentary &mdash; no cost.</p></div></div>
        </div></div>
      </section>
      <nav><button aria-expanded="false" aria-controls="menu">Services</button><ul id="menu"><li>Planning</li></ul></nav></main>`),
    );
    expect(qaPairs).toEqual([
      { question: "Is the initial consultation really free?", answer: "Yes. Our first meeting is completely complimentary — no cost." },
    ]);
  });

  it("reads <details>/<summary>", () => {
    const { qaPairs } = extractParsedHtml(
      page(`<main><details><summary>How do I apply?</summary><p>Fill in the form online.</p></details>
        <details><summary>Shipping</summary><p>Not a question, so skipped.</p></details></main>`),
    );
    expect(qaPairs).toEqual([{ question: "How do I apply?", answer: "Fill in the form online." }]);
  });
});

describe("extractParsedHtml metadata and JSON-LD", () => {
  it("reads html lang, og:type and author signals", () => {
    const html = `<!doctype html><html lang="en-GB"><head><meta property="og:type" content="article">
      <meta name="author" content="Sam Lee"><link rel="author" href="/authors/sam"></head><body></body></html>`;
    expect(extractParsedHtml(html)).toMatchObject({
      htmlLang: "en-GB",
      ogType: "article",
      metaAuthor: "Sam Lee",
      relAuthorHref: "/authors/sam",
    });
  });

  it("keeps every JSON-LD block, with parse errors instead of dropping them", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@graph":[{"@type":["Organization","LocalBusiness"]}]}</script>
      <script type="application/ld+json">{"@type": "FAQPage",}</script></head><body></body></html>`;
    const { jsonLdScripts } = extractParsedHtml(html);
    expect(jsonLdScripts).toHaveLength(2);
    expect(jsonLdScripts[0]).toEqual({ ok: true, value: { "@graph": [{ "@type": ["Organization", "LocalBusiness"] }] } });
    expect(jsonLdScripts[1].ok).toBe(false);
  });
});
