"use client";

import { useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import type { PageWriteContext } from "@/hooks/usePageFields";

type MetaField = "metaTitle" | "metaDescription" | "ogTitle" | "ogDescription";

interface FieldConfig {
  key: MetaField;
  label: string;
  maxChars: number;
  /** Key into PageWriteContext.fieldNames (metaTitle is stored under pageTitle). */
  nameKey: keyof PageWriteContext["fieldNames"];
}

const FIELDS: FieldConfig[] = [
  { key: "metaTitle", label: "Meta title", maxChars: 60, nameKey: "pageTitle" },
  { key: "metaDescription", label: "Meta description", maxChars: 155, nameKey: "metaDescription" },
  { key: "ogTitle", label: "OG title", maxChars: 70, nameKey: "ogTitle" },
  { key: "ogDescription", label: "OG description", maxChars: 200, nameKey: "ogDescription" },
];

interface MetaGeneratorProps {
  client: ClientSDK | null;
  writeContext: PageWriteContext;
  /** Current field values shown to the author and sent as generation context. */
  current: Record<MetaField, string>;
  /** Page title + body text used to ground generation. */
  pageTitle: string;
  bodyText: string;
}

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "";

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface FieldRowProps {
  field: MetaField;
  label: string;
  maxChars: number;
  nameKey: keyof PageWriteContext["fieldNames"];
  client: ClientSDK | null;
  writeContext: MetaGeneratorProps["writeContext"];
  currentValue: string;
  pageTitle: string;
  bodyText: string;
}

function FieldRow({
  field,
  label,
  maxChars,
  nameKey,
  client,
  writeContext,
  currentValue,
  pageTitle,
  bodyText,
}: FieldRowProps) {

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [populated, setPopulated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldName = writeContext.fieldNames[nameKey];
  const canPopulate = Boolean(client && writeContext.pageId && fieldName);

  async function generate() {
    setIsGenerating(true);
    setError(null);
    setPopulated(false);
    try {
      const res = await fetch(`${BASE}/api/generate-meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, pageTitle, bodyText, currentValue }),
      });
      if (!res.ok) {
        setError("Generation failed. Try again.");
        return;
      }
      const data = (await res.json()) as { value?: string };
      if (data.value) setSuggestion(data.value);
      else setError("No suggestion returned.");
    } catch {
      setError("Generation failed. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function populate() {
    if (!client || !writeContext.pageId || !fieldName || !suggestion) return;
    setIsPopulating(true);
    setError(null);
    try {
      await client.mutate("xmc.pages.updateFields", {
        params: {
          path: { pageId: writeContext.pageId },
          body: {
            language: writeContext.language,
            fields: [{ name: fieldName, value: suggestion }],
          },
          ...(writeContext.sitecoreContextId
            ? { query: { sitecoreContextId: writeContext.sitecoreContextId } }
            : {}),
        },
      } as Parameters<ClientSDK["mutate"]>[1]);
      setPopulated(true);
    } catch (err) {
      console.error("[MetaGenerator] updateFields failed:", err);
      setError("Could not write to the field.");
    } finally {
      setIsPopulating(false);
    }
  }

  const over = suggestion ? suggestion.length > maxChars : false;

  return (
    <div className="px-3 py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-gray-700 flex-1">{label}</span>
        <button
          onClick={generate}
          disabled={isGenerating}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
            isGenerating
              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
              : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
          }`}
        >
          {isGenerating ? (
            <>
              <Spinner />
              Generating…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M11 2 8.5 8.5 2 11l6.5 2.5L11 20l2.5-6.5L20 11l-6.5-2.5L11 2z" />
              </svg>
              {suggestion ? "Regenerate" : "Generate"}
            </>
          )}
        </button>
      </div>

      {currentValue ? (
        <p className="text-[11px] text-gray-400 mb-1 truncate" title={currentValue}>
          Current: {currentValue}
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 mb-1 italic">Current: empty</p>
      )}

      {suggestion && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2 mt-1">
          <p className="text-xs text-gray-800 whitespace-pre-wrap">{suggestion}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[11px] ${over ? "text-amber-600" : "text-gray-400"}`}>
              {suggestion.length}/{maxChars} chars
            </span>
            <span className="flex-1" />
            {populated ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
                Populated
              </span>
            ) : (
              <button
                onClick={populate}
                disabled={!canPopulate || isPopulating}
                title={canPopulate ? undefined : "This field isn't available on the current page template."}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                  !canPopulate || isPopulating
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {isPopulating ? (
                  <>
                    <Spinner />
                    Populating…
                  </>
                ) : (
                  "Populate field"
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function MetaGenerator({
  client,
  writeContext,
  current,
  pageTitle,
  bodyText,
}: MetaGeneratorProps) {
  return (
    <section className="mt-3">
      <div className="px-3 py-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex-1">
          Meta &amp; social — AI generate
        </h2>
        <span className="text-[10px] text-gray-400">brand-aligned</span>
      </div>
      <div className="bg-white border-y border-gray-200">
        {FIELDS.map((f) => (
          <FieldRow
            key={f.key}
            field={f.key}
            label={f.label}
            maxChars={f.maxChars}
            nameKey={f.nameKey}
            client={client}
            writeContext={writeContext}
            currentValue={current[f.key] ?? ""}
            pageTitle={pageTitle}
            bodyText={bodyText}
          />
        ))}
      </div>
    </section>
  );
}
