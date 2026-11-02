import { cn } from "@/lib/utils";
import { CATEGORY_META } from "@/lib/checks/view-model";
import { CATEGORIES, type Category, type Subtotal } from "@/lib/checks/types";

/** A category's 0–100 score, or null when nothing in it was scored. */
export function categoryPct(s: Subtotal): number | null {
  return s.max > 0 ? Math.round((s.earned / s.max) * 100) : null;
}

export function Bar({ pct, color, height = 6 }: { pct: number | null; color: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded bg-gray-100" style={{ height }} aria-hidden>
      <div className="h-full rounded transition-[width] duration-700" style={{ width: `${pct ?? 0}%`, background: color }} />
    </div>
  );
}

interface CategoryBarsProps {
  categories: Record<Category, Subtotal>;
  /** The category the check list is filtered to, if any. */
  selected: Category | null;
  onSelect: (c: Category | null) => void;
}

/** Reach / Read / Understand / Trust. Selecting one filters the check list (plan section 6.3). */
export function CategoryBars({ categories, selected, onSelect }: CategoryBarsProps) {
  return (
    <div role="group" aria-label="Filter checks by category" className="grid grid-cols-2 gap-x-4 gap-y-1">
      {CATEGORIES.map((c) => {
        const meta = CATEGORY_META[c];
        const pct = categoryPct(categories[c]);
        const active = selected === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : c)}
            title={meta.question}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-md px-1.5 py-1 text-left hover:bg-subtle-bg",
              active && "bg-primary-bg",
            )}
          >
            <span className="flex justify-between text-xs">
              <span className="font-semibold">{meta.label}</span>
              <span className="text-subtle-text tabular-nums">{pct ?? "N/A"}</span>
            </span>
            <Bar pct={pct} color={meta.color} />
          </button>
        );
      })}
    </div>
  );
}

export function CategorySwatch({ category, size = 10 }: { category: Category; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[3px]"
      style={{ width: size, height: size, background: CATEGORY_META[category].color }}
    />
  );
}
