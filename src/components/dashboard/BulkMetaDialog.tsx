"use client";

import { useState } from "react";
import { mdiCheckCircle, mdiCloseCircle } from "@mdi/js";
import { useConfirmWrite } from "@/components/shared/WriteConfirm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requestMeta, type Demo } from "@/lib/assist/client";
import { Icon } from "@/lib/icon";
import { FIELD_MAP } from "@/lib/sitecore/field-map";
import { writeDisabledReason, type WriteRequest } from "@/lib/sitecore/write";
import { cn } from "@/lib/utils";
import type { PageMatrixRow } from "@/types/dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// "Generate for all" for missing meta descriptions (plan section 6.4, Phase 9).
// Claude writes one per page from its published page (the dashboard has no
// draft); the author reviews, edits and approves each one; then one confirm
// lists every approved change before anything is written. Writes go through
// xmc.pages.updateFields to the page's current version, never published.
// ─────────────────────────────────────────────────────────────────────────────

/** Pages per run: keeps one run's cost and review list small. */
export const BULK_MAX = 25;
const CONCURRENCY = 3;
const MIN = 120;
const MAX = 160;

type Step = "intro" | "generating" | "review";

interface Item {
  page: PageMatrixRow;
  status: "waiting" | "ok" | "error";
  value: string;
  error?: string;
  approved: boolean;
  written?: { ok: boolean; reason?: string };
}

