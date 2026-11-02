// ─────────────────────────────────────────────────────────────────────────────
// Check registry (plan section 5.2). Every check the engine runs, in display
// order. Checks from later phases are added when they're built:
//   Phase 6: S1, S3–S6, S8–S12 (S2 is upgraded there)
//   Phase 7: P5 read.markdown-page, P6 read.markdown-quality
// ─────────────────────────────────────────────────────────────────────────────

import { READ_PAGE_CHECKS } from "./page/read";
import { REACH_PAGE_CHECKS } from "./page/reach";
import { TRUST_PAGE_CHECKS } from "./page/trust";
import { UNDERSTAND_PAGE_CHECKS } from "./page/understand";
import { UNDERSTAND_SITE_CHECKS } from "./site/org-schema";
import { REACH_SITE_CHECKS } from "./site/reach";
import type { CheckDef, CheckMeta, PageContext, SiteContext } from "./types";

export const PAGE_CHECKS: CheckDef<PageContext>[] = [
  ...REACH_PAGE_CHECKS,
  ...READ_PAGE_CHECKS,
  ...UNDERSTAND_PAGE_CHECKS,
  ...TRUST_PAGE_CHECKS,
];

export const SITE_CHECKS: CheckDef<SiteContext>[] = [...REACH_SITE_CHECKS, ...UNDERSTAND_SITE_CHECKS];

/** The descriptive part of a check (no functions), e.g. for the UI and outcomes. */
export function checkMeta<C>(def: CheckDef<C>): CheckMeta {
  const meta: Partial<CheckDef<C>> = { ...def };
  delete meta.applies;
  delete meta.run;
  return meta as CheckMeta;
}
