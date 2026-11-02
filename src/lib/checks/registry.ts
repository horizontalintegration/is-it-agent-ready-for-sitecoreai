// ─────────────────────────────────────────────────────────────────────────────
// Check registry (plan section 5.2). Every check the engine runs, in display
// order. Checks from later phases are added when they're built.
// ─────────────────────────────────────────────────────────────────────────────

import { READ_PAGE_CHECKS } from "./page/read";
import { REACH_PAGE_CHECKS } from "./page/reach";
import { TRUST_PAGE_CHECKS } from "./page/trust";
import { UNDERSTAND_PAGE_CHECKS } from "./page/understand";
import { orgSchema } from "./site/org-schema";
import { agentProtocols, commerceProtocols, linkHeaders, llmsTxt, markdownSite } from "./site/read";
import { aiBotAccess, contentSignalsCheck, notFound, robotsAiRules, sitemap } from "./site/reach";
import { trustPages } from "./site/trust";
import type { CheckDef, CheckMeta, PageContext, SiteContext } from "./types";

export const PAGE_CHECKS: CheckDef<PageContext>[] = [
  ...REACH_PAGE_CHECKS,
  ...READ_PAGE_CHECKS,
  ...UNDERSTAND_PAGE_CHECKS,
  ...TRUST_PAGE_CHECKS,
];

/** S1–S12 in plan order, as the Agent access checklist lists them. */
export const SITE_CHECKS: CheckDef<SiteContext>[] = [
  aiBotAccess, // S1
  robotsAiRules, // S2
  markdownSite, // S3
  sitemap, // S4
  llmsTxt, // S5
  trustPages, // S6
  orgSchema, // S7
  notFound, // S8
  contentSignalsCheck, // S9
  linkHeaders, // S10
  agentProtocols, // S11
  commerceProtocols, // S12
];

/** The descriptive part of a check (no functions), e.g. for the UI and outcomes. */
export function checkMeta<C>(def: CheckDef<C>): CheckMeta {
  const meta: Partial<CheckDef<C>> = { ...def };
  delete meta.applies;
  delete meta.run;
  return meta as CheckMeta;
}
