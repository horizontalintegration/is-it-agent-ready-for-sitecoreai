import type { AssistData, AssistRequest } from "@/lib/server/assist";
import type { MetaField } from "@/lib/server/generate-meta";

// ─────────────────────────────────────────────────────────────────────────────
// Browser side of AI Assist: calls /api/assist and /api/generate-meta. In demo
// mode (`?demo=1`) the answers come from the fixture with no request at all
// (no network, paid or write calls).
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "";

const MESSAGES: Record<string, string> = {
  refused: "Claude declined to write this one. Try again, or write it yourself.",
  rate_limited: "Too many requests right now. Wait a moment and try again.",
  api_key_missing: "The app's Claude API key isn't set up.",
  api_key_invalid: "The app's Claude API key isn't valid.",
  page_unreadable: "The published page couldn't be read.",
  url_not_allowed: "That page address isn't allowed.",
};

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the app. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(MESSAGES[data.error ?? ""] ?? "Generation failed. Try again.");
  return data;
}

const pause = (ms = 350) => new Promise((r) => setTimeout(r, ms));

export interface Demo {
  assist(req: AssistRequest): AssistData;
  meta(field: MetaField, pageKey: string): string;
}

export async function requestAssist(req: AssistRequest, demo?: Demo | null): Promise<AssistData> {
  if (demo) {
    await pause();
    return demo.assist(req);
  }
  return post<AssistData>("/api/assist", req);
}

export interface MetaRequest {
  field: MetaField;
  pageTitle: string;
  currentValue: string;
  /** The panel sends the draft's text. */
  bodyText?: string;
  /** The dashboard sends the published page's URL instead. */
  pageUrl?: string;
}

export async function requestMeta(req: MetaRequest, demo?: Demo | null): Promise<{ value: string; overLimit: boolean; maxChars: number }> {
  if (demo) {
    await pause();
    const value = demo.meta(req.field, req.pageUrl ?? req.pageTitle);
    return { value, overLimit: false, maxChars: 0 };
  }
  return post("/api/generate-meta", req);
}
