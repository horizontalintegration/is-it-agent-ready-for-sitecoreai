// ─────────────────────────────────────────────────────────────────────────────
// Check registry types (plan section 5). The engine is UI-agnostic: checks get
// pre-fetched data in a context object and return a result with a 0–1 credit.
// Points come from the tier pools in scoring.ts, never from the check itself.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AiResults,
  OrganizationInfo,
  ParsedHtml,
  PsiResult,
  RobotsTxt,
} from "@/lib/rule-engine/types";

export type Category = "reach" | "read" | "understand" | "trust";
export type Tier = "essential" | "recommended" | "bonus";
export type Scope = "site" | "page";
/** Where a check's data comes from. Shown as a chip in the Phase 5 UI. */
export type Source = "draft" | "live" | "fields" | "ai" | "psi" | "probe";
/** Who can fix it: drives the "You can fix" / "Developer" badge. */
export type Owner = "author" | "developer";
export type FixAction = "generate" | "apply-field" | "copy-snippet" | "send-to-developer";
/** Site type setting (dashboard, per site). Decides which Bonus protocol checks apply. */
export type SiteType = "content" | "commerce" | "app";

export const CATEGORIES: Category[] = ["reach", "read", "understand", "trust"];
export const TIERS: Tier[] = ["essential", "recommended", "bonus"];

export type CheckStatus = "pass" | "warning" | "fail" | "info";

/**
 * - `scored`: the credit counts toward the score.
 * - `not-applicable`: the check doesn't apply to this page or site. Excluded, never failed.
 * - `not-checked`: its data isn't available (AI pending, PageSpeed not run, fetch
 *   failed). Excluded like N/A, but shown so the user can run it.
 */
export type ResultState = "scored" | "not-applicable" | "not-checked";

export interface CheckResult {
  state: ResultState;
  /** 0–1. Only counts when `state` is "scored". */
  credit: number;
  status: CheckStatus;
  /** What was found, e.g. "58 chars". */
  value: string;
  /** Short verdict. */
  message: string;
  /** Actionable next step; empty when passing. */
  fixSuggestion: string;
  details: string[];
  /** Items needing attention, shown in their own list. */
  flaggedItems?: string[];
  /** Ready-to-paste snippet (e.g. JSON-LD). */
  codePreview?: string;
}

export interface CheckDef<Ctx> {
  /** e.g. "reach.canonical" */
  id: string;
  /** Plan ID, e.g. "P2" or "S7". */
  ref: string;
  /** Outcome phrasing, e.g. "Canonical points to this page". */
  title: string;
  /** One sentence on why it matters to AI. */
  why: string;
  category: Category;
  tier: Tier;
  scope: Scope;
  sources: Source[];
  owner: Owner;
  fix?: FixAction;
  /** Multiplier on this check's share of its tier pool. Default 1. */
  weight?: number;
  /** False when the check doesn't apply (N/A). Data-dependent N/A can also come from `run`. */
  applies(ctx: Ctx): boolean;
  /** Synchronous: all data is fetched before the checks run. */
  run(ctx: Ctx): CheckResult;
}

// ── Contexts ──────────────────────────────────────────────────────────────────

/**
 * Sitecore fields the page checks read. The panel and the dashboard read the
 * same fields by the same names, so the same page scores the same in both.
 */
export interface PageFields {
  /** Raw title field (no page-name fallback). */
  metaTitle: string | null;
  metaDescription: string | null;
  /** SXA "Robots Meta Tag" field, e.g. "noindex, follow". */
  robotsMetaTag: string | null;
  /** __Updated, raw (Sitecore "yyyyMMddTHHmmssZ" or ISO). */
  updated: string | null;
}

export interface PageContext {
  pageUrl: string;
  isHomePage: boolean;
  templateName: string | null;
  /** Null when the Sitecore fields aren't loaded. */
  fields: PageFields | null;
  /** Live HTML. Null when it hasn't been fetched or the fetch failed. */
  html: ParsedHtml | null;
  ai: AiResults | null;
  psi: PsiResult | null;
  /** For the fix snippets. */
  organization: OrganizationInfo;
}

export interface SiteContext {
  /** Site origin, e.g. "https://www.example.com". */
  siteUrl: string;
  siteType: SiteType;
  /** Organization data for the fix snippet: config with site fallbacks. */
  organization: OrganizationInfo;
  /**
   * Organization identity set explicitly in config (NEXT_PUBLIC_ORG_*). It is
   * the expected value: a schema naming someone else is a warning. Null fields
   * mean "not configured".
   */
  expectedOrganization: { name: string | null; url: string | null };
  /** Home page live HTML. Null when it couldn't be fetched. */
  home: ParsedHtml | null;
  robotsTxt: RobotsTxt | null;
}

// ── Engine output ─────────────────────────────────────────────────────────────

export type CheckMeta = Omit<CheckDef<unknown>, "applies" | "run">;

export interface CheckOutcome {
  check: CheckMeta;
  result: CheckResult;
  /** Points earned: credit × maxPoints. 0 unless scored. */
  points: number;
  /** This check's share of its tier pool. 0 unless scored. */
  maxPoints: number;
}

export interface Subtotal {
  earned: number;
  max: number;
}

export interface ScoreBreakdown {
  /** 0–100, rounded. Null when nothing could be scored yet. */
  score: number | null;
  outcomes: CheckOutcome[];
  categories: Record<Category, Subtotal>;
  tiers: Record<Tier, Subtotal>;
}

export interface GateResult {
  blocked: boolean;
  /** Empty when not blocked. */
  reason: string;
}

export interface PageReport extends ScoreBreakdown {
  gate: GateResult;
}

export type SiteReport = ScoreBreakdown;
