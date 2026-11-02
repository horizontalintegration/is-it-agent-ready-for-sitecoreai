import type { PageScoreSummary } from "@/lib/checks/view-model";
import type { ScoreLabel } from "@/lib/score-thresholds";
import type { PageFields } from "@/lib/checks/types";

export type RowScanStatus = "idle" | "scanning" | "scanned" | "error";

export interface PageMatrixRow {
  id: string;
  name: string;
  /** Public-facing route (e.g. "/about-us") */
  route: string;
  /** Full public URL (domain + route), built once during enumeration */
  pageUrl: string;
  /** Sitecore template display name (e.g. "Article Detail Page") — marks article pages for the checks. */
  templateName: string;
  /** ISO timestamp from xmc.pages.search.updatedAt */
  lastModified: string;
  /** Page "Title" field from Sitecore — used as the llms.txt link label when present. */
  metaTitle?: string | null;
  /** "Meta Description" (OG description fallback) from Sitecore — used as the llms.txt summary. */
  metaDescription?: string | null;
  /** The Sitecore fields the checks read (the same fields the panel reads). */
  fields: PageFields;
  score: PageScoreSummary | null;
  scanStatus: RowScanStatus;
  scanError?: string;
  /** ISO timestamp of the last successful scan */
  lastScannedAt?: string;
}

export type MatrixFilter = ScoreLabel | "all";
export type MatrixSort = "score-asc" | "score-desc" | "modified" | "name";
