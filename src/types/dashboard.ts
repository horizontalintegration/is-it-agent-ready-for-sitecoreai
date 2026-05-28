import type { QuickScoreResult } from "@/lib/rule-engine/quick-score";

export interface PageSummaryFields {
  pageTitle: string | null;
  metaDescription: string | null;
  author: string | null;
  publishDate: string | null;
  lastUpdatedDate: string | null;
  noIndex: boolean;
  richTextParagraphs: string[];
  images: Array<{ componentName: string; alt: string | null }>;
  links: Array<{ componentName: string; anchorText: string | null; href: string | null }>;
  headings: Array<{ level: number; text: string; componentName: string }>;
  faqItems: Array<{ question: string; answer: string }>;
  hasFaqComponent: boolean;
  hasHowToComponent: boolean;
}

export interface PageMatrixRow {
  id: string;
  name: string;
  path: string;
  templateId: string;
  lastModified: string;
  score: QuickScoreResult;
  fields: PageSummaryFields;
}

export type MatrixFilter = "critical" | "warning" | "good" | "all";
export type MatrixSort = "score-asc" | "score-desc" | "modified" | "name";