export function BulkMetaDialog({
  open,
  onOpenChange,
  pages,
  demo,
  hasClient,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pages without a meta description. */
  pages: PageMatrixRow[];
  /** Demo answers (`?demo=1`): no requests, and writes off. */
  demo: Demo | null;
  hasClient: boolean;
}) {
  const confirmWrite = useConfirmWrite();
  const [step, setStep] = useState<Step>("intro");
  const [items, setItems] = useState<Item[]>([]);
  const [writing, setWriting] = useState(false);
  const batch = pages.slice(0, BULK_MAX);
  const done = items.filter((i) => i.status !== "waiting").length;

  const reset = () => {
    setStep("intro");
    setItems([]);
  };

  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.page.id === id ? { ...i, ...patch } : i)));

  const generate = async () => {
    const start: Item[] = batch.map((page) => ({ page, status: "waiting", value: "", approved: false }));
    setItems(start);
    setStep("generating");
    let next = 0;
    const worker = async () => {
      while (next < start.length) {
        const { page } = start[next++];
        try {
          const res = await requestMeta({ field: "metaDescription", pageTitle: page.metaTitle ?? page.name, currentValue: "", pageUrl: page.pageUrl }, demo);
          update(page.id, { status: "ok", value: res.value });
        } catch (err) {
          update(page.id, { status: "error", error: err instanceof Error ? err.message : "Generation failed." });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, start.length) }, worker));
    setStep("review");
  };

  const reasonFor = (page: PageMatrixRow) =>
    writeDisabledReason({ hasClient, demo: Boolean(demo), configuredField: FIELD_MAP.metaDescription, fieldOnItem: page.metaDescriptionField ?? null });

  const approved = items.filter((i) => i.approved && i.status === "ok" && !i.written?.ok && !reasonFor(i.page) && i.value.trim());

  const write = async () => {
    const requests: WriteRequest[] = approved.map((i) => ({
      target: { via: "updateFields", pageId: i.page.id, language: i.page.language ?? "en", field: i.page.metaDescriptionField! },
      label: "Meta description",
      itemLabel: i.page.name,
      before: i.page.fields.metaDescription ?? "",
      after: i.value.trim(),
    }));
    setWriting(true);
    const results = await confirmWrite(requests, { title: `Write ${requests.length} meta description${requests.length > 1 ? "s" : ""} to Sitecore?` });
    setWriting(false);
    if (!results) return;
    results.forEach((r, n) => update(approved[n].page.id, { written: r.ok ? { ok: true } : { ok: false, reason: r.reason } }));
  };

  const writtenCount = items.filter((i) => i.written?.ok).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (step === "generating" || writing) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate meta descriptions</DialogTitle>
          <DialogDescription className="text-sm text-subtle-text">
            {step === "intro"
              ? `${pages.length} page${pages.length > 1 ? "s have" : " has"} no meta description. Claude writes one for each from its published page, in your brand voice. You review and approve each one before anything is written.`
              : step === "generating"
                ? `Writing ${done} of ${items.length}…`
                : "Edit any suggestion, tick the ones to keep, then write them. They're saved to each page's current version; nothing is published."}
          </DialogDescription>
        </DialogHeader>

        {step === "intro" && (
          <div className="flex flex-col gap-2 text-sm">
            {pages.length > BULK_MAX && <p>This run takes the first {BULK_MAX}; run it again for the rest.</p>}
            <p className="text-subtle-text">
              {demo
                ? "Demo: the suggestions are examples, nothing is sent to Claude, and nothing is written."
                : `${batch.length} request${batch.length > 1 ? "s" : ""} to Claude, about 1 cent each. Pages that haven't changed since the last run are answered from the cache at no cost.`}
            </p>
          </div>
        )}

        {step !== "intro" && (
          <ul className="flex flex-col gap-3">
            {items.map((i) => {
              const reason = reasonFor(i.page);
              const n = i.value.trim().length;
              return (
                <li key={i.page.id} className="flex flex-col gap-1.5 rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{i.page.name}</span>
                    <a href={i.page.pageUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-subtle-text underline">
                      {i.page.route}
                    </a>
                  </div>
                  <span className="text-xs text-subtle-text">Now: <em>empty</em></span>
                  {i.status === "waiting" && <span className="text-sm text-subtle-text">Writing…</span>}
                  {i.status === "error" && <span role="alert" className="text-sm text-danger-fg">{i.error}</span>}
                  {i.status === "ok" && (
                    <>
                      <textarea
                        aria-label={`Meta description for ${i.page.name}`}
                        className="min-h-14 w-full rounded-md border bg-neutral-bg p-2 text-sm leading-snug"
                        value={i.value}
                        disabled={Boolean(i.written?.ok)}
                        onChange={(e) => update(i.page.id, { value: e.target.value })}
                      />
                      <span className={cn("text-xs", n < MIN || n > MAX ? "font-semibold text-warning-fg" : "text-subtle-text")}>
                        {n} characters · target {MIN}–{MAX}
                      </span>
                      {i.written?.ok ? (
                        <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-success-fg">
                          <Icon path={mdiCheckCircle} className="size-4" aria-hidden /> Saved (draft, not published)
                        </span>
                      ) : (
                        <>
                          {i.written && !i.written.ok && (
                            <span role="alert" className="flex items-center gap-1.5 text-sm text-danger-fg">
                              <Icon path={mdiCloseCircle} className="size-4" aria-hidden /> Not saved: {i.written.reason}
                            </span>
                          )}
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={i.approved}
                              disabled={Boolean(reason) || step !== "review"}
                              onCheckedChange={(v) => update(i.page.id, { approved: v === true })}
                            />
                            Approve
                          </label>
                          {reason && <span className="text-xs text-subtle-text">{reason}</span>}
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter className="flex flex-wrap items-center gap-2">
          {step === "intro" && (
            <>
              <Button type="button" variant="ghost" colorScheme="neutral" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" onClick={generate} disabled={batch.length === 0}>
                Generate {batch.length} description{batch.length > 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              {writtenCount > 0 && <span className="mr-auto text-sm text-subtle-text">{writtenCount} saved. Scan the site again after publishing to see the scores change.</span>}
              <Button type="button" variant="ghost" colorScheme="neutral" onClick={() => { onOpenChange(false); reset(); }}>Close</Button>
              <Button type="button" onClick={write} disabled={approved.length === 0 || writing}>
                {writing ? "Writing…" : `Write ${approved.length} approved`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
