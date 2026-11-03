"use client";

import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { Chip, DeltaChip } from "@/components/shared/Chips";
import { Spinner, StatusIcon } from "@/components/shared/StatusIcon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCitationProbe } from "@/hooks/useCitationProbe";
import type { BotRow } from "@/lib/agent-access/grid";
import { citedDelta, classify, matchesHosts, probeTotals, runTotals } from "@/lib/citations/classify";
import { engineEstimates } from "@/lib/citations/readiness";
import {
  ENGINE_TEXT,
  PROBE_CACHE_DAYS,
  PROBE_CAVEAT,
  PROBE_COUNTRIES,
  QUESTION_MAX,
  QUESTION_MAX_CHARS,
  QUESTION_MIN,
  READINESS_TEXT,
  type CitationDemo,
  type ProbeEvidence,
  type ProbeOutcome,
  type Readiness,
} from "@/lib/citations/types";
import type { DisplayStatus } from "@/lib/checks/view-model";
import { cn } from "@/lib/utils";
import type { PageMatrixRow } from "@/types/dashboard";

const field = "w-full rounded-lg border border-border-color-a11y bg-body-bg p-2.5 text-md";
const CUSTOM = "__custom__";
const NO_COUNTRY = "__any__";

const READINESS_STYLE: Record<Readiness, { box: string; text: string; status: DisplayStatus }> = {
  ready: { box: "border-success-bg-active bg-success-bg", text: "text-success-fg", status: "pass" },
  limited: { box: "border-warning-bg-active bg-warning-bg", text: "text-warning-fg", status: "improve" },
  blocked: { box: "border-danger-bg-active bg-danger-bg", text: "text-danger-fg", status: "fix" },
  unknown: { box: "border bg-subtle-bg", text: "text-subtle-text", status: "not-checked" },
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const isHome = (route: string) => route === "/" || route === "";
const isArticleLike = (templateName: string) => /article|blog|news|post/i.test(templateName);

interface CitationsTabProps {
  pages: PageMatrixRow[];
  siteUrl: string;
  /** botGrid of the agent-access scan; null while it loads. */
  botRows: BotRow[] | null;
  /** Demo mode: sample questions and runs, nothing is fetched. */
  demo: CitationDemo | null;
  /** The page selected first (demo mode's probed page). */
  initialPageId?: string;
}

export function CitationsTab({ pages, siteUrl, botRows, demo, initialPageId }: CitationsTabProps) {
  // Content pages first (articles, then by name); the home page is rarely cited, so it goes last.
  const options = useMemo(
    () =>
      [...pages].sort((a, b) => {
        const rank = (p: PageMatrixRow) => (isHome(p.route) ? 2 : isArticleLike(p.templateName) ? 0 : 1);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      }),
    [pages],
  );
  const [pageId, setPageId] = useState<string>("");
  const [customUrl, setCustomUrl] = useState("");

  useEffect(() => {
    if (pageId || options.length === 0) return;
    setPageId(options.find((p) => p.id === initialPageId)?.id ?? options[0].id);
  }, [options, pageId, initialPageId]);

  const row = pageId === CUSTOM ? null : options.find((p) => p.id === pageId) ?? null;
  const pageUrl = pageId === CUSTOM ? customUrl : row?.pageUrl ?? "";
  const probe = useCitationProbe(pageUrl, siteUrl, demo);
  const estimates = useMemo(() => engineEstimates({ rows: botRows, page: row?.score ?? null }), [botRows, row]);

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5 p-4 sm:p-6">
      <PagePicker
        options={options}
        pageId={pageId}
        siteHosts={probe.siteHosts}
        customUrl={customUrl}
        onPick={setPageId}
        onCustomUrl={(url) => {
          setCustomUrl(url);
          setPageId(CUSTOM);
        }}
      />

      {/* Layer 1 */}
      <section aria-labelledby="cite-estimate" className="flex flex-col gap-3.5 rounded-xl border bg-body-bg p-[18px]">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 id="cite-estimate" className="text-lg font-bold">Can each engine cite this page?</h2>
          <Chip>Estimate · instant · from your checks</Chip>
        </div>
        <p className="-mt-2 text-sm text-subtle-text">
          From the agent-access scan{row?.score ? " and this page's score" : ""}. No AI is involved, so it&apos;s the same every time.
        </p>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {estimates.map((e) => {
            const style = READINESS_STYLE[e.readiness];
            return (
              <li key={e.engine} className={cn("flex flex-col gap-1.5 rounded-[10px] border p-3.5", style.box)}>
                <span className="font-bold">{ENGINE_TEXT[e.engine]}</span>
                <StatusIcon status={style.status} withText text={READINESS_TEXT[e.readiness]} className={cn("text-md", style.text)} />
                {e.reasons.map((r) => (
                  <span key={r} className="text-sm leading-snug text-subtle-text">{r}</span>
                ))}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Layer 2 */}
      <ProbeCard probe={probe} pageUrl={pageUrl} demo={demo !== null} />
    </div>
  );
}

function PagePicker({
  options,
  pageId,
  siteHosts,
  customUrl,
  onPick,
  onCustomUrl,
}: {
  options: PageMatrixRow[];
  pageId: string;
  siteHosts: string[];
  customUrl: string;
  onPick: (id: string) => void;
  onCustomUrl: (url: string) => void;
}) {
  const ids = { page: useId(), url: useId() };
  const [draft, setDraft] = useState(customUrl);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = draft.trim();
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (!raw || !matchesHosts(url, siteHosts)) {
      setError(siteHosts.length > 0 ? `Enter a page on ${siteHosts.join(" or ")}.` : "The site's domain isn't known yet.");
      return;
    }
    setError(null);
    onCustomUrl(url);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {options.length > 0 && (
        <div className="flex min-w-0 flex-[0_1_420px] flex-col gap-1.5">
          <span id={ids.page} className="text-md font-semibold">Page</span>
          <Select value={pageId} onValueChange={onPick}>
            <SelectTrigger aria-labelledby={ids.page} className="h-10 w-full text-md">
              <SelectValue placeholder="Choose a page" />
            </SelectTrigger>
            <SelectContent>
              {options.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.route || "/"}</SelectItem>
              ))}
              {pageId === CUSTOM && <SelectItem value={CUSTOM}>{customUrl}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )}
      <form onSubmit={submit} className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
        <label htmlFor={ids.url} className="text-md font-semibold">{options.length > 0 ? "Or a page URL" : "Page URL"}</label>
        <div className="flex gap-2">
          <input
            id={ids.url}
            type="url"
            inputMode="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={siteHosts[0] ? `https://${siteHosts[0]}/…` : "https://…"}
            aria-describedby={error ? `${ids.url}-error` : undefined}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border-color-a11y bg-body-bg px-3 text-md"
          />
          <Button type="submit" size="sm" variant="outline" className="h-10 text-sm">Use</Button>
        </div>
        {error && <span id={`${ids.url}-error`} role="alert" className="text-sm text-danger-fg">{error}</span>}
      </form>
    </div>
  );
}

