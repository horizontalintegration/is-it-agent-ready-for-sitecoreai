"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { writeField, type WriteRequest, type WriteResult } from "@/lib/sitecore/write";

// ─────────────────────────────────────────────────────────────────────────────
// The confirm step every write goes through (Phase 9 accept-when): a dialog
// with each change as before → after, the item and field, and "saved to the
// current version, not published". Only "Write to Sitecore" sends anything.
// Then one [audit] console line per write (writeField) and a toast.
//
// An in-page dialog, not window.confirm: Page Builder's iframe blocks browser
// dialogs (SPIKE-FINDINGS §9.3).
//
// Demo mode (`?demo=1`) shows the same dialog, but "Write to Sitecore" only
// logs an "[audit] demo" line and says nothing was written. Demo mode never
// starts the Marketplace client, so there's nothing it could write with.
// ─────────────────────────────────────────────────────────────────────────────

type ConfirmWrite = (requests: WriteRequest[], opts?: { title?: string }) => Promise<WriteResult[] | null>;

const WriteConfirmContext = createContext<ConfirmWrite | null>(null);

/** Opens the confirm dialog; resolves with each write's result, or null when cancelled. */
export function useConfirmWrite(): ConfirmWrite {
  const ctx = useContext(WriteConfirmContext);
  if (!ctx) throw new Error("useConfirmWrite needs a WriteConfirmProvider");
  return ctx;
}

interface Pending {
  requests: WriteRequest[];
  title: string;
  resolve: (r: WriteResult[] | null) => void;
}

export function WriteConfirmProvider({
  client,
  contextId,
  demo = false,
  children,
}: {
  client: ClientSDK | null;
  contextId: string | undefined;
  demo?: boolean;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useCallback<ConfirmWrite>(
    (requests, opts) =>
      new Promise((resolve) => {
        if (requests.length === 0) return resolve([]);
        setPending({ requests, title: opts?.title ?? (requests.length === 1 ? `Write ${requests[0].label.toLowerCase()} to Sitecore?` : `Write ${requests.length} changes to Sitecore?`), resolve });
      }),
    [],
  );

  const cancel = () => {
    pending?.resolve(null);
    setPending(null);
  };

  const send = async () => {
    if (!pending) return;
    if (demo) {
      for (const req of pending.requests) console.info(`[audit] demo, nothing written: ${req.label} on ${req.itemLabel} (field "${req.target.field}")`);
      toast.info("Demo: nothing was written to Sitecore.");
      pending.resolve(null);
      setPending(null);
      return;
    }
    if (!client) {
      toast.error("Nothing was written: there's no connection to Sitecore here.");
      pending.resolve(null);
      setPending(null);
      return;
    }
    setBusy(true);
    const results: WriteResult[] = [];
    for (const req of pending.requests) results.push(await writeField(client, contextId, req));
    setBusy(false);

    const failed = results.filter((r) => !r.ok) as Array<Extract<WriteResult, { ok: false }>>;
    const okCount = results.length - failed.length;
    if (pending.requests.length === 1) {
      const req = pending.requests[0];
      if (failed.length === 0) toast.success(`Saved ${req.label.toLowerCase()} to “${req.target.field}” (draft, not published).`);
      else toast.error(`${req.label} wasn't saved: ${failed[0].reason}`);
    } else {
      if (okCount > 0) toast.success(`Saved ${okCount} of ${results.length} changes (draft, not published).`);
      if (failed.length > 0) toast.error(`${failed.length} change${failed.length > 1 ? "s" : ""} weren't saved: ${failed[0].reason}`);
    }
    pending.resolve(results);
    setPending(null);
  };

  const shared = pending?.requests.some((r) => r.shared);

  return (
    <WriteConfirmContext.Provider value={confirm}>
      {children}
      <Toaster />
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && !busy && cancel()}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="pb-1">{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-subtle-text">
              Saved to the current version in your workflow. Nothing is published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-3">
            {pending?.requests.map((r, i) => (
              <li key={i} className="flex flex-col gap-1.5 rounded-md border p-2.5 text-sm">
                <span className="font-semibold">{r.label}</span>
                <span className="text-xs text-subtle-text break-words">
                  {r.itemLabel} · field “{r.target.field}” · {r.target.language}
                </span>
                <span className="text-xs font-semibold text-subtle-text">Before</span>
                <span className="break-words rounded bg-neutral-bg p-1.5">{(r.display?.before ?? r.before) || <em>empty</em>}</span>
                <span className="text-xs font-semibold text-subtle-text">After</span>
                <span className="break-words rounded bg-primary-bg p-1.5">{r.display?.after ?? r.after}</span>
                {r.shared && (
                  <span className="text-xs font-semibold text-warning-fg">
                    This component is shared: the change shows on every page that uses it.
                  </span>
                )}
              </li>
            ))}
          </ul>
          {shared && <p className="sr-only">Some of these items are shared with other pages.</p>}
          <AlertDialogFooter className="pt-2">
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              colorScheme="primary"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {busy ? "Writing…" : pending && pending.requests.length > 1 ? `Write ${pending.requests.length} changes` : "Write to Sitecore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WriteConfirmContext.Provider>
  );
}
