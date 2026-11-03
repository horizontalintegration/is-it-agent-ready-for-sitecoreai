import { describe, expect, it } from "vitest";
import {
  collectNodes,
  isArticle,
  isOrganization,
  parseErrors,
  parseJsonLdScript,
  resolve,
} from "./json-ld";

const parse = (...blocks: string[]) => blocks.map(parseJsonLdScript);

describe("parseJsonLdScript", () => {
  it("keeps the parsed value", () => {
    expect(parseJsonLdScript('{"@type":"Thing"}')).toEqual({ ok: true, value: { "@type": "Thing" } });
  });

  it("keeps the parse error instead of dropping the block", () => {
    const s = parseJsonLdScript('{"@type": "Organization",}');
    expect(s.ok).toBe(false);
    expect(parseErrors([s])).toHaveLength(1);
  });
});

describe("collectNodes", () => {
  it("reads single objects, top-level arrays and @graph bundles", () => {
    const nodes = collectNodes(
      parse(
        '{"@type":"WebPage"}',
        '[{"@type":"BreadcrumbList"},{"@type":"FAQPage"}]',
        '{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"#org"},{"@type":"WebSite"}]}',
      ),
    );
    expect(nodes.map((n) => n.types[0])).toEqual(["WebPage", "BreadcrumbList", "FAQPage", "Organization", "WebSite"]);
  });

  it("reads @type arrays and strips schema.org prefixes", () => {
    const [node] = collectNodes(parse('{"@type":["schema:Organization","https://schema.org/LocalBusiness"]}'));
    expect(node.types).toEqual(["Organization", "LocalBusiness"]);
  });

  it("skips blocks that don't parse", () => {
    expect(collectNodes(parse("{bad", '{"@type":"Thing"}'))).toHaveLength(1);
  });

  it("doesn't turn nested objects into nodes", () => {
    const nodes = collectNodes(parse('{"@type":"Article","author":{"@type":"Person","name":"Sam"}}'));
    expect(nodes).toHaveLength(1);
  });
});

describe("type matching", () => {
  it("recognises Organization subtypes", () => {
    const nodes = collectNodes(parse('{"@type":"BankOrCreditUnion"}', '{"@type":"Corporation"}', '{"@type":"Person"}'));
    expect(nodes.map(isOrganization)).toEqual([true, true, false]);
  });

  it("recognises Article subtypes", () => {
    const nodes = collectNodes(parse('{"@type":"BlogPosting"}', '{"@type":"NewsArticle"}', '{"@type":"WebPage"}'));
    expect(nodes.map(isArticle)).toEqual([true, true, false]);
  });
});

describe("resolve", () => {
  it("looks up {@id} references and uses inline objects as they are", () => {
    const nodes = collectNodes(parse('{"@graph":[{"@type":"Organization","@id":"#org","name":"BrandX"}]}'));
    expect(resolve({ "@id": "#org" }, nodes)?.data.name).toBe("BrandX");
    expect(resolve({ "@type": "Organization", name: "Inline" }, nodes)?.data.name).toBe("Inline");
    expect(resolve({ "@id": "#missing" }, nodes)).toBeNull();
    expect(resolve("BrandX", nodes)).toBeNull();
  });
});
