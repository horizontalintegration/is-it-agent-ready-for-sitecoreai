import type { PageWriteContext } from "@/hooks/usePageFields";
import type { Demo } from "@/lib/assist/client";
import type { WriteRequest, WriteResult } from "@/lib/sitecore/write";

/** What every AI Assist card needs. */
export interface AssistEnv {
  /** Demo answers (`?demo=1`): no requests, writes off. */
  demo: Demo | null;
  hasClient: boolean;
  writeContext: PageWriteContext;
  pageTitle: string;
  /** The draft's main text (or the live page's when the draft isn't available). */
  mainText: string;
  /** True while the page text is still being read. */
  bodyPending: boolean;
  confirmWrite: (requests: WriteRequest[], opts?: { title?: string }) => Promise<WriteResult[] | null>;
  /** After a successful write: re-read the fields and the draft. */
  onWritten: () => void;
}

export const textPendingReason = (env: AssistEnv) => (env.bodyPending ? "Waiting for the page text to be read." : null);

/** True when every write in the dialog went through. */
export const allOk = (results: WriteResult[] | null) => Boolean(results && results.length > 0 && results.every((r) => r.ok));
