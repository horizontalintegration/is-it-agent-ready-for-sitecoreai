// ─────────────────────────────────────────────────────────────────────────────
// View model: turns the engine's reports into what the panel and the dashboard
// show (plan section 6). Display only: it never changes a score. Ranking,
// verdicts and "+N pts" are all derived from the points the engine computed.
// ─────────────────────────────────────────────────────────────────────────────

import { labelForPct, LABEL_TEXT, READY_PCT, type ScoreLabel } from "@/lib/score-thresholds";
import { DESCRIPTION_MISSING } from "./page/understand";
import { checkMeta, PAGE_CHECKS } from "./registry";
import {
  CATEGORIES,
  type Category,
  type CheckMeta,
  type CheckOutcome,
  type CheckStatus,
  type FixAction,
  type Owner,
  type PageReport,
  type ResultState,
  type Source,
  type Subtotal,
  type Tier,
} from "./types";

export const CATEGORY_META: Record<Category, { label: string; question: string; color: string }> = {
  reach: { label: "Reach", question: "Can AI agents get to it?", color: "#2563EB" },
  read: { label: "Read", question: "Can they read it?", color: "#0F8A7E" },
  understand: { label: "Understand", question: "Do they understand it?", color: "#8B3FD9" },
  trust: { label: "Trust", question: "Will they trust and cite it?", color: "#D9480F" },
};

// ── Status: always an icon and a word (plan section 6.2, item 6) ─────────────

export type DisplayStatus = "pass" | "improve" | "fix" | "na" | "not-checked";

export const STATUS_TEXT: Record<DisplayStatus, string> = {
  pass: "Pass",
  improve: "Improve",
  fix: "Fix",
  na: "N/A",
  "not-checked": "Not checked",
};

export function displayStatus(state: ResultState, status: CheckStatus): DisplayStatus {
  if (state === "not-applicable") return "na";
  if (state === "not-checked") return "not-checked";
  if (status === "pass") return "pass";
  if (status === "warning") return "improve";
  if (status === "fail") return "fix";
  return "na";
}

export const OWNER_TEXT: Record<Owner, string> = {
  author: "You can fix",
  developer: "Developer",
};

export const SOURCE_TEXT: Record<Source, string> = {
  draft: "Draft",
  live: "Live",
  fields: "Fields",
  ai: "AI",
  psi: "PageSpeed",
  probe: "Probe",
};

export const SOURCE_HINT: Record<Source, string> = {
  draft: "Read from the Page Builder draft, unsaved edits included",
  live: "Read from the published page",
  fields: "Read from the Sitecore fields",
  ai: "Judged by Claude",
  psi: "From PageSpeed Insights",
  probe: "From a citation probe",
};

// ── One row per check ─────────────────────────────────────────────────────────

export interface CheckRowModel {
  id: string;
  ref: string;
  title: string;
  why: string;
  category: Category;
  tier: Tier;
  owner: Owner;
  fix?: FixAction;
  state: ResultState;
  status: CheckStatus;
  display: DisplayStatus;
  points: number;
  maxPoints: number;
  /** Points this check would add if fixed. 0 when it isn't scored. */
  gain: number;
  /** `gain` rounded for "+N pts". 0 hides the chip. */
  gainPts: number;
  value: string;
  message: string;
  fixSuggestion: string;
  details: string[];
  flaggedItems?: string[];
  codePreview?: string;
  /** The on-demand scan that fills this check, if any. */
  runner: "ai" | "psi" | null;
  /** Where the data came from, for the source chip. */
  sources: Source[];
}

export function toCheckRow(o: CheckOutcome): CheckRowModel {
  const { check, result } = o;
  const gain = Math.max(0, o.maxPoints - o.points);
  return {
    id: check.id,
    ref: check.ref,
    title: check.title,
    why: check.why,
    category: check.category,
    tier: check.tier,
    owner: check.owner,
    fix: check.fix,
    state: result.state,
    status: result.status,
    display: displayStatus(result.state, result.status),
    points: o.points,
    maxPoints: o.maxPoints,
    gain,
    gainPts: Math.round(gain),
    value: result.value,
    message: result.message,
    fixSuggestion: result.fixSuggestion,
    details: result.details,
    flaggedItems: result.flaggedItems,
    codePreview: result.codePreview,
    runner: check.sources.includes("psi") ? "psi" : check.sources.includes("ai") ? "ai" : null,
    sources: o.sources,
  };
}

