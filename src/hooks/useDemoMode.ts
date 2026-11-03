"use client";

import { useSyncExternalStore } from "react";

/**
 * Returns true only when the URL contains `?demo=1`.
 *
 * SSR snapshot is `false` so the initial server-rendered HTML matches the
 * client hydration result, avoiding hydration mismatches and ensuring that
 * running the extension inside Page Builder never accidentally shows fixture
 * data.
 *
 * Use `?demo=1` when opening the page directly in a browser tab
 * (e.g. http://localhost:3000/pages-contextpanel-extension?demo=1) to iterate
 * on the UI without needing a live Sitecore connection.
 */
const subscribe = () => () => {};

/**
 * The same check outside React, for code that runs only in the browser
 * (effects, event handlers). False during SSR.
 */
export function isDemoUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

const getClientSnapshot = isDemoUrl;

function getServerSnapshot(): boolean {
  return false;
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/**
 * `?domain=https://example.com`, opened directly in a browser tab (not inside
 * a Sitecore extension point, and not in demo mode): the dashboard runs for
 * that site without the Marketplace client. Agent access, AI citations (with a
 * page URL) and Files work; Overview and Pages need Sitecore's page list.
 * Returns the origin, or "" when it doesn't apply.
 */
export function standaloneDomain(): string {
  if (typeof window === "undefined" || isDemoUrl() || window.self !== window.top) return "";
  const raw = new URLSearchParams(window.location.search).get("domain")?.trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

const serverEmpty = () => "";

export function useStandaloneDomain(): string {
  return useSyncExternalStore(subscribe, standaloneDomain, serverEmpty);
}

/** `?demo=1&md=1`: the demo site serves Markdown (P5 4/4, S3 passes). Without it, it doesn't, as in the mockup. */
function isDemoMarkdownUrl(): boolean {
  return isDemoUrl() && new URLSearchParams(window.location.search).get("md") === "1";
}

export function useDemoServesMarkdown(): boolean {
  return useSyncExternalStore(subscribe, isDemoMarkdownUrl, getServerSnapshot);
}
