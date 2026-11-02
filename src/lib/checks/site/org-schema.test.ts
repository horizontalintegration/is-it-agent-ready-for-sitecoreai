import { describe, expect, it } from "vitest";
import { orgSchema } from "./org-schema";
import { runSiteChecks } from "../engine";
import { toCheckRow } from "../view-model";
import { extractParsedHtml } from "@/lib/html/extract-html";
import { makeTestSiteContext } from "@/lib/rule-engine/test-fixture";
import type { SiteContext } from "../types";

const SITE = "https://www.brandx.com";
const CONFIG_ORG = {
  name: "BrandX",
  url: "https://www.brandx.com/",
  logo: "https://www.brandx.com/logo.png",
  description: "Financial planning for everyone.",
  sameAs: ["https://www.linkedin.com/company/brandx"],
};

const homePage = (...blocks: string[]) =>
  `<!doctype html><html lang="en"><head><title>BrandX</title>${blocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join("")}</head><body><main><h1>Welcome to BrandX</h1></main></body></html>`;

function ctx(html: string | null, expected: SiteContext["expectedOrganization"] = { name: null, url: null }): SiteContext {
  return {
    siteUrl: SITE,
    siteType: "content",
    organization: CONFIG_ORG,
    expectedOrganization: expected,
    home: html === null ? null : extractParsedHtml(html),
    access: null,
  };
}

const COMPLETE = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BrandX",
  url: "https://www.brandx.com/",
  logo: { "@type": "ImageObject", url: "https://www.brandx.com/logo.png" },
  sameAs: ["https://www.linkedin.com/company/brandx"],
  description: "Financial planning for everyone.",
  contactPoint: { "@type": "ContactPoint", telephone: "+1-555-0100", contactType: "customer service" },
};

const run = (c: SiteContext) => orgSchema.run(c);
const snippetJson = (snippet: string | undefined) => JSON.parse((snippet ?? "").replace(/<\/?script[^>]*>/g, ""));

describe("S7 understand.org-schema — the four rules", () => {
  it("rule 1: complete Organization schema → full credit, pass", () => {
    const r = run(ctx(homePage(JSON.stringify(COMPLETE))));
    expect(r).toMatchObject({ state: "scored", credit: 1, status: "pass" });
    expect(r.codePreview).toBeUndefined();
  });

  it("rule 2: missing fields → partial credit, warning listing them, corrected snippet", () => {
    const partial = { "@context": "https://schema.org", "@type": "Organization", name: "BrandX", url: "https://www.brandx.com/" };
    const r = run(ctx(homePage(JSON.stringify(partial))));
    // 2 of 3 required (70%), 0 of 3 recommended (30%)
    expect(r.state).toBe("scored");
    expect(r.credit).toBeCloseTo(0.7 * (2 / 3));
    expect(r.status).toBe("warning");
    expect(r.message).toContain("logo");
    expect(r.message).toContain("contactPoint");

    // The snippet starts from the site's schema and fills only the gaps from config.
    const fixed = snippetJson(r.codePreview);
    expect(fixed.name).toBe("BrandX");
    expect(fixed.logo).toBe(CONFIG_ORG.logo);
    expect(fixed.description).toBe(CONFIG_ORG.description);
    expect(fixed.sameAs).toEqual(CONFIG_ORG.sameAs);
  });

  it("rule 3: no Organization schema (page fetched) → 0, shown as a warning, with a snippet", () => {
    const r = run(ctx(homePage('{"@context":"https://schema.org","@type":"WebSite","name":"BrandX"}')));
    expect(r).toMatchObject({ state: "scored", credit: 0, status: "warning", value: "Not added yet" });
    expect(snippetJson(r.codePreview)).toMatchObject({ "@type": "Organization", name: "BrandX", url: CONFIG_ORG.url });
  });

  it("rule 4: home page couldn't be fetched → N/A (excluded), with a snippet", () => {
    const r = run(ctx(null));
    expect(r.state).toBe("not-applicable");
    expect(r.value).toBe("Couldn't check");
    expect(r.codePreview).toContain('"@type": "Organization"');
  });
});

