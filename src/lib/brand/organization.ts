// ────────────────────────────────────────────────────────────────────────────
// Organization identity for the Organization JSON-LD snippet.
//
// Comes from NEXT_PUBLIC_ORG_* env vars. When those aren't set, the name and
// URL fall back to the current site's display name and domain from the SDK.
// Anything still missing renders as a placeholder in the snippet.
//
// Read in the browser (the rule engine runs client-side), so the env vars
// must be NEXT_PUBLIC_* and referenced literally for Next.js to inline them.
// ────────────────────────────────────────────────────────────────────────────

import type { OrganizationInfo } from "@/lib/rule-engine/types";

function env(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function getOrganizationInfo(site: { name?: string | null; url?: string | null }): OrganizationInfo {
  const url = env(process.env.NEXT_PUBLIC_ORG_URL) ?? env(site.url ?? undefined);
  return {
    name: env(process.env.NEXT_PUBLIC_ORG_NAME) ?? env(site.name ?? undefined),
    url: url ? withTrailingSlash(url) : null,
    logo: env(process.env.NEXT_PUBLIC_ORG_LOGO),
    description: env(process.env.NEXT_PUBLIC_ORG_DESCRIPTION),
    sameAs: (process.env.NEXT_PUBLIC_ORG_SAME_AS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
