"use client";

// The panel's Agent View tab (plan section 6.3, Phase 7): what an AI agent gets
// when it asks this page for Markdown. The four accept.md checks (P5), the
// token saving, the Markdown itself (served, or the local preview converted
// from the draft), its quality (P6, once Markdown is served) and how to fix it.

import { useMemo, useState } from "react";
import { mdiRobotOutline } from "@mdi/js";
import { OwnerBadge } from "@/components/shared/Chips";
import { EmptyState } from "@/components/shared/EmptyState";
import { FixButton } from "@/components/shared/FixButton";
import { MarkdownFixes } from "@/components/shared/MarkdownFixes";
import { Segmented } from "@/components/shared/Segmented";
import { Spinner, StatusIcon } from "@/components/shared/StatusIcon";
import { gradePageNegotiation } from "@/lib/checks/page/read";
import { markdownResponseType, mediaType, negotiationTiles, type NegotiationTile } from "@/lib/checks/markdown-negotiation";
import type { PageFields } from "@/lib/checks/types";
import type { CheckRowModel, DisplayStatus } from "@/lib/checks/view-model";
import { estimateTokens, toAgentMarkdown } from "@/lib/markdown/convert";
import { CHROME_PASS, COVERAGE_PASS, gradeMarkdownQuality } from "@/lib/markdown/quality";
import type { MarkdownCheckData } from "@/lib/markdown/types";
import type { ParsedHtml } from "@/lib/rule-engine/types";
import type { MarkdownCheckStatus } from "@/hooks/useMarkdownCheck";
import { cn } from "@/lib/utils";

const TILE_STATUS: Record<NegotiationTile["status"], DisplayStatus> = { pass: "pass", fail: "fix", na: "na" };
const TILE_STYLE: Record<NegotiationTile["status"], string> = {
  pass: "border-success-bg-active bg-success-bg",
  fail: "border-danger-bg-active bg-danger-bg",
  na: "bg-subtle-bg",
};

const num = (n: number) => n.toLocaleString("en-US");
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface AgentViewTabProps {
  data: MarkdownCheckData | null;
  status: MarkdownCheckStatus;
  /** P5's row, for Send to developer. */
  p5: CheckRowModel | null;
  pageUrl: string;
  /** The sanitised Page Builder draft: the preview is converted from it when there is one. */
  draftSource: string | null;
  /** What the page shows a person: the draft, or the live page. */
  body: ParsedHtml | null;
  /** The live page, which the served Markdown is compared with (P6). */
  live: ParsedHtml | null;
  fields: PageFields | null;
}

