"use client";

import { useEffect, useState } from "react";
import { Chip } from "@/components/shared/Chips";
import { FixButton } from "@/components/shared/FixButton";
import { StatusIcon } from "@/components/shared/StatusIcon";
import { Segmented } from "@/components/shared/Segmented";
import { Button } from "@/components/ui/button";
import { needsWork, toCheckRow, type DisplayStatus } from "@/lib/checks/view-model";
import type { SiteReport, Tier } from "@/lib/checks/types";
import type { CrawlerPermission, FooterTrust, RobotsTxt } from "@/lib/rule-engine/types";

const TIER_TEXT: Record<Tier, string> = { essential: "Essential", recommended: "Recommended", bonus: "Bonus" };

type Purpose = "Search" | "Training";

/** The crawlers robots.txt is checked for today. Phase 6 adds live requests and the user-fetch agents. */
const BOTS: Array<{ key: keyof RobotsTxt; name: string; company: string; purpose: Purpose }> = [
  { key: "perplexityBot", name: "PerplexityBot", company: "Perplexity", purpose: "Search" },
  { key: "amazonBot", name: "Amazonbot", company: "Amazon", purpose: "Search" },
  { key: "gptBot", name: "GPTBot", company: "OpenAI", purpose: "Training" },
  { key: "claudeBot", name: "ClaudeBot", company: "Anthropic", purpose: "Training" },
  { key: "googleExtended", name: "Google-Extended", company: "Google", purpose: "Training" },
  { key: "appleBotExtended", name: "Applebot-Extended", company: "Apple", purpose: "Training" },
];

const PERMISSION: Record<CrawlerPermission, { status: DisplayStatus; robots: string; result: string }> = {
  allowed: { status: "pass", robots: "Allowed", result: "Can read" },
  blocked: { status: "fix", robots: "Disallowed", result: "Blocked by robots.txt" },
  unknown: { status: "pass", robots: "Not mentioned", result: "Can read (allowed by default)" },
};

const FOOTER_SIGNALS: Array<{ key: keyof FooterTrust; label: string }> = [
  { key: "hasAbout", label: "About" },
  { key: "hasContact", label: "Contact" },
  { key: "hasPrivacy", label: "Privacy" },
  { key: "hasTerms", label: "Terms" },
  { key: "hasSecurity", label: "Security or trust" },
  { key: "hasAddress", label: "Postal address" },
];

