// ─────────────────────────────────────────────────────────────────────────────
// AI citations (plan section 8). Two layers, clearly labelled:
//   Layer 1  a readiness estimate per engine, from the site and page checks
//            (no AI call, see readiness.ts)
//   Layer 2  citation probes: real questions asked to Claude with live web
//            search. What the search returned and what the answer cited are
//            kept as evidence; Found and Cited are computed from it in code
//            (classify.ts), never from the model's own claims.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What one probe saw, as returned by /api/citation-probe and cached for 7
 * days. Raw URLs, not verdicts: which hosts count as the site's own can change
 * after the run without asking again.
 */
export interface ProbeEvidence {
  question: string;
  /** At least one search returned results (an error-only search doesn't count). */
  searched: boolean;
  /** Every URL in the web_search_tool_result blocks, in order. */
  resultUrls: string[];
  /** Every URL in the answer's web_search_result_location citations, in order. */
  citedUrls: string[];
  /** The queries Claude searched for. */
  queries: string[];
  /** error_code of searches that failed (HTTP 200 with an error object). */
  searchErrors: string[];
  /** The start of the answer the user would see. */
  excerpt: string;
  /** Every model in the chain declined the request. */
  refused: boolean;
  /** The first attempt didn't search, so the question was asked once more. */
  retried: boolean;
  model: string;
  /** ISO time of the run (of the cached run when served from a cache). */
  ranAt: string;
}

/** One question's result for the site. */
export interface ProbeOutcome {
  /** Null when no search ran: unknown, not false. */
  found: boolean | null;
  cited: boolean | null;
  /** The page's own URL (not just the domain) was found / cited. */
  pageFound: boolean;
  pageCited: boolean;
  /** Other hosts cited in the answer, first citation first. */
  citedInstead: string[];
}

/** A completed probe run of one page, kept in the history. */
export interface ProbeRun {
  at: string;
  /** Identifies the question set (and country), so only like runs are compared. */
  setKey: string;
  country: string | null;
  evidence: ProbeEvidence[];
}

/** Demo mode's question set and runs for the AI citations tab. */
export interface CitationDemo {
  questions: string[];
  country: string | null;
  runs: ProbeRun[];
}

/** The Layer 1 engines, in the mockup's order. */
export type CitationEngine = "chatgpt" | "claude" | "perplexity" | "gemini" | "copilot";

export const ENGINE_TEXT: Record<CitationEngine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Copilot",
};

export type Readiness = "ready" | "limited" | "blocked" | "unknown";

export const READINESS_TEXT: Record<Readiness, string> = {
  ready: "Ready",
  limited: "Limited",
  blocked: "Blocked",
  unknown: "Checking…",
};

export interface EngineEstimate {
  engine: CitationEngine;
  readiness: Readiness;
  reasons: string[];
}

/** Shown under every probe result (plan section 8, item 7). */
export const PROBE_CAVEAT = "AI answers vary by time, location and engine. This is a sample, not a ranking.";

/** Probe results are reused for this long, in the browser and on the server. */
export const PROBE_CACHE_DAYS = 7;
export const PROBE_CACHE_MS = PROBE_CACHE_DAYS * 24 * 60 * 60 * 1000;

/** Countries the probe can ask from (web search's approximate user location). */
export const PROBE_COUNTRIES: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IE", label: "Ireland" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "IN", label: "India" },
];

export const QUESTION_MIN = 5;
export const QUESTION_MAX = 10;
export const QUESTION_MAX_CHARS = 300;
