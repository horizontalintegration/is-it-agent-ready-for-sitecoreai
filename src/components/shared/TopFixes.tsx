"use client";

import type { CheckRowModel } from "@/lib/checks/view-model";
import { GainChip, OwnerBadge } from "./Chips";
import { FixButton } from "./FixButton";

interface TopFixesProps {
  fixes: CheckRowModel[];
  pageUrl: string;
  onGenerate: () => void;
  onShowHow: (id: string) => void;
}

/** The three fixes worth the most points, each with a verb button (plan section 6.3). */
export function TopFixes({ fixes, pageUrl, onGenerate, onShowHow }: TopFixesProps) {
  if (fixes.length === 0) return null;
  return (
    <section aria-labelledby="top-fixes" className="flex flex-col gap-2">
      <h3 id="top-fixes" className="text-xs font-bold tracking-wide text-subtle-text uppercase">
        Top fixes
      </h3>
      <ol className="flex flex-col gap-2">
        {fixes.map((r) => (
          <li key={r.id} className="flex items-center gap-2.5 rounded-[10px] border bg-body-bg px-3 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-semibold">{r.title}</span>
              <span className="flex flex-wrap gap-1.5">
                <GainChip pts={r.gainPts} />
                <OwnerBadge owner={r.owner} />
              </span>
            </div>
            <FixButton row={r} pageUrl={pageUrl} primary onGenerate={onGenerate} onShowHow={() => onShowHow(r.id)} />
          </li>
        ))}
      </ol>
    </section>
  );
}
