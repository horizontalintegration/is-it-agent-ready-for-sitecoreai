"use client";

import { useMemo, useState } from "react";
import { Chip } from "@/components/shared/Chips";
import { FixButton, FlashText, useFlash } from "@/components/shared/FixButton";
import { Spinner, StatusIcon } from "@/components/shared/StatusIcon";
import { Segmented } from "@/components/shared/Segmented";
import { Button } from "@/components/ui/button";
import { PURPOSE_TEXT, isAnswerBot, type BotPurpose } from "@/lib/agent-access/bots";
import { botGrid, ROBOTS_TEXT, type BotRow } from "@/lib/agent-access/grid";
import type { AgentAccessData } from "@/lib/agent-access/types";
import { copyText } from "@/lib/clipboard";
import { developerNote, fixButton, needsWork, toCheckRow, type CheckRowModel, type DisplayStatus } from "@/lib/checks/view-model";
import { SPOOF_CAVEAT } from "@/lib/checks/site/reach";
import { listText } from "@/lib/checks/site/shared";
import type { SiteReport, Tier } from "@/lib/checks/types";
import type { AgentAccessStatus } from "@/hooks/useAgentAccess";
import { timeAgo } from "@/lib/relative-time";

const TIER_TEXT: Record<Tier, string> = { essential: "Essential", recommended: "Recommended", bonus: "Bonus" };

const PURPOSE_TONE: Record<BotPurpose, "blue" | "primary" | "neutral"> = { search: "blue", user: "primary", training: "neutral" };

const ROW_STATUS: Record<BotRow["status"], DisplayStatus> = { pass: "pass", fix: "fix", info: "na", "not-checked": "not-checked" };

interface AgentAccessTabProps {
  siteUrl: string;
  /** Null until the agent-access scan is in. */
  report: SiteReport | null;
  access: AgentAccessData | null;
  status: AgentAccessStatus;
  onRetry: () => void;
  onOpenFiles: () => void;
}

function ChecklistItem({ row, action }: { row: CheckRowModel; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-t py-3">
      {/* A scored "info" result is a Bonus check that isn't set: it applies, it just adds nothing. */}
      <StatusIcon status={row.display} withText text={row.state === "scored" && row.display === "na" ? "Not set" : undefined} className="mt-0.5 w-[100px]" />
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-md font-semibold">{row.title}</span>
          <Chip>{TIER_TEXT[row.tier]}</Chip>
        </span>
        <span className="text-sm leading-snug text-subtle-text">{row.message}</span>
      </div>
      {action}
    </li>
  );
}

