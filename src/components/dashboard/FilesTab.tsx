"use client";

import { useId, useMemo, useState } from "react";
import { Chip } from "@/components/shared/Chips";
import { FlashText, useFlash } from "@/components/shared/FixButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { copyText } from "@/lib/clipboard";
import { buildLlmsTxt } from "@/lib/llms-txt/build";
import { ALMOST_PCT } from "@/lib/score-thresholds";
import type { RobotsTxt } from "@/lib/rule-engine/types";
import type { PageMatrixRow } from "@/types/dashboard";

const ROBOTS_BOTS: Array<{ key: keyof RobotsTxt; name: string }> = [
  { key: "gptBot", name: "GPTBot" },
  { key: "claudeBot", name: "ClaudeBot" },
  { key: "perplexityBot", name: "PerplexityBot" },
  { key: "amazonBot", name: "Amazonbot" },
  { key: "googleExtended", name: "Google-Extended" },
  { key: "appleBotExtended", name: "Applebot-Extended" },
];

const card = "flex min-w-0 flex-[1_1_480px] flex-col gap-3.5 rounded-xl border bg-body-bg p-[18px]";
const field = "w-full rounded-lg border border-border-color-a11y bg-body-bg p-2.5 text-md";
const code = "max-h-[360px] overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-50";

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

interface FilesTabProps {
  pages: PageMatrixRow[];
  siteUrl: string;
  siteName: string;
  robotsTxt: RobotsTxt | null;
  onOpenAgentAccess: () => void;
}

export function FilesTab({ pages, siteUrl, siteName, robotsTxt, onOpenAgentAccess }: FilesTabProps) {
  return (
    <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-5 p-4 sm:p-6">
      <LlmsTxtCard pages={pages} siteUrl={siteUrl} siteName={siteName} />
      <RobotsCard siteUrl={siteUrl} robotsTxt={robotsTxt} onOpenAgentAccess={onOpenAgentAccess} />
    </div>
  );
}

function LlmsTxtCard({ pages, siteUrl, siteName }: { pages: PageMatrixRow[]; siteUrl: string; siteName: string }) {
  const ids = { tagline: useId(), when: useId(), only: useId() };
  const [tagline, setTagline] = useState("Digital experience platform");
  const [whenToUse, setWhenToUse] = useState("");
  const [onlyReady, setOnlyReady] = useState(true);
  const [flash, setFlash] = useFlash();

  // The score filter only means something once pages are scanned. Unscanned pages are always kept.
  const hasAnyScore = pages.some((p) => p.score != null);
  const scoreThreshold = onlyReady && hasAnyScore ? ALMOST_PCT : null;
  const { content, includedCount } = useMemo(
    () => buildLlmsTxt(pages, { siteDomain: siteUrl, siteName, tagline, whenToUse, scoreThreshold }),
    [pages, siteUrl, siteName, tagline, whenToUse, scoreThreshold],
  );
  const qualifying = useMemo(
    () => buildLlmsTxt(pages, { siteDomain: siteUrl, siteName, tagline: "", scoreThreshold: ALMOST_PCT }).includedCount,
    [pages, siteUrl, siteName],
  );

  const note = `Please publish this file at ${siteUrl.replace(/\/+$/, "")}/llms.txt. In a headless SitecoreAI setup, add it to the head application's /public folder, or serve it from the site root through the CDN.\n\n${content}`;

  return (
    <section aria-labelledby="llms-title" className={card}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="llms-title" className="flex-1 text-lg font-bold">llms.txt</h2>
        <Chip>{includedCount} {includedCount === 1 ? "page" : "pages"} included</Chip>
      </div>
      <p className="text-md leading-normal text-subtle-text">
        A short guide to your site for AI tools: what it covers, when to use it, and the best pages. Built from your
        pages and their meta descriptions.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.tagline} className="text-sm font-semibold">One-line summary of the site</label>
        <input id={ids.tagline} type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} className={field} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.when} className="text-sm font-semibold">When should AI tools use this site?</label>
        <textarea
          id={ids.when}
          rows={3}
          value={whenToUse}
          onChange={(e) => setWhenToUse(e.target.value)}
          placeholder="For example: Use this site for guidance on building content-led customer journeys, written by our product team."
          className={`${field} resize-y leading-normal`}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id={ids.only} checked={onlyReady} disabled={!hasAnyScore} onCheckedChange={(v) => setOnlyReady(v === true)} />
        <label htmlFor={ids.only} className="text-md">
          Only include pages scoring {ALMOST_PCT} or more{hasAnyScore ? ` (${qualifying} pages)` : ""}
        </label>
      </div>
      {!hasAnyScore && <p className="text-sm text-subtle-text">Scan your pages to filter by score. Until then every page is listed.</p>}

      <pre className={code} tabIndex={0} aria-label="Generated llms.txt">{content}</pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="text-sm" onClick={async () => setFlash((await copyText(content)) ? "Copied" : "Copy failed")}>
          Copy
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-sm" onClick={() => { download("llms.txt", content); setFlash("Downloaded"); }}>
          Download
        </Button>
        <Button type="button" size="sm" className="text-sm" onClick={async () => setFlash((await copyText(note)) ? "Copied for your developer" : "Copy failed")}>
          Send to developer to publish
        </Button>
        <FlashText text={flash} />
      </div>
    </section>
  );
}

