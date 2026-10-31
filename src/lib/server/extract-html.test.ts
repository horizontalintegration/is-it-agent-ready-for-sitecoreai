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
