// Page checks — Read: can they read it?
// P3 (content without JS), P5 and P6 (Markdown) come in Phases 4 and 7.

import { htmlNotScanned, notChecked, scored } from "../result";
import type { CheckDef, PageContext } from "../types";

/** P4 — was cq-agentic-readiness */
export const landmarks: CheckDef<PageContext> = {
  id: "read.landmarks",
  ref: "P4",
  title: "Page structure is machine-readable",
  why: "Agents use HTML landmarks to find the main content and skip navigation and footers.",
  category: "read",
  tier: "recommended",
  scope: "page",
  sources: ["live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ html }) {
    if (!html) return htmlNotScanned();

    const items = [
      { name: "<main>", present: html.hasMain },
      { name: "<article>", present: html.hasArticle },
      { name: "<nav>", present: html.hasNav },
      { name: "<header>", present: html.hasHeader },
    ];
    const presentCount = items.filter((l) => l.present).length;
    const missing = items.filter((l) => !l.present);
    const details = items.map((l) => `${l.name}: ${l.present ? "✓ present" : "✗ missing"}`);

    if (html.interactiveElementsMissingLabel > 0) {
      const n = html.interactiveElementsMissingLabel;
      details.push(
        `⚠ ${n} interactive element${n > 1 ? "s" : ""} missing accessible label`,
        "These are typically icon-only buttons (e.g. hamburger menu, search, carousel arrows) or image-wrapped links with no visible text. Without a label, screen readers and AI agents cannot identify what the element does.",
        'Fix: add aria-label="Descriptive name" to each flagged element — e.g. <button aria-label="Open navigation menu"><svg .../></button>',
      );
    }

    return scored(
      presentCount / items.length,
      `${presentCount} of 4 landmark elements present`,
      missing.length === 0
        ? "All semantic landmark elements are present. AI agents and browser automation tools use these landmarks to locate and extract specific content regions."
        : `Missing landmark${missing.length > 1 ? "s" : ""}: ${missing.map((l) => l.name).join(", ")}. AI agents rely on these to navigate and extract content from the page.`,
      {
        status: presentCount === 4 ? "pass" : presentCount >= 3 ? "warning" : "fail",
        fixSuggestion:
          missing.length === 0
            ? ""
            : `Add the missing HTML5 landmark elements to your component layout: ${missing.map((l) => l.name).join(", ")}.`,
        details,
      },
    );
  },
};

/** P7 — was cq-page-experience. On demand: excluded until PageSpeed has run. */
export const speed: CheckDef<PageContext> = {
  id: "read.speed",
  ref: "P7",
  title: "Page loads fast",
  why: "Slow pages time out for agents that fetch on the user's behalf, and rank lower in AI search.",
  category: "read",
  tier: "recommended",
  scope: "page",
  sources: ["psi"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ psi }) {
    if (!psi) {
      return notChecked("Not yet checked", "Run PageSpeed Insights to score page speed. It isn't counted until it runs.");
    }

    if (psi.psiError) {
      return notChecked(
        "PSI unavailable",
        "PageSpeed Insights could not analyse this page — it may not be publicly accessible on the internet. PSI requires a live, crawlable URL.",
        {
          fixSuggestion: "Run PSI manually at pagespeed.web.dev once the page is deployed to a public URL.",
          details: [`Error: ${psi.psiError}`],
        },
      );
    }

    if (!psi.isCrawlable) {
      return scored(0, `PSI score: ${psi.performanceScore} — page not crawlable`, "PageSpeed Insights reports this page as not crawlable.", {
        fixSuggestion: "Check that the page is publicly accessible and not blocked by robots.txt or a login wall.",
      });
    }

    const credit = psi.performanceScore >= 70 ? 1 : psi.performanceScore >= 50 ? 0.6 : 0;
    return scored(
      credit,
      `PSI performance: ${psi.performanceScore}/100`,
      credit === 1
        ? `Good performance score (${psi.performanceScore}/100). Page experience is acceptable.`
        : `Performance score of ${psi.performanceScore}/100 is below threshold. Slow pages reduce dwell time and can affect AI feature eligibility.`,
      {
        fixSuggestion:
          credit === 1
            ? ""
            : "Run PageSpeed Insights directly (pagespeed.web.dev) for a detailed breakdown of Core Web Vitals and improvement opportunities.",
        details: psi.coreWebVitals,
        flaggedItems: psi.opportunities.length > 0 ? psi.opportunities : undefined,
      },
    );
  },
};

export const READ_PAGE_CHECKS = [landmarks, speed];
