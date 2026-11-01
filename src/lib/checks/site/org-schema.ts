// ─────────────────────────────────────────────────────────────────────────────
// S7 understand.org-schema — "Your organisation is described for AI".
// Runs once per site on the home page's live HTML (the getPageHTML draft has
// no <head> scripts). Scoring rules agreed 2026-10-31 (plan section 5.2):
//
//   Complete Organization schema            full credit, pass
//   Organization schema, missing fields     partial credit, warning + corrected snippet
//   No Organization schema (page fetched)   0, warning ("Not added yet") + snippet
//   Home page couldn't be fetched           N/A ("Couldn't check") + snippet
//   A JSON-LD block that doesn't parse      0, fail, with the parse error
//
// Credit: 70% for the required fields (name, url on the site's own domain,
// logo), 30% for the recommended ones (sameAs, description, contactPoint).
// Bonus fields (address as a PostalAddress, legalName) are shown as tips only.
// A name that differs from NEXT_PUBLIC_ORG_NAME, or conflicting duplicate
// Organization entries, is a warning and caps the credit below full.
// ─────────────────────────────────────────────────────────────────────────────

import { buildOrganizationJsonLd } from "@/lib/rule-engine/helpers";
import type { OrganizationInfo } from "@/lib/rule-engine/types";
import {
  collectNodes,
  hasType,
  isObject,
  isOrganization,
  listProp,
  parseErrors,
  resolve,
  stringProp,
  typesOf,
  type JsonLdNode,
} from "../json-ld";
import { notApplicable, scored } from "../result";
import type { CheckDef, SiteContext } from "../types";

const REQUIRED_SHARE = 0.7;
const RECOMMENDED_SHARE = 0.3;
/** Credit cap when the schema is complete but names someone else or conflicts. */
const ISSUE_CAP = 0.9;

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Same host, or one a subdomain of the other (www. ignored). */
function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Organization nodes on the page, including a WebSite.publisher (inline or by @id). */
export function findOrganizations(nodes: JsonLdNode[]): JsonLdNode[] {
  const orgs = nodes.filter(isOrganization);
  for (const site of nodes.filter((n) => hasType(n, "WebSite"))) {
    for (const p of listProp(site.data, "publisher")) {
      const node = resolve(p, nodes);
      if (node && isOrganization(node) && !orgs.some((o) => o.data === node.data)) orgs.push(node);
    }
  }
  // The same entity declared twice under one @id counts once.
  return orgs.filter((o, i) => !o.id || orgs.findIndex((x) => x.id === o.id) === i);
}

function logoOf(data: Record<string, unknown>): string | null {
  const logo = data.logo;
  if (typeof logo === "string" && logo.trim()) return logo.trim();
  if (isObject(logo)) return stringProp(logo, "url") ?? stringProp(logo, "contentUrl");
  return null;
}

function hasPostalAddress(data: Record<string, unknown>): boolean {
  return listProp(data, "address").some(
    (a) => isObject(a) && (typesOf(a).includes("PostalAddress") || "streetAddress" in a || "addressLocality" in a),
  );
}

interface Field {
  key: string;
  ok: boolean;
  note?: string;
}

interface Grade {
  required: Field[];
  recommended: Field[];
  bonus: Field[];
  credit: number;
}

function grade(node: JsonLdNode, ownHosts: string[]): Grade {
  const d = node.data;
  const url = stringProp(d, "url");
  const urlHost = hostOf(url);
  const urlOk = Boolean(urlHost && ownHosts.some((h) => sameSite(h, urlHost)));

  const required: Field[] = [
    { key: "name", ok: Boolean(stringProp(d, "name")) },
    {
      key: "url",
      ok: urlOk,
      note: url && !urlOk ? `url ${url} isn't on the site's own domain (${ownHosts.join(" or ")})` : undefined,
    },
    { key: "logo", ok: Boolean(logoOf(d)) },
  ];
  const recommended: Field[] = [
    { key: "sameAs", ok: listProp(d, "sameAs").some((s) => typeof s === "string" && s.trim()) },
    { key: "description", ok: Boolean(stringProp(d, "description")) },
    { key: "contactPoint", ok: listProp(d, "contactPoint").some(isObject) },
  ];
  const bonus: Field[] = [
    { key: "address", ok: hasPostalAddress(d), note: typeof d.address === "string" ? "address is plain text; use a PostalAddress" : undefined },
    { key: "legalName", ok: Boolean(stringProp(d, "legalName")) },
  ];
  const share = (fields: Field[]) => fields.filter((f) => f.ok).length / fields.length;
  return {
    required,
    recommended,
    bonus,
    credit: REQUIRED_SHARE * share(required) + RECOMMENDED_SHARE * share(recommended),
  };
}

/**
 * The fix snippet: the schema already on the site, with the gaps filled from
 * config. A url off the site's domain is replaced; other values are kept.
 */
export function buildOrgFixSnippet(
  primary: JsonLdNode | null,
  g: Grade | null,
  org: OrganizationInfo,
  siteUrl: string,
): string {
  const fallback: OrganizationInfo = { ...org, url: org.url ?? (siteUrl ? `${siteUrl.replace(/\/+$/, "")}/` : null) };
  if (!primary || !g) return buildOrganizationJsonLd(fallback);

  const missing = (key: string) => [...g.required, ...g.recommended].some((f) => f.key === key && !f.ok);
  const base = Object.fromEntries(Object.entries(primary.data).filter(([k]) => k !== "@context"));
  const placeholderUrl = fallback.url ?? "https://www.example.com/";
  const jsonLd: Record<string, unknown> = { "@context": "https://schema.org", ...base };

  if (missing("name")) jsonLd.name = fallback.name ?? "YOUR ORGANIZATION NAME";
  if (missing("url")) jsonLd.url = placeholderUrl;
  if (missing("logo")) jsonLd.logo = fallback.logo ?? `${placeholderUrl.replace(/\/+$/, "")}/YOUR-LOGO.png`;
  if (missing("description") && fallback.description) jsonLd.description = fallback.description;
  if (missing("sameAs") && fallback.sameAs.length > 0) jsonLd.sameAs = fallback.sameAs;

  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}

