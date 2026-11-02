import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

/** A small set of toggle buttons, e.g. Needs work / All. */
export function Segmented<T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-semibold text-neutral-fg",
              active && "bg-body-bg text-body-text shadow-sm",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
