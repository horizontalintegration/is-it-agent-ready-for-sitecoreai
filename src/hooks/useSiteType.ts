"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteType } from "@/lib/checks/types";

// Site type setting (plan section 5.1): Content site (default) / Commerce /
// App or API. It decides which Bonus protocol checks apply (S11, S12 — Phase 6).
// Stored per site in localStorage (plan section 12, decision 2).
const KEY_PREFIX = "aiDiscovery:siteType:v1:";

export const SITE_TYPES: Array<{ value: SiteType; label: string }> = [
  { value: "content", label: "Content site" },
  { value: "commerce", label: "Commerce" },
  { value: "app", label: "App or API" },
];

const isSiteType = (v: unknown): v is SiteType => SITE_TYPES.some((t) => t.value === v);

function read(siteId: string): SiteType {
  if (typeof window === "undefined" || !siteId) return "content";
  try {
    const v = window.localStorage.getItem(KEY_PREFIX + siteId);
    return isSiteType(v) ? v : "content";
  } catch {
    return "content";
  }
}

export function useSiteType(siteId: string): [SiteType, (t: SiteType) => void] {
  const [siteType, setState] = useState<SiteType>("content");

  useEffect(() => {
    setState(read(siteId));
  }, [siteId]);

  const setSiteType = useCallback(
    (t: SiteType) => {
      setState(t);
      if (typeof window === "undefined" || !siteId) return;
      try {
        window.localStorage.setItem(KEY_PREFIX + siteId, t);
      } catch {
        // ignore quota errors
      }
    },
    [siteId],
  );

  return [siteType, setSiteType];
}