describe("S7 — detection", () => {
  it("finds Organization in a @graph bundle", () => {
    const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, { ...COMPLETE, "@context": undefined }] };
    expect(run(ctx(homePage(JSON.stringify(graph)))).credit).toBe(1);
  });

  it("finds Organization in a @type array", () => {
    const r = run(ctx(homePage(JSON.stringify({ ...COMPLETE, "@type": ["Organization", "LocalBusiness"] }))));
    expect(r.credit).toBe(1);
    expect(r.value).toContain("LocalBusiness");
  });

  it.each(["Corporation", "LocalBusiness", "FinancialService", "BankOrCreditUnion"])("accepts the subtype %s", (type) => {
    expect(run(ctx(homePage(JSON.stringify({ ...COMPLETE, "@type": type })))).credit).toBe(1);
  });

  it("counts a WebSite.publisher that points to an Organization by @id", () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", url: SITE, publisher: { "@id": "https://www.brandx.com/#org" } },
        { ...COMPLETE, "@context": undefined, "@id": "https://www.brandx.com/#org" },
      ],
    };
    expect(run(ctx(homePage(JSON.stringify(graph)))).credit).toBe(1);
  });

  it("counts an inline WebSite.publisher Organization", () => {
    const site = { "@context": "https://schema.org", "@type": "WebSite", publisher: { ...COMPLETE, "@context": undefined } };
    expect(run(ctx(homePage(JSON.stringify(site)))).credit).toBe(1);
  });

  it("fails a block that doesn't parse, with the parse error", () => {
    const r = run(ctx(homePage(JSON.stringify(COMPLETE), '{"@type": "Organization",}')));
    expect(r).toMatchObject({ state: "scored", credit: 0, status: "fail" });
    expect(r.details[0]).toMatch(/^Parse error 1:/);
  });
});

describe("S7 — expected values and conflicts", () => {
  it("doesn't accept a url off the site's own domain", () => {
    const r = run(ctx(homePage(JSON.stringify({ ...COMPLETE, url: "https://other-agency.com/" }))));
    expect(r.credit).toBeCloseTo(0.7 * (2 / 3) + 0.3);
    expect(r.details.join(" ")).toContain("isn't on the site's own domain");
    expect(snippetJson(r.codePreview).url).toBe(CONFIG_ORG.url);
  });

  it("accepts the bare domain for a www site", () => {
    expect(run(ctx(homePage(JSON.stringify({ ...COMPLETE, url: "https://brandx.com" })))).credit).toBe(1);
  });

  it("warns when the schema names a different organisation from config", () => {
    const r = run(ctx(homePage(JSON.stringify({ ...COMPLETE, name: "Acme Corp" })), { name: "BrandX", url: null }));
    expect(r.status).toBe("warning");
    expect(r.credit).toBeLessThan(1);
    expect(r.details.join(" ")).toContain('configured organisation is "BrandX"');
  });

  it("warns on duplicate Organization entries with conflicting data", () => {
    const r = run(ctx(homePage(JSON.stringify(COMPLETE), JSON.stringify({ ...COMPLETE, name: "BrandX Holdings" }))));
    expect(r.status).toBe("warning");
    expect(r.credit).toBeLessThan(1);
  });

  it("treats the same entity declared twice under one @id as one", () => {
    const withId = { ...COMPLETE, "@id": "https://www.brandx.com/#org" };
    expect(run(ctx(homePage(JSON.stringify(withId), JSON.stringify(withId)))).credit).toBe(1);
  });

  it("lists the bonus fields as tips without scoring them", () => {
    const r = run(ctx(homePage(JSON.stringify(COMPLETE))));
    expect(r.details.find((d) => d.startsWith("Bonus"))).toBe("Bonus (not scored): ✗ address · ✗ legalName");
  });
});

describe("S7 — BrandX home page (no JSON-LD, as on 2026-10-31)", () => {
  it("scores 0 with a warning and a ready-to-paste snippet", () => {
    const html = `<!doctype html><html lang="en"><head><title>BrandX</title><meta name="description" content="Financial planning"></head>
      <body><header><nav><a href="/about">About</a></nav></header><main><h1>Plan your financial future</h1><p>Advice for every stage.</p></main></body></html>`;
    const r = run({ ...ctx(html), expectedOrganization: { name: "BrandX", url: CONFIG_ORG.url } });
    expect(r).toMatchObject({ state: "scored", credit: 0, status: "warning", value: "Not added yet" });
    expect(snippetJson(r.codePreview)).toMatchObject({ "@type": "Organization", name: "BrandX" });
  });

  it("shows the same in the demo fixture, worth points in the site score", () => {
    const report = runSiteChecks(makeTestSiteContext());
    const s7 = report.outcomes.find((o) => o.check.id === "understand.org-schema")!;
    expect(s7.result).toMatchObject({ state: "scored", credit: 0, status: "warning" });
    expect(s7.result.codePreview).toContain("BrandX");
    expect(toCheckRow(s7).gain).toBeGreaterThan(0);
  });
});
