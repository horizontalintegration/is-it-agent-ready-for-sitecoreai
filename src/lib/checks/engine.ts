// ─────────────────────────────────────────────────────────────────────────────
// Engine entry points. UI-agnostic: they take a context and return a report.
// ─────────────────────────────────────────────────────────────────────────────

import { runGate } from "./gate";
import { checkMeta, PAGE_CHECKS, SITE_CHECKS } from "./registry";
import { notApplicable } from "./result";
import { scoreResults } from "./scoring";
import type { CheckDef, CheckResult, PageContext, PageReport, SiteContext, SiteReport } from "./types";

function runAll<C>(checks: CheckDef<C>[], ctx: C) {
  return checks.map((def) => {
    const result: CheckResult = def.applies(ctx)
      ? def.run(ctx)
      : notApplicable("Not applicable", "This check doesn't apply here.");
    return { check: checkMeta(def), result };
  });
}

/** Page checks for one page. A page the gate blocks gets no score. */
export function runPageChecks(ctx: PageContext): PageReport {
  const gate = runGate(ctx.fields, ctx.html);
  if (gate.blocked) return { gate, ...scoreResults([]) };
  return { gate, ...scoreResults(runAll(PAGE_CHECKS, ctx)) };
}

/** Site checks, computed once per site. Scored separately from the pages. */
export function runSiteChecks(ctx: SiteContext): SiteReport {
  return scoreResults(runAll(SITE_CHECKS, ctx));
}
