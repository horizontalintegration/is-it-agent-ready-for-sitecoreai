// ─────────────────────────────────────────────────────────────────────────────
// Engine entry points. UI-agnostic: they take a context and return a report.
// ─────────────────────────────────────────────────────────────────────────────

import { runGate } from "./gate";
import { checkMeta, PAGE_CHECKS, SITE_CHECKS } from "./registry";
import { notApplicable } from "./result";
import { scoreResults } from "./scoring";
import type {
  BodySource,
  CheckDef,
  CheckResult,
  PageContext,
  PageReport,
  SiteContext,
  SiteReport,
  Source,
} from "./types";

function runAll<C>(checks: CheckDef<C>[], ctx: C) {
  return checks.map((def) => {
    const result: CheckResult = def.applies(ctx)
      ? def.run(ctx)
      : notApplicable("Not applicable", "This check doesn't apply here.");
    return { check: checkMeta(def), result };
  });
}

/**
 * The sources a page check actually read: "draft" means the body, so it's
 * "live" without a draft, and the AI checks judged the body too.
 */
export function resolveSources(sources: Source[], bodySource: BodySource): Source[] {
  const out = sources.flatMap((s): Source[] => (s === "draft" ? [bodySource] : s === "ai" ? ["ai", bodySource] : [s]));
  return [...new Set(out)];
}

/** Page checks for one page. A page the gate blocks gets no score. */
export function runPageChecks(ctx: PageContext): PageReport {
  const gate = runGate(ctx.fields, ctx.html);
  if (gate.blocked) return { gate, ...scoreResults([]) };
  const items = runAll(PAGE_CHECKS, ctx).map((i) => ({ ...i, sources: resolveSources(i.check.sources, ctx.bodySource) }));
  return { gate, ...scoreResults(items) };
}

/** Site checks, computed once per site. Scored separately from the pages. */
export function runSiteChecks(ctx: SiteContext): SiteReport {
  return scoreResults(runAll(SITE_CHECKS, ctx));
}
