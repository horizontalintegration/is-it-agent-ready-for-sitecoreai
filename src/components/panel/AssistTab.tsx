"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { useConfirmWrite } from "@/components/shared/WriteConfirm";
import { useAuthorNames, useImageFields } from "@/hooks/useAssistSources";
import type { FaqSource, PageWriteContext } from "@/hooks/usePageFields";
import type { Demo } from "@/lib/assist/client";
import { matchImages } from "@/lib/assist/images";
import { isArticleTemplate } from "@/lib/checks/context";
import type { CheckRowModel } from "@/lib/checks/view-model";
import type { AssistDemo } from "@/lib/rule-engine/test-fixture";
import type { QaPair } from "@/lib/rule-engine/types";
import type { MetaField } from "@/lib/server/generate-meta";
import { FIELD_MAP } from "@/lib/sitecore/field-map";
import { QuestionHeadingsCard, SummaryCard } from "./assist/CopyCards";
import { AltCard, AuthorCard, FaqCard, JsonLdCard, MetaCard } from "./assist/WriteCards";
import type { AssistEnv } from "./assist/env";

// ─────────────────────────────────────────────────────────────────────────────
// The AI Assist tab (plan sections 6.3 and Phase 9; mockup PanelAssist):
// suggested fixes written from the draft, each with before → after and an
// Apply that goes through the confirm dialog, or Copy where there's no field.
// Cards follow the points they'd add; the summary paragraph (no check) last.
// ─────────────────────────────────────────────────────────────────────────────

interface AssistTabProps {
  client: ClientSDK | null;
  /** `?demo=1`: the fixture's suggestions and fields; writes off. */
  demo: { answers: Demo; data: AssistDemo } | null;
  /** True while the tab is showing: the image and author lookups wait for it. */
  active: boolean;
  writeContext: PageWriteContext;
  fieldValues: Record<string, string>;
  faqSources: FaqSource[];
  datasources: string[];
  currentMeta: Record<MetaField, string>;
  pageTitle: string;
  mainText: string;
  bodyPending: boolean;
  templateName: string | null;
  /** From the page scan: the draft's images, H2s and Q&A pairs. */
  images: Array<{ src: string; alt: string | null }>;
  h2s: string[];
  qaPairs: QaPair[];
  /** Every page check's row, for "+N pts" and P10's snippet. */
  rows: CheckRowModel[];
  /** The check whose Generate opened the tab: its card is scrolled into view. */
  focus: string | null;
  onWritten: () => void;
}

export function AssistTab(props: AssistTabProps) {
  const { client, demo, active, writeContext, rows, focus } = props;
  const confirmWrite = useConfirmWrite();
  const gain = (id: string) => rows.find((r) => r.id === id)?.gainPts ?? 0;
  const row = (id: string) => rows.find((r) => r.id === id) ?? null;

  const env: AssistEnv = {
    demo: demo?.answers ?? null,
    hasClient: Boolean(client),
    writeContext: demo ? { ...writeContext, pageId: demo.data.pageId, pagePath: demo.data.pagePath, pageName: "How to build an effective content strategy", fieldNames: demo.data.fieldNames } : writeContext,
    pageTitle: props.pageTitle,
    mainText: props.mainText,
    bodyPending: props.bodyPending,
    confirmWrite,
    onWritten: props.onWritten,
  };

  const fieldValues = demo ? demo.data.fieldValues : props.fieldValues;
  const faqSources = demo ? demo.data.faqSources : props.faqSources;
  const imageFields = useImageFields({
    client,
    contextId: writeContext.sitecoreContextId,
    enabled: active,
    pageId: writeContext.pageId,
    pagePath: writeContext.pagePath,
    language: writeContext.language,
    pageFieldValues: fieldValues,
    datasources: props.datasources,
    demo: demo ? demo.data.imageFields : null,
  });
  const targets = useMemo(() => matchImages(props.images, imageFields.fields), [props.images, imageFields.fields]);

  const isArticle = isArticleTemplate(props.templateName);
  const authors = useAuthorNames({
    client,
    contextId: writeContext.sitecoreContextId,
    enabled: active && isArticle,
    pagePath: writeContext.pagePath,
    language: writeContext.language,
    demo: demo ? demo.data.authorNames : null,
  });
  const authorField = env.writeContext.fieldNames.author ?? FIELD_MAP.author;
  const currentAuthor = fieldValues[authorField] ?? "";

  // Generate on the Score tab: bring that check's card into view.
  useEffect(() => {
    if (!active || !focus) return;
    const el = document.getElementById(`assist-${focus === "understand.metadata" ? "understand.title-meta" : focus}`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [active, focus]);

  const jsonLdSnippet = row("understand.json-ld")?.codePreview ?? null;
  const qaCount = faqSources.length || props.qaPairs.length;

  const cards: Array<{ key: string; gain: number; node: ReactNode }> = [
    { key: "meta", gain: gain("understand.title-meta") + gain("understand.metadata"), node: <MetaCard env={env} current={props.currentMeta} gainPts={gain("understand.title-meta") + gain("understand.metadata")} /> },
    ...(qaCount > 0 ? [{ key: "faq", gain: gain("understand.faq-quality"), node: <FaqCard env={env} sources={faqSources} draftPairs={props.qaPairs} gainPts={gain("understand.faq-quality")} /> }] : []),
    ...(targets.length > 0 || imageFields.status === "loading"
      ? [{ key: "alt", gain: gain("understand.image-alt"), node: <AltCard env={env} targets={targets} loading={imageFields.status === "loading"} gainPts={gain("understand.image-alt")} /> }]
      : []),
    ...(jsonLdSnippet ? [{ key: "json-ld", gain: gain("understand.json-ld"), node: <JsonLdCard env={env} snippet={jsonLdSnippet} gainPts={gain("understand.json-ld")} /> }] : []),
    ...(isArticle
      ? [{ key: "author", gain: gain("trust.author"), node: <AuthorCard key={currentAuthor} env={env} names={authors.names} loading={authors.status === "loading"} current={currentAuthor} gainPts={gain("trust.author")} /> }]
      : []),
    ...(props.h2s.length > 0 ? [{ key: "headings", gain: gain("understand.question-headings"), node: <QuestionHeadingsCard env={env} headings={props.h2s} gainPts={gain("understand.question-headings")} /> }] : []),
  ];
  cards.sort((a, b) => b.gain - a.gain);

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Suggested fixes</h2>
        <p className="text-sm leading-snug text-subtle-text">
          Written from your draft content. Review each one, then apply it to the field.
        </p>
      </div>
      {cards.map((c) => (
        <div key={c.key}>{c.node}</div>
      ))}
      <SummaryCard env={env} />
      <p className="text-sm leading-snug text-subtle-text">
        Changes are saved to this page&apos;s current version and follow your workflow. Nothing is published automatically.
        {demo && " Demo: suggestions are examples and nothing is written."}
      </p>
    </div>
  );
}
