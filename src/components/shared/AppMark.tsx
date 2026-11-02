import { mdiShieldCheckOutline } from "@mdi/js";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";

/** The app mark: a shield with a tick, on the accent colour. */
export function AppMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary text-white", className)}
      style={{ width: size, height: size }}
    >
      <Icon path={mdiShieldCheckOutline} style={{ width: size * 0.62, height: size * 0.62 }} />
    </span>
  );
}