export function rowsByCategory(outcomes: CheckOutcome[]): Record<Category, CheckRowModel[]> {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, [] as CheckRowModel[]])) as Record<Category, CheckRowModel[]>;
  for (const o of outcomes) out[o.check.category].push(toCheckRow(o));
  return out;
}

/** Scored and not passing: what the "Needs work" filter and the fixes lists show. */
export function needsWork(row: Pick<CheckRowModel, "display">): boolean {
  return row.display === "fix" || row.display === "improve";
}

// ── Fixes ─────────────────────────────────────────────────────────────────────

/** The checks the AI Assist tab has a card for (Phase 9). */
const GENERATOR_CHECK_IDS = new Set([
  "understand.title-meta",
  "understand.metadata",
  "understand.faq-quality",
  "understand.question-headings",
  "understand.image-alt",
]);
/** Checks fixed by choosing a value in AI Assist, with no AI (P17's author byline). */
const APPLY_CHECK_IDS = new Set(["trust.author"]);

/** The verb button a fix gets (plan section 6.2, item 2). */
export type FixButton = "generate" | "apply" | "copy-snippet" | "send-to-developer" | "show-how";

export const FIX_BUTTON_TEXT: Record<FixButton, string> = {
  generate: "Generate",
  // Only P17 uses it today.
  apply: "Choose author",
  "copy-snippet": "Copy snippet",
  "send-to-developer": "Send to developer",
  "show-how": "Show how",
};

export function fixButton(row: Pick<CheckRowModel, "id" | "fix" | "owner" | "codePreview">): FixButton {
  if (row.fix === "generate" && GENERATOR_CHECK_IDS.has(row.id)) return "generate";
  if (row.fix === "apply-field" && APPLY_CHECK_IDS.has(row.id)) return "apply";
  if (row.fix === "copy-snippet" && row.codePreview) return "copy-snippet";
  if (row.fix === "send-to-developer" || row.owner === "developer") return "send-to-developer";
  return "show-how";
}

/** Rank order for fixes: most points first, then Essential before the rest, then the fixes the author can make. */
function byGain(a: CheckRowModel, b: CheckRowModel): number {
  if (b.gain !== a.gain) return b.gain - a.gain;
  if (a.tier !== b.tier) return a.tier === "essential" ? -1 : b.tier === "essential" ? 1 : 0;
  if (a.owner !== b.owner) return a.owner === "author" ? -1 : 1;
  return 0;
}

/** Fixes that are worth at least 1 point, biggest gain first. */
export function rankedFixes(rows: CheckRowModel[]): CheckRowModel[] {
  return rows.filter((r) => needsWork(r) && r.gainPts >= 1).sort(byGain);
}

/** The "Top fixes" list. */
export function topFixes(rows: CheckRowModel[], limit = 3): CheckRowModel[] {
  return rankedFixes(rows).slice(0, limit);
}

/**
 * How many of the biggest fixes it takes to reach Agent-ready (80). 0 when the
 * page is already there; null when even every fix wouldn't get it there.
 */
