// ─────────────────────────────────────────────────────────────────────────────
// Adapter from the engine's reports to what the pre-v2 UI renders (panel check
// rows, dashboard matrix rows). Temporary: the Phase 5 UI reads the reports
// directly and this file goes.
// ─────────────────────────────────────────────────────────────────────────────

import { labelForPct, type ScoreLabel } from "@/lib/score-thresholds";
import {
  CATEGORIES,
  type Category,
  type CheckOutcome,
  type CheckStatus,
  type PageReport,
  type ResultState,
  type Source,
  type Subtotal,
  type Tier,
} from "./types";

export const CATEGORY_META: Record<Category, { label: string; question: string }> = {
  reach: { label: "Reach", question: "Can AI agents get to it?" },
  read: { label: "Read", question: "Can they read it?" },
  understand: { label: "Understand", question: "Do they understand it?" },
  trust: { label: "Trust", question: "Will they trust and cite it?" },
};

// ── Panel: one row per check ──────────────────────────────────────────────────

export interface CheckRowModel {
  id: string;
  title: string;
  tier: Tier;
  state: ResultState;
  status: CheckStatus;
  points: number;
  maxPoints: number;
  /** Points this check would add if fixed ("+N pts"). 0 when it isn't scored. */
  gain: number;
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
  return {
    id: check.id,
    title: check.title,
    tier: check.tier,
    state: result.state,
    status: result.status,
    points: o.points,
    maxPoints: o.maxPoints,
    gain: Math.max(0, o.maxPoints - o.points),
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

// ── Dashboard: one summary per page (cached in localStorage) ─────────────────

export interface PageScoreSummary {
  /** 0–100. Null when the gate blocks the page or nothing could be scored. */
  score: number | null;
  label: ScoreLabel | null;
  blocked: boolean;
  /** Empty when not blocked. */
  gateReason: string;
  categories: Record<Category, Subtotal>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarisePageReport(report: PageReport): PageScoreSummary {
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c, { earned: round2(report.categories[c].earned), max: round2(report.categories[c].max) }]),
  ) as Record<Category, Subtotal>;
  return {
    score: report.gate.blocked ? null : report.score,
    label: report.gate.blocked || report.score === null ? null : labelForPct(report.score),
    blocked: report.gate.blocked,
    gateReason: report.gate.reason,
    categories,
  };
}
