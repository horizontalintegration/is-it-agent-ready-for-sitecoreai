import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OWNER_TEXT, SOURCE_HINT, SOURCE_TEXT } from "@/lib/checks/view-model";
import type { Owner, Source } from "@/lib/checks/types";

const CHIP = "h-auto rounded-full px-2 py-0.5 text-xs font-semibold";

/** "You can fix" or "Developer" (plan section 6.2, item 4). */
export function OwnerBadge({ owner }: { owner: Owner }) {
  return (
    <Badge colorScheme={owner === "author" ? "success" : "neutral"} className={CHIP}>
      {OWNER_TEXT[owner]}
    </Badge>
  );
}

/** "+N pts": the only place points show (plan section 10, Phase 5). */
export function GainChip({ pts, suffix }: { pts: number; suffix?: string }) {
  if (pts < 1) return null;
  return (
    <Badge colorScheme="primary" className={CHIP}>
      +{pts} pts{suffix ? ` ${suffix}` : ""}
    </Badge>
  );
}

/** Where a result's data came from (plan section 6.2, item 7). */
export function SourceChip({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  const text = sources.length === 2 && sources.includes("draft") && sources.includes("live")
    ? "Draft vs Live"
    : sources.map((s) => SOURCE_TEXT[s]).join(" · ");
  return (
    <Badge
      colorScheme={sources.includes("draft") ? "primary" : "neutral"}
      className={cn(CHIP, "font-medium")}
      title={sources.map((s) => SOURCE_HINT[s]).join(". ")}
    >
      {text}
    </Badge>
  );
}

/** A plain chip for counts and states. */
export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger" | "blue";
  className?: string;
}) {
  return (
    <Badge colorScheme={tone} className={cn(CHIP, className)}>
      {children}
    </Badge>
  );
}

/** "▲ 6 since last scan". Hidden when there's nothing to compare with or no change. */
export function DeltaChip({ delta, since = "since last scan" }: { delta: number | null; since?: string }) {
  if (delta === null || delta === 0) return null;
  const up = delta > 0;
  return (
    <Chip tone={up ? "success" : "danger"}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "Up" : "Down"}</span> {Math.abs(delta)} {since}
    </Chip>
  );
}
