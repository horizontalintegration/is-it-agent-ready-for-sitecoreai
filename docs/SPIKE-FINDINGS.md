# Spike findings (Phase 0)

Answers to the **[SPIKE]** questions in [IS-IT-AGENT-READY-PLAN.md](IS-IT-AGENT-READY-PLAN.md). Each answer is marked:

- **Confirmed:** checked with real output.
- **From docs/types:** read from documentation or SDK type definitions, not yet seen at runtime.
- **Open:** still needs a run in a real environment.

Code that depends on an Open answer must wait for it (working agreement, item 6).

Date: 2026-10-23 · Branch: `feature/v2-phase-0-setup` · Base: `28963dc`

---

## 1. Marketplace SDK upgrade

| Package | Before | After |
|---|---|---|
| `@sitecore-marketplace-sdk/client` | 0.3.2 | **0.4.1** (latest) |
| `@sitecore-marketplace-sdk/xmc` | 0.4.1 | **0.4.4** (latest; peer `client ^0.4.0`) |

**Breaking changes for this app: none found at compile time** (Confirmed: `tsc --noEmit`, `next build`).

- **client 0.3.2 → 0.4.1:** the only typed change is the new `getPageHTML(): Promise<string>`.
- **xmc 0.4.1 → 0.4.4:** the HTTP layer moved from `@hey-api/client-fetch` to an internal `shared/src/http`.
  - The result envelope is still `{ data, error, request, response }`, so the existing `pageRes.data.data` unwrapping in `usePageFields.ts` and `useSitePages.ts` still type-checks.
  - The request and response types for `retrievePage`, `updateFields`, `retrieveSite` and `authoring.graphql` are unchanged. The diff is only type reordering, doc comments, and `[key: string]: unknown` index signatures.
- **Runtime smoke test** (2026-10-29, after merging to `main`):
  - **Confirmed:** the context panel and the dashboard both load in Sitecore on the new SDK, and `getPageHTML` works in the panel (section 3).
  - The dashboard shows errors, but the same errors appear in the v1 app, so they aren't caused by the upgrade. Re-check them after the planned changes.
  - **Confirmed (2026-10-30):** meta **Generate → Populate**, the only path that writes to Sitecore (`updateFields`), runs without errors for every field.
  - It generated the same text as the existing values. That's expected while D1 is open: the panel sends an empty `bodyText`, so the model sees only the page title and the current value. Re-check that the output follows the page content once Phase 1 fixes D1.
  - **Confirmed after the D1 fix (2026-10-31, Phase 1 branch):**
    - The panel console shows `[scan] ai-check body: N chars of main text — …` with the page's real text. This was Phase 1's acceptance check.
    - Generate no longer repeats the current value. The meta title came back as "BrandX Financial Planning: Wealth, Tax & Retirement Strategies", with the BrandX brand voice from `BRAND_VOICE_FILE`.
    - It's 62 characters, over the 60-character target. The limit is only an instruction in the prompt, and the UI flags the overrun in amber. Phase 2's structured outputs should enforce length.
    - Caveat: wealth, tax and retirement are also listed under the brand document's Products & Services, so this result alone doesn't show which source the wording came from. To check, generate on a narrow page (e.g. a single article) and confirm the title names that article's topic.

Other setup notes:

- **Node.** No Node version was installed. Node 24.22.1 LTS was installed with nvm-windows. Vitest 5 needs Node `^22.12 || ^24 || >=26`.
- **Lockfile.** `package-lock.json` was out of sync with `package.json` (`@emnapi/*` transitive packages), so `npm ci` failed. Re-locked with `npm install`.
- **Lint.** `npm run lint` was already failing at `28963dc` on two `require()` calls in `docs/build-docs.js`. Fixed with an ESLint override for `docs/**/*.js`, which are plain CommonJS Node scripts.

## 2. Unit tests (vitest)

- `vitest` 5.0.5, config in `vitest.config.mts` (aliases mirror the `tsconfig.json` paths), run with `npm test`.
- 31 tests in `src/lib/rule-engine/{helpers,engine}.test.ts`:
  - pure helpers
  - gate check
  - fixture page scored on the current 81-point model
  - score bounds
  - dashboard label thresholds
- **Finding for Phase 3 (P20 `trust.anchor-text`):** `isGenericAnchor` flags descriptive anchors that *start* with a blocklisted word, e.g. "Download the 2026 report" ("download " prefix) or "Register for the webinar". This is harmless while the check is info-only, but it will cost real points once P20 is scored. Limit the prefix rule to "click here …" / "read more …" style phrases.

