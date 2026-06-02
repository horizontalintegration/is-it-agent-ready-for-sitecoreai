"use client";

import type { MatrixFilter, MatrixSort, PageMatrixRow } from "@/types/dashboard";
import { PageScoreRow } from "./PageScoreRow";

interface AllPagesViewProps {
  /** Filtered + sorted rows to render. */
  pages: PageMatrixRow[];
  /** All rows (for the "showing X of Y" footer + unscanned count). */
  allPages: PageMatrixRow[];
  filter: MatrixFilter;
  sortBy: MatrixSort;
  scanningCount: number;
  onFilterChange: (f: MatrixFilter) => void;
  onSortChange: (s: MatrixSort) => void;
  onScanRow: (row: PageMatrixRow) => void;
  onScanAll: () => void;
  onClearAndRefresh: () => void;
  onOpenPage: (row: PageMatrixRow) => void;
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

export function AllPagesView({
  pages,
  allPages,
  filter,
  sortBy,
  scanningCount,
  onFilterChange,
  onSortChange,
  onScanRow,
  onScanAll,
  onClearAndRefresh,
  onOpenPage,
}: AllPagesViewProps) {
  const unscanned = allPages.filter((p) => p.score === null).length;

  return (
    <div className="px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">All pages</h3>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => onFilterChange(f.value)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  active
                    ? f.activeClass + " border-transparent"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {scanningCount > 0 && (
            <span className="text-xs text-blue-600">
              Scanning {scanningCount} {scanningCount === 1 ? "page" : "pages"}…
            </span>
          )}
          {unscanned > 0 && scanningCount === 0 && (
            <button
              onClick={onScanAll}
              className="text-xs px-3 py-1.5 rounded-md border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
            >
              Scan all ({unscanned})
            </button>
          )}
          <button
            onClick={onClearAndRefresh}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            title="Clear cached scores and rescan"
          >
            Refresh
          </button>
          <label className="text-xs text-gray-500">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as MatrixSort)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {pages.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-500">
            No pages match the current filter.
          </div>
        ) : (
          pages.map((row) => (
            <PageScoreRow
              key={row.id}
              row={row}
              onOpenPage={onOpenPage}
              onScan={onScanRow}
            />
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Showing {pages.length} of {allPages.length} pages
        {unscanned > 0 && ` · ${unscanned} not yet scanned`}
        <span
          className="ml-1 underline decoration-dotted cursor-help"
          title="Click a page name to see its category breakdown. Scores come from the AI Search Discovery rule engine, cached per page until the page is edited."
        >
          (?)
        </span>
      </p>
    </div>
  );
}
