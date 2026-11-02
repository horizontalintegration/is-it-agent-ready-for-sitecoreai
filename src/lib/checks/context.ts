// ─────────────────────────────────────────────────────────────────────────────
// Builds the check contexts. The panel and the dashboard both go through these
// functions with the same Sitecore fields and the same live HTML, so the same
// inputs give the same score in both. The panel also passes its Page Builder
// draft: the body checks then read the draft, so its score follows unpublished
// edits and can differ from the dashboard's (plan section 7).
// ─────────────────────────────────────────────────────────────────────────────

import type { AiResults, OrganizationInfo, ParsedHtml, PsiResult } from "@/lib/rule-engine/types";
import type { DraftHtml, PageContext, PageFields } from "./types";

// Only pages whose Sitecore template name matches this are treated as articles
// (Article JSON-LD expected, author check applies). Case-insensitive compare.
const ARTICLE_TEMPLATE_NAME = "article detail page";

export function isArticleTemplate(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === ARTICLE_TEMPLATE_NAME;
}

export function isHomeRoute(route: string | null | undefined): boolean {
  const r = (route ?? "").trim();
  return r === "" || r === "/";
}

// Sitecore field names the checks read. Overridable per tenant (field names
// vary between SXA and custom templates); referenced literally so Next.js
// inlines them in the browser.
export const SCORING_FIELD_NAMES = {
  metaTitle: process.env.NEXT_PUBLIC_FIELD_TITLE ?? "pageTitle",
  metaDescription: process.env.NEXT_PUBLIC_FIELD_META_DESCRIPTION ?? "MetaDescription",
  robotsMetaTag: "robotsMetaTag",
  updated: "__Updated",
} as const;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Normalise raw field values: trimmed, empty → null. */
export function pageFieldsFromValues(values: Partial<Record<keyof PageFields, string | null | undefined>>): PageFields {
  return {
    metaTitle: clean(values.metaTitle),
    metaDescription: clean(values.metaDescription),
    robotsMetaTag: clean(values.robotsMetaTag),
    updated: clean(values.updated),
  };
}

/** The panel's path: a lower-cased field name → value map from authoring GraphQL. */
export function pageFieldsFromFieldMap(fieldMap: Record<string, string>): PageFields {
  const get = (name: string) => fieldMap[name.toLowerCase()];
  return pageFieldsFromValues({
    metaTitle: get(SCORING_FIELD_NAMES.metaTitle),
    metaDescription: get(SCORING_FIELD_NAMES.metaDescription),
    robotsMetaTag: get(SCORING_FIELD_NAMES.robotsMetaTag),
    updated: get(SCORING_FIELD_NAMES.updated),
  });
}

export interface PageInput {
  pageUrl: string;
  route: string | null;
  templateName: string | null;
  fields: PageFields | null;
  /** Live HTML. */
  html: ParsedHtml | null;
  /** The panel's Page Builder draft. The dashboard has none and leaves it out. */
  draft?: DraftHtml | null;
  /** The panel couldn't read the draft (getPageHTML failed). */
  draftUnavailable?: boolean;
  ai: AiResults | null;
  psi: PsiResult | null;
  organization: OrganizationInfo;
}

export function buildPageContext(input: PageInput): PageContext {
  const draft = input.draft ?? null;
  return {
    pageUrl: input.pageUrl,
    isHomePage: isHomeRoute(input.route),
    templateName: clean(input.templateName),
    fields: input.fields,
    html: input.html,
    draft,
    draftUnavailable: !draft && input.draftUnavailable === true,
    body: draft ? draft.html : input.html,
    bodySource: draft ? "draft" : "live",
    ai: input.ai,
    psi: input.psi,
    organization: input.organization,
  };
}
