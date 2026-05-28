"use client";

import type { MatrixFilter, MatrixSort, PageMatrixRow } from "@/types/dashboard";
import { ScorePill } from "./ScorePill";

interface MatrixViewProps {
  pages: PageMatrixRow[];
  allPages: PageMatrixRow[];
  filter: MatrixFilter;
  sortBy: MatrixSort;
  isLoading: boolean;
  siteDomain: string;
  error?: string | null;
  onFilterChange: (f: MatrixFilter) => void;
  onSortChange: (s: MatrixSort) => void;
  onRescanPage: (row: PageMatrixRow) => void;
}

const FILTERS: { value: MatrixFilter; label: string; activeClass: string }[] = [
  { value: "critical", label: "Critical", activeClass: "bg-red-600 text-white" },
  { value: "warning", label: "Warning", activeClass: "bg-amber-500 text-white" },
  { value: "good", label: "Good", activeClass: "bg-green-600 text-white" },
  { value: "all", label: "All pages", activeClass: "bg-gray-800 text-white" },
];

const SORTS: { value: MatrixSort; label: string }[] = [
  { value: "score-asc", label: "Score ↑" },
  { value: "score-desc", label: "Score ↓" },
  { value: "modified", label: "Last modified" },
  { value: "name", label: "Name" },
];

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "red" | "amber" | "green";
}) {
  const toneClass = {
    neutral: "text-gray-900",
    red: "text-red-600",
    amber: "text-amber-600",
    green: "text-green-600",
  }[tone];
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function totalBarColor(label: PageMatrixRow["score"]["label"]): string {
  if (label === "critical") return "bg-red-500";
  if (label === "warning") return "bg-amber-500";
  return "bg-green-500";
}

export function MatrixView({
  pages,
  allPages,
  filter,
  sortBy,
  isLoading,
  error,
  onFilterChange,
  onSortChange,
  onRescanPage,
}: MatrixViewProps) {
  const counts = {
    total: allPages.length,
    critical: allPages.filter((p) => p.score.label === "critical").length,
    warning: allPages.filter((p) => p.score.label === "warning").length,
    good: allPages.filter((p) => p.score.label === "good").length,
  };

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total pages" value={counts.total} tone="neutral" />
        <MetricCard label="Critical" value={counts.critical} tone="red" />
        <MetricCard label="Warning" value={counts.warning} tone="amber" />
        <MetricCard label="Good" value={counts.good} tone="green" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => onFilterChange(f.value)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  active ? f.activeClass + " border-transparent" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-gray-500">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as MatrixSort)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "36%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Page</th>
              <th className="text-center px-2 py-2 font-medium">SEO</th>
              <th className="text-center px-2 py-2 font-medium">AEO</th>
              <th className="text-center px-2 py-2 font-medium">CQ</th>
              <th className="text-left px-3 py-2 font-medium">Total</th>
              <th className="text-right px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="h-6 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              : pages.length === 0
              ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                    No pages match the current filter.
                  </td>
                </tr>
              )
              : pages.map((row) => {
                  const pct = row.score.maxTotal === 0 ? 0 : row.score.total / row.score.maxTotal;
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 truncate">
                        <div className="text-sm font-medium text-gray-900 truncate">{row.name}</div>
                        <div className="text-xs font-mono text-gray-500 truncate">{row.path}</div>
                      </td>
                      <td className="text-center px-2 py-2">
                        <ScorePill score={row.score.seo} max={21} />
                      </td>
                      <td className="text-center px-2 py-2">
                        <ScorePill score={row.score.aeo} max={5} />
                      </td>
                      <td className="text-center px-2 py-2">
                        <ScorePill score={row.score.contentQuality} max={15} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full ${totalBarColor(row.score.label)}`}
                              style={{ width: `${Math.min(100, pct * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-700 font-medium tabular-nums">
                            {Math.round(row.score.total)}
                          </span>
                        </div>
                      </td>
                      <td className="text-right px-3 py-2">
                        <button
                          onClick={() => onRescanPage(row)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Showing {pages.length} of {allPages.length} pages · Scores from quick check
        <span
          className="ml-1 underline decoration-dotted cursor-help"
          title="Quick scores use authoring field checks only (no preview fetch or AI calls). Run a full scan in the Page Builder context panel for a complete score on any page."
        >
          (?)
        </span>
      </p>
    </div>
  );
}
