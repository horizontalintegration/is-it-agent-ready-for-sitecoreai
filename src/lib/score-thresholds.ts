// ─────────────────────────────────────────────────────────────────────────────
// One set of score thresholds for the panel and the dashboard (plan section 4):
// Agent-ready ≥ 80 · Almost there 60–79 · Not ready < 60.
// ─────────────────────────────────────────────────────────────────────────────

/** Percentage at or above which a score is Agent-ready. */
export const READY_PCT = 80;

/** Percentage at or above which a score is Almost there. */
export const ALMOST_PCT = 60;

export type ScoreLabel = "not-ready" | "almost-there" | "agent-ready";

export const SCORE_LABELS: ScoreLabel[] = ["not-ready", "almost-there", "agent-ready"];

/** The verdict as the UI shows it. */
export const LABEL_TEXT: Record<ScoreLabel, string> = {
  "not-ready": "Not ready",
  "almost-there": "Almost there",
  "agent-ready": "Agent-ready",
};

/** Label for a 0–100 percentage. */
export function labelForPct(pct: number): ScoreLabel {
  if (pct < ALMOST_PCT) return "not-ready";
  if (pct < READY_PCT) return "almost-there";
  return "agent-ready";
}