function RobotsCard({ siteUrl, robotsTxt, onOpenAgentAccess }: { siteUrl: string; robotsTxt: RobotsTxt | null; onOpenAgentAccess: () => void }) {
  const [flash, setFlash] = useFlash();
  const blocked = robotsTxt ? ROBOTS_BOTS.filter((b) => robotsTxt[b.key] === "blocked") : [];
  const lines = blocked.flatMap((b) => [`User-agent: ${b.name}`, "Allow: /", ""]).join("\n").trim();
  const note = `In ${siteUrl.replace(/\/+$/, "")}/robots.txt, remove the Disallow rules for ${blocked.map((b) => b.name).join(", ")}, or add:\n\n${lines}`;

  return (
    <section aria-labelledby="robots-title" className={card}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="robots-title" className="flex-1 text-lg font-bold">robots.txt help</h2>
        {robotsTxt &&
          (blocked.length === 0 ? (
            <Chip tone="success">✓ AI crawlers allowed</Chip>
          ) : (
            <Chip tone="danger">✕ {blocked.length} AI {blocked.length === 1 ? "crawler" : "crawlers"} blocked</Chip>
          ))}
      </div>
      <p className="text-md leading-normal text-subtle-text">
        Your robots.txt tells AI crawlers which pages they may read. A crawler you block can&apos;t use your pages in its
        answers.
      </p>
      {robotsTxt === null ? (
        <p className="text-sm text-subtle-text">robots.txt hasn&apos;t been read yet, or couldn&apos;t be.</p>
      ) : blocked.length === 0 ? (
        <p className="text-md">None of the AI crawlers we check for is blocked. Nothing to change.</p>
      ) : (
        <>
          <p className="text-md">
            To let them in, remove their <code className="font-mono">Disallow</code> rules, or add these lines:
          </p>
          <pre className={code} tabIndex={0} aria-label="robots.txt lines to add">{lines}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="text-sm" onClick={async () => setFlash((await copyText(lines)) ? "Copied" : "Copy failed")}>
              Copy
            </Button>
            <Button type="button" size="sm" className="text-sm" onClick={async () => setFlash((await copyText(note)) ? "Copied for your developer" : "Copy failed")}>
              Send to developer
            </Button>
            <FlashText text={flash} />
          </div>
        </>
      )}
      <p className="text-sm leading-normal text-subtle-text">
        robots.txt is a request, not a lock. Firewall rules decide who actually gets in: see{" "}
        <Button type="button" variant="link" size="sm" className="h-auto px-0 text-sm" onClick={onOpenAgentAccess}>
          Agent access
        </Button>
        .
      </p>
    </section>
  );
}
