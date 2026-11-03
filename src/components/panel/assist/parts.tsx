"use client";

import { useState, type ReactNode } from "react";
import { mdiCheckCircle, mdiCreation } from "@mdi/js";
import { FlashText, useFlash } from "@/components/shared/FixButton";
import { GainChip } from "@/components/shared/Chips";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";

/** One section of the AI Assist tab. `anchor` lets the Score tab's Generate scroll to it. */
export function AssistCard({
  anchor,
  title,
  gainPts = 0,
  intro,
  children,
}: {
  anchor: string;
  title: string;
  gainPts?: number;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`assist-${anchor}`} aria-labelledby={`assist-${anchor}-title`} className="flex scroll-mt-2 flex-col gap-2.5 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <h3 id={`assist-${anchor}-title`} className="flex-1 text-md font-bold">
          {title}
        </h3>
        <GainChip pts={gainPts} />
      </div>
      {intro && <div className="text-sm leading-snug text-subtle-text">{intro}</div>}
      {children}
    </section>
  );
}

export function GenerateButton({
  busy,
  again,
  onClick,
  disabledReason,
  label = "Generate",
}: {
  busy: boolean;
  again: boolean;
  onClick: () => void;
  disabledReason?: string | null;
  label?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="self-start text-sm"
      onClick={onClick}
      disabled={busy || Boolean(disabledReason)}
      title={disabledReason ?? undefined}
    >
      <Icon path={mdiCreation} className="size-4" aria-hidden />
      {busy ? "Generating…" : again ? "Regenerate" : label}
    </Button>
  );
}

/** "Now: …" and the suggestion, which the author can edit before applying. */
export function BeforeAfter({
  before,
  after,
  onEdit,
  limit,
  multiline = true,
  label,
}: {
  before: string;
  after: string;
  onEdit: (v: string) => void;
  /** Character range shown under the suggestion, e.g. { min: 120, max: 160 }. */
  limit?: { min?: number; max: number };
  multiline?: boolean;
  /** Accessible name for the edit box. */
  label: string;
}) {
  const n = after.length;
  const off = limit ? n > limit.max || (limit.min !== undefined && n < limit.min) : false;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-subtle-text break-words">
        Now: {before ? before : <em>empty</em>}
      </span>
      {multiline ? (
        <textarea
          aria-label={label}
          className="min-h-16 w-full rounded-md border bg-neutral-bg p-2 text-sm leading-snug"
          value={after}
          onChange={(e) => onEdit(e.target.value)}
        />
      ) : (
        <input aria-label={label} className="w-full rounded-md border bg-neutral-bg p-2 text-sm" value={after} onChange={(e) => onEdit(e.target.value)} />
      )}
      {limit && (
        <span className={cn("text-xs", off ? "font-semibold text-warning-fg" : "text-subtle-text")}>
          {n} characters · target {limit.min !== undefined ? `${limit.min}–${limit.max}` : `up to ${limit.max}`}
        </span>
      )}
    </div>
  );
}

/**
 * Apply (through the confirm dialog) and Copy. When Apply can't be used, the
 * reason is shown as text next to it, not only in a tooltip.
 */
export function ApplyBar({
  reason,
  onApply,
  copy,
  applied,
  appliedText = "Saved to the field (draft, not published)",
  applyLabel = "Apply to field",
}: {
  /** Why Apply is off; null when it can be used. Copy-only cards pass `undefined` and no onApply. */
  reason?: string | null;
  onApply?: () => Promise<void>;
  copy: string;
  applied: boolean;
  appliedText?: string;
  applyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();
  if (applied) {
    return (
      <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-success-fg">
        <Icon path={mdiCheckCircle} className="size-4" aria-hidden />
        {appliedText}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {onApply && (
          <Button
            type="button"
            size="sm"
            className="text-sm"
            disabled={busy || Boolean(reason) || !copy.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onApply();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Writing…" : applyLabel}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-sm"
          disabled={!copy.trim()}
          onClick={async () => setFlash((await copyText(copy)) ? "Copied" : "Copy failed")}
        >
          Copy
        </Button>
        <FlashText text={flash} />
      </div>
      {onApply && reason && <span className="text-xs text-subtle-text">{reason}</span>}
    </div>
  );
}

export function ErrorText({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-xs text-danger-fg">
      {text}
    </p>
  );
}
