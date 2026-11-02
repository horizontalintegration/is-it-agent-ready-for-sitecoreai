// ─────────────────────────────────────────────────────────────────────────────
// Tier/pool scoring (plan section 5.1).
//
//   Essential    80-point pool
//   Recommended  20-point pool
//   Bonus        up to +5; the total is capped at 100
//
// Each pool is split across the checks that are scored, in proportion to their
// weight (default 1). A check earns credit × its share. N/A and not-checked
// results are left out of the pools, never failed.
//
// When Essential or Recommended has no scored checks, the other one is scaled
// up so the base still totals 100.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATEGORIES,
  TIERS,
  type CheckMeta,
  type CheckOutcome,
  type CheckResult,
  type ScoreBreakdown,
  type Source,
  type Subtotal,
  type Tier,
} from "./types";

export const TIER_POOLS: Record<Exclude<Tier, "bonus">, number> = {
  essential: 80,
  recommended: 20,
};
export const BONUS_MAX = 5;
export const MAX_SCORE = 100;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function emptySubtotals<K extends string>(keys: K[]): Record<K, Subtotal> {
  return Object.fromEntries(keys.map((k) => [k, { earned: 0, max: 0 }])) as Record<K, Subtotal>;
}

export function scoreResults(
  items: Array<{ check: CheckMeta; result: CheckResult; sources?: Source[] }>,
): ScoreBreakdown {
  const weightOf = (c: CheckMeta) => (c.weight === undefined ? 1 : Math.max(0, c.weight));
  const scored = items.filter((i) => i.result.state === "scored");

  const tierWeight = (t: Tier) =>
    scored.filter((i) => i.check.tier === t).reduce((s, i) => s + weightOf(i.check), 0);
  const weights: Record<Tier, number> = {
    essential: tierWeight("essential"),
    recommended: tierWeight("recommended"),
    bonus: tierWeight("bonus"),
  };

  // Base pools with no scored checks drop out; the rest scale up to 100.
  const basePool =
    (weights.essential > 0 ? TIER_POOLS.essential : 0) +
    (weights.recommended > 0 ? TIER_POOLS.recommended : 0);
  const scale = basePool > 0 ? MAX_SCORE / basePool : 0;

  const poolFor = (t: Tier): number => {
    if (t === "bonus") return BONUS_MAX;
    return TIER_POOLS[t] * scale;
  };

  const outcomes: CheckOutcome[] = items.map(({ check, result, sources = check.sources }) => {
    if (result.state !== "scored" || weights[check.tier] === 0) {
      return { check, result, sources, points: 0, maxPoints: 0 };
    }
    const maxPoints = (poolFor(check.tier) * weightOf(check)) / weights[check.tier];
    return { check, result, sources, points: clamp01(result.credit) * maxPoints, maxPoints };
  });

  const categories = emptySubtotals(CATEGORIES);
  const tiers = emptySubtotals(TIERS);
  for (const o of outcomes) {
    if (o.maxPoints === 0) continue;
    categories[o.check.category].earned += o.points;
    categories[o.check.category].max += o.maxPoints;
    tiers[o.check.tier].earned += o.points;
    tiers[o.check.tier].max += o.maxPoints;
  }

  // Bonus alone can't make a score: there's nothing to add it to.
  const score =
    basePool === 0
      ? null
      : Math.round(Math.min(MAX_SCORE, tiers.essential.earned + tiers.recommended.earned + tiers.bonus.earned));

  return { score, outcomes, categories, tiers };
}
