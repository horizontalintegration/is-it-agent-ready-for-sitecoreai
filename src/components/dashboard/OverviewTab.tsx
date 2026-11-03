"use client";

import { useMemo, useState } from "react";
import { Bar, CategorySwatch } from "@/components/shared/CategoryBars";
import { Chip, DeltaChip, OwnerBadge } from "@/components/shared/Chips";
import { FlashText, useFlash } from "@/components/shared/FixButton";
import { ScoreRing } from "@/components/shared/ScoreRing";
import { StatusIcon } from "@/components/shared/StatusIcon";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { CATEGORY_META, issueNote, pageCheckTitles, type IssueGroup } from "@/lib/checks/view-model";
import type { WhatChanged } from "@/lib/history/what-changed";
import { LABEL_TEXT } from "@/lib/score-thresholds";
import type { SiteAggregate } from "@/lib/site-aggregate";
import type { PageMatrixRow } from "@/types/dashboard";
import { Sparkline } from "./Sparkline";

const FIX_FIRST_LIMIT = 6;
const CHANGES_LIMIT = 5;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface OverviewTabProps {
  aggregate: SiteAggregate;
  pages: PageMatrixRow[];
  siteUrl: string;
  isLoading: boolean;
  /** Site issues first, then page issues by total gain. */
  issues: IssueGroup[];
  /** Site scores of the last scans, oldest first. */
  history: number[];
  /** "What changed since last scan". */
  changes: WhatChanged;
  onReviewPages: (issue: IssueGroup) => void;
}

/** The hero sentence: what it would take, from the same numbers as Fix first. */
function heroSentence(aggregate: SiteAggregate, issues: IssueGroup[], scanning: boolean): string {
  if (aggregate.overallPct === null) {
    return scanning ? "Scanning your pages. The score fills in as each page is checked." : "Scan your site to see how ready it is for AI agents.";
  }
  if (issues.length === 0) return "Every scanned page passes every check.";
  const site = issues.filter((i) => i.scope === "site");
  const authorIssues = issues.filter((i) => i.owner === "author").length;
  const first = site.length > 0
    ? `${plural(site.length, "site issue")} affect${site.length === 1 ? "s" : ""} every page.`
    : `The biggest gain: ${issues[0].title.toLowerCase()} on ${plural(issues[0].pageIds.length, "page")}.`;
  return authorIssues > 0 ? `${first} Authors can fix ${authorIssues} of the ${issues.length} issues in Page Builder.` : first;
}

