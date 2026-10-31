// ────────────────────────────────────────────────────────────────────────────
// Brand voice used to ground AI meta/social generation (/api/generate-meta).
//
// Configured with two server-only env vars:
//   BRAND_VOICE_FILE  Markdown brand-voice document, relative to the project
//                     root (e.g. brand/brandx.md). Files under brand/ are
//                     bundled into the Vercel function (next.config.ts).
//   BRAND_NAME        Brand name used in the prompts (e.g. BrandX).
// With neither set, a neutral default voice is used.
//
// Server-side only: imported by the API route, never shipped to the browser.
// Reading the brand kit from SitecoreAI directly is a planned enhancement
// (plan section 11).
// ────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface BrandVoice {
  /** Brand name for the prompts, or null to refer to "the brand". */
  name: string | null;
  /** Markdown guidance placed in the system prompt. */
  document: string;
  /** Where the document came from, for logs. */
  source: string;
}

export const DEFAULT_BRAND_VOICE = `# Brand voice (default)

No brand voice document is configured, so follow these general guidelines:

- Use clear, plain, accurate language. Explain any jargon.
- Describe what the page actually offers, and lead with the value to the reader.
- Be confident but not boastful. No pressure tactics or clickbait.
- Don't invent statistics, proof points, guarantees or claims that the page content doesn't support.
`;

let cached: Promise<BrandVoice> | null = null;

async function load(): Promise<BrandVoice> {
  const name = process.env.BRAND_NAME?.trim() || null;
  const file = process.env.BRAND_VOICE_FILE?.trim();
  if (!file) return { name, document: DEFAULT_BRAND_VOICE, source: "default" };

  try {
    const document = await readFile(path.join(process.cwd(), file), "utf8");
    return { name, document, source: file };
  } catch (err) {
    console.error(
      `[brand-voice] could not read BRAND_VOICE_FILE "${file}", using the default voice:`,
      err instanceof Error ? err.message : err,
    );
    return { name, document: DEFAULT_BRAND_VOICE, source: "default (file unreadable)" };
  }
}

/** The configured brand voice, read once per server instance. */
export function getBrandVoice(): Promise<BrandVoice> {
  cached ??= load();
  return cached;
}
