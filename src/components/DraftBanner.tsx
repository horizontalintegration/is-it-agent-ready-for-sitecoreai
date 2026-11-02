"use client";

interface DraftBannerProps {
  /** Blocks of text edited in the draft. */
  changed: number;
  /** Published blocks that aren't in the draft. */
  removed: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Shown when the draft's text differs from the published page's (plan section 7). */
export function DraftBanner({ changed, removed }: DraftBannerProps) {
  const parts = [
    changed > 0 ? `${plural(changed, "block")} changed` : "",
    removed > 0 ? `${plural(removed, "block")} not in the draft` : "",
  ].filter(Boolean);

  return (
    <div className="mx-3 mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" role="status">
      <p className="font-semibold">Draft differs from live{parts.length > 0 ? ` (${parts.join(", ")})` : ""}</p>
      <p className="mt-0.5 text-blue-800">
        Content checks score your draft. Title tag, canonical, metadata and structured data are read from the
        published page until you publish.
      </p>
    </div>
  );
}
