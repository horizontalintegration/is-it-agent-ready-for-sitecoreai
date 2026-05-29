import type { SiteScoreResult } from "@/lib/rule-engine/site-score";

export type RowScanStatus = "idle" | "scanning" | "scanned" | "error";

export interface PageMatrixRow {
  id: string;
  name: string;
  /** Public-facing route (e.g. "/about-us") */
  route: string;
  /** Full public URL (domain + route), built once during enumeration */
  pageUrl: string;
  templateId: string;
  /** ISO timestamp from xmc.pages.search.updatedAt */
  lastModified: string;
  score: SiteScoreResult | null;
  scanStatus: RowScanStatus;
  scanError?: string;
  /** ISO timestamp of the last successful scan */
  lastScannedAt?: string;
}

export type MatrixFilter = "critical" | "warning" | "good" | "all";
export type MatrixSort = "score-asc" | "score-desc" | "modified" | "name";
