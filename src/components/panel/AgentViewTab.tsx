"use client";

// The panel's Agent View tab (plan section 6.3, Phase 7): what an AI agent gets
// when it asks this page for Markdown. The four accept.md checks (P5), the
// token saving, Before / After (Phase 13: the HTML an agent downloads today,
// with its waste marked, and the Markdown, served or the local preview
// converted from the draft, with what it removes), why it matters, the
// Markdown's quality (P6, once Markdown is served) and how to fix it.

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
import { ANATOMY_KINDS, WASTE_KINDS } from "@/lib/markdown/anatomy";
import { estimateTokens, toAgentMarkdown } from "@/lib/markdown/convert";
import { CHROME_PASS, COVERAGE_PASS, gradeMarkdownQuality } from "@/lib/markdown/quality";
import type { AnatomyKind, HtmlAnatomy, HtmlExcerpt, MarkdownCheckData } from "@/lib/markdown/types";
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
/** A share of the page in words: "under 1%" rather than "0%" for a sliver. */
const share = (part: number, total: number) => (part > 0 && part / total < 0.005 ? "under 1%" : pct(total > 0 ? part / total : 0));

type View = "before" | "after";

const KIND_LABEL: Record<AnatomyKind, string> = {
  content: "Your content",
  scripts: "Scripts",
  styles: "Styles",
  markup: "Markup",
  chrome: "Menus, header and footer",
  structuredData: "Structured data",
};
// Red for what agents pay for and throw away, neutral grey for JSON-LD (agents use it).
const KIND_SWATCH: Record<AnatomyKind, string> = {
  content: "bg-primary",
  scripts: "bg-danger-700",
  styles: "bg-danger-500",
  markup: "bg-danger-400",
  chrome: "bg-danger-200",
  structuredData: "bg-gray-300",
};
const isWaste = (kind: AnatomyKind) => WASTE_KINDS.includes(kind);

