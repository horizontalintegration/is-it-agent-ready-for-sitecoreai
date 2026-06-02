// ─────────────────────────────────────────────────────────────────────────────
// AI Citation forecast — per-page prediction of how likely each AI answer engine
// is to cite the page. Unlike the deterministic site score, this is an AI-reasoned
// synthesis (one Claude call) and is presented as guidance, not a measurement.
// ─────────────────────────────────────────────────────────────────────────────

/** The four answer engines we forecast for. */
export type CitationSystem = "chatgpt" | "perplexity" | "copilot" | "gemini";

export const CITATION_SYSTEMS: { key: CitationSystem; label: string }[] = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "perplexity", label: "Perplexity" },
  { key: "copilot", label: "Copilot" },
  { key: "gemini", label: "Gemini" },
];

export interface CitationSystemForecast {
  system: CitationSystem;
  /** 1–5 star likelihood of this engine citing the page. */
  stars: number;
  /** One- or two-sentence, system-specific reasoning. */
  reasoning: string;
}

export interface CitationForecast {
  pageUrl: string;
  systems: CitationSystemForecast[];
  /** Plain-language summary of the single highest-leverage improvement. */
  topRecommendation: string;
  /** ISO timestamp stamped client-side when the forecast was received. */
  generatedAt: string;
}

/** Error shape returned by the /api/citation-forecast endpoint. */
export interface CitationForecastError {
  error: string;
  detail?: string;
}