type Probe = ReturnType<typeof useCitationProbe>;

function ProbeCard({ probe, pageUrl, demo }: { probe: Probe; pageUrl: string; demo: boolean }) {
  const [editing, setEditing] = useState(false);
  const { questions, current, status, rowState, siteHosts } = probe;
  const running = status === "running";

  const evidenceFor = useMemo(() => new Map((current?.evidence ?? []).map((e) => [e.question, e])), [current]);
  const outcomes = useMemo(
    () => (current ? current.evidence.map((e) => classify(e, siteHosts, pageUrl)) : []),
    [current, siteHosts, pageUrl],
  );
  const totals = probeTotals(outcomes);
  const delta = citedDelta(probe.runs, siteHosts, pageUrl);
  const countryLabel = PROBE_COUNTRIES.find((c) => c.code === (current?.country ?? probe.country))?.label;

  useEffect(() => setEditing(false), [pageUrl]);

  if (!pageUrl) {
    return (
      <section className="rounded-xl border bg-body-bg p-[18px] text-md text-subtle-text">
        Choose a page, or enter a page URL, to see whether AI answers cite it.
      </section>
    );
  }

  return (
    <section aria-labelledby="cite-probe" className="flex flex-col gap-4 rounded-xl border bg-body-bg p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 id="cite-probe" className="text-lg font-bold">Are AI answers citing this page?</h2>
            <Chip tone="primary">Measured · citation probe</Chip>
          </div>
          {current && (
            <p className="text-sm text-subtle-text">
              {plural(current.evidence.length, "real question")} asked with live web search on {longDate(current.at)}
              {countryLabel ? ` from ${/^(United|Netherlands)/.test(countryLabel) ? "the " : ""}${countryLabel}` : ""}. Results are kept for{" "}
              {PROBE_CACHE_DAYS} days.
            </p>
          )}
        </div>
        {questions && questions.length > 0 && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="text-sm" disabled={running} onClick={() => setEditing(true)}>
              Edit questions
            </Button>
            <Button type="button" size="sm" className="text-sm" disabled={running} onClick={probe.run}>
              {running ? "Asking…" : current ? "Run again" : "Run probe"}
            </Button>
          </div>
        )}
      </div>

      {probe.error && <p role="alert" className="rounded-lg border border-danger-bg-active bg-danger-bg px-3 py-2 text-sm text-danger-fg">{probe.error}</p>}

      {editing || (questions && questions.length === 0) ? (
        <QuestionEditor probe={probe} onDone={() => setEditing(false)} />
      ) : !questions ? (
        <div className="flex flex-col gap-3">
          <p className="text-md leading-normal text-subtle-text">
            Ask Claude {QUESTION_MIN}–{QUESTION_MAX} real questions this page should answer, with live web search, and see whether the answers find and
            cite it. Each question costs about 3 to 8 cents and runs only when you click.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="text-sm" disabled={status === "suggesting"} onClick={probe.suggest}>
              {status === "suggesting" ? "Suggesting…" : "Suggest questions"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-sm" onClick={() => probe.saveQuestions([], probe.country)}>
              Write my own
            </Button>
          </div>
        </div>
      ) : (
        <>
          {current && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <Tile label="Cited in the answer">
                <Big n={totals.cited} of={totals.searched} />
                <DeltaChip delta={delta} since="since last run" />
              </Tile>
              <Tile label="Found in search results">
                <Big n={totals.found} of={totals.searched} />
                <span className="text-sm text-subtle-text">
                  {totals.found === 0
                    ? "Not in the search results for any question"
                    : totals.foundNotCited > 0
                      ? `Found but not cited ${plural(totals.foundNotCited, "time")}`
                      : "Every time it was found, it was cited"}
                </span>
              </Tile>
              <Tile label="Most cited instead">
                {totals.topInstead ? (
                  <>
                    <span className="truncate pt-2 text-xl font-bold" title={totals.topInstead.host}>{totals.topInstead.host}</span>
                    <span className="text-sm text-subtle-text">Cited in {totals.topInstead.count} of {current.evidence.length} answers</span>
                  </>
                ) : (
                  <span className="pt-2 text-md text-subtle-text">No other site was cited.</span>
                )}
              </Tile>
            </div>
          )}
          {current && totals.notSearched > 0 && (
            <p className="text-sm text-subtle-text">
              {plural(totals.notSearched, "question")} {totals.notSearched === 1 ? "wasn't" : "weren't"} searched (Claude answered from memory), so{" "}
              {totals.notSearched === 1 ? "it isn't" : "they aren't"} counted. Running again asks {totals.notSearched === 1 ? "it" : "them"} again.
            </p>
          )}
          {probe.lastRun && !running && (
            <p className="text-sm text-subtle-text" role="status">
              {demo
                ? "Demo data: these are sample results, and nothing was asked."
                : probe.lastRun.cached === probe.lastRun.total
                  ? `Nothing was asked again: every answer came from the last ${PROBE_CACHE_DAYS} days' results.`
                  : probe.lastRun.cached > 0
                    ? `${probe.lastRun.cached} of ${probe.lastRun.total} answers came from the last ${PROBE_CACHE_DAYS} days' results; the rest were asked now.`
                    : null}
            </p>
          )}
          <ResultsTable questions={questions} evidenceFor={evidenceFor} rowState={rowState} siteHosts={siteHosts} pageUrl={pageUrl} />
          <History probe={probe} pageUrl={pageUrl} />
        </>
      )}

      <p className="text-sm leading-normal text-subtle-text">
        {PROBE_CAVEAT} Probes use Claude with web search
        {siteHosts.length > 1 ? `, and count ${siteHosts.join(", ")} as this site` : ""}.
      </p>
    </section>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 rounded-[10px] bg-subtle-bg p-3.5">
      <span className="text-xs font-bold tracking-wide text-subtle-text uppercase">{label}</span>
      {children}
    </div>
  );
}

