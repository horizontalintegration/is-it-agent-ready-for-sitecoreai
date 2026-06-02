// ─────────────────────────────────────────────────────────────────────────────
// Site-level roll-up of per-page SiteScoreResults for the dashboard Overview.
//
// Every number here is derived purely from the rows the hook already produced —
// no engine changes. Percentages match the matrix's per-row pct (total/maxTotal)
// so the hero, category cards, and table never disagree.
// ─────────────────────────────────────────────────────────────────────────────

import type { PageMatrixRow } from "@/types/dashboard";
import type { SiteScoreResult } from "@/lib/rule-engine/site-score";

export type ScoreLabel = SiteScoreResult["label"];
export type PillarKey = keyof SiteScoreResult["pillars"];

// Display order + the per-category max contribution (mirrors site-score MAX_PILLARS).
export const PILLAR_ORDER: PillarKey[] = [
  "crawlability",
  "structured",
  "answerability",
  "authority",
  "retrievability",
];

// A page "fails" a category when it scores below this fraction of the category max.
const FAIL_THRESHOLD = 0.4;

// Mirror site-score's labelFor thresholds so the hero label matches per-row labels.
export function labelForPct(pct: number): ScoreLabel {
  if (pct < 40) return "critical";
  if (pct <= 70) return "warning";
  return "good";
}

export interface CategoryAggregate {
  key: PillarKey;
  /** Mean readiness across pages where this category applies (0–100), or null if none. */
  pct: number | null;
  label: ScoreLabel | null;
  /** Pages scoring below FAIL_THRESHOLD for this category. */
  failingCount: number;
  /** Pages where this category was scored at all (structured is conditional). */
  applicableCount: number;
}

export interface SiteAggregate {
  totalCount: number;
  scannedCount: number;
  scanningCount: number;
  errorCount: number;
  /** Fraction of rows that have finished (scanned or errored) — for the progress bar. */
  progress: number;
  /** Mean readiness across scanned pages (0–100), or null if nothing scanned yet. */
  overallPct: number | null;
  overallLabel: ScoreLabel | null;
  counts: { critical: number; warning: number; good: number };
  categories: CategoryAggregate[];
}

function pctOf(score: SiteScoreResult): number {
  return score.maxTotal > 0 ? (score.total / score.maxTotal) * 100 : 0;
}

export function aggregateSite(pages: PageMatrixRow[]): SiteAggregate {
  const totalCount = pages.length;
  const scannedRows = pages.filter((p) => p.score !== null);
  const scannedCount = scannedRows.length;
  const scanningCount = pages.filter((p) => p.scanStatus === "scanning").length;
  const errorCount = pages.filter((p) => p.scanStatus === "error").length;
  const done = scannedCount + errorCount;

  const counts = { critical: 0, warning: 0, good: 0 };
  let pctSum = 0;
  for (const row of scannedRows) {
    const s = row.score as SiteScoreResult;
    counts[s.label] += 1;
    pctSum += pctOf(s);
  }

  const overallPct = scannedCount > 0 ? pctSum / scannedCount : null;

  const categories: CategoryAggregate[] = PILLAR_ORDER.map((key) => {
    let sum = 0;
    let applicableCount = 0;
    let failingCount = 0;
    for (const row of scannedRows) {
      const s = row.score as SiteScoreResult;
      const max = s.maxPillars[key];
      if (max <= 0) continue; // category didn't apply to this page
      applicableCount += 1;
      const frac = s.pillars[key] / max;
      sum += frac * 100;
      if (frac < FAIL_THRESHOLD) failingCount += 1;
    }
    const pct = applicableCount > 0 ? sum / applicableCount : null;
    return {
      key,
      pct,
      label: pct === null ? null : labelForPct(pct),
      failingCount,
      applicableCount,
    };
  });

  return {
    totalCount,
    scannedCount,
    scanningCount,
    errorCount,
    progress: totalCount > 0 ? done / totalCount : 0,
    overallPct,
    overallLabel: overallPct === null ? null : labelForPct(overallPct),
    counts,
    categories,
  };
}

/** Scanned pages sorted by readiness ascending — the "fix these first" list. */
export function worstPages(pages: PageMatrixRow[], limit: number): PageMatrixRow[] {
  return pages
    .filter((p) => p.score !== null)
    .sort((a, b) => pctOf(a.score as SiteScoreResult) - pctOf(b.score as SiteScoreResult))
    .slice(0, limit);
}
