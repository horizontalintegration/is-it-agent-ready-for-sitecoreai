import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: string;
  title: string;
  children?: React.ReactNode;
  tone?: "neutral" | "success";
  className?: string;
}

/** A friendly placeholder: nothing to show yet, or everything passes. */
export function EmptyState({ icon, title, children, tone = "neutral", className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}>
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-full",
          tone === "success" ? "bg-success-bg text-success-fg" : "bg-primary-bg text-primary-fg",
        )}
      >
        <Icon path={icon} aria-hidden className="size-6" />
      </span>
      <p className="text-md font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm leading-relaxed text-subtle-text">{children}</div>}
    </div>
  );
}
