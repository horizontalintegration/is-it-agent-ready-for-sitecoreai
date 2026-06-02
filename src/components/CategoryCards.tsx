"use client";

import type { CategoryAggregate, PillarKey, ScoreLabel } from "@/lib/site-aggregate";

interface CategoryCardsProps {
  categories: CategoryAggregate[];
}

// Plain-English framing + "what's included" for non-expert site owners.
// The checks mirror src/lib/rule-engine/site-score.ts.
const META: Record<PillarKey, { label: string; question: string; includes: string[] }> = {
  crawlability: {
    label: "Crawlability",
    question: "Can AI bots reach and index this page?",
    includes: [
      "AI crawler access in robots.txt (GPTBot, ClaudeBot, Google-Extended, PerplexityBot…)",
      "Canonical URL present and self-referencing",
      "No noindex / nosnippet robots meta tag",
    ],
  },
  structured: {
    label: "Structured data",
    question: "Can AI parse the page's meaning from schema?",
    includes: [
      "FAQPage schema on question-and-answer pages",
      "Article schema on article pages",
      "BreadcrumbList on inner pages",
      "Organization schema on the home page",
    ],
  },
  answerability: {
    label: "Answerability",
    question: "Can AI extract a clean answer from the content?",
    includes: [
      "Exactly one H1, with no heading-level skips",
      "Question-style H2 sections",
      "Readable prose (reading grade ≤ 13)",
      "Scannable paragraphs (≈ 40–120 words)",
    ],
  },
  authority: {
    label: "Authority",
    question: "Does AI trust this content enough to cite it?",
    includes: [
      "Content uniqueness (AI-rated vs. commodity content)",
      "Content depth (sufficient word count)",
      "Freshness (recently published or updated)",
      "Descriptive internal link anchor text",
    ],
  },
  retrievability: {
    label: "Retrievability",
    question: "Does AI prefer this page when answering?",
    includes: [
      "Title length 30–60 characters",
      "Meta description 120–160 characters",
      "Complete Open Graph tags (title, description, image)",
      "Semantic landmarks (main / article / nav / header)",
      "Image alt-text coverage",
    ],
  },
};

function ring(label: ScoreLabel | null): string {
  switch (label) {
    case "critical": return "text-red-600";
    case "warning": return "text-amber-600";
    case "good": return "text-green-600";
    default: return "text-gray-300";
  }
}

function bar(label: ScoreLabel | null): string {
  switch (label) {
    case "critical": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "good": return "bg-green-500";
    default: return "bg-gray-200";
  }
}

export function CategoryCards({ categories }: CategoryCardsProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Readiness by category</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {categories.map((cat) => {
          const meta = META[cat.key];
          const pctText = cat.pct === null ? "—" : `${Math.round(cat.pct)}%`;
          return (
            <div
              key={cat.key}
              className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-gray-700">{meta.label}</span>
                <span className={`text-lg font-semibold tabular-nums ${ring(cat.label)}`}>
                  {pctText}
                </span>
              </div>

              <div className="h-1 rounded-full bg-gray-100 overflow-hidden my-2">
                <div
                  className={`h-full ${bar(cat.label)}`}
                  style={{ width: `${cat.pct === null ? 0 : Math.round(cat.pct)}%` }}
                />
              </div>

              <p className="text-xs text-gray-500 leading-snug">{meta.question}</p>

              <p className="mt-2 text-xs font-medium">
                {cat.applicableCount === 0 ? (
                  <span className="text-gray-400">Not yet scanned</span>
                ) : cat.failingCount === 0 ? (
                  <span className="text-green-600">All pages passing</span>
                ) : (
                  <span className="text-red-600">
                    {cat.failingCount} {cat.failingCount === 1 ? "page" : "pages"} failing
                  </span>
                )}
              </p>

              <details className="mt-2 group">
                <summary className="text-xs text-blue-600 cursor-pointer list-none flex items-center gap-1 select-none">
                  <span className="transition-transform group-open:rotate-90">▸</span>
                  What&apos;s included
                </summary>
                <ul className="mt-1.5 space-y-1 text-[11px] text-gray-500 leading-snug">
                  {meta.includes.map((item, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-gray-300 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
      </div>
    </section>
  );
}
