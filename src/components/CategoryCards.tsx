"use client";

import type { CategoryAggregate, ScoreLabel } from "@/lib/site-aggregate";
import { CATEGORY_META } from "@/lib/checks/adapters";
import { PAGE_CHECKS } from "@/lib/checks/registry";
import type { Category } from "@/lib/checks/types";

interface CategoryCardsProps {
  categories: CategoryAggregate[];
}

// Checks the dashboard can't run: P3 needs the Page Builder draft and P7 runs
// PageSpeed on demand. They count only in the panel.
const PANEL_ONLY = new Set(["read.no-js-content", "read.speed"]);

// "What's included" comes straight from the check registry, so it can't drift
// from what's scored. Bonus and panel-only checks are marked.
function includes(category: Category): string[] {
  return PAGE_CHECKS.filter((c) => c.category === category).map((c) =>
    c.tier === "bonus" ? `${c.title} (bonus)` : PANEL_ONLY.has(c.id) ? `${c.title} (Page Builder panel only)` : c.title,
  );
}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat.key];
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
                  {includes(cat.key).map((item, i) => (
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