interface AgentViewTabProps {
  data: MarkdownCheckData | null;
  status: MarkdownCheckStatus;
  /** P5's row, for Send to developer. */
  p5: CheckRowModel | null;
  pageUrl: string;
  /** The sanitised Page Builder draft: the preview is converted from it when there is one. */
  draftSource: string | null;
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

/** Before: where the page's tokens go, as a stacked bar and a legend in words. */
function TokenBreakdown({ anatomy, total }: { anatomy: HtmlAnatomy; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 gap-px overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        {ANATOMY_KINDS.filter((k) => anatomy.tokens[k] > 0).map((k) => (
          <div key={k} className={KIND_SWATCH[k]} style={{ width: `${(anatomy.tokens[k] / total) * 100}%`, minWidth: 3 }} />
        ))}
      </div>
      <ul aria-label="Where the tokens go" className="flex flex-col gap-1">
        {ANATOMY_KINDS.map((k) => (
          <li key={k} className="flex items-center gap-2 text-xs">
            <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-sm", KIND_SWATCH[k])} />
            <span className="min-w-0 flex-1">{KIND_LABEL[k]}</span>
            <span className="tabular-nums">{num(anatomy.tokens[k])}</span>
            <span className="w-[58px] shrink-0 text-right text-subtle-text tabular-nums">{share(anatomy.tokens[k], total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Before: the start of the HTML, each red category in a red <mark>, the category in a hidden label. */
function HtmlExcerptView({ excerpt, total, contentStartsAt }: { excerpt: HtmlExcerpt; total: number; contentStartsAt: number | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <pre
        tabIndex={0}
        aria-label="The start of the page's HTML"
        className="max-h-[300px] overflow-auto rounded-[10px] border bg-subtle-bg p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {excerpt.segments.map((s, i) =>
          s.kind === "content" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <mark
              key={i}
              title={KIND_LABEL[s.kind]}
              className={isWaste(s.kind) ? "bg-danger-bg text-danger-fg" : "bg-gray-200 text-body-text"}
            >
              <span className="sr-only">{KIND_LABEL[s.kind]}: </span>
              {s.text}
            </mark>
          ),
        )}
      </pre>
      <p className="text-xs leading-snug text-subtle-text">
        Showing the first {num(excerpt.tokens)} of {num(total)} tokens.
        {contentStartsAt !== null && contentStartsAt >= excerpt.tokens && ` Your content starts about ${num(contentStartsAt)} tokens in.`}
      </p>
    </div>
  );
}

/** After: each red category struck through, with the tokens it saves, and the total saving. */
function RemovedList({ anatomy, saved, saving, measured }: { anatomy: HtmlAnatomy; saved: number; saving: number; measured: boolean }) {
  const rows = WASTE_KINDS.filter((k) => anatomy.tokens[k] > 0);
  return (
    <section aria-labelledby="agent-view-removed" className="flex flex-col gap-1.5">
      <h4 id="agent-view-removed" className="text-xs font-bold">
        What was removed
      </h4>
      <ul className="rounded-[10px] border">
        {rows.map((k) => (
          <li key={k} className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-sm last:border-b-0">
            <del className="text-subtle-text">{KIND_LABEL[k]}</del>
            <span className="font-semibold whitespace-nowrap text-success-fg tabular-nums">−{num(anatomy.tokens[k])}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <strong className="text-success-fg">−{num(saved)} tokens</strong>, {measured ? "" : "about "}
        {pct(saving)} fewer
      </p>
    </section>
  );
}

export function AgentViewTab({ data, status, p5, pageUrl, draftSource, live, fields }: AgentViewTabProps) {
  const g = useMemo(() => (data ? gradePageNegotiation(data) : null), [data]);
  const served = g?.servesMarkdown ?? false;

  // Before shows the problem first; a page that serves Markdown opens on its win. A pick sticks until the page changes.
  const [picked, setPicked] = useState<{ url: string; view: View } | null>(null);
  const view: View = picked?.url === pageUrl ? picked.view : served ? "after" : "before";

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
  const anatomy = data.html.anatomy;
  const waste = anatomy ? WASTE_KINDS.reduce((sum, k) => sum + anatomy.tokens[k], 0) : 0;

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
        title="Compare"
        extra={
          <Segmented
            label="Show the page"
            value={view}
            onChange={(v) => setPicked({ url: pageUrl, view: v })}
            options={[
              { value: "before", label: "Before" },
              { value: "after", label: "After" },
            ]}
          />
        }
      >
        {view === "before" ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs leading-snug text-subtle-text">Without optimisation: the full web page an agent downloads today.</p>
            {anatomy && htmlTokens > 0 ? (
              <>
                <TokenBreakdown anatomy={anatomy} total={htmlTokens} />
                <p className="text-sm leading-snug">
                  {`Your content is ${share(anatomy.tokens.content, htmlTokens)} of what an agent downloads. ${share(waste, htmlTokens)} (${num(waste)} tokens) is code and layout.`}
                </p>
                {data.html.excerpt && <HtmlExcerptView excerpt={data.html.excerpt} total={htmlTokens} contentStartsAt={anatomy.contentStartsAt} />}
              </>
            ) : (
              <p className="text-sm text-subtle-text">The web page is {num(htmlTokens)} tokens. Re-scan to see where they go.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs leading-snug text-subtle-text">With optimisation: the same page as Markdown.</p>
            {shown ? (
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
            )}
            {anatomy && saving !== null && markdownTokens !== null && (
              <RemovedList anatomy={anatomy} saved={Math.max(0, htmlTokens - markdownTokens)} saving={saving} measured={served} />
            )}
          </div>
        )}
      </Section>

      <section aria-labelledby="agent-view-why" className="flex flex-col gap-2 rounded-[10px] border bg-subtle-bg p-3">
        <h3 id="agent-view-why" className="text-sm font-bold">
          Why it matters
        </h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs leading-snug">
          <li>
            <strong>It fits:</strong> agents read within a fixed token budget. This page is {num(htmlTokens)} tokens
            {anatomy ? `, and ${num(anatomy.tokens.content)} of them are your content` : ""}. A page that is mostly code can be cut short
            before they reach your content.
          </li>
          <li>
            <strong>It&apos;s easier to quote:</strong> with less noise, your answer is easier for an agent to find and cite correctly.
          </li>
          <li>
            <strong>It&apos;s cheaper to read:</strong>{" "}
            {markdownTokens !== null
              ? `as Markdown this page is ${served ? "" : "about "}${num(markdownTokens)} tokens instead of ${num(htmlTokens)}, so agents can read more of your site for the same cost.`
              : "agents can read more of your site for the same cost."}
          </li>
        </ul>
      </section>

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
