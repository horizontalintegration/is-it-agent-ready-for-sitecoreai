// ─────────────────────────────────────────────────────────────────────────────
// One set of score thresholds for the panel and the dashboard (plan section 4):
// Agent-ready ≥ 80 · Almost there 60–79 · Not ready < 60.
// The labels keep their pre-v2 names until the Phase 5 UI renames them.
// ─────────────────────────────────────────────────────────────────────────────

/** Percentage at or above which a score is "good" (Agent-ready). */
export const READY_PCT = 80;

/** Percentage at or above which a score is "warning" (Almost there). */
export const ALMOST_PCT = 60;

export type ScoreLabel = "critical" | "warning" | "good";

/** Label for a 0–100 percentage. */
export function labelForPct(pct: number): ScoreLabel {
  if (pct < ALMOST_PCT) return "critical";
  if (pct < READY_PCT) return "warning";
  return "good";
}
