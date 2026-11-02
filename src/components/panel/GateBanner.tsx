import { StatusIcon } from "@/components/shared/StatusIcon";

interface GateBannerProps {
  reason: string;
}

/** The page is noindex or nosnippet: no other check counts until that's fixed. */
export function GateBanner({ reason }: GateBannerProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-danger-bg-active bg-danger-bg p-3" role="alert">
      <StatusIcon status="fix" className="mt-0.5" />
      <div className="flex flex-col gap-1 text-sm leading-snug">
        <p className="font-semibold text-danger-fg">AI tools are told to skip this page</p>
        <p>{reason}</p>
        <p className="text-subtle-text">
          Fix this first. The other checks wait until the page can be indexed and quoted.
        </p>
      </div>
    </div>
  );
}
