// Page checks — Reach: can AI agents get to it?
// P1 reach.indexable is the gate (src/lib/checks/gate.ts), not a scored check.

import { normaliseUrl } from "@/lib/rule-engine/helpers";
import { htmlNotScanned, scored } from "../result";
import type { CheckDef, PageContext } from "../types";

/** P2 — was seo-canonical */
export const canonical: CheckDef<PageContext> = {
  id: "reach.canonical",
  ref: "P2",
  title: "Canonical points to this page",
  why: "Agents and search engines index the canonical URL; a wrong one sends citations to a different page.",
  category: "reach",
  tier: "essential",
  scope: "page",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ html, pageUrl }) {
    if (!html) return htmlNotScanned();

    if (!html.canonicalHref) {
      return scored(0, "Missing", "No canonical tag found in the rendered page.", {
        fixSuggestion: 'Ensure the page template renders a <link rel="canonical"> tag pointing to this page URL.',
      });
    }

    if (normaliseUrl(html.canonicalHref) === normaliseUrl(pageUrl)) {
      return scored(1, html.canonicalHref, "Canonical tag is present and self-referencing.");
    }

    return scored(0.4, html.canonicalHref, "Canonical tag points to a different URL.", {
      status: "warning",
      fixSuggestion: `Update the canonical href to match this page's URL: ${pageUrl}`,
      details: [`Canonical: ${html.canonicalHref}`, `Expected: ${pageUrl}`],
    });
  },
};

export const REACH_PAGE_CHECKS = [canonical];
