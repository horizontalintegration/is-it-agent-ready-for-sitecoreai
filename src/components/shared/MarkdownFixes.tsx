"use client";

import { useState } from "react";
import { FlashText, useFlash } from "@/components/shared/FixButton";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { MARKDOWN_FIXES, type MarkdownFix } from "@/lib/markdown/fixes";

function FixCard({ fix }: { fix: MarkdownFix }) {
  const [showCode, setShowCode] = useState(false);
  const [flash, setFlash] = useFlash();
  const copy = async (text: string) => setFlash((await copyText(text)) ? "Copied" : "Copy failed");

  return (
    <li className="flex flex-col gap-2 rounded-[10px] border p-3">
      <span className="text-md font-semibold">{fix.title}</span>
      {fix.command && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-subtle-bg px-2.5 py-2 font-mono text-xs">{fix.command}</code>
          <Button type="button" size="sm" variant="outline" className="text-sm" onClick={() => copy(fix.command!)}>
            Copy
          </Button>
        </div>
      )}
      <p className="text-sm leading-snug text-subtle-text">{fix.text}</p>
      {fix.code && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button type="button" size="xs" variant="ghost" colorScheme="primary" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode} className="px-1 text-xs">
              {showCode ? "Hide code" : "Show code"}
            </Button>
            {showCode && (
              <Button type="button" size="xs" variant="ghost" colorScheme="primary" className="px-1 text-xs" onClick={() => copy(fix.code!)}>
                Copy
              </Button>
            )}
          </div>
          {showCode && (
            <pre className="max-h-64 overflow-auto rounded-md bg-gray-900 p-2.5 text-xs leading-relaxed whitespace-pre text-gray-50">{fix.code}</pre>
          )}
        </div>
      )}
      <FlashText text={flash} />
    </li>
  );
}

/** How to serve Markdown: the Agent View's fix cards, and S3's on the dashboard. */
export function MarkdownFixes() {
  return (
    <ul className="flex flex-col gap-2">
      {MARKDOWN_FIXES.map((f) => (
        <FixCard key={f.id} fix={f} />
      ))}
    </ul>
  );
}
