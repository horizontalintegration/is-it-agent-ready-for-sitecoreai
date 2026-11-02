"use client";

import { useId, useMemo, useState } from "react";
import { Chip } from "@/components/shared/Chips";
import { FlashText, useFlash } from "@/components/shared/FixButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BOTS, type BotPurpose } from "@/lib/agent-access/bots";
import { readRobots, robotsVerdict } from "@/lib/agent-access/grid";
import { buildRobotsLines } from "@/lib/agent-access/robots-helper";
import { contentSignals, siteSitemap } from "@/lib/agent-access/robots";
import type { AgentAccessData } from "@/lib/agent-access/types";
import { copyText } from "@/lib/clipboard";
import { buildLlmsTxt } from "@/lib/llms-txt/build";
import { ALMOST_PCT } from "@/lib/score-thresholds";
import type { PageMatrixRow } from "@/types/dashboard";

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
  /** The agent-access scan: whether llms.txt and robots.txt are published, and robots.txt's rules today. */
  access: AgentAccessData | null;
  onOpenAgentAccess: () => void;
}

export function FilesTab({ pages, siteUrl, siteName, access, onOpenAgentAccess }: FilesTabProps) {
  return (
    <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-5 p-4 sm:p-6">
      <LlmsTxtCard pages={pages} siteUrl={siteUrl} siteName={siteName} access={access} />
      {/* Re-mounted per scan, so the checkboxes start from the robots.txt just read. */}
      <RobotsCard key={access?.checkedAt ?? "none"} siteUrl={siteUrl} access={access} onOpenAgentAccess={onOpenAgentAccess} />
    </div>
  );
}

/** "Published? ✓/✕" for llms.txt, from the agent-access scan (as S5 reads it). */
function LlmsStatus({ access }: { access: AgentAccessData | null }) {
  if (!access) return null;
  const { probe, text } = access.llmsTxt;
  if (probe.status === null) return <Chip>Couldn&apos;t check /llms.txt</Chip>;
  const published = probe.status === 200 && text !== null && !text.trimStart().startsWith("<");
  return published ? (
    <Chip tone="success">✓ Published</Chip>
  ) : (
    <Chip tone="danger">✕ Not published · /llms.txt returns {probe.status === 200 ? "a web page" : probe.status}</Chip>
  );
}

function LlmsTxtCard({ pages, siteUrl, siteName, access }: { pages: PageMatrixRow[]; siteUrl: string; siteName: string; access: AgentAccessData | null }) {
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
        <LlmsStatus access={access} />
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

const GROUP_LABEL: Record<BotPurpose, string> = {
  search: "Let AI search engines find and cite pages",
  user: "Let AI assistants open pages when a user asks",
  training: "Let AI companies train models on your content",
};

/** Up to three agent names per group, for the checkbox labels. */
const examples = (purpose: BotPurpose) => {
  const names = BOTS.filter((b) => b.purpose === purpose).map((b) => b.name);
  return `${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`;
};

function RobotsCard({ siteUrl, access, onOpenAgentAccess }: { siteUrl: string; access: AgentAccessData | null; onOpenAgentAccess: () => void }) {
  const [flash, setFlash] = useFlash();
  const ids = { search: useId(), user: useId(), training: useId(), signals: useId() };

  // Start from what robots.txt allows today: a group is "allowed" when none of its agents is disallowed.
  const robots = access ? readRobots(access) : null;
  const allows = (purpose: BotPurpose) =>
    !robots || BOTS.filter((b) => b.purpose === purpose).every((b) => robotsVerdict(robots, b.name) !== "disallowed");
  const [allow, setAllow] = useState<Record<BotPurpose, boolean>>({ search: allows("search"), user: allows("user"), training: allows("training") });
  const [signals, setSignals] = useState(true);

  const origin = siteUrl.replace(/\/+$/, "");
  const sitemapUrl = (robots?.parsed && siteSitemap(robots.parsed, origin)) ?? `${origin}/sitemap.xml`;
  const lines = buildRobotsLines({ allow, contentSignal: signals, sitemapUrl });
  const note = `Please add these lines to ${origin}/robots.txt and keep the rules that are already there. If the file already has a group for one of these user agents, replace that group.\n\n${lines}`;

  const searchBlocked = robots?.parsed ? !allows("search") || !allows("user") : false;
  const hasSignal = robots?.parsed ? contentSignals(robots.parsed).length > 0 : false;

  return (
    <section aria-labelledby="robots-title" className={card}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="robots-title" className="flex-1 text-lg font-bold">robots.txt helper</h2>
        {robots &&
          (robots.state === "ok" ? (
            searchBlocked ? <Chip tone="danger">✕ Blocks AI search</Chip> : <Chip tone="success">✓ Published · AI search allowed</Chip>
          ) : robots.state === "no-file" ? (
            <Chip>No robots.txt yet</Chip>
          ) : (
            <Chip>Couldn&apos;t read robots.txt</Chip>
          ))}
      </div>
      <p className="text-md leading-normal text-subtle-text">
        Choose what AI tools may do with your content. We generate the lines to add.
        {hasSignal && " Your robots.txt already has a Content-Signal line; replace it with this one."}
      </p>
      <div className="flex flex-col gap-1">
        {(Object.keys(GROUP_LABEL) as BotPurpose[]).map((p) => (
          <div key={p} className="flex min-h-9 items-center gap-2.5">
            <Checkbox id={ids[p]} checked={allow[p]} onCheckedChange={(v) => setAllow((a) => ({ ...a, [p]: v === true }))} />
            <label htmlFor={ids[p]} className="text-md">
              {GROUP_LABEL[p]} ({examples(p)})
            </label>
          </div>
        ))}
        <div className="flex min-h-9 items-center gap-2.5">
          <Checkbox id={ids.signals} checked={signals} onCheckedChange={(v) => setSignals(v === true)} />
          <label htmlFor={ids.signals} className="text-md">Add a Content-Signal line (machine-readable usage choices)</label>
        </div>
      </div>
      <pre className={code} tabIndex={0} aria-label="Generated robots.txt lines">{lines}</pre>
      <p className="text-sm leading-normal text-subtle-text">
        robots.txt is a request, not a lock. Firewall rules decide who actually gets in: see{" "}
        <Button type="button" variant="link" size="sm" className="h-auto px-0 text-sm" onClick={onOpenAgentAccess}>
          Agent access
        </Button>
        .
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="text-sm" onClick={async () => setFlash((await copyText(lines)) ? "Copied" : "Copy failed")}>
          Copy
        </Button>
        <Button type="button" size="sm" className="text-sm" onClick={async () => setFlash((await copyText(note)) ? "Copied for your developer" : "Copy failed")}>
          Send to developer
        </Button>
        <FlashText text={flash} />
      </div>
    </section>
  );
}
