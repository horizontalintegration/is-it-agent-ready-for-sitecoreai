"use client";

import { useState } from "react";
import { requestAssist } from "@/lib/assist/client";
import { ApplyBar, AssistCard, ErrorText, GenerateButton } from "./parts";
import { textPendingReason, type AssistEnv } from "./env";

// Suggestions with no field to write to (plan: anything without a field is
// copy-only): a rendered heading or paragraph can't be traced back to the
// datasource field it came from.

/** P13: section headings phrased as the questions they answer. */
export function QuestionHeadingsCard({ env, headings, gainPts }: { env: AssistEnv; headings: string[]; gainPts: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Array<{ before: string; after: string }> | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await requestAssist({ kind: "question-headings", pageTitle: env.pageTitle, mainText: env.mainText, headings: headings.slice(0, 15) }, env.demo);
      if (data.kind === "question-headings") setResult(data.headings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AssistCard
      anchor="understand.question-headings"
      title="Question headings"
      gainPts={gainPts}
      intro="People ask AI assistants questions. Headings phrased as those questions are easy to match and cite. Change the heading in Page Builder: headings aren't written from here."
    >
      <GenerateButton busy={busy} again={result !== null} onClick={generate} disabledReason={textPendingReason(env)} label="Suggest question headings" />
      <ErrorText text={error} />
      {result?.length === 0 && <p className="text-sm text-subtle-text">No heading needs changing: they&apos;re questions already, or a question would sound forced.</p>}
      {result?.map((h) => (
        <div key={h.before} className="flex flex-col gap-1 border-t pt-2">
          <span className="text-xs text-subtle-text">Now: {h.before}</span>
          <span className="text-sm font-semibold">{h.after}</span>
          <ApplyBar copy={h.after} applied={false} />
        </div>
      ))}
    </AssistCard>
  );
}

/** An answer-first summary paragraph for the top of the page. */
export function SummaryCard({ env }: { env: AssistEnv }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await requestAssist({ kind: "summary", pageTitle: env.pageTitle, mainText: env.mainText }, env.demo);
      if (data.kind === "summary") setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AssistCard
      anchor="summary"
      title="Summary paragraph"
      intro="A short paragraph at the top that answers the page's main question, so an AI assistant can quote it. Paste it into the page's intro text."
    >
      <GenerateButton busy={busy} again={summary !== null} onClick={generate} disabledReason={textPendingReason(env)} label="Write a summary" />
      <ErrorText text={error} />
      {summary !== null && (
        <>
          <p className="rounded-md bg-neutral-bg p-2 text-sm leading-snug">{summary}</p>
          <span className="text-xs text-subtle-text">{summary.split(/\s+/).filter(Boolean).length} words</span>
          <ApplyBar copy={summary} applied={false} />
        </>
      )}
    </AssistCard>
  );
}
