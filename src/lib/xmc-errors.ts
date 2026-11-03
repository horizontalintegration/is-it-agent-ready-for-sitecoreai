// SitecoreAI calls (`xmc.*`) go through the Sitecore host, which adds the
// authorization (built-in authorization). Since October 2026 the dashboard
// host refuses them with "[HostSDK] … Authentication required but
// getAccessToken method not provided" (plan section 13, item 1; Sitecore case
// CS0746928). The app can't supply that token, so the dashboard recognises the
// refusal and says so, instead of falling back to the content-tree walk and
// reporting a misleading "Home item not found".

// Only the host's own wording: a plain 401 from an API (e.g. the Sites scope
// refusing the machine token, as in June 2026) must keep its fallbacks.
const HOST_AUTH_PATTERN = /getAccessToken method not provided/i;

// Fields an SDK error or HTTP error envelope may carry the host's message in.
const TEXT_KEYS = ["message", "reason", "detail", "title"] as const;
const NESTED_KEYS = ["details", "error", "cause", "data"] as const;
const MAX_DEPTH = 3;

export const HOST_AUTH_ERROR_MESSAGE =
  "Sitecore didn't authorize the SitecoreAI request from this dashboard widget, so the site's pages can't be loaded here. The Page builder panel isn't affected.";

/** The same refusal on a write (Apply, Write approved). */
export const HOST_AUTH_WRITE_MESSAGE =
  "Sitecore didn't authorize the write from this extension, so nothing was saved. Try again from the Page builder panel.";

/** True when an error (or HTTP error envelope) is the host's built-in authorization refusal. */
export function isHostAuthError(err: unknown, depth = 0): boolean {
  if (err == null || depth > MAX_DEPTH) return false;
  if (typeof err === "string") return HOST_AUTH_PATTERN.test(err);
  if (typeof err !== "object") return false;

  const obj = err as Record<string, unknown>;
  for (const key of TEXT_KEYS) {
    const value = obj[key];
    if (typeof value === "string" && HOST_AUTH_PATTERN.test(value)) return true;
  }
  if (Array.isArray(err)) return err.some((e) => isHostAuthError(e, depth + 1));
  return NESTED_KEYS.some((key) => isHostAuthError(obj[key], depth + 1));
}