## 3. `getPageHTML()` (plan section 7)

**How to run the spike:**

1. Open the context panel with `?spike=1`, or set `NEXT_PUBLIC_SPIKE_DEBUG=1` for `npm run dev`. An amber "getPageHTML spike" box appears at the top of the panel.
2. Capture each scenario:
   - **simple:** a basic content page.
   - **article:** an article or blog page.
   - **faq:** a page with an FAQ.
   - **unsaved-edit:** type a unique word into a field and capture before saving, with the word entered as the marker.
   - **client-rendered:** a page with a client-rendered component.
   - **empty-placeholder:** a page with an empty placeholder or datasource.
3. Click **Copy N reports** (or copy the JSON from the textarea if clipboard access is blocked) and paste it here or into the session. Each capture is also logged with `console.groupCollapsed("[spike:getPageHTML] …")`, including the full HTML.

Implementation: `src/components/spike/PageHtmlSpike.tsx` (temporary; remove in Phase 4).

| # | Question | Answer | Status |
|---|---|---|---|
| 1 | Return type: `string` or `{ html }`? | A plain `string`, in all 5 captures. | **Confirmed** |
| 2 | Is `<head>` included (title, canonical, meta, JSON-LD)? | **No.** The HTML starts with an empty `<head></head>`, with no doctype or `<html>` tag. It contains **no `<script>` elements at all**, so JSON-LD isn't there either. | **Confirmed** |
| 3 | Are unsaved edits included, or only saved ones? | **Unsaved edits are included.** The marker typed into a heading without saving was found (`h2: zebra7731`). | **Confirmed** |
| 4 | Is content rendered by client-side scripts included? | **Yes.** The article's Related Articles cards are fetched in the browser (not in the server HTML at all), and the draft capture contains them. But client-fetched listings can render an empty state in the editor. See the notes below. | **Confirmed** |
| 5 | Placeholders, empty datasources, editor `data-*`? | **Yes, editor artifacts are present** and must be removed before scoring. No Sitecore chrome (`<code type=text/sitecore>`, `data-sc-*`) appeared. See the list below. | **Confirmed** |
| 6 | Which extension points support it? | Works in the **context panel**. The dashboard wasn't tested; the plan already keeps it live-only. | **Confirmed** (context panel) |

**Captures** (Confirmed; 2026-10-29, BrandX in Page Builder, context panel):

| Kind | Page | HTML size | Time |
|---|---|---|---|
| simple | Home | 125 KB | 32 ms |
| FAQ | /Contact-and-Support/FAQs | 109 KB | 32 ms |
| empty placeholder | /st-patricks-day-2026 | 84 KB | 33 ms |
| article | …/Banking-Sector-Earnings-Point-to-Resilience | 94 KB | 44 ms |
| unsaved edit | Home, with `zebra7731` typed into an h2 | 126 KB | 51 ms |

The call takes about 30–50 ms, so it's cheap enough to re-run on every `fieldsUpdated` (with the planned debounce).

**Editor artifacts in the draft HTML** (item 5). Phase 4 needs a sanitiser that removes these before any check runs:

- **`Fallback: …` text appended to headings.** Page Builder renders a fallback hint next to fields that use one, e.g. the FAQ h1 reads `Frequently Asked QuestionsFallback: Frequently Asked Questions` and the article h1 reads `Fallback: Banking Sector Earnings Point to Resilience`. Left in, this breaks P8 (headings), P13 (question headings) and any text comparison.
- **`[No text in field]`** for empty fields: 14 on the home page, 3 on the FAQ page. Some render as headings (`h2: [No text in field]`), which would count as real headings.
- **`contenteditable`** attributes (1–36 per page), a `placeholder` class (1–2 per page), one `scEmpty*` class, and an `editing-mode` wrapper class.
- **Empty-datasource messages** such as "No articles found" (St. Patrick's Day page), which the published page doesn't show.
- **Not editor markup:** `data-component` and `data-icon` also appear on the published site, so they're the site's own attributes.

**Item 4 notes (client-rendered content):**

- **How it was checked** (Confirmed; 2026-10-30): all 74 English pages in the BrandX sitemap were loaded twice, as raw server HTML and in headless Chrome with JavaScript (`--dump-dom`). Text found only in the rendered DOM was grouped by its `authorable/` component.

  | Component | Pages with client-only text | Example |
  |---|---|---|
  | `relatedarticles` | 38 (every article page) | related-article cards: title, summary, date, "Read More" |
  | `articlelisting` | 6 (listing pages, St. Patrick's Day) | the full article list |
  | form inside `mainlayout` | 2 (Contact-and-Support, Schedule-a-Consultation) | form intro text and field labels |
  | `searchresult` | 1 (/Search) | facets and results |
  | `statsitem` | 1 (Recognition-and-Awards) | a count-up number ("178") |

- **The draft includes client-rendered content.** "Retail Investor Participation Hits Record High" (a Related Articles card on the Banking article) isn't in that page's server HTML at all, not even in `__NEXT_DATA__`. The `getPageHTML` capture of the same article contains it, with its summary and date.
- **But the editor's version can differ from what visitors see.** The St. Patrick's Day article listing renders a full list for visitors, but "No articles found" in the draft. Client-fetched listings may get no data in editing mode.
- **Consequences for P3 (content without JS):**
  - "In the sanitised draft but not in the server HTML" is a valid signal for client-only content.
  - Compare against the full server `<body>` text, not only `<main>` paragraphs as the spike did.
  - Treat empty-state messages as "couldn't render in the editor", not as content.
- Script and results: in the session scratchpad (`csr-scan/scan.mjs`), not committed.

**Other observations:**

- `preview-fetch` doesn't decode `&nbsp;` in headings and paragraphs (the article's server side shows `h3: &nbsp;` and 10 `&nbsp;` paragraphs). The draft side decodes it. Fix this before P3 compares the two.
- On the St. Patrick's Day page, the published paragraph "Celebrate St. Patrick's Day with BrandX…" isn't in the draft. Either the draft has changed since publishing or that component renders differently in editing mode. P3 must not report this as "content missing without JavaScript".
- The footer contains a literal `© {{year}}` token in the draft. On the published page, JavaScript replaces it in the browser ("© 2026"), so the sanitiser should ignore `{{…}}` tokens.

## 4. Blok design system (plan section 6.2, item 9)

**Recommendation: adopt Blok** (this settles open decision 4). Install components from its **shadcn registry** into `src/components/ui`; don't build custom tokens.

The licence check and Next 15 compatibility below need a quick confirmation before Phase 5 depends on them.

- **Distribution** (Confirmed: registry URLs return 200).
  - Blok is a shadcn/ui registry, not an npm component package.
    - Theme: `npx shadcn@latest add https://blok.sitecore.com/r/theme.json`
    - Components: `https://blok.sitecore.com/r/<name>.json` (74 items; `blok-components.json` contains all of them)
    - Marketplace quickstarts: `https://blok.sitecore.com/r/marketplace/next/quickstart.json`
  - Source: https://github.com/Sitecore/blok. The registry isn't versioned, so record the commit or date you copied from.
  - **Avoid `@sitecore/blok-theme` on npm.** It is the legacy Chakra theme (1.1.18, 2025-11).
- **Stack fit.**
  - Built on shadcn/ui + Radix / Base UI + Tailwind CSS 4 (CSS-first). No Chakra, so it fits our Tailwind 4.3 / React 19.2.
  - Blok's own repo builds on **Next ^16.2**; we're on 15.5. A test install on next 15.5 + react 19.2 + tailwind 4.3 produced no peer-dependency warnings. **Open:** run a `next build` with a few components added. Calendar on react-day-picker 10 is unverified.
- **Sitecore guidance.** The Marketplace SDK quick start "strongly recommend[s]" Blok, and says matching Sitecore's look and feel is *required for public Marketplace apps*.
  - That's relevant because we plan a public listing ("Is It Agent-Ready? for SitecoreAI").
  - Source: https://doc.sitecore.com/mp/en/developers/sdk/latest/sitecore-marketplace-sdk/quick-start--manual-.html
  - `Sitecore/marketplace-starter` itself doesn't use Blok.
- **Licence.** Apache-2.0 per LICENSE/README, with no extra restriction found. GitHub shows "NOASSERTION". **Open:** confirm before publishing.
- **Theming.**
  - `theme.json` gives about 296 tokens ready for `@theme` (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`; e.g. `--color-primary-500: #6e3fff`).
  - It also gives shadcn semantic variables for `:root` and `.dark`, so dark mode is class-based and maps to plan section 6.2, item 9 ("both themes if the host passes a theme").
  - Primary is a violet (`#6e3fff`). That fits the "deep indigo/violet accent" in plan section 6.5, so we can use Blok's primary color rather than add our own.
- **Bundle and SSR.**
  - The code is copied into the repo, so we only pay for what we add.
  - About half the components are `"use client"`; none import `next/*`.
  - Add the heavy ones (charts on recharts 2.x, react-select, dnd-kit) only if needed. The heatmap and sparkline can be plain SVG.
- **Phase 5 setup notes.**
  - shadcn needs a `components.json`. Our `@/components` alias maps to `src/components`, so configure `ui: "@/components/ui"`.
  - `lucide-react` (plan section 6.5) is the shadcn default icon set, so the two choices line up.

## 5. Web search pricing and test probe (plan section 8)

**Pricing (From docs, checked 2026-10-23):**

- Web search costs **$10 per 1,000 searches** (`usage.server_tool_use.web_search_requests`), plus normal token costs. Search result content counts as input tokens, both in the turn that searched and in later turns. A search that errors isn't billed.
  Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool#usage-and-pricing
- `claude-opus-5-5` costs **$4 / MTok** input and **$20 / MTok** output; cache reads are $0.20 / MTok.
  Source: https://platform.claude.com/docs/en/about-claude/pricing
- **Code execution is free when used with `web_search_20260209` or later**: dynamic filtering runs inside code execution, and there's no extra charge for it.

**Measured cost per question** (Confirmed; 2026-10-23, one question each, `effort: low`, US location):

| Mode | Searches | Results | Citations | Input / output tokens | Cost | Time |
|---|---|---|---|---|---|---|
| Dynamic filtering (tool default) | 2 | 18 | **0** | 29,919 / 1,368 | $0.167 | 26 s |
| **Direct** (`allowed_callers: ["direct"]`) | 1 | 9 | **6** | 11,408 / 1,201 | **$0.080** | ~20 s |

- At about $0.08 per question, an 8-question page run costs about **$0.65**.
- The 7-day cache and per-site rate limit (plan section 8) are worth building.
- Run the questions in parallel. Running them one after another would take about 3 minutes per page.

**Changes the plan should pick up:**

1. **There's a newer tool version, `web_search_20260318`**, which adds `response_inclusion`. Keep `20260209`, or use `20260318` with `response_inclusion: "full"` (the default).
   - `"excluded"` drops search-result blocks that were used inside code execution. "Found" would then be under-counted, because it's measured from those blocks.
2. **Dynamic filtering breaks "Cited". Use `allowed_callers: ["direct"]`** (Confirmed).
   - With the tool default (dynamic filtering, from `20260209`), Claude ran both searches inside code execution: `caller: { type: "code_execution_20260120" }`.
   - It read the results through encrypted code output, and the answer had **no `web_search_result_location` citations**.
   - "Found" still works in that mode, because nested `web_search_tool_result` blocks keep their URLs. "Cited" and "Cited instead" can't be measured at all.
   - Direct mode returned 6 citations, used fewer tokens, and cost half as much.
   - **Plan section 8 step 2 and section 9 should specify `allowed_callers: ["direct"]`.** With direct calls, `response_inclusion` doesn't matter.
3. **Search errors return HTTP 200.** `content` is then an object with `error_code` instead of a list (as the plan says). An empty list means no results, not an error.
4. **`pause_turn` can happen** on long search turns. The probe resends the paused assistant turn, up to 3 times.
5. **`@anthropic-ai/sdk` 1.0.0 was released on 2026-10-21** (a new major; 1.2.0 is from 2026-10-23). The spike pins **1.2.0 as a devDependency** only. Phase 2 must choose 1.x or the last 0.x (0.137.0) and read the TypeScript SDK changelog for 1.0 breaking changes.
   - **Resolved in Phase 2 (2026-10-31): 1.3.0, pinned, as a runtime dependency.** 1.0's only breaking change is API version `2026-10-21` (sampling parameters, document blocks in assistant turns and user-turn citations are rejected; some Admin API fields are removed). The app uses none of them. 1.3.0 adds Claude Tag endpoints only.
   - **Structured outputs can't enforce string length.** The API rejects `maxLength`, so the SDK moves it into the schema description and validates after the response. `generate-meta` checks length itself and retries once (plan section 9).
6. **Claude doesn't always search** (Confirmed; follow-up runs below). With `tool_choice: auto` it can answer from its own knowledge, which yields `found: false, cited: false` with zero searches.
   - That must be reported as **Not searched**, not Not found, and left out of the "Cited in X of N" totals.
   - Forced `tool_choice` returns a 400 on Opus 5.5 (plan section 9), so use a system prompt that requires a search, and retry once when `usage.server_tool_use.web_search_requests` is 0.
7. **Host matching is exact (plus subdomains), so sibling hosts of the same site count as competitors** (Confirmed). `blueprint-brandx-dev.horizontaldigital.com` showed up under "cited instead" for BrandX. Let the user list extra hosts that count as the site's own (dev, staging, regional domains).

**Test probe:** `scripts/spikes/citation-probe.mts` (run with `npm run spike:citation-probe -- …`).

- Settings:
  - model: `claude-opus-5-5`
  - `effort: low`
  - `web_search_20260209` with `max_uses: 3` and `allowed_callers: ["direct"]` (`--dynamic` runs the tool default instead, for comparison)
  - server-side refusal fallback: `server-side-fallback-2026-07-01`, `fallbacks: "default"`
- Found, Cited and "cited instead" are computed in code from `web_search_tool_result` and `web_search_result_location` blocks, never from the model's own answer.
- **Confirmed:**
  - The script type-checks under strict `nodenext` settings.
  - It runs on Node 24 type stripping.
  - It handles auth errors (it reached the API and got a 401 with a dummy key).
- **Confirmed with a real run** (key from `.env.local`):

  ```sh
  node --env-file=.env.local scripts/spikes/citation-probe.mts \
    --domain https://blueprint-brandx.horizontaldigital.com \
    --question "How do I choose a financial advisor to help me plan for retirement?" --country US
  ```

  Result in direct mode:
  - `found: false`, `cited: false`
  - `stop_reason: end_turn`; no refusal
  - Cited instead: truewealthstewardship.com, troweprice.com, themadisonpartners.com, savvywealth.com, apsitaxes.com, experian.com

  The BrandX demo site isn't in the results for this question. Phase 10's demo fixtures should show a mix of Cited / Found / Not found rather than rely on live results.

- **Follow-up runs** (Confirmed; 2026-10-29, direct mode, US location, about $0.18 in total). These check the positive case, which the first run never reached:

  | Domain | Question | Searches | Found | Cited | Cost |
  |---|---|---|---|---|---|
  | irs.gov | "What are the 2026 IRA contribution limits?" | 1 | **true** | **true** | $0.075 |
  | blueprint-brandx.horizontaldigital.com | "What financial services does BrandX (blueprint-brandx.horizontaldigital.com) offer?" | 1 | **true** | **true** | $0.072 |
  | troweprice.com | "How do I choose a financial advisor to help me plan for retirement?" | **0** | false | false | $0.031 |

  - **Found and Cited detection works.** IRS results came from `www.irs.gov`, and the `www.` prefix was stripped correctly.
  - **BrandX is in the search index** even though its `robots.txt` has `Disallow: /`. It's found and cited when named, but not for the generic question above.
  - **The T. Rowe Price run never searched.** The response was a single `text` block. troweprice.com was cited for the same question on 2026-10-23, so this `false` says nothing about the site (see item 6 above).
  - **BrandX's dev site is publicly indexed** and was cited next to the live site (see item 7 above). That's worth raising with the site owner on its own merits.

## 6. Phase 2 acceptance: Claude API on the SDK (2026-10-31)

Confirmed with a local `next dev` run against the BrandX article *Banking Sector Earnings Point to Resilience* (2,621 chars of main text), `ANTHROPIC_MODEL_BULK=claude-sonnet-5-5`, `ANTHROPIC_MODEL` unset (Opus 5.5). About $0.06 in total.

| Route | Model | Result | Repeat call | Cost |
|---|---|---|---|---|
| `ai-check` | Sonnet 5.5 | `commodity`, 5 gaps; 2,657 in / 329 out | server cache hit, 19 ms, no API call | ~$0.009 |
| `generate-meta` × 4 fields + 1 Regenerate | Opus 5.5 | all within limits (title 53/60) | `cache_write=2966` on the first field, then `cache_read=2966` on every later call | ~$0.03 |
| `citation-forecast` | Opus 5.5 | 1 star for all four engines (BrandX blocks AI crawlers); 2,123 in / 421 out | server cache hit, 0.7 s | ~$0.017 |

- **Length retry fired for real:** the meta description came back at 158/155; the retry returned 145.
- **Low effort barely thinks:** output was 35–185 tokens per meta call, so costs came in well under the planned estimate.
- **One `ogDescription` call took 61 s** for 57 output tokens. That looks like one attempt hitting the SDK's 60 s timeout and the internal retry then finishing in about 1 s. The timeout is now 30 s with one retry, so a stalled call is capped at about a minute.
- **Confirmed:** after deploy (2026-10-31), the panel console showed `[ai-cache] hit` on the second visit to an unchanged page.