export function OverviewTab({ aggregate, pages, siteUrl, isLoading, issues, history, changes, onReviewPages }: OverviewTabProps) {
  const [showAll, setShowAll] = useState(false);
  const score = aggregate.overallPct === null ? null : Math.round(aggregate.overallPct);
  const scanning = aggregate.scanningCount > 0 || (isLoading && aggregate.scannedCount < aggregate.totalCount);
  const done = aggregate.scannedCount + aggregate.errorCount;
  const delta = history.length >= 2 ? history[history.length - 1] - history[history.length - 2] : null;
  const shown = showAll ? issues : issues.slice(0, FIX_FIRST_LIMIT);
  const sentence = useMemo(() => heroSentence(aggregate, issues, scanning), [aggregate, issues, scanning]);
  const notServed = aggregate.markdown.checked - aggregate.markdown.served;

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5 p-4 sm:p-6">
      {/* Hero */}
      <section aria-label="Site score" className="flex flex-wrap items-center gap-7 rounded-xl border bg-body-bg p-6 shadow-small">
        <ScoreRing score={score} size={132} label="Site score" />
        <div className="flex min-w-[240px] flex-[1_1_320px] flex-col gap-2">
          <span className="text-md text-subtle-text">Is this site agent-ready?</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[28px] leading-tight font-bold">{aggregate.overallLabel ? LABEL_TEXT[aggregate.overallLabel] : "Not scored yet"}</h2>
            <DeltaChip delta={delta} />
          </div>
          <p className="text-[15px] leading-normal text-subtle-text">{sentence}</p>
        </div>
        <div className="flex flex-[0_1_300px] flex-col gap-2.5">
          {history.length >= 2 && (
            <>
              <span className="text-xs font-bold tracking-wide text-subtle-text uppercase">Last {history.length} scans</span>
              <Sparkline scores={history} />
            </>
          )}
          {aggregate.scannedCount > 0 && (
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm">
              <span><strong>{aggregate.counts["agent-ready"]}</strong> <span className="text-success-fg">{LABEL_TEXT["agent-ready"]}</span></span>
              <span><strong>{aggregate.counts["almost-there"]}</strong> <span className="text-warning-fg">{LABEL_TEXT["almost-there"]}</span></span>
              <span><strong>{aggregate.counts["not-ready"]}</strong> <span className="text-danger-fg">{LABEL_TEXT["not-ready"]}</span></span>
              {aggregate.blockedCount > 0 && (
                <span title="noindex or nosnippet pages have no score"><strong>{aggregate.blockedCount}</strong> <span className="text-subtle-text">Blocked</span></span>
              )}
            </div>
          )}
        </div>
        {aggregate.totalCount > 0 && (scanning || done < aggregate.totalCount) && (
          <div className="flex w-full flex-col gap-1">
            <div className="flex justify-between text-sm text-subtle-text">
              <span>{scanning ? "Scanning pages…" : "Scan paused"}</span>
              <span className="tabular-nums">
                {done} of {aggregate.totalCount}
                {aggregate.errorCount > 0 && <span className="text-danger-fg"> · {aggregate.errorCount} failed</span>}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Pages scanned"
              aria-valuemin={0}
              aria-valuemax={aggregate.totalCount}
              aria-valuenow={done}
              className="h-1.5 overflow-hidden rounded-full bg-gray-100"
            >
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(aggregate.progress * 100)}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* Category cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {aggregate.categories.map((c) => {
          const meta = CATEGORY_META[c.key];
          const pct = c.pct === null ? null : Math.round(c.pct);
          return (
            <section key={c.key} aria-label={meta.label} className="flex flex-col gap-2.5 rounded-xl border bg-body-bg p-[18px]">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-bold">
                  <CategorySwatch category={c.key} size={12} />
                  {meta.label}
                </h3>
                <span className="text-[26px] font-bold tabular-nums">{pct ?? "—"}</span>
              </div>
              <Bar pct={pct} color={meta.color} height={8} />
              <p className="text-md text-subtle-text">{meta.question}</p>
              {c.key === "read" && notServed > 0 ? (
                // As in the mockup: Markdown is the Read issue that affects the most pages.
                <p className="text-sm font-semibold text-danger-fg">
                  {notServed} of {plural(aggregate.markdown.checked, "page")} not served as Markdown
                </p>
              ) : c.applicableCount > 0 && (
                <p className={c.failingCount > 0 ? "text-sm font-semibold text-warning-fg" : "text-sm font-semibold text-success-fg"}>
                  {c.failingCount > 0 ? `${plural(c.failingCount, "page")} need${c.failingCount === 1 ? "s" : ""} work` : "Every scanned page passes"}
                </p>
              )}
              <details className="text-sm text-subtle-text">
                <summary className="cursor-pointer font-semibold text-primary-fg">What&apos;s included</summary>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {pageCheckTitles(c.key).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Fix first */}
        <section aria-labelledby="fix-first" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 rounded-xl border bg-body-bg p-[18px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="fix-first" className="text-lg font-bold">Fix first</h3>
            <span className="text-sm text-subtle-text">Grouped by issue, biggest gain first</span>
          </div>
          {issues.length === 0 ? (
            <p className="border-t pt-3 text-sm text-subtle-text">
              {aggregate.scannedCount === 0 ? "Issues show here once pages are scanned." : "Nothing to fix on the scanned pages."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {shown.map((issue) => (
                <FixFirstRow key={issue.id} issue={issue} pages={pages} siteUrl={siteUrl} onReviewPages={onReviewPages} />
              ))}
            </ul>
          )}
          {issues.length > FIX_FIRST_LIMIT && (
            <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${issues.length} issues`}
            </Button>
          )}
        </section>

        <WhatChangedCard changes={changes} />
      </div>
    </div>
  );
}

function WhatChangedCard({ changes }: { changes: WhatChanged }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? changes.items : changes.items.slice(0, CHANGES_LIMIT);
  return (
    <section aria-labelledby="what-changed" className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 rounded-xl border bg-body-bg p-[18px]">
      <h3 id="what-changed" className="text-lg font-bold">What changed since last scan</h3>
      {changes.items.length === 0 ? (
        <p className="border-t pt-3 text-sm text-subtle-text">
          {changes.comparable ? "No changes since the last scan." : "Changes show here after the next scan, compared with this one."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((item) => (
            <li key={item.key} className="flex gap-2.5 border-t py-3">
              <span className={item.tone === "down" ? "w-10 shrink-0 font-bold text-danger-fg" : "w-10 shrink-0 font-bold text-success-fg"}>
                <span className="sr-only">{item.tone === "down" ? "Worse: " : "Better: "}</span>
                {item.badge}
              </span>
              <span className="min-w-0 text-md leading-snug break-words">
                {item.parts.map((part, i) => (typeof part === "string" ? <span key={i}>{part}</span> : <strong key={i}>{part.strong}</strong>))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {changes.items.length > CHANGES_LIMIT && (
        <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${changes.items.length} changes`}
        </Button>
      )}
    </section>
  );
}

function FixFirstRow({
  issue,
  pages,
  siteUrl,
  onReviewPages,
}: {
  issue: IssueGroup;
  pages: PageMatrixRow[];
  siteUrl: string;
  onReviewPages: (issue: IssueGroup) => void;
}) {
  const [flash, setFlash] = useFlash();
  const sendToDeveloper = issue.scope === "site" || issue.owner === "developer";

  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t py-3">
      <StatusIcon status={issue.display} withText className="w-16" />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <span className="text-md font-semibold">{issue.title}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-subtle-text">{issue.scope === "site" ? "Whole site" : plural(issue.pageIds.length, "page")}</span>
          {issue.scope === "site" ? <Chip>Affects every page</Chip> : <Chip tone="primary">+{issue.gainEach} pts each</Chip>}
          <OwnerBadge owner={issue.owner} />
        </span>
      </div>
      <span className="flex flex-col items-end gap-0.5">
        {sendToDeveloper ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-sm"
            title="Copies a note with the issue and the pages it affects"
            onClick={async () => setFlash((await copyText(issueNote(issue, pages, siteUrl))) ? "Copied for your developer" : "Copy failed")}
          >
            Send to developer
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="text-sm" onClick={() => onReviewPages(issue)}>
            Review pages
          </Button>
        )}
        <FlashText text={flash} />
      </span>
    </li>
  );
}
