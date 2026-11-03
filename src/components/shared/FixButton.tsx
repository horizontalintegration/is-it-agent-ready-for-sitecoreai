"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { developerNote, FIX_BUTTON_TEXT, fixButton, type CheckRowModel } from "@/lib/checks/view-model";

/** A short confirmation shown next to a button, announced to screen readers. */
export function useFlash(ms = 2000) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = (t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), ms);
  };
  return [text, flash] as const;
}

export function FlashText({ text }: { text: string | null }) {
  return (
    <span role="status" className="text-xs font-semibold text-success-fg">
      {text}
    </span>
  );
}

interface FixButtonProps {
  row: CheckRowModel;
  pageUrl: string;
  /** Opens the check's card in the AI Assist tab (Generate, Choose author). */
  onGenerate?: (checkId: string) => void;
  /** Opens the check's details. */
  onShowHow?: () => void;
  /** The most important action on screen gets the filled style. */
  primary?: boolean;
}

/** The verb button on a fix: Generate, Choose author, Copy snippet, Send to developer or Show how. */
export function FixButton({ row, pageUrl, onGenerate, onShowHow, primary = false }: FixButtonProps) {
  const kind = fixButton(row);
  const [flashText, flash] = useFlash();

  const onClick = async () => {
    switch (kind) {
      case "generate":
      case "apply":
        onGenerate?.(row.id);
        return;
      case "copy-snippet":
        flash((await copyText(row.codePreview ?? "")) ? "Copied" : "Copy failed");
        return;
      case "send-to-developer":
        flash((await copyText(developerNote(row, pageUrl))) ? "Copied for your developer" : "Copy failed");
        return;
      case "show-how":
        onShowHow?.();
        return;
    }
  };

  const filled = primary && (kind === "generate" || kind === "apply" || kind === "copy-snippet");
  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-0.5">
      <Button
        type="button"
        size="sm"
        variant={filled ? "default" : "outline"}
        onClick={onClick}
        title={kind === "send-to-developer" ? "Copies a note with the page, what we found and the fix" : undefined}
        className="text-sm"
      >
        {FIX_BUTTON_TEXT[kind]}
      </Button>
      <FlashText text={flashText} />
    </span>
  );
}