export function fixesToReady(score: number, rows: CheckRowModel[]): number | null {
  if (score >= READY_PCT) return 0;
  let total = score;
  const fixes = rankedFixes(rows);
  for (let i = 0; i < fixes.length; i++) {
    total += fixes[i].gain;
    if (Math.round(total) >= READY_PCT) return i + 1;
  }
  return null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface Verdict {
  label: ScoreLabel;
  text: string;
  /** One sentence: what it would take. */
  sentence: string;
}

export function pageVerdict(score: number, rows: CheckRowModel[]): Verdict {
  const label = labelForPct(score);
  const open = rows.filter(needsWork).length;
  const needed = fixesToReady(score, rows);
  let sentence: string;
  if (label === "agent-ready") {
    sentence = open === 0 ? "Every check passes. Nothing to fix." : `${plural(open, "check")} could still improve.`;
  } else if (needed === null) {
    sentence = `${plural(open, "check")} need work. Start with the top fixes below.`;
  } else {
    sentence = `${plural(needed, "fix", "fixes")} would make this page agent-ready.`;
  }
  return { label, text: LABEL_TEXT[label], sentence };
}

/** Plain text for a developer: pasted into a ticket or a message. */
export function developerNote(row: CheckRowModel, pageUrl: string): string {
  return [
    `${row.title} (${row.ref})`,
    pageUrl ? `Page: ${pageUrl}` : "",
    `Why it matters: ${row.why}`,
    `What we found: ${row.message}${row.value ? ` (${row.value})` : ""}`,
    row.fixSuggestion ? `Fix: ${row.fixSuggestion}` : "",
    ...row.details.map((d) => `- ${d}`),
    row.codePreview ? `\n${row.codePreview}` : "",
    "\nFrom Is It Agent-Ready? for SitecoreAI",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Dashboard: one summary per page (cached in localStorage) ─────────────────

/** A check that needs work on a page, kept for "Fix first". */
export interface PageIssue {
  id: string;
  status: "warning" | "fail";
  /** Points it would add to this page. */
  gain: number;
}

export interface PageScoreSummary {
  /** 0–100. Null when the gate blocks the page or nothing could be scored. */
  score: number | null;
  label: ScoreLabel | null;
  blocked: boolean;
  /** Empty when not blocked. */
  gateReason: string;
  categories: Record<Category, Subtotal>;
  issues: PageIssue[];
  /** P5: true when the page serves Markdown (any credit), false when it doesn't; null when it wasn't checked. */
  servesMarkdown: boolean | null;
  /** Points a meta description would add (half of P9); 0 when the page has one. Missing in summaries cached before Phase 9. */
  descriptionGain?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarisePageReport(report: PageReport): PageScoreSummary {
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c, { earned: round2(report.categories[c].earned), max: round2(report.categories[c].max) }]),
  ) as Record<Category, Subtotal>;
  const issues: PageIssue[] = report.gate.blocked
    ? []
    : report.outcomes
        .filter((o) => o.result.state === "scored" && (o.result.status === "warning" || o.result.status === "fail"))
        .map((o) => ({ id: o.check.id, status: o.result.status as PageIssue["status"], gain: round2(Math.max(0, o.maxPoints - o.points)) }));
  const p5 = report.outcomes.find((o) => o.check.id === "read.markdown-page")?.result;
  const p9 = report.outcomes.find((o) => o.check.id === "understand.title-meta");
  const noDescription = !report.gate.blocked && p9?.result.state === "scored" && (p9.result.details ?? []).includes(DESCRIPTION_MISSING);
  return {
    score: report.gate.blocked ? null : report.score,
    label: report.gate.blocked || report.score === null ? null : labelForPct(report.score),
    blocked: report.gate.blocked,
    gateReason: report.gate.reason,
    categories,
    issues,
    servesMarkdown: p5?.state === "scored" ? p5.credit > 0 : null,
    descriptionGain: noDescription && p9 ? round2(p9.maxPoints / 2) : 0,
  };
}

// ── Dashboard: "Fix first", grouped by issue (plan section 6.4) ──────────────

const PAGE_CHECK_META = new Map<string, CheckMeta>(PAGE_CHECKS.map((c) => [c.id, checkMeta(c)]));

export interface IssueGroup {
  id: string;
  title: string;
  owner: Owner;
  display: "fix" | "improve";
  scope: "page" | "site";
  /** Pages with this issue (page issues only). */
  pageIds: string[];
  /** Average points per page, rounded ("+N pts each"). 0 for site issues. */
  gainEach: number;
  /** For ordering: the points it would add across the site. */
  weight: number;
  /** The site check's result (site issues only), for its developer note. */
  row?: CheckRowModel;
  /** A fix the dashboard can generate for every page at once ("Generate for all"). */
  bulk?: "meta-description";
}

/** A dashboard page as Fix first reads it. */
type FixFirstPage = { id: string; score: PageScoreSummary | null; fields?: { metaDescription: string | null } | null };

/**
 * "Meta description missing": the pages whose Meta Description field is empty,
 * for "Generate for all" (plan section 6.4). One part of P9, so it can show
 * next to P9's own row, which also covers the title.
 */
export function metaDescriptionGroup(pages: FixFirstPage[]): IssueGroup | null {
  const missing = pages
    .filter((p) => p.score && !p.score.blocked && !p.fields?.metaDescription)
    .map((p) => {
      // Summaries cached before Phase 9 have no descriptionGain: P9's own gain stands in.
      const gain = p.score!.descriptionGain ?? p.score!.issues.find((i) => i.id === "understand.title-meta")?.gain ?? 0;
      return { id: p.id, gain };
    })
    .filter((p) => p.gain > 0);
  if (missing.length === 0) return null;
  const total = missing.reduce((s, p) => s + p.gain, 0);
  const meta = PAGE_CHECK_META.get("understand.title-meta");
  return {
    id: "meta-description-missing",
    title: "Meta description missing",
    owner: meta?.owner ?? "author",
    display: "fix",
    scope: "page",
    pageIds: missing.map((p) => p.id),
    gainEach: Math.max(1, Math.round(total / missing.length)),
    weight: total,
    bulk: "meta-description",
  };
}

/** Page issues grouped by check across pages, biggest total gain first. */
export function groupPageIssues(pages: Array<{ id: string; score: PageScoreSummary | null }>): IssueGroup[] {
  const groups = new Map<string, { pageIds: string[]; gain: number; fail: boolean }>();
  for (const page of pages) {
    for (const issue of page.score?.issues ?? []) {
      const g = groups.get(issue.id) ?? { pageIds: [], gain: 0, fail: false };
      g.pageIds.push(page.id);
      g.gain += issue.gain;
      g.fail ||= issue.status === "fail";
      groups.set(issue.id, g);
    }
  }
  const out: IssueGroup[] = [];
  for (const [id, g] of groups) {
    const meta = PAGE_CHECK_META.get(id);
    const gainEach = Math.round(g.gain / g.pageIds.length);
    if (!meta || gainEach < 1) continue;
    out.push({
      id,
      title: meta.title,
      owner: meta.owner,
      display: g.fail ? "fix" : "improve",
      scope: "page",
      pageIds: g.pageIds,
      gainEach,
      weight: g.gain,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Site checks that need work, as "Fix first" rows. They affect every page, so they come first. */
export function siteIssueGroups(outcomes: CheckOutcome[]): IssueGroup[] {
  return outcomes
    .map(toCheckRow)
    .filter(needsWork)
    .map((r) => ({
      id: r.id,
      title: r.title,
      owner: r.owner,
      display: r.display as "fix" | "improve",
      scope: "site" as const,
      pageIds: [],
      gainEach: 0,
      weight: Number.POSITIVE_INFINITY,
      row: r,
    }));
}

/**
 * "Fix first": site issues, then page issues by total gain. Markdown shows
 * once: when pages have been checked, P5's row (with its page count and
 * "+N pts each") stands in for S3's and comes right after the site issues,
 * since it's one developer fix for every page.
 */
export function fixFirstGroups(siteOutcomes: CheckOutcome[] | null, pages: FixFirstPage[]): IssueGroup[] {
  const site = siteOutcomes ? siteIssueGroups(siteOutcomes) : [];
  const description = metaDescriptionGroup(pages);
  const page = [...groupPageIssues(pages), ...(description ? [description] : [])].sort((a, b) => b.weight - a.weight);
  const p5 = page.find((g) => g.id === "read.markdown-page");
  if (!p5) return [...site, ...page];
  return [...site.filter((g) => g.id !== "read.markdown-site"), p5, ...page.filter((g) => g !== p5)];
}

/** Plain text for a developer about one issue across pages (or the whole site). */
export function issueNote(group: IssueGroup, pages: Array<{ id: string; name: string; pageUrl: string }>, siteUrl: string): string {
  if (group.row) return developerNote(group.row, siteUrl);
  const meta = PAGE_CHECK_META.get(group.id);
  const affected = pages.filter((p) => group.pageIds.includes(p.id));
  return [
    `${group.title} (${meta?.ref ?? group.id}): ${plural(affected.length, "page")}`,
    meta ? `Why it matters: ${meta.why}` : "",
    "Pages:",
    ...affected.map((p) => `- ${p.name}: ${p.pageUrl}`),
    "\nFrom Is It Agent-Ready? for SitecoreAI",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Checks the dashboard can't run: P3 needs the draft, P7 (PageSpeed) runs on request in the panel. */
const PANEL_ONLY = new Set(["read.no-js-content", "read.speed"]);

/** Every page check's title, by category: the dashboard's "What's included" list. */
export function pageCheckTitles(category: Category): string[] {
  return [...PAGE_CHECK_META.values()]
    .filter((m) => m.category === category)
    .map((m) => (m.tier === "bonus" ? `${m.title} (bonus)` : PANEL_ONLY.has(m.id) ? `${m.title} (Page Builder panel only)` : m.title));
}