/** The footer's identity links, fetched once per domain (demo mode uses the fixture). */
function useFooterTrust(siteUrl: string, demo: FooterTrust | null) {
  const [state, setState] = useState<{ footer: FooterTrust | null; error: boolean }>({ footer: null, error: false });
  useEffect(() => {
    if (demo || !siteUrl) return;
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    fetch(`${base}/api/footer-check?domain=${encodeURIComponent(siteUrl)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("footer-check failed"))))
      .then((footer: FooterTrust) => !cancelled && setState({ footer, error: false }))
      .catch(() => !cancelled && setState({ footer: null, error: true }));
    return () => {
      cancelled = true;
    };
  }, [siteUrl, demo]);
  return demo ? { footer: demo, error: false } : state;
}

interface AgentAccessTabProps {
  siteUrl: string;
  /** Null while robots.txt and the home page are being fetched. */
  report: SiteReport | null;
  robotsTxt: RobotsTxt | null;
  /** Demo mode's footer, so nothing is fetched. */
  demoFooter: FooterTrust | null;
  onOpenFiles: () => void;
}

function ChecklistItem({
  status,
  title,
  tier,
  detail,
  action,
}: {
  status: DisplayStatus;
  title: string;
  tier: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-t py-3">
      <StatusIcon status={status} withText className="mt-0.5 w-[88px]" />
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-md font-semibold">{title}</span>
          <Chip>{tier}</Chip>
        </span>
        <span className="text-sm leading-snug text-subtle-text">{detail}</span>
      </div>
      {action}
    </li>
  );
}

export function AgentAccessTab({ siteUrl, report, robotsTxt, demoFooter, onOpenFiles }: AgentAccessTabProps) {
  const [purpose, setPurpose] = useState<"All" | Purpose>("All");
  const { footer, error: footerError } = useFooterTrust(siteUrl, demoFooter);

  const present = footer ? FOOTER_SIGNALS.filter((s) => footer[s.key]) : [];
  const missing = footer ? FOOTER_SIGNALS.filter((s) => !footer[s.key]) : [];
  const footerStatus: DisplayStatus = !footer ? "not-checked" : present.length >= 5 ? "pass" : present.length >= 3 ? "improve" : "fix";

  const bots = BOTS.filter((b) => purpose === "All" || b.purpose === purpose);
  const blocked = robotsTxt ? BOTS.filter((b) => robotsTxt[b.key] === "blocked") : [];

  return (
    <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-5 p-4 sm:p-6">
      <section aria-labelledby="site-checklist" className="flex min-w-0 flex-[1_1_420px] flex-col gap-1 rounded-xl border bg-body-bg p-[18px]">
        <h2 id="site-checklist" className="text-lg font-bold">Site checklist</h2>
        <p className="mb-2 text-sm text-subtle-text">Checked once for the whole site. Every page inherits these. They aren&apos;t part of the page scores.</p>
        {report === null ? (
          <p className="border-t py-3 text-sm text-subtle-text">Checking robots.txt and the home page…</p>
        ) : (
          <ul>
            {report.outcomes.map((o) => {
              const row = toCheckRow(o);
              const action = !needsWork(row) ? undefined : row.id === "reach.robots-ai-rules" ? (
                <Button type="button" size="sm" variant="outline" className="text-sm" onClick={onOpenFiles}>
                  Open robots.txt help
                </Button>
              ) : (
                <FixButton row={row} pageUrl={siteUrl} />
              );
              return (
                <ChecklistItem key={row.id} status={row.display} title={row.title} tier={TIER_TEXT[row.tier]} detail={row.message} action={action} />
              );
            })}
            <ChecklistItem
              status={footerStatus}
              title="About, contact and policy pages are linked"
              tier="Not scored yet"
              detail={
                footer
                  ? missing.length === 0
                    ? "The footer links every identity page and shows a postal address."
                    : `Found ${present.map((s) => s.label).join(", ") || "none"}. Missing: ${missing.map((s) => s.label).join(", ")}.`
                  : footerError
                    ? "Couldn't read the home page footer."
                    : "Checking the home page footer…"
              }
            />
          </ul>
        )}
      </section>

      <section aria-labelledby="bot-grid" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 rounded-xl border bg-body-bg p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-col gap-1">
            <h2 id="bot-grid" className="text-lg font-bold">Can each AI agent get in?</h2>
            <p className="text-sm text-subtle-text">What your robots.txt says to each AI crawler.</p>
          </div>
          <Segmented
            label="Filter agents by purpose"
            value={purpose}
            onChange={setPurpose}
            options={[
              { value: "All", label: "All" },
              { value: "Search", label: "Search" },
              { value: "Training", label: "Training" },
            ]}
          />
        </div>
        {robotsTxt === null ? (
          <p className="text-sm text-subtle-text">{report === null ? "Reading robots.txt…" : "Couldn't read robots.txt."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="text-xs font-bold tracking-wide text-subtle-text uppercase">
                  <th scope="col" className="border-b px-3 py-2.5">Agent</th>
                  <th scope="col" className="border-b px-3 py-2.5">Company</th>
                  <th scope="col" className="border-b px-3 py-2.5">Purpose</th>
                  <th scope="col" className="border-b px-3 py-2.5">robots.txt</th>
                  <th scope="col" className="border-b px-3 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((b) => {
                  const p = PERMISSION[robotsTxt[b.key]];
                  return (
                    <tr key={b.key} className="border-b text-md last:border-b-0">
                      <th scope="row" className="px-3 py-2.5 font-mono text-sm font-normal">{b.name}</th>
                      <td className="px-3 py-2.5">{b.company}</td>
                      <td className="px-3 py-2.5"><Chip tone={b.purpose === "Search" ? "primary" : "neutral"}>{b.purpose}</Chip></td>
                      <td className="px-3 py-2.5">{p.robots}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <StatusIcon status={p.status} withText />
                          <span className="text-sm">{p.result}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {blocked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-danger-bg-active bg-danger-bg p-3">
            <p className="flex-[1_1_320px] text-sm leading-normal">
              <strong>{blocked.length === 1 ? "1 AI crawler is" : `${blocked.length} AI crawlers are`} blocked by robots.txt:</strong>{" "}
              {blocked.map((b) => b.name).join(", ")}. Their AI answers can&apos;t use your pages.
            </p>
            <Button type="button" size="sm" className="text-sm" onClick={onOpenFiles}>
              Open robots.txt help
            </Button>
          </div>
        )}
        <p className="text-sm text-subtle-text">
          robots.txt is a request, not a lock: your firewall or CDN decides who actually gets in. Coming soon: we&apos;ll request your
          home page as each agent to catch firewall blocks.
        </p>
      </section>
    </div>
  );
}
