interface ScorePillProps {
  score: number;
  max: number;
  size?: "sm" | "md";
}

export function ScorePill({ score, max, size = "sm" }: ScorePillProps) {
  if (max === 0) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-500 ${
          size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1"
        }`}
      >
        n/a
      </span>
    );
  }

  const pct = score / max;
  let style: string;
  if (pct >= 0.8) style = "bg-green-50 text-green-700";
  else if (pct >= 0.4) style = "bg-amber-50 text-amber-700";
  else style = "bg-red-50 text-red-700";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium ${style} ${
        size === "sm" ? "text-xs px-2 py-0.5 min-w-[2rem]" : "text-sm px-3 py-1 min-w-[2.5rem]"
      }`}
    >
      {Math.round(score)}
    </span>
  );
}
