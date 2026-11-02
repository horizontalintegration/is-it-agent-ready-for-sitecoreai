// Page checks — Read: can they read it?
// P5 and P6 (Markdown) come in Phase 7.

import { wordCount } from "@/lib/rule-engine/helpers";
import type { BodyBlock } from "@/lib/rule-engine/types";
import { compareBlocks } from "../draft-diff";
import { htmlNotScanned, notApplicable, notChecked, scored } from "../result";
import type { CheckDef, PageContext } from "../types";

/** "authorable/articles/relatedarticles" → "relatedarticles". */
const componentName = (c: string | null) => (c ? (c.split("/").pop() ?? c) : "Other content");

const excerpt = (s: string, max = 70) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** One flagged line per component: its client-only word count and the first block. */
function byComponent(blocks: BodyBlock[]): string[] {
  const groups = new Map<string, BodyBlock[]>();
  for (const b of blocks) {
    const key = componentName(b.component);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups].map(([name, list]) => {
    const words = list.reduce((s, b) => s + wordCount(b.text), 0);
    return `${name}: ${words} words, e.g. "${excerpt(list[0].text)}"`;
  });
}

/**
 * P3 — new. Needs the Page Builder draft, which includes content rendered by
 * JavaScript, and the server HTML, which is what crawlers that don't run
 * JavaScript get. Panel only: the dashboard has no draft, so it's not checked there.
 */
export const noJsContent: CheckDef<PageContext> = {
  id: "read.no-js-content",
  ref: "P3",
  title: "Content is there without JavaScript",
  why: "Most AI crawlers don't run JavaScript, so content rendered in the browser is invisible to them.",
  category: "read",
  tier: "essential",
  scope: "page",
  sources: ["draft", "live"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ draft, draftUnavailable, html }) {
    if (!draft && draftUnavailable) {
      return notChecked(
        "Draft not available",
        "The editor's draft couldn't be read, so this can't be compared with the published page. Re-scan to try again.",
      );
    }
    if (!draft) {
      return notChecked(
        "Page Builder only",
        "Checked in the Page Builder panel, which compares what the editor renders with the page's server HTML.",
      );
    }
    if (!html) {
      return notChecked(
        "Published page not fetched",
        "This compares the draft with the published page's server HTML. If the page isn't published yet, publish it and re-scan.",
      );
    }

    const diff = compareBlocks(draft.html.bodyBlocks, html.bodyBlocks);
    const total = diff.serverWords + diff.clientOnlyWords;
    if (total === 0) return notApplicable("No text", "The page has no text to compare.");

    const share = diff.serverWords / total;
    const credit = share >= 0.95 ? 1 : share >= 0.8 ? 0.5 : 0;
    const pct = Math.floor(share * 100);

    const details = [
      "Full credit when at least 95% of the text is in the server HTML, half at 80%.",
      "Only blocks of 4+ words are judged; dates, buttons and labels are skipped.",
    ];
    if (diff.edited.length > 0) {
      const n = diff.edited.length;
      details.push(`${n} block${n > 1 ? "s" : ""} edited in the draft ${n > 1 ? "count" : "counts"} as server content.`);
    }
    if (diff.clientOnly.length > 0) {
      details.push("Text added in the draft and not published yet also shows up here until it's published.");
    }
    for (const msg of draft.emptyStates) {
      details.push(`Couldn't render in the editor, not counted: "${msg}". Check this listing on the published page.`);
    }

    return scored(
      credit,
      diff.clientOnlyWords === 0
        ? "All text is in the server HTML"
        : `${diff.clientOnlyWords} of ${total} words need JavaScript (${pct}% in the server HTML)`,
      diff.clientOnlyWords === 0
        ? "Agents that don't run JavaScript see all of this page's content."
        : `${diff.clientOnlyWords} words appear only after JavaScript runs in the browser. Crawlers that don't run JavaScript miss them.`,
      {
        fixSuggestion:
          diff.clientOnlyWords === 0
            ? ""
            : "Render this content on the server (SSR or SSG), so it's in the HTML. For listings, fetch the data at build or request time, not in the browser.",
        details,
        flaggedItems: diff.clientOnly.length > 0 ? byComponent(diff.clientOnly) : undefined,
      },
    );
  },
};

/** P4 — was cq-agentic-readiness */
export const landmarks: CheckDef<PageContext> = {
  id: "read.landmarks",
  ref: "P4",
  title: "Page structure is machine-readable",
  why: "Agents use HTML landmarks to find the main content and skip navigation and footers.",
  category: "read",
  tier: "recommended",
  scope: "page",
  sources: ["draft"],
  owner: "developer",
  fix: "send-to-developer",
  applies: () => true,
  run({ body: html }) {
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

export const READ_PAGE_CHECKS = [noJsContent, landmarks, speed];
