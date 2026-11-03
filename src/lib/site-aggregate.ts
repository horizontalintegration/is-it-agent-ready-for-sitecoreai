// ─────────────────────────────────────────────────────────────────────────────
// Site-level roll-up of per-page scores for the dashboard Overview.
//
// Every number here is derived purely from the rows the hook already produced —
// no engine changes. Percentages match the matrix's per-row score, so the hero,
// category cards, and table never disagree. Pages the gate blocks (noindex /
// nosnippet) have no score: they're counted separately and left out of averages.
// ─────────────────────────────────────────────────────────────────────────────

import type { PageMatrixRow } from "@/types/dashboard";
import { CATEGORIES, type Category } from "@/lib/checks/types";
import { labelForPct, type ScoreLabel } from "@/lib/score-thresholds";

export { labelForPct, type ScoreLabel };

// A page "fails" a category when it scores below this fraction of the category max.
const FAIL_THRESHOLD = 0.4;

export interface CategoryAggregate {
  key: Category;
  /** Mean readiness across pages where this category was scored (0–100), or null if none. */
  pct: number | null;
  label: ScoreLabel | null;
  /** Pages scoring below FAIL_THRESHOLD for this category ("N pages need work"). */
  failingCount: number;
  /** Pages where this category was scored at all. */
  applicableCount: number;
}

export interface SiteAggregate {
  totalCount: number;
  /** Rows with a finished scan (scored or blocked). */
  scannedCount: number;
  scanningCount: number;
  errorCount: number;
  /** Pages the gate blocks (noindex / nosnippet). Not in the averages. */
  blockedCount: number;
  /** Fraction of rows that have finished (scanned or errored) — for the progress bar. */
  progress: number;
  /** Mean readiness across scored pages (0–100), or null if nothing scored yet. */
  overallPct: number | null;
  overallLabel: ScoreLabel | null;
  counts: Record<ScoreLabel, number>;
  categories: CategoryAggregate[];
  /** P5 across scored pages: how many serve Markdown, of those it was checked on. */
  markdown: { served: number; checked: number };
}

/** The page's 0–100 score, or null when unscanned, blocked or unscorable. */
export function pageScore(row: PageMatrixRow): number | null {
  return row.score?.score ?? null;
}

export function aggregateSite(pages: PageMatrixRow[]): SiteAggregate {
  const totalCount = pages.length;
  const finished = pages.filter((p) => p.score !== null);
  const scoredRows = finished.filter((p) => pageScore(p) !== null);
  const scanningCount = pages.filter((p) => p.scanStatus === "scanning").length;
  const errorCount = pages.filter((p) => p.scanStatus === "error").length;
  const blockedCount = finished.filter((p) => p.score?.blocked).length;
  const done = finished.length + errorCount;

  const counts: Record<ScoreLabel, number> = { "not-ready": 0, "almost-there": 0, "agent-ready": 0 };
  let pctSum = 0;
  for (const row of scoredRows) {
    const pct = pageScore(row)!;
    counts[labelForPct(pct)] += 1;
    pctSum += pct;
  }

  const overallPct = scoredRows.length > 0 ? pctSum / scoredRows.length : null;

  const categories: CategoryAggregate[] = CATEGORIES.map((key) => {
    let sum = 0;
    let applicableCount = 0;
    let failingCount = 0;
    for (const row of scoredRows) {
      const { earned, max } = row.score!.categories[key];
      if (max <= 0) continue; // nothing in this category was scored on this page
      applicableCount += 1;
      const frac = earned / max;
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
    scannedCount: finished.length,
    scanningCount,
    errorCount,
    blockedCount,
    progress: totalCount > 0 ? done / totalCount : 0,
    overallPct,
    overallLabel: overallPct === null ? null : labelForPct(overallPct),
    counts,
    categories,
    markdown: {
      served: scoredRows.filter((r) => r.score!.servesMarkdown === true).length,
      checked: scoredRows.filter((r) => r.score!.servesMarkdown !== null && r.score!.servesMarkdown !== undefined).length,
    },
  };
}
