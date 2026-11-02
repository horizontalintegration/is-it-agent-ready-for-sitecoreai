import { StatusIcon } from "@/components/shared/StatusIcon";
import { Button } from "@/components/ui/button";
import type { CheckRowModel } from "@/lib/checks/view-model";

interface SiteIssuesProps {
  /** Failing site checks that keep agents out of every page (S1, S2). */
  issues: CheckRowModel[];
  onOpenDashboard: () => void;
}

/**
 * "Site issues affecting this page" (plan section 5.1): site checks are scored
 * on the dashboard, not here, but a blocked agent can't read this page either.
 */
export function SiteIssues({ issues, onOpenDashboard }: SiteIssuesProps) {
  if (issues.length === 0) return null;
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-lg border border-danger-bg-active bg-danger-bg p-2.5">
      <StatusIcon status="fix" className="mt-px" />
      <p className="min-w-0 text-xs leading-normal">
        <strong>
          {issues.length === 1 ? "1 site issue affects" : `${issues.length} site issues affect`} every page:
        </strong>{" "}
        {issues.map((r) => r.message).join(" ")}{" "}
        <Button type="button" variant="link" size="xs" className="h-auto px-0 text-xs font-semibold" onClick={onOpenDashboard}>
          View in dashboard
        </Button>
      </p>
    </div>
  );
}
