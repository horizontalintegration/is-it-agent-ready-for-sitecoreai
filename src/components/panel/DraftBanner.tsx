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
    changed > 0 ? `${plural(changed, "block")} of text changed` : "",
    removed > 0 ? `${plural(removed, "block")} not in the draft` : "",
  ].filter(Boolean);

  return (
    <div className="rounded-lg bg-primary-bg px-2.5 py-2 text-sm leading-snug text-primary-fg" role="status">
      Scored from your <strong>draft</strong>. It differs from the live page
      {parts.length > 0 ? `: ${parts.join(", ")}` : ""}. Title, canonical, metadata and structured data are read from
      the live page until you publish.
    </div>
  );
}
