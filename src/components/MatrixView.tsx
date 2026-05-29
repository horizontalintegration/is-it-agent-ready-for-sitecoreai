"use client";

import type { MatrixFilter, MatrixSort, PageMatrixRow } from "@/types/dashboard";
import type { SiteScoreResult } from "@/lib/rule-engine/site-score";
import { ScorePill } from "./ScorePill";

interface MatrixViewProps {
  pages: PageMatrixRow[];
  allPages: PageMatrixRow[];
  filter: MatrixFilter;
  sortBy: MatrixSort;
  isLoading: boolean;
  scanningCount: number;
  error?: string | null;
  onFilterChange: (f: MatrixFilter) => void;
  onSortChange: (s: MatrixSort) => void;
  onScanRow: (row: PageMatrixRow) => void;
  onScanAll: () => void;
  onClearAndRefresh: () => void;
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

const PILLAR_COLS: Array<{
  key: keyof SiteScoreResult["pillars"];
  label: string;
  title: string;
}> = [
  { key: "crawlability",   label: "CRAWL",   title: "Crawlability — can AI bots see this page?" },
  { key: "structured",     label: "STRUCT",  title: "Structured data — can AI parse the schema?" },
  { key: "answerability",  label: "ANSWER",  title: "Answerability — can AI extract a passage?" },
  { key: "authority",      label: "AUTH",    title: "Authority — does AI trust this content?" },
  { key: "retrievability", label: "RETRIEV", title: "Retrievability — does AI prefer it?" },
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

function totalBarColor(label: SiteScoreResult["label"]): string {
  if (label === "critical") return "bg-red-500";
  if (label === "warning") return "bg-amber-500";
  return "bg-green-500";
}

function ScanCell({ row, onScan }: { row: PageMatrixRow; onScan: (r: PageMatrixRow) => void }) {
  if (row.scanStatus === "scanning") {
    return <span className="text-xs text-gray-500">Scanning…</span>;
  }
  if (row.scanStatus === "error") {
    return (
      <button
        onClick={() => onScan(row)}
        className="text-xs text-red-600 hover:text-red-800 font-medium"
        title={row.scanError ?? "Scan failed"}
      >
        Retry
      </button>
    );
  }
  if (row.scanStatus === "idle") {
    return (
      <button
        onClick={() => onScan(row)}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        Scan
      </button>
    );
  }
  return (
    <button
      onClick={() => onScan(row)}
      className="text-xs text-gray-600 hover:text-gray-800 font-medium"
    >
      Re-scan
    </button>
  );
}

export function MatrixView({
  pages,
  allPages,
  filter,
  sortBy,
  isLoading,
  scanningCount,
  error,
  onFilterChange,
  onSortChange,
  onScanRow,
  onScanAll,
  onClearAndRefresh,
}: MatrixViewProps) {
  const scoredPages = allPages.filter((p) => p.score !== null);
  const counts = {
    total: allPages.length,
    critical: scoredPages.filter((p) => p.score?.label === "critical").length,
    warning: scoredPages.filter((p) => p.score?.label === "warning").length,
    good: scoredPages.filter((p) => p.score?.label === "good").length,
  };
  const unscanned = allPages.length - scoredPages.length;

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

      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: "30%" }} />
            {PILLAR_COLS.map((c) => (
              <col key={c.key} style={{ width: "8%" }} />
            ))}
            <col style={{ width: "20%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Page</th>
              {PILLAR_COLS.map((c) => (
                <th
                  key={c.key}
                  className="text-center px-1 py-2 font-medium"
                  title={c.title}
                >
                  {c.label}
                </th>
              ))}
              <th className="text-left px-3 py-2 font-medium">Total</th>
              <th className="text-right px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td colSpan={PILLAR_COLS.length + 3} className="px-3 py-3">
                    <div className="h-6 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : pages.length === 0 ? (
              <tr>
                <td
                  colSpan={PILLAR_COLS.length + 3}
                  className="px-3 py-8 text-center text-sm text-gray-500"
                >
                  No pages match the current filter.
                </td>
              </tr>
            ) : (
              pages.map((row) => {
                const score = row.score;
                const pct = score ? score.total / score.maxTotal : 0;
                return (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 truncate">
                      <div className="text-sm font-medium text-gray-900 truncate">{row.name}</div>
                      <div className="text-xs font-mono text-gray-500 truncate">{row.route || "/"}</div>
                    </td>
                    {PILLAR_COLS.map((c) => (
                      <td key={c.key} className="text-center px-1 py-2">
                        {score ? (
                          <ScorePill score={score.pillars[c.key]} max={score.maxPillars[c.key]} />
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {score ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full ${totalBarColor(score.label)}`}
                              style={{ width: `${Math.min(100, pct * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-700 font-medium tabular-nums">
                            {Math.round(score.total)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {row.scanStatus === "scanning" ? "Scanning…" : "Not scanned"}
                        </span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2">
                      <ScanCell row={row} onScan={onScanRow} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Showing {pages.length} of {allPages.length} pages
        {unscanned > 0 && ` · ${unscanned} not yet scanned`}
        <span
          className="ml-1 underline decoration-dotted cursor-help"
          title="Scores are computed by fetching each page's rendered HTML and running the AI Search Discovery rule engine. Cached per page until the page is edited."
        >
          (?)
        </span>
      </p>
    </div>
  );
}
