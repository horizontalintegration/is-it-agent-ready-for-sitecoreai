// ─────────────────────────────────────────────────────────────────────────────
// Content-hash keys for caching AI results (plan section 9, defects D8 / D10).
//
// Runs in the browser and on the server (Web Crypto is available in both), so
// the panel, the dashboard and the API routes derive keys the same way.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bump when the ai-check prompts or response shape change, so results cached
 * in browsers under the old prompts are not reused.
 */
export const AI_CHECK_VERSION = "2026-10-31.1";

/** Collapses whitespace and Unicode forms so cosmetic differences don't miss the cache. */
export function normaliseText(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

export async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Key for one cached AI result: SHA-256 of the normalised parts, joined with a
 * separator that can't appear after normalisation.
 */
export function contentKey(parts: string[]): Promise<string> {
  return sha256Hex(parts.map(normaliseText).join("\u0000"));
}
