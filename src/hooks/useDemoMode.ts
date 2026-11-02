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

/** `?demo=1&md=1`: the demo site serves Markdown (P5 4/4, S3 passes). Without it, it doesn't, as in the mockup. */
function isDemoMarkdownUrl(): boolean {
  return isDemoUrl() && new URLSearchParams(window.location.search).get("md") === "1";
}

export function useDemoServesMarkdown(): boolean {
  return useSyncExternalStore(subscribe, isDemoMarkdownUrl, getServerSnapshot);
}