function Big({ n, of }: { n: number; of: number }) {
  return (
    <span className="text-[32px] leading-tight font-bold tabular-nums">
      {n} <span className="text-lg text-subtle-text">of {of}</span>
    </span>
  );
}

function YesNo({ value, page }: { value: boolean | null; page: boolean }) {
  if (value === null) return <span className="text-sm text-subtle-text">— Not searched</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 text-sm font-semibold", value ? "text-success-fg" : "text-danger-fg")}>
      <span aria-hidden>{value ? "✓" : "✕"}</span> {value ? "Yes" : "No"}
      {value && page && <span className="text-xs font-normal text-subtle-text">(this page)</span>}
    </span>
  );
}

function rowNote(e: ProbeEvidence, o: ProbeOutcome): string {
  if (e.refused) return "Claude declined to answer this question, so it says nothing about your site.";
  if (o.found === null) return "Claude answered from memory without searching, even when asked twice, so this says nothing about your site.";
  if (o.cited) return o.pageCited ? "Cited. Keep this answer easy to find on the page." : "Your site was cited, from another page than this one.";
  if (o.found) return "Search found your site, but the answer cited others. A short, direct answer under a question heading is easier to quote.";
  return "Your site wasn't in the search results for this question.";
}

function ResultsTable({
  questions,
  evidenceFor,
  rowState,
  siteHosts,
  pageUrl,
}: {
  questions: string[];
  evidenceFor: Map<string, ProbeEvidence>;
  rowState: Probe["rowState"];
  siteHosts: string[];
  pageUrl: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="text-xs font-bold tracking-wide text-subtle-text uppercase">
            <th scope="col" className="border-b px-3 py-2.5">Question</th>
            <th scope="col" className="w-[120px] border-b px-3 py-2.5">Found</th>
            <th scope="col" className="w-[120px] border-b px-3 py-2.5">Cited</th>
            <th scope="col" className="w-[240px] border-b px-3 py-2.5">Cited instead</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => {
            const state = rowState[q];
            const e = state?.state === "loading" ? undefined : evidenceFor.get(q);
            const o = e ? classify(e, siteHosts, pageUrl) : null;
            const expanded = open === q && e !== undefined;
            return (
              <Fragment key={q}>
                <tr className={cn("text-md", !expanded && "border-b")}>
                  <th scope="row" className="px-3 py-2.5 font-medium">
                    {e ? (
                      <button type="button" className="text-left hover:underline" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : q)}>
                        {q}
                      </button>
                    ) : (
                      q
                    )}
                  </th>
                  {state?.state === "loading" ? (
                    <td colSpan={3} className="px-3 py-2.5 text-sm text-subtle-text">
                      <span className="inline-flex items-center gap-2"><Spinner /> Asking with web search…</span>
                    </td>
                  ) : state?.state === "error" ? (
                    <td colSpan={3} className="px-3 py-2.5 text-sm text-danger-fg">{state.error ?? "Probe failed"}. Run again to retry.</td>
                  ) : e && o ? (
                    <>
                      <td className="px-3 py-2.5"><YesNo value={o.found} page={o.pageFound} /></td>
                      <td className="px-3 py-2.5"><YesNo value={o.cited} page={o.pageCited} /></td>
                      <td className="px-3 py-2.5 text-sm text-subtle-text">{o.citedInstead.length > 0 ? o.citedInstead.slice(0, 3).join(", ") : "—"}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-3 py-2.5 text-sm text-subtle-text">Not asked yet</td>
                  )}
                </tr>
                {expanded && e && o && (
                  <tr className="border-b">
                    <td colSpan={4} className="px-3 pb-3.5">
                      <div className="flex flex-col gap-1.5 text-sm leading-normal text-subtle-text">
                        {e.excerpt && <span><strong className="text-body-text">Answer excerpt: </strong>{e.excerpt}</span>}
                        {e.queries.length > 0 && <span><strong className="text-body-text">Searched for: </strong>{e.queries.map((s) => `"${s}"`).join(", ")}</span>}
                        <span><strong className="text-body-text">What this means: </strong>{rowNote(e, o)}</span>
                        <span className="text-xs">Asked {longDate(e.ranAt)} · {e.model}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function History({ probe, pageUrl }: { probe: Probe; pageUrl: string }) {
  const earlier = probe.runs.slice(0, -1).reverse().slice(0, 4);
  if (earlier.length === 0) return null;
  const latestKey = probe.runs.at(-1)?.setKey;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold tracking-wide text-subtle-text uppercase">Earlier runs</span>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle-text">
        {earlier.map((r) => {
          const t = runTotals(r, probe.siteHosts, pageUrl);
          return (
            <li key={r.at}>
              {shortDate(r.at)}: cited {t.cited} of {t.searched}, found {t.found}
              {r.setKey !== latestKey && " (other questions)"}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuestionEditor({ probe, onDone }: { probe: Probe; onDone: () => void }) {
  const ids = { country: useId(), hosts: useId(), list: useId() };
  const [items, setItems] = useState<string[]>(() => (probe.questions && probe.questions.length > 0 ? probe.questions : [""]));
  const [country, setCountry] = useState(probe.country ?? NO_COUNTRY);
  const [hosts, setHosts] = useState(probe.ownHosts.join("\n"));
  // "Suggest new questions" replaces the list being edited.
  useEffect(() => {
    if (probe.questions && probe.questions.length > 0) setItems(probe.questions);
  }, [probe.questions]);
  const clean = items.map((q) => q.trim()).filter(Boolean);
  const tooLong = clean.some((q) => q.length > QUESTION_MAX_CHARS);

  const save = () => {
    probe.saveQuestions([...new Set(clean)].slice(0, QUESTION_MAX), country === NO_COUNTRY ? null : country);
    probe.saveOwnHosts(hosts.split(/[\s,]+/));
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend id={ids.list} className="mb-1 text-md font-semibold">
          Questions <span className="font-normal text-subtle-text">({QUESTION_MIN}–{QUESTION_MAX} work best; ask about the topic, not your brand)</span>
        </legend>
        {items.map((q, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              aria-label={`Question ${i + 1}`}
              value={q}
              maxLength={QUESTION_MAX_CHARS}
              onChange={(e) => setItems((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
              className={cn(field, "h-10 py-0")}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-10 text-sm"
              aria-label={`Remove question ${i + 1}`}
              onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [""]))}
            >
              Remove
            </Button>
          </div>
        ))}
        {items.length < QUESTION_MAX && (
          <Button type="button" size="sm" variant="link" className="self-start px-0 text-sm" onClick={() => setItems((prev) => [...prev, ""])}>
            Add a question
          </Button>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[0_1_260px] flex-col gap-1.5">
          <span id={ids.country} className="text-md font-semibold">Ask from</span>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger aria-labelledby={ids.country} className="h-10 w-full text-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROBE_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
              <SelectItem value={NO_COUNTRY}>No location</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <label htmlFor={ids.hosts} className="text-md font-semibold">Other hosts that count as this site</label>
          <textarea
            id={ids.hosts}
            rows={2}
            value={hosts}
            onChange={(e) => setHosts(e.target.value)}
            placeholder={"staging.example.com\nexample.co.uk"}
            className={field}
          />
          <span className="text-sm text-subtle-text">One per line: dev, staging or regional domains. Otherwise they count as other sites.</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" className="text-sm" disabled={clean.length === 0 || tooLong} onClick={save}>Save questions</Button>
        {probe.questions && probe.questions.length > 0 && (
          <Button type="button" size="sm" variant="outline" className="text-sm" onClick={onDone}>Cancel</Button>
        )}
        <Button type="button" size="sm" variant="outline" className="text-sm" disabled={probe.status === "suggesting"} onClick={probe.suggest}>
          {probe.status === "suggesting" ? "Suggesting…" : "Suggest new questions"}
        </Button>
        {clean.length > 0 && clean.length < QUESTION_MIN && <span className="text-sm text-warning-fg">Fewer than {QUESTION_MIN} questions make a thin sample.</span>}
      </div>
    </div>
  );
}
