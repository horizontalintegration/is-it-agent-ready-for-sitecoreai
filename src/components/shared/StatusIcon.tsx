import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiCloseCircleOutline,
  mdiHelpCircleOutline,
  mdiLoading,
  mdiMinusCircleOutline,
} from "@mdi/js";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { STATUS_TEXT, type DisplayStatus } from "@/lib/checks/view-model";

const PATH: Record<DisplayStatus, string> = {
  pass: mdiCheckCircleOutline,
  improve: mdiAlertCircleOutline,
  fix: mdiCloseCircleOutline,
  na: mdiMinusCircleOutline,
  "not-checked": mdiHelpCircleOutline,
};

export const STATUS_COLOR: Record<DisplayStatus, string> = {
  pass: "text-success-fg",
  improve: "text-warning-fg",
  fix: "text-danger-fg",
  na: "text-neutral-fg",
  "not-checked": "text-neutral-fg",
};

interface StatusIconProps {
  status: DisplayStatus;
  /** Show the word next to the icon. Without it the icon carries the word as its label. */
  withText?: boolean;
  className?: string;
}

/** Status never by colour alone: an icon, a colour and a word (plan section 6.2, item 6). */
export function StatusIcon({ status, withText = false, className }: StatusIconProps) {
  const color = STATUS_COLOR[status];
  if (!withText) {
    return <Icon path={PATH[status]} role="img" aria-label={STATUS_TEXT[status]} className={cn("size-[18px] shrink-0", color, className)} />;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap", color, className)}>
      <Icon path={PATH[status]} aria-hidden className="size-4 shrink-0" />
      {STATUS_TEXT[status]}
    </span>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <Icon
      path={mdiLoading}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("size-4 shrink-0 animate-spin text-primary-fg", className)}
    />
  );
}