const WHY_DETAILS = [
  "Why it matters: identifies your brand as a verified entity (name, logo, official URL) to search engines and AI assistants.",
  "The sameAs links connect your site to official profiles, so AI engines recognise and cite your organisation correctly.",
];

export const orgSchema: CheckDef<SiteContext> = {
  id: "understand.org-schema",
  ref: "S7",
  title: "Your organisation is described for AI",
  why: "Organization schema on the home page tells agents who runs the site, so they name and cite you correctly.",
  category: "understand",
  tier: "recommended",
  scope: "site",
  sources: ["live"],
  owner: "developer",
  fix: "copy-snippet",
  applies: () => true,
  run({ home, siteUrl, organization, expectedOrganization }) {
    if (!home) {
      return notApplicable("Couldn't check", "The home page couldn't be fetched (unreachable or unpublished), so it isn't scored.", {
        fixSuggestion: "Once the site is published, add Organization JSON-LD to the home page. A starting snippet is below.",
        codePreview: buildOrgFixSnippet(null, null, organization, siteUrl),
      });
    }

    const errors = parseErrors(home.jsonLdScripts);
    if (errors.length > 0) {
      return scored(0, `${errors.length} JSON-LD block${errors.length > 1 ? "s" : ""} broken`, "A JSON-LD block on the home page doesn't parse, so agents ignore it.", {
        status: "fail",
        fixSuggestion: "Fix the JSON syntax of the broken block (validate it at validator.schema.org).",
        details: errors.map((e, i) => `Parse error ${i + 1}: ${e}`),
        codePreview: buildOrgFixSnippet(null, null, organization, siteUrl),
      });
    }

    const nodes = collectNodes(home.jsonLdScripts);
    const orgs = findOrganizations(nodes);
    if (orgs.length === 0) {
      return scored(0, "Not added yet", "The home page has no Organization schema. Agents have to guess who runs the site.", {
        status: "warning",
        fixSuggestion: "Add this Organization JSON-LD to the home page (or the site's global head).",
        details: WHY_DETAILS,
        codePreview: buildOrgFixSnippet(null, null, organization, siteUrl),
      });
    }

    const ownHosts = Array.from(
      new Set([hostOf(siteUrl), hostOf(expectedOrganization.url)].filter((h): h is string => Boolean(h))),
    );
    const expectedName = expectedOrganization.name ? normName(expectedOrganization.name) : null;

    // Prefer the entry naming the configured organisation, then the most complete one.
    const graded = orgs
      .map((node) => ({ node, g: grade(node, ownHosts) }))
      .sort((a, b) => {
        const am = expectedName && normName(stringProp(a.node.data, "name") ?? "") === expectedName ? 1 : 0;
        const bm = expectedName && normName(stringProp(b.node.data, "name") ?? "") === expectedName ? 1 : 0;
        return bm - am || b.g.credit - a.g.credit;
      });
    const { node: primary, g } = graded[0];

    const issues: string[] = [];
    const name = stringProp(primary.data, "name");
    if (expectedName && name && normName(name) !== expectedName) {
      issues.push(`The schema names "${name}", but the configured organisation is "${expectedOrganization.name}".`);
    }
    const names = new Set(orgs.map((o) => stringProp(o.data, "name")).filter(Boolean).map((n) => normName(n!)));
    const hosts = new Set(orgs.map((o) => hostOf(stringProp(o.data, "url"))).filter(Boolean));
    if (orgs.length > 1 && (names.size > 1 || hosts.size > 1)) {
      issues.push(`${orgs.length} Organization entries with conflicting names or URLs. Keep one, or give them the same @id.`);
    }

    const missingRequired = g.required.filter((f) => !f.ok).map((f) => f.key);
    const missingRecommended = g.recommended.filter((f) => !f.ok).map((f) => f.key);
    const credit = issues.length > 0 ? Math.min(g.credit, ISSUE_CAP) : g.credit;
    const complete = credit >= 1;
    const fieldLine = (label: string, fields: Field[]) =>
      `${label}: ${fields.map((f) => `${f.ok ? "✓" : "✗"} ${f.key}`).join(" · ")}`;

    return scored(
      credit,
      complete ? `${primary.types.join(", ")} — complete` : `${primary.types.join(", ")} — ${missingRequired.length + missingRecommended.length} field${missingRequired.length + missingRecommended.length === 1 ? "" : "s"} to add`,
      complete
        ? "The home page describes your organisation completely."
        : missingRequired.length + missingRecommended.length > 0
          ? `Organization schema found, but it's missing: ${[...missingRequired, ...missingRecommended].join(", ")}.`
          : "Organization schema found, with the issues listed below.",
      {
        status: complete ? "pass" : "warning",
        fixSuggestion: complete ? "" : "Replace the home page Organization JSON-LD with the corrected snippet below, and check the values.",
        details: [
          fieldLine("Required", g.required),
          fieldLine("Recommended", g.recommended),
          fieldLine("Bonus (not scored)", g.bonus),
          ...[...g.required, ...g.bonus].flatMap((f) => (f.note ? [f.note] : [])),
          ...issues,
        ],
        codePreview: complete ? undefined : buildOrgFixSnippet(primary, g, organization, siteUrl),
      },
    );
  },
};

export const UNDERSTAND_SITE_CHECKS = [orgSchema];
