"use client";

import { StatusIcon } from "@/components/shared/StatusIcon";
import { limitEffect, limitMessage, useApiLimits } from "@/lib/api/limits";
import { cn } from "@/lib/utils";

/**
 * A rate limit on the API routes is in force (plan Phase 12): which one, when
 * to try again, and what it holds back. Gone once the limit resets.
 */
export function LimitBanner({ className }: { className?: string }) {
  const limits = useApiLimits();
  if (limits.length === 0) return null;
  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-lg border border-warning-bg-active bg-warning-bg p-3", className)}
      role="status"
    >
      <StatusIcon status="improve" className="mt-0.5" />
      <div className="flex flex-col gap-1 text-sm leading-snug">
        {limits.map((l) => (
          <p key={l.route}>
            <span className="font-semibold text-warning-fg">{limitMessage(l)}</span> {limitEffect(l.route)}
          </p>
        ))}
      </div>
    </div>
  );
}
