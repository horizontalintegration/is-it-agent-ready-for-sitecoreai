"use client";

import { useState } from "react";
import type { FaqSource, PageWriteContext } from "@/hooks/usePageFields";
import { requestAssist, requestMeta } from "@/lib/assist/client";
import { isSharedDatasource, type AltStatus, type ImageTarget } from "@/lib/assist/images";
import type { QaPair } from "@/lib/rule-engine/types";
import type { MetaField } from "@/lib/server/generate-meta";
import { FIELD_MAP } from "@/lib/sitecore/field-map";
import { richTextWithText, setImageAlt, writeDisabledReason, type WriteRequest } from "@/lib/sitecore/write";
import { Chip } from "@/components/shared/Chips";
import { Button } from "@/components/ui/button";
import { ApplyBar, AssistCard, BeforeAfter, ErrorText, GenerateButton } from "./parts";
import { allOk, textPendingReason, type AssistEnv } from "./env";

// The AI Assist cards that can write to a field (through the confirm dialog).

const errorOf = (err: unknown) => (err instanceof Error ? err.message : "Generation failed.");

function reasonFor(env: AssistEnv, configuredField: string | null, fieldOnItem: string | null, itemKind = "page") {
  if (!env.demo && env.hasClient && !env.writeContext.pageId) return "The page isn't loaded yet.";
  return writeDisabledReason({ hasClient: env.hasClient, demo: Boolean(env.demo), configuredField, fieldOnItem, itemKind });
}

function pageWrite(ctx: PageWriteContext, field: string, label: string, before: string, after: string, display?: WriteRequest["display"]): WriteRequest {
  return {
    target: { via: "updateFields", pageId: ctx.pageId ?? "", language: ctx.language, field },
    label,
    itemLabel: ctx.pageName ?? "this page",
    before,
    after,
    display,
  };
}

// ── Meta and social (P9, P11): the existing generator, now with a confirm ────

const META_FIELDS: Array<{ key: MetaField; label: string; min?: number; max: number; nameKey: keyof PageWriteContext["fieldNames"]; configured: string }> = [
  { key: "metaTitle", label: "Meta title", min: 50, max: 60, nameKey: "pageTitle", configured: FIELD_MAP.metaTitle },
  { key: "metaDescription", label: "Meta description", min: 120, max: 160, nameKey: "metaDescription", configured: FIELD_MAP.metaDescription },
  { key: "ogTitle", label: "Social title (Open Graph)", max: 70, nameKey: "ogTitle", configured: FIELD_MAP.ogTitle },
  { key: "ogDescription", label: "Social description (Open Graph)", max: 200, nameKey: "ogDescription", configured: FIELD_MAP.ogDescription },
];

function MetaFieldRow({ env, spec, current }: { env: AssistEnv; spec: (typeof META_FIELDS)[number]; current: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const fieldName = env.writeContext.fieldNames[spec.nameKey];

  const generate = async () => {
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      const res = await requestMeta({ field: spec.key, pageTitle: env.pageTitle, bodyText: env.mainText, currentValue: current }, env.demo);
      setValue(res.value);
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!fieldName || value === null) return;
    const results = await env.confirmWrite([pageWrite(env.writeContext, fieldName, spec.label, current, value.trim())]);
    if (allOk(results)) {
      setApplied(true);
      env.onWritten();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-semibold">{spec.label}</span>
        <GenerateButton busy={busy} again={value !== null} onClick={generate} disabledReason={textPendingReason(env)} />
      </div>
      {value === null ? (
        <span className="text-xs text-subtle-text break-words">Now: {current ? current : <em>empty</em>}</span>
      ) : (
        <>
          <BeforeAfter before={current} after={value} onEdit={(v) => { setValue(v); setApplied(false); }} limit={{ min: spec.min, max: spec.max }} label={`Suggested ${spec.label.toLowerCase()}`} />
          <ApplyBar reason={reasonFor(env, spec.configured, fieldName)} onApply={apply} copy={value} applied={applied} />
        </>
      )}
      <ErrorText text={error} />
    </div>
  );
}

export function MetaCard({ env, current, gainPts }: { env: AssistEnv; current: Record<MetaField, string>; gainPts: number }) {
  return (
    <AssistCard
      anchor="understand.title-meta"
      title="Title, description and social"
      gainPts={gainPts}
      intro={!env.bodyPending && !env.mainText ? "The page text couldn't be read, so suggestions use only the title and the current values." : "Written from your draft content, in the brand voice."}
    >
      {META_FIELDS.map((spec) => (
        <MetaFieldRow key={spec.key} env={env} spec={spec} current={current[spec.key] ?? ""} />
      ))}
    </AssistCard>
  );
}

// ── FAQ answers (P12) ────────────────────────────────────────────────────────

const FAQ_MIN = 40;
const FAQ_MAX = 300;
const inRange = (s: string) => s.length >= FAQ_MIN && s.length <= FAQ_MAX;

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  /** Null when the pair wasn't found in an AccordionItem datasource: copy-only. */
  source: FaqSource | null;
}

