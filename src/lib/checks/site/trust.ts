// Site checks — Trust (S6). Grades the evidence from /api/agent-access.

import type { TrustPageKind } from "@/lib/agent-access/types";
import { notChecked, scored } from "../result";
import type { CheckDef, SiteContext } from "../types";
import { listText, notScanned } from "./shared";

/** A privacy page shorter than this is a stub, not a policy. */
export const PRIVACY_MIN_CHARS = 500;

const LABEL: Record<TrustPageKind, string> = { about: "about", contact: "contact", privacy: "privacy" };

/**
 * S6 — about, contact and privacy pages: linked from the home page (footer
 * first), each returning 200, and the privacy page with real text. Upgrades
 * the Phase 5 footer-links row; terms, security and a postal address are
 * reported but not scored.
 */
export const trustPages: CheckDef<SiteContext> = {
  id: "trust.trust-pages",
  ref: "S6",
  title: "About, contact and privacy pages exist",
  why: "AI answers favour sources that say who they are and how to reach them.",
  category: "trust",
  tier: "recommended",
  scope: "site",
  sources: ["live"],
  owner: "author",
  applies: () => true,
  run({ access }) {
    if (!access) return notScanned();
    if (!access.home.html) return notChecked("Couldn't check", "The home page couldn't be read, so its links couldn't be checked.");

    const problems: string[] = [];
    let ok = 0;
    let privacyChars = 0;
    for (const page of access.trustPages) {
      const name = LABEL[page.kind];
      if (!page.href) {
        problems.push(`No link to ${name === "about" ? "an" : "a"} ${name} page.`);
      } else if (page.probe?.status !== 200) {
        problems.push(`The ${name} page returns ${page.probe?.status ?? "no response"}.`);
      } else if (page.kind === "privacy" && page.textChars < PRIVACY_MIN_CHARS) {
        problems.push(`The privacy page has only ${page.textChars.toLocaleString("en-US")} characters (a policy needs ${PRIVACY_MIN_CHARS} or more).`);
      } else {
        ok++;
        if (page.kind === "privacy") privacyChars = page.textChars;
      }
    }

    const footer = access.home.footer;
    const details = [
      ...access.trustPages.map((p) => `${LABEL[p.kind][0].toUpperCase()}${LABEL[p.kind].slice(1)}: ${p.href ?? "not linked"}${p.probe ? ` (HTTP ${p.probe.status ?? p.probe.error})` : ""}`),
      ...(footer
        ? [
            `Also in the footer (not scored): ${listText(
              [
                `terms ${footer.hasTerms ? "linked" : "not linked"}`,
                `security or trust page ${footer.hasSecurity ? "linked" : "not linked"}`,
                `postal address ${footer.hasAddress ? "shown" : "not found"}`,
              ],
            )}.`,
          ]
        : []),
    ];
    const total = access.trustPages.length || 3;
    if (problems.length === 0) {
      return scored(1, `${ok} of ${total}`, `All three respond with 200. The privacy page has ${privacyChars.toLocaleString("en-US")} characters.`, { details });
    }
    return scored(ok / total, `${ok} of ${total}`, problems.join(" "), {
      fixSuggestion: "Link your about, contact and privacy pages from the site footer, and make sure each one is published.",
      details,
    });
  },
};
