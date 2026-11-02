"use client";

import { useMemo, useState } from "react";
import { mdiClose } from "@mdi/js";
import { Segmented } from "@/components/shared/Segmented";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/relative-time";
import { CATEGORY_META, type IssueGroup } from "@/lib/checks/view-model";
import { CATEGORIES } from "@/lib/checks/types";
import { categoryPct } from "@/components/shared/CategoryBars";
import { labelForPct, LABEL_TEXT, type ScoreLabel } from "@/lib/score-thresholds";
import { pageScore } from "@/lib/site-aggregate";
import type { MatrixFilter, MatrixSort, PageMatrixRow } from "@/types/dashboard";

const CELL_TONE: Record<ScoreLabel, string> = {
  "agent-ready": "bg-success-bg text-success-fg",
  "almost-there": "bg-warning-bg text-warning-fg",
  "not-ready": "bg-danger-bg text-danger-fg",
};

const SORTS: Array<{ value: MatrixSort; label: string }> = [
  { value: "score-asc", label: "Lowest score first" },
  { value: "score-desc", label: "Highest score first" },
  { value: "modified", label: "Recently updated" },
  { value: "name", label: "Name" },
];

function Cell({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) {
    return <span className="block min-w-16 rounded-md bg-gray-100 py-1.5 text-center text-sm font-bold text-neutral-fg" title={`${label}: not scored`}>N/A</span>;
  }
  const verdict = labelForPct(pct);
  return (
    <span className={cn("block min-w-16 rounded-md py-1.5 text-center text-sm font-bold tabular-nums", CELL_TONE[verdict])} title={`${label}: ${pct} (${LABEL_TEXT[verdict]})`}>
      {pct}
    </span>
  );
}

interface PagesTabProps {
  pages: PageMatrixRow[];
  /** Only pages with this issue ("Review pages" from Fix first). */
  issue: IssueGroup | null;
  onClearIssue: () => void;
  onOpenPage: (row: PageMatrixRow) => void;
  onScanRow: (row: PageMatrixRow) => void;
}

export function PagesTab({ pages, issue, onClearIssue, onOpenPage, onScanRow }: PagesTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MatrixFilter>("all");
  const [sortBy, setSortBy] = useState<MatrixSort>("score-asc");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = pages;
    if (issue) out = out.filter((p) => issue.pageIds.includes(p.id));
    if (q) out = out.filter((p) => p.name.toLowerCase().includes(q) || p.route.toLowerCase().includes(q));
    // Unscanned rows have no label: they show only under "All".
    if (filter !== "all") out = out.filter((p) => p.score?.label === filter);
    // Unscanned and blocked pages have no score and sort last (lowest first) / first (highest first).
    const pct = (p: PageMatrixRow) => pageScore(p) ?? -1;
    return [...out].sort((a, b) => {
      switch (sortBy) {
        case "score-asc":
          return pct(a) - pct(b);
        case "score-desc":
          return pct(b) - pct(a);
        case "modified":
          return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
  }, [pages, issue, search, filter, sortBy]);

  const unscanned = pages.filter((p) => p.score === null).length;

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="page-search" className="sr-only">Search pages</label>
        <input
          id="page-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pages"
          className="h-10 min-w-0 flex-[0_1_260px] rounded-lg border border-border-color-a11y bg-body-bg px-3 text-md"
        />
        <Segmented
          label="Filter pages by verdict"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "not-ready", label: LABEL_TEXT["not-ready"] },
            { value: "almost-there", label: LABEL_TEXT["almost-there"] },
            { value: "agent-ready", label: LABEL_TEXT["agent-ready"] },
          ]}
        />
        <span className="ml-auto flex items-center gap-2">
          <span id="sort-label" className="text-sm text-subtle-text">Sort</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as MatrixSort)}>
            <SelectTrigger aria-labelledby="sort-label" className="h-10 min-w-48 text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </div>

      {issue && (
        <div className="flex items-center gap-2 self-start rounded-full bg-primary-bg py-1 pr-1 pl-3 text-sm text-primary-fg">
          Pages where: <strong>{issue.title}</strong>
          <Button type="button" size="icon-xs" variant="ghost" colorScheme="primary" aria-label="Show all pages" onClick={onClearIssue}>
            <Icon path={mdiClose} aria-hidden />
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-body-bg px-2 pt-2 pb-1">
        {/* relative: keeps the sr-only header inside the scroll box, not widening the page */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="text-left text-xs font-bold tracking-wide text-subtle-text uppercase">
                <th scope="col" className="border-b px-2.5 py-2.5">Page</th>
                <th scope="col" className="border-b px-2.5 py-2.5 text-center">Score</th>
                {CATEGORIES.map((c) => (
                  <th key={c} scope="col" className="border-b px-2.5 py-2.5 text-center" title={CATEGORY_META[c].question}>
                    {CATEGORY_META[c].label}
                  </th>
                ))}
                <th scope="col" className="border-b px-2.5 py-2.5">Updated</th>
                <th scope="col" className="border-b px-2.5 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-md text-subtle-text">No pages match.</td>
                </tr>
              )}
              {rows.map((row) => {
                const s = row.score;
                const scored = s && s.score !== null;
                return (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <th scope="row" className="min-w-[240px] px-2.5 py-2 text-left font-normal">
                      <span className="block text-md font-semibold">{row.name}</span>
                      <span className="block text-xs text-subtle-text">{row.route || "/"}</span>
                    </th>
                    {scored ? (
                      <>
                        <td className="px-2.5 py-2"><Cell pct={s.score} label="Score" /></td>
                        {CATEGORIES.map((c) => (
                          <td key={c} className="px-2.5 py-2"><Cell pct={categoryPct(s.categories[c])} label={CATEGORY_META[c].label} /></td>
                        ))}
                      </>
                    ) : (
                      <td colSpan={5} className="px-2.5 py-2 text-sm text-subtle-text">
                        {row.scanStatus === "scanning"
                          ? "Scanning…"
                          : s?.blocked
                            ? `Blocked: ${s.gateReason || "noindex or nosnippet"}`
                            : row.scanStatus === "error"
                              ? (row.scanError ?? "Scan failed")
                              : "Not scanned yet"}
                      </td>
                    )}
                    <td className="px-2.5 py-2 text-sm whitespace-nowrap text-subtle-text">{timeAgo(row.lastModified) ?? "—"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      {scored || s?.blocked ? (
                        <Button type="button" size="sm" variant="link" className="px-0 text-sm" onClick={() => onOpenPage(row)}>
                          Open in Page Builder
                        </Button>
                      ) : row.scanStatus !== "scanning" ? (
                        <Button type="button" size="sm" variant="outline" className="text-sm" onClick={() => onScanRow(row)}>
                          {row.scanStatus === "error" ? "Retry" : "Scan"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-subtle-text">
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-3.5 rounded bg-success-bg" />80+ {LABEL_TEXT["agent-ready"]}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-3.5 rounded bg-warning-bg" />60–79 {LABEL_TEXT["almost-there"]}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-3.5 rounded bg-danger-bg" />Under 60 {LABEL_TEXT["not-ready"]}</span>
        <span className="sm:ml-auto">
          Showing {rows.length} of {pages.length} pages
          {unscanned > 0 && ` · ${unscanned} not scanned yet`} · scores are kept until a page is edited
        </span>
      </div>
    </div>
  );
}