function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-subtle-text uppercase">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function TokenBar({ label, tokens, max, color }: { label: string; tokens: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-[68px] shrink-0 text-subtle-text">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(2, Math.round((tokens / max) * 100))}%` }} />
      </div>
      <span className="w-[52px] shrink-0 text-right tabular-nums">{num(tokens)}</span>
    </div>
  );
}

export function AgentViewTab({ data, status, p5, pageUrl, draftSource, body, live, fields }: AgentViewTabProps) {
  const [view, setView] = useState<"agent" | "human">("agent");

  const g = useMemo(() => (data ? gradePageNegotiation(data) : null), [data]);
  const served = g?.servesMarkdown ?? false;

  // The local preview: from the draft when there is one (unsaved edits included), otherwise the server's conversion of the published page.
  const preview = useMemo(() => {
    if (!data || served) return null;
    if (draftSource) {
      const markdown = toAgentMarkdown(draftSource, {
        title: fields?.metaTitle ?? live?.title ?? null,
        description: fields?.metaDescription ?? null,
        url: pageUrl,
      });
      return { markdown, tokens: estimateTokens(markdown), from: "draft" as const };
    }
    return data.preview ? { markdown: data.preview.markdown, tokens: data.preview.tokens, from: "live" as const } : null;
  }, [data, served, draftSource, fields, live, pageUrl]);

  const quality = useMemo(
    () => (served && data?.markdown.body && live ? gradeMarkdownQuality({ markdown: data.markdown.body, fields, html: live }) : null),
    [served, data, fields, live],
  );

  if (!data) {
    return status === "error" ? (
      <EmptyState icon={mdiRobotOutline} title="Couldn't request this page">
        The published page didn&apos;t answer our request. If it isn&apos;t published yet, publish it and re-scan.
      </EmptyState>
    ) : (
      <p className="flex items-center gap-2 px-4 py-6 text-sm text-subtle-text">
        <Spinner />
        Requesting this page as an AI agent…
      </p>
    );
  }
  if (!served && data.html.status !== 200) {
    return (
      <EmptyState icon={mdiRobotOutline} title="The published page wasn't found">
        {data.html.status === null
          ? `The request failed (${data.html.error}). Re-scan to try again.`
          : `It returned HTTP ${data.html.status}. If the page isn't published yet, publish it and re-scan.`}
      </EmptyState>
    );
  }

  const tiles = negotiationTiles(g!, markdownResponseType(data.markdown), mediaType(data.html.contentType) || `HTTP ${data.html.status}`);
  const allPass = tiles.every((t) => t.status === "pass");
  const markdownTokens = served ? data.markdown.tokens : (preview?.tokens ?? null);
  const htmlTokens = data.html.tokens;
  const saving = markdownTokens !== null && htmlTokens > 0 ? Math.max(0, 1 - markdownTokens / htmlTokens) : null;
  const shown = served ? data.markdown.body : preview?.markdown;
  const h1 = body?.headings.find((h) => h.level === 1)?.text ?? body?.title ?? live?.title ?? "";

  return (
    <div className="flex flex-col gap-3.5 px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">What AI agents receive</h2>
        <p className="text-sm leading-snug text-subtle-text">
          {!served
            ? "Agents ask for Markdown. Your site sends them the full HTML page instead."
            : allPass
              ? "Agents ask for Markdown, and your site sends it."
              : "Agents ask for Markdown and get it, but some of the setup is missing."}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2" aria-label="Markdown checks">
        {tiles.map((t) => (
          <li key={t.id} className={cn("flex flex-col gap-1 rounded-lg border p-2.5", TILE_STYLE[t.status])}>
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <StatusIcon status={TILE_STATUS[t.status]} className="size-4" />
              {t.label}
            </span>
            <span className="text-xs leading-snug">{t.text}</span>
          </li>
        ))}
      </ul>

      {saving !== null && markdownTokens !== null && (
        <section aria-label="Token saving" className="flex flex-col gap-2.5 rounded-[10px] border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-sm font-bold">{served ? "Markdown saves" : "If you served Markdown"}</span>
            <span className="text-lg font-bold whitespace-nowrap text-success-fg">
              {served ? "" : "about "}
              {pct(saving)} fewer tokens
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <TokenBar label="HTML" tokens={htmlTokens} max={htmlTokens} color="bg-gray-300" />
            <TokenBar label="Markdown" tokens={markdownTokens} max={htmlTokens} color="bg-success" />
          </div>
          <p className="text-xs text-subtle-text">Estimated tokens: about 4 characters each.</p>
        </section>
      )}

      <Section
        title="Preview"
        extra={
          <Segmented
            label="Show the page as"
            value={view}
            onChange={setView}
            options={[
              { value: "human", label: "Human" },
              { value: "agent", label: "Agent" },
            ]}
          />
        }
      >
        {view === "agent" ? (
          shown ? (
            <div className="flex flex-col gap-1.5">
              <pre
                tabIndex={0}
                aria-label="Markdown"
                className="max-h-[300px] overflow-auto rounded-[10px] bg-gray-900 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-gray-50"
              >
                {shown}
              </pre>
              <p className="text-xs leading-snug text-subtle-text">
                {served
                  ? `What your site sends for Accept: text/markdown${data.markdown.truncated ? " (first 50,000 characters)" : ""}.`
                  : `Preview: your site doesn't serve this yet. Converted in the app from ${preview?.from === "draft" ? "your draft" : "the published page"}.`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-subtle-text">No preview: the page couldn&apos;t be converted.</p>
          )
        ) : (
          <div className="flex max-h-[300px] flex-col gap-2 overflow-auto rounded-[10px] border p-3">
            {h1 && <span className="text-md font-bold">{h1}</span>}
            {body?.paragraphs[0] && <span className="text-xs leading-relaxed">{body.paragraphs[0]}</span>}
            <span className="text-xs text-subtle-text">
              Plus navigation, footer, scripts, styles and tracking: {num(htmlTokens)} tokens in total.
            </span>
          </div>
        )}
      </Section>

      <Section title="Is the Markdown complete?">
        {quality ? (
          <ul className="rounded-[10px] border">
            {[
              {
                ok: quality.frontMatter.title.ok && quality.frontMatter.description.ok,
                title: !quality.frontMatter.present
                  ? "No front matter."
                  : quality.frontMatter.title.ok && quality.frontMatter.description.ok
                    ? "Front matter has the page's title and description."
                    : !quality.frontMatter.description.ok
                      ? "Front matter has no matching description."
                      : "Front matter title doesn't match the page title.",
                text:
                  quality.frontMatter.present && !quality.frontMatter.description.ok && fields && !fields.metaDescription
                    ? "It comes from the Meta description field, which is empty."
                    : undefined,
              },
              {
                ok: quality.coverage === null || quality.coverage >= COVERAGE_PASS,
                title: quality.coverage === null ? "No content to compare." : `${pct(quality.coverage)} of your content is included.`,
                text: quality.missing[0] ? `Missing, e.g. "${quality.missing[0].slice(0, 80)}".` : undefined,
              },
              {
                ok: quality.chromeShare < CHROME_PASS,
                title:
                  quality.chromeShare < 0.005
                    ? "No menus, header or footer in it."
                    : `Menus, header and footer are ${quality.chromeShare < CHROME_PASS ? "only " : ""}${pct(quality.chromeShare)} of it.`,
                text: undefined,
              },
            ].map((r) => (
              <li key={r.title} className="flex items-start gap-2.5 border-b px-3 py-2.5 last:border-b-0">
                <StatusIcon status={r.ok ? "pass" : "improve"} className="mt-0.5" />
                <span className="text-sm leading-snug">
                  <strong>{r.title}</strong>
                  {r.text && <span className="text-subtle-text"> {r.text}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-[10px] border bg-subtle-bg px-3 py-2.5 text-sm text-subtle-text">
            <StatusIcon status="na" />
            Checked once your site serves Markdown.
          </p>
        )}
      </Section>

      {!allPass && (
        <Section title="How to fix" extra={<OwnerBadge owner="developer" />}>
          <MarkdownFixes />
          {p5 && (
            <div className="flex justify-end">
              <FixButton row={p5} pageUrl={pageUrl} primary />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