export function AgentAccessTab({ siteUrl, report, access, status, onRetry, onOpenFiles }: AgentAccessTabProps) {
  const [purpose, setPurpose] = useState<"all" | BotPurpose>("all");
  const [flash, setFlash] = useFlash();

  const rows = useMemo(() => (access ? botGrid(access) : []), [access]);
  const shown = rows.filter((r) => purpose === "all" || r.bot.purpose === purpose);
  const firewall = rows.filter((r) => isAnswerBot(r.bot) && (r.outcome === "blocked" || r.outcome === "challenge"));
  const s1 = report?.outcomes.find((o) => o.check.id === "reach.ai-bot-access");
  const scanning = status === "loading" || (status === "idle" && !access);

  /** The button a checklist row gets. Files-tab checks open the right tool there. */
  const actionFor = (row: CheckRowModel) => {
    const filesButton = (label: string) => (
      <Button type="button" size="sm" variant="outline" className="text-sm" onClick={onOpenFiles}>{label}</Button>
    );
    if (row.id === "reach.content-signals" && row.state === "scored" && row.points < row.maxPoints) return filesButton("Generate line");
    if (!needsWork(row)) return undefined;
    if (row.id === "reach.robots-ai-rules") return filesButton("Open robots.txt help");
    if (row.id === "read.llms-txt") return filesButton("Open generator");
    if (fixButton(row) === "show-how") return undefined;
    return <FixButton row={row} pageUrl={siteUrl} />;
  };

  return (
    <div className="mx-auto flex max-w-[1320px] flex-wrap items-start gap-5 p-4 sm:p-6">
      <section aria-labelledby="site-checklist" className="flex min-w-0 flex-[1_1_420px] flex-col gap-1 rounded-xl border bg-body-bg p-[18px]">
        <h2 id="site-checklist" className="text-lg font-bold">Site checklist</h2>
        <p className="mb-2 text-sm text-subtle-text">Checked once for the whole site. Every page inherits these. They aren&apos;t part of the page scores.</p>
        {report === null ? (
          <p className="flex items-center gap-2 border-t py-3 text-sm text-subtle-text">
            {scanning && <Spinner />}
            {scanning ? "Checking the site…" : "The site couldn't be checked."}
          </p>
        ) : (
          <ul>
            {report.outcomes.map((o) => {
              const row = toCheckRow(o);
              return <ChecklistItem key={row.id} row={row} action={actionFor(row)} />;
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="bot-grid" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 rounded-xl border bg-body-bg p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-col gap-1">
            <h2 id="bot-grid" className="text-lg font-bold">Can each AI agent get in?</h2>
            <p className="text-sm text-subtle-text">
              We request your home page and two linked pages as each agent and compare the responses with a normal browser.
            </p>
          </div>
          <Segmented
            label="Filter agents by purpose"
            value={purpose}
            onChange={setPurpose}
            options={[
              { value: "all", label: "All" },
              { value: "search", label: "Search" },
              { value: "user", label: "User" },
              { value: "training", label: "Training" },
            ]}
          />
        </div>

        {!access ? (
          status === "error" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-subtle-text">Couldn&apos;t scan the site. It may be unreachable from our server.</p>
              <Button type="button" size="sm" variant="outline" className="text-sm" onClick={onRetry}>Try again</Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-subtle-text">
              <Spinner />
              Requesting your pages as each AI agent. This takes up to 20 seconds.
            </p>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="text-xs font-bold tracking-wide text-subtle-text uppercase">
                    <th scope="col" className="border-b px-3 py-2.5">Agent</th>
                    <th scope="col" className="border-b px-3 py-2.5">Company</th>
                    <th scope="col" className="border-b px-3 py-2.5">Purpose</th>
                    <th scope="col" className="border-b px-3 py-2.5">robots.txt</th>
                    <th scope="col" className="border-b px-3 py-2.5">Live request</th>
                    <th scope="col" className="border-b px-3 py-2.5">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.bot.name} className="border-b text-md last:border-b-0">
                      <th scope="row" className="px-3 py-2.5 font-mono text-sm font-normal">{r.bot.name}</th>
                      <td className="px-3 py-2.5">{r.bot.company}</td>
                      <td className="px-3 py-2.5"><Chip tone={PURPOSE_TONE[r.bot.purpose]}>{PURPOSE_TEXT[r.bot.purpose]}</Chip></td>
                      <td className="px-3 py-2.5">{ROBOTS_TEXT[r.robots]}</td>
                      <td className="px-3 py-2.5 tabular-nums">{r.live}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <StatusIcon status={ROW_STATUS[r.status]} />
                          <span className="text-sm">{r.result}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {firewall.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] border border-danger-bg-active bg-danger-bg p-3">
                <p className="flex-[1_1_320px] text-sm leading-normal">
                  <strong>
                    {firewall.length === 1 ? "1 agent" : `${firewall.length} agents`} blocked by your firewall.
                  </strong>{" "}
                  {firewall.every((r) => r.robots !== "disallowed") ? "robots.txt allows them, but " : ""}
                  {listText(firewall.map((r) => r.bot.name))} {firewall.length === 1 ? "gets" : "get"}{" "}
                  {firewall.every((r) => r.failStatus === firewall[0].failStatus && r.failStatus !== null)
                    ? `HTTP ${firewall[0].failStatus}`
                    : "blocked"}
                  . People who ask these assistants about your site get no answer from your pages.
                </p>
                {s1 && (
                  <Button
                    type="button"
                    size="sm"
                    className="text-sm"
                    onClick={async () => setFlash((await copyText(developerNote(toCheckRow(s1), siteUrl))) ? "Copied for your developer" : "Copy failed")}
                  >
                    Send to developer
                  </Button>
                )}
                <FlashText text={flash} />
              </div>
            )}

            <p className="text-sm text-subtle-text">
              robots.txt is a request, not a lock: your firewall or CDN decides who actually gets in. {SPOOF_CAVEAT}
            </p>
            <p className="text-xs text-subtle-text">
              {status === "loading" ? "Checking again…" : `Checked ${timeAgo(access.checkedAt) ?? "just now"}`} · {access.requestCount} requests in{" "}
              {(access.durationMs / 1000).toFixed(1)} s
            </p>
          </>
        )}
      </section>
    </div>
  );
}
