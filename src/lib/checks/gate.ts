// ─────────────────────────────────────────────────────────────────────────────
// P1 reach.indexable — the gate. Runs before every other page check. A page
// that is noindex or nosnippet can't appear in AI answers, so it shows the
// gate instead of a score.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedHtml } from "@/lib/rule-engine/types";
import type { GateResult, PageFields } from "./types";

export function runGate(fields: PageFields | null, html: ParsedHtml | null): GateResult {
  // Field-level noindex set on the Sitecore item
  if ((fields?.robotsMetaTag ?? "").toLowerCase().includes("noindex")) {
    return {
      blocked: true,
      reason:
        'The page has "noindex" enabled in its Robots Meta Tag field. It is excluded from Google Search and all AI features.',
    };
  }

  if (!html) return { blocked: false, reason: "" };

  const robotsContent = (html.robotsMeta ?? "").toLowerCase();
  const googlebotContent = (html.googlebotMeta ?? "").toLowerCase();

  const blockedByRobots =
    robotsContent.includes("noindex") ||
    robotsContent.includes("nosnippet") ||
    robotsContent.includes("max-snippet:0") ||
    googlebotContent.includes("noindex") ||
    googlebotContent.includes("nosnippet") ||
    googlebotContent.includes("max-snippet:0");

  if (blockedByRobots) {
    const tag = robotsContent.includes("noindex") ? "noindex" : "nosnippet / max-snippet:0";
    return {
      blocked: true,
      reason: `The rendered page contains a <meta name="robots"> tag with "${tag}". This page cannot appear in any Google AI feature.`,
    };
  }

  return { blocked: false, reason: "" };
}
