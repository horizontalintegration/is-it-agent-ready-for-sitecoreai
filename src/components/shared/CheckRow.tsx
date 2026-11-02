"use client";

import { useId, useState } from "react";
import { mdiChevronDown } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { fixButton, needsWork, SOURCE_HINT, STATUS_TEXT, type CheckRowModel } from "@/lib/checks/view-model";
import { GainChip, OwnerBadge, SourceChip } from "./Chips";
import { FixButton, FlashText, useFlash } from "./FixButton";
import { Spinner, STATUS_COLOR, StatusIcon } from "./StatusIcon";

interface CheckRowProps {
  row: CheckRowModel;
  pageUrl: string;
  open: boolean;
  onToggle: () => void;
  /** Waiting for the data this check reads. */
  scanning?: boolean;
  /** The AI result judged an earlier version of the text. */
  stale?: boolean;
  /** Runs the on-demand scan (AI or PageSpeed) this check needs. */
  onRun?: () => void;
  onGenerate?: () => void;
}

/** One check: status icon, outcome title, source chip and status word. Expands to why, evidence and fix. */
export function CheckRow({ row, pageUrl, open, onToggle, scanning = false, stale = false, onRun, onGenerate }: CheckRowProps) {
  const panelId = useId();
  const [showCode, setShowCode] = useState(false);
  const [copied, flash] = useFlash();
  const waiting = scanning && row.state === "not-checked";
  const canRun = !!onRun && row.runner !== null && row.state === "not-checked" && !waiting;

  return (
    <div id={`check-${row.id}`} className="scroll-mt-4 border-b last:border-b-0">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-subtle-bg"
        >
          {waiting ? <Spinner label="Checking" /> : <StatusIcon status={row.display} />}
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{row.title}</span>
            <SourceChip sources={row.sources} />
          </span>
          <span className={cn("min-w-[52px] shrink-0 text-right text-xs font-semibold", waiting ? "text-primary-fg" : STATUS_COLOR[row.display])}>
            {waiting ? "Checking…" : STATUS_TEXT[row.display]}
          </span>
          <Icon path={mdiChevronDown} aria-hidden className={cn("size-4 shrink-0 text-neutral-fg transition-transform", open && "rotate-180")} />
        </button>
        {canRun && (
          <Button type="button" size="xs" variant="outline" colorScheme="primary" onClick={onRun} className="mr-2 text-xs">
            Run
          </Button>
        )}
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-2 px-3 pb-3 pl-[40px] text-sm leading-relaxed text-subtle-text">
          <p>
            <strong className="text-body-text">Why it matters: </strong>
            {row.why}
          </p>
          <p>
            <strong className="text-body-text">What we found: </strong>
            {waiting ? "Checking…" : row.message}
            {row.value && !waiting && <span className="text-subtle-text"> ({row.value})</span>}
          </p>
          {stale && row.state === "scored" && onRun && (
            <p className="text-warning-fg">
              Based on an earlier version of the text.{" "}
              <button type="button" onClick={onRun} className="cursor-pointer font-semibold underline">
                Re-run
              </button>
            </p>
          )}
          {row.details.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {row.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          {row.flaggedItems && row.flaggedItems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-warning-fg">
              {row.flaggedItems.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          {needsWork(row) && row.fixSuggestion && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-body-text">{row.fixSuggestion}</span>
              <GainChip pts={row.gainPts} />
              <OwnerBadge owner={row.owner} />
              {fixButton(row) !== "show-how" && <FixButton row={row} pageUrl={pageUrl} onGenerate={onGenerate} />}
            </div>
          )}
          {row.codePreview && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Button type="button" size="xs" variant="ghost" colorScheme="primary" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode} className="px-1 text-xs">
                  {showCode ? "Hide code" : "Show code"}
                </Button>
                {showCode && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    colorScheme="primary"
                    className="px-1 text-xs"
                    onClick={async () => flash((await copyText(row.codePreview ?? "")) ? "Copied" : "Copy failed")}
                  >
                    Copy
                  </Button>
                )}
                <FlashText text={copied} />
              </div>
              {showCode && (
                <pre className="max-h-56 overflow-auto rounded-md bg-gray-900 p-2.5 text-xs leading-relaxed whitespace-pre text-gray-50">
                  {row.codePreview}
                </pre>
              )}
            </div>
          )}
          <p className="text-xs">
            {row.sources.map((s) => SOURCE_HINT[s]).join(". ")}.
          </p>
        </div>
      )}
    </div>
  );
}
