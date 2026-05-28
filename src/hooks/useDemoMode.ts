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

function getClientSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

function getServerSnapshot(): boolean {
  return false;
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