export function FaqCard({ env, sources, draftPairs, gainPts }: { env: AssistEnv; sources: FaqSource[]; draftPairs: QaPair[]; gainPts: number }) {
  const rows: FaqRow[] = sources.length > 0
    ? sources.map((s) => ({ id: s.itemId, question: s.question, answer: s.answer, source: s }))
    : draftPairs.map((p, i) => ({ id: `q${i + 1}`, question: p.question, answer: p.answer, source: null }));
  const flagged = rows.filter((r) => !inRange(r.answer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Record<string, string> | null>(null);
  const [applied, setApplied] = useState<Record<string, boolean>>({});

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const asked = (flagged.length > 0 ? flagged : rows).slice(0, 15);
      const data = await requestAssist(
        { kind: "faq-answers", pageTitle: env.pageTitle, mainText: env.mainText, pairs: asked.map((r) => ({ id: r.id, question: r.question, answer: r.answer })) },
        env.demo,
      );
      if (data.kind === "faq-answers") setSuggested(Object.fromEntries(data.answers.map((a) => [a.id, a.answer])));
      setApplied({});
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (row: FaqRow, text: string) => {
    const s = row.source;
    if (!s) return;
    const results = await env.confirmWrite([
      {
        target: { via: "updateItem", itemId: s.itemId, language: env.writeContext.language, field: s.answerField },
        label: "FAQ answer",
        itemLabel: `“${row.question}” (${s.path.split("/").slice(-2).join("/")})`,
        before: s.answerHtml,
        after: richTextWithText(s.answerHtml, text.trim()),
        display: { before: s.answer, after: text.trim() },
        shared: isSharedDatasource(s.path, env.writeContext.pagePath),
      },
    ]);
    if (allOk(results)) {
      setApplied((a) => ({ ...a, [row.id]: true }));
      env.onWritten();
    }
  };

  const copyOnly = sources.length === 0;
  return (
    <AssistCard
      anchor="understand.faq-quality"
      title="Quotable FAQ answers"
      gainPts={gainPts}
      intro={
        <>
          AI assistants quote FAQ answers word for word, so each should answer the question in its first sentence and stand alone, in {FAQ_MIN}–{FAQ_MAX} characters.{" "}
          {flagged.length > 0 ? `${flagged.length} of ${rows.length} answers need it.` : `All ${rows.length} answers are in range; you can still ask for tighter versions.`}
          {copyOnly && " These answers aren't in FAQ (AccordionItem) components, so copy them into the editor."}
        </>
      }
    >
      <GenerateButton busy={busy} again={suggested !== null} onClick={generate} disabledReason={textPendingReason(env)} label={flagged.length > 0 ? `Rewrite ${flagged.length} answer${flagged.length > 1 ? "s" : ""}` : "Suggest tighter answers"} />
      <ErrorText text={error} />
      {suggested && rows.filter((r) => suggested[r.id] !== undefined).map((r) => (
        <div key={r.id} className="flex flex-col gap-1.5 border-t pt-2">
          <span className="text-sm font-semibold">{r.question}</span>
          <BeforeAfter
            before={r.answer}
            after={suggested[r.id]}
            onEdit={(v) => { setSuggested((s) => ({ ...s!, [r.id]: v })); setApplied((a) => ({ ...a, [r.id]: false })); }}
            limit={{ min: FAQ_MIN, max: FAQ_MAX }}
            label={`Suggested answer to ${r.question}`}
          />
          <ApplyBar
            reason={r.source ? reasonFor(env, r.source.answerField, r.source.answerField, "FAQ item") : undefined}
            onApply={r.source ? () => apply(r, suggested[r.id]) : undefined}
            copy={suggested[r.id]}
            applied={Boolean(applied[r.id])}
            appliedText="Saved to the FAQ item (draft, not published)"
          />
        </div>
      ))}
    </AssistCard>
  );
}

// ── Image alt text (P15) ─────────────────────────────────────────────────────

const ALT_STATUS: Record<AltStatus, { text: string; tone: "danger" | "warning" | "success" }> = {
  missing: { text: "No alt text", tone: "danger" },
  filename: { text: "Alt is a file name", tone: "warning" },
  ok: { text: "Has alt text", tone: "success" },
};

function fileOf(src: string) {
  try {
    return decodeURIComponent(new URL(src).pathname.split("/").pop() ?? src);
  } catch {
    return src.split("/").pop() ?? src;
  }
}

function AltRow({ env, target }: { env: AssistEnv; target: ImageTarget }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const absolute = /^https?:\/\//i.test(target.src);
  const field = target.field;

  const generate = async () => {
    setBusy(true);
    setError(null);
    setApplied(false);
    try {
      const data = await requestAssist(
        { kind: "alt", pageTitle: env.pageTitle, mainText: env.mainText, image: { src: target.src, currentAlt: target.alt } },
        env.demo,
      );
      if (data.kind === "alt") {
        setValue(data.alt);
        setNote(data.sawImage ? null : "Claude couldn't open the image, so this is based on the file name and the page text. Check it against the image.");
      }
    } catch (err) {
      setError(errorOf(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!field || value === null) return;
    const alt = value.trim();
    const after = setImageAlt(field.value, alt);
    if (!after) return;
    const display = { before: target.alt ?? "", after: alt };
    const req: WriteRequest =
      field.owner === "page"
        ? pageWrite(env.writeContext, field.field, "Alt text", field.value, after, display)
        : {
            target: { via: "updateItem", itemId: field.itemId, language: env.writeContext.language, field: field.field },
            label: "Alt text",
            itemLabel: field.itemPath.split("/").slice(-2).join("/"),
            before: field.value,
            after,
            display,
            shared: field.shared,
          };
    const results = await env.confirmWrite([req]);
    if (allOk(results)) {
      setApplied(true);
      env.onWritten();
    }
  };

  const reason = field
    ? reasonFor(env, field.field, field.field, field.owner === "page" ? "page" : "component")
    : "This image isn't from an image field (for example, it's inside rich text), so copy the alt text into the editor.";

  return (
    <div className="flex flex-col gap-2 border-t pt-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2.5">
        {env.demo ? (
          // Demo mode makes no requests, so no preview.
          <span aria-hidden className="h-11 w-16 shrink-0 rounded bg-neutral-bg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a preview of the author's own image, any host
          <img src={target.src} alt="" className="h-11 w-16 shrink-0 rounded bg-neutral-bg object-cover" loading="lazy" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold" title={target.src}>{fileOf(target.src)}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone={ALT_STATUS[target.status].tone}>{ALT_STATUS[target.status].text}</Chip>
            {field?.shared && <Chip tone="warning">Shared component</Chip>}
          </span>
        </div>
      </div>
      <GenerateButton busy={busy} again={value !== null} onClick={generate} disabledReason={!absolute ? "This image's address can't be read." : textPendingReason(env)} label="Suggest alt text" />
      {value === null ? (
        <span className="text-xs text-subtle-text break-words">Now: {target.alt ? target.alt : <em>none</em>}</span>
      ) : (
        <>
          <BeforeAfter before={target.alt ?? ""} after={value} onEdit={(v) => { setValue(v); setApplied(false); }} limit={{ max: 125 }} multiline={false} label={`Alt text for ${fileOf(target.src)}`} />
          {note && <span className="text-xs text-warning-fg">{note}</span>}
          <ApplyBar reason={reason} onApply={field ? apply : undefined} copy={value} applied={applied} appliedText="Saved to the image field (draft, not published)" />
          {!field && <span className="text-xs text-subtle-text">{reason}</span>}
        </>
      )}
      <ErrorText text={error} />
    </div>
  );
}

export function AltCard({ env, targets, loading, gainPts }: { env: AssistEnv; targets: ImageTarget[]; loading: boolean; gainPts: number }) {
  const [showAll, setShowAll] = useState(false);
  const needs = targets.filter((t) => t.status !== "ok");
  const shown = showAll ? targets : needs;
  return (
    <AssistCard
      anchor="understand.image-alt"
      title="Image alt text"
      gainPts={gainPts}
      intro="Agents can't see images: alt text is how they learn what an image shows. It's saved on the image field, so it changes this use of the image only (not the media library item)."
    >
      {loading && <p className="text-sm text-subtle-text">Finding where each image comes from…</p>}
      {!loading && needs.length === 0 && <p className="text-sm text-subtle-text">Every image has descriptive alt text.</p>}
      {shown.map((t) => (
        <AltRow key={t.src} env={env} target={t} />
      ))}
      {targets.length > needs.length && (
        <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show only images that need alt text" : `Show all ${targets.length} images`}
        </Button>
      )}
    </AssistCard>
  );
}

// ── Author byline (P17): no AI ───────────────────────────────────────────────

const OTHER = "__other__";

export function AuthorCard({ env, names, loading, current, gainPts }: { env: AssistEnv; names: string[]; loading: boolean; current: string; gainPts: number }) {
  const options = [...new Set([current, ...names].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [choice, setChoice] = useState(current || "");
  const [other, setOther] = useState("");
  const [applied, setApplied] = useState(false);
  const fieldName = env.writeContext.fieldNames.author;
  const value = (choice === OTHER ? other : choice).trim();

  const apply = async () => {
    if (!fieldName || !value) return;
    const results = await env.confirmWrite([pageWrite(env.writeContext, fieldName, "Author", current, value)]);
    if (allOk(results)) {
      setApplied(true);
      env.onWritten();
    }
  };

  const reason = value === current ? "Choose a different person to change the byline." : reasonFor(env, FIELD_MAP.author, fieldName);
  return (
    <AssistCard
      anchor="trust.author"
      title="Author byline"
      gainPts={gainPts}
      intro="A named author tells agents who stands behind the article. The page shows it as the byline and in its structured data once you publish. A link to an author profile page needs a developer."
    >
      <label htmlFor="assist-author" className="text-sm text-subtle-text">
        Choose a person who writes for this site{loading ? " (loading names…)" : ""}
      </label>
      <select
        id="assist-author"
        className="h-10 rounded-md border bg-body-bg px-2 text-sm"
        value={choice}
        onChange={(e) => { setChoice(e.target.value); setApplied(false); }}
      >
        {!current && <option value="">No author</option>}
        {options.map((n) => (
          <option key={n} value={n}>
            {n}{n === current ? " (now)" : ""}
          </option>
        ))}
        <option value={OTHER}>Someone else…</option>
      </select>
      {choice === OTHER && (
        <input aria-label="Author name" className="h-10 rounded-md border bg-neutral-bg px-2 text-sm" placeholder="Full name" value={other} onChange={(e) => setOther(e.target.value)} />
      )}
      <ApplyBar reason={reason} onApply={apply} copy={value} applied={applied} applyLabel="Apply" appliedText="Byline saved (draft, not published)" />
    </AssistCard>
  );
}

// ── Structured data (P10): built from the page, no AI ────────────────────────

export function JsonLdCard({ env, snippet, gainPts }: { env: AssistEnv; snippet: string; gainPts: number }) {
  const [applied, setApplied] = useState(false);
  const fieldName = env.writeContext.fieldNames.jsonLd;
  const current = "";

  const apply = async () => {
    if (!fieldName) return;
    const results = await env.confirmWrite([pageWrite(env.writeContext, fieldName, "Structured data", current, snippet)]);
    if (allOk(results)) {
      setApplied(true);
      env.onWritten();
    }
  };

  return (
    <AssistCard
      anchor="understand.json-ld"
      title="Structured data (JSON-LD)"
      gainPts={gainPts}
      intro="Built from this page's content: it tells agents what the page is (an article, a set of answers, its place in the site). Your developer adds it to the page template, or Apply saves it when the template has a field for it."
    >
      <details className="rounded-md border">
        <summary className="cursor-pointer px-2 py-1.5 text-sm font-semibold">Show code</summary>
        <pre className="max-h-48 overflow-auto bg-neutral-bg p-2 text-xs leading-snug">{snippet}</pre>
      </details>
      <ApplyBar reason={reasonFor(env, FIELD_MAP.jsonLd, fieldName)} onApply={apply} copy={snippet} applied={applied} />
    </AssistCard>
  );
}
