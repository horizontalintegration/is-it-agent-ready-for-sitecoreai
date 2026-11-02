import { DeltaChip } from "./Chips";
import { ScoreRing } from "./ScoreRing";

interface VerdictCardProps {
  score: number;
  /** "Agent-ready", "Almost there" or "Not ready". */
  verdict: string;
  sentence: string;
  /** Change since the last scan; null hides the chip. */
  delta: number | null;
}

/** Answer first: one score, one verdict, one sentence (plan section 6.2, item 1). */
export function VerdictCard({ score, verdict, sentence, delta }: VerdictCardProps) {
  return (
    <div className="flex items-center gap-3.5">
      <ScoreRing score={score} size={88} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-[20px] leading-tight font-bold">{verdict}</h2>
          <DeltaChip delta={delta} />
        </div>
        <p className="text-sm leading-snug text-subtle-text">{sentence}</p>
      </div>
    </div>
  );
}
