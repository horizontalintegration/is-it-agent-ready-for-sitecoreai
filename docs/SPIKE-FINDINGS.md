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

Implementation: `src/components/spike/PageHtmlSpike.tsx` (temporary; removed in Phase 4, replaced by `src/hooks/usePageHtml.ts` and the sanitiser in `src/lib/html/sanitise-draft.ts`).

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

### 3.1 Phase 4 captures (2026-11-01)

The Phase 0 captures kept only 1.5 KB excerpts, so the sanitiser was built from the notes above and then checked on new full captures of three BrandX pages, each next to the published server HTML. Trimmed copies are the test fixtures in `src/lib/html/fixtures/` (each file's header says what was trimmed; trimming was checked to give the same parse result as the full capture).

| Page | Draft | What it showed |
|---|---|---|
| /Contact-and-Support/FAQs | first 50,000 chars (the paste was cut off) | Help text is an `.ee-help-text-block` element |
| …/Banking-Sector-Earnings-Point-to-Resilience | 93 KB | h1 is an empty field with a fallback; Related Articles cards are client-rendered |
| /st-patricks-day-2026 | 83 KB | Two fallback forms; an empty image field; the article listing is an empty field |

**Confirmed (real captures):**

- **Help text is one element type.** `<div class="undefined ee-help-text-block">` holds both kinds:
  - "Placeholder: custom-headless-hero"-style labels: 6 on the FAQ excerpt, 12 on each of the other two.
  - "Fallback:" hints.
  
  The notes' "`Frequently Asked QuestionsFallback: …`" was the joined text of `<span>value</span><div class="… ee-help-text-block">Fallback:<!-- --> <span>value</span></div>`.
- **Two fallback forms.**
  - **The field has a value** (FAQ h1, St. Patrick's hero h1 "Luck looks good on you."): the hint sits next to the value. The published page shows the value.
  - **The field is empty** (the Banking h1, St. Patrick's page-title h1): the h1 holds only the hint block. The published page shows the fallback value.
- **Empty image fields** render as `<img class="scEmptyImage …" alt="" src="data:image/svg+xml,…">` (the St. Patrick's hero). The published page has no image there.
- **node-html-parser quirk:** that `src` contains `class=&quot;st3&quot;`, and the parser reports it as the element's class. The sanitiser reads `scEmpty*` from the raw attributes.
- **No "No articles found" this time.** The St. Patrick's article listing renders only `[No text in field]` in the editor. The empty-state handling stays for listings that do show one.
- **The footer token is server-rendered on the published page.** The server HTML already says "© 2026", so the comparison treats `{{…}}` as matching any one word, rather than the sanitiser dropping it.
- **Related Articles on the published Banking page** is the section heading and a loading spinner (`role="status"`). The draft has both cards (title, summary, date, category, "Read More"). P3: 44 of 522 words need JavaScript (91%), half credit, all flagged under `relatedarticles`. The cards' two "Read More" links also make P20 stricter on the draft (2 of 7 links generic, against 0 of 5 live).
- **St. Patrick's page-title description.** The published page shows "Celebrate St. Patrick's Day with BrandX…" in the page-title component. In the draft that field is an empty `<div>` with no fallback hint. So either the field was emptied after publishing, or the published component falls back to another field without the editor saying so. The "Draft differs from live" banner shows on this page as a result (plan section 13, item 7).

### 3.2 `getPageHTML` right after a page opens (production, 2026-11-02)

- **Confirmed:** on the first production run of Phase 4, P3 showed "not checked" with a Live chip on the home page, About Us and the Banking article. The console showed `[draft] getPageHTML unavailable; the body checks use the live page: CoreError: [client SDK] [CANVAS BUG] Service implementation is not provided.`
- **Confirmed:** clicking **Re-scan page** a moment later read the draft on About Us and the Banking article. So the failure is timing: the read 1.5 s after the page opened came before Page Builder's canvas was ready, and the hook gave up on the page after one failure.
- The error text isn't in the SDK (client 0.4.1, core 0.3.5, the versions the Phase 0 spike used); it comes from the Page Builder host. Sitecore's docs say `getPageHTML` "requires that the SitecoreAI environment where your app is installed supports the page HTML capability. If the host doesn't support it, the request fails", and give no timing rule ([Get the page HTML](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/get-the-page-html.html)). The Phase 0 spike called it by hand, well after the page had loaded, so it never hit this.
- **Fix:** the first read of a page is retried after 2, 4 and 8 s (`readWithRetry` in `usePageHtml.ts`).

## 4. Blok design system (plan section 6.2, item 9)

**Recommendation: adopt Blok** (this settles open decision 4). Install components from its **shadcn registry** into `src/components/ui`; don't build custom tokens.

**Confirmed in Phase 5 (2026-11-02):** the licence is Apache-2.0 (LICENSE, "Copyright 2025 Sitecore"), and `next build` passes on next 15.5.18 with the theme and six components (button, tabs, badge, tooltip, checkbox, select) from Sitecore/blok `0a7997e` (2026-10-23), installed with `shadcn@4.23.0`. Notes from the install:
- The CLI wrote 172 malformed tokens into `globals.css` (`--color-color-…: var(----color-…)`), mapping the theme's already-prefixed `--color-*` keys a second time. They were deleted; nothing references them.
- Blok's components use **`@mdi/js`** (Material Design Icons) through a small `Icon` component (`src/lib/icon.tsx`), not lucide. The app uses `@mdi/js` too, to keep one icon set (plan section 6.5).
- The theme has no `@layer base` rules, so `globals.css` adds the border colour, body background and text, the font stack and a focus outline.
- The components need `cn` (`src/lib/utils.ts`, clsx + tailwind-merge), `radix-ui` and `class-variance-authority`.

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

### 5.1 Phase 8: the probe in the app (Confirmed, 2026-11-02)

A real run through `/api/citation-probe` (local production build, standalone dashboard in headless Chrome) on the BrandX replica, `https://hztl-page-health-checker-demo.vercel.app/services`, US location, `claude-opus-5-5`:

| Step | Calls | Result | Cost |
|---|---|---|---|
| Suggest questions (effort medium, structured output) | 1 | 8 non-branded questions; 1,303 in / 196 out | ~$0.009 |
| Run probe (effort low, direct web search, cached system prompt) | 8 | every question searched once (no retry, no refusal); 9–10 results and 8–17 citations each; found 0, cited 0; about 30 s for the run, 4 at a time | ~$0.26 (~$0.03 each) |
| Run again | 0 | every answer from the browser's 7-day cache | $0 |
| The same question sent to the route | 0 | `cached: true` (server cache) | $0 |

- **Prompt caching works on the probe.** Every probe read 2,731 tokens from the cache (some 5,462, two reads in one call): the tool definitions plus the system prompt with `cache_control` are above the minimum cacheable length. That's most of the drop from the spike's $0.08 (whose system prompt wasn't cached) to about $0.03.
- **Every question searched first time** with the system prompt that requires a search. The retry for unsearched questions (item 6 above) didn't fire on this run.
- **Found 0 of 8** is the expected result: the replica is a new `vercel.app` host, and no search returned it. The positive case was shown in the follow-up runs above (irs.gov, BrandX).

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

## 7. Dashboard authorization (open item 1, 2026-11-01)

Plan section 13, item 1. Every `xmc.*` call from the dashboard widget fails with `[HostSDK] … Authentication required but getAccessToken method not provided`. The Page builder panel makes the same calls with built-in authorization and they work. Sitecore support ticket **CS0746928** is open.

**Status (2026-11-02): Sitecore has identified the root cause on their side** and is targeting a production fix for the middle of the week of 2026-11-02 (7.6). Built-in authorization stays. The custom-authorization contingency (7.4) is shelved unless the fix slips.

App changes made alongside the investigation (built-in authorization kept):

- **PR #8:** the Context ID fix, a clear dashboard message when the host refuses, and demo mode with no Sitecore or paid calls on load.
- **PR #9:** `host.state` and dashboard-block diagnostics.

Neither PR fixes the refusal itself.

### 7.1 Where the error comes from

**From docs/types** (SDK bundles in `node_modules`, client 0.4.1 and xmc 0.4.4, both the latest on npm):

- A built-in call (`client.query/mutate("xmc.*")`) never leaves the iframe as HTTP. The xmc module's fetch hands the request to `ClientSDK._fetch`. That posts a `host.request` message to the Sitecore host with only the path, method, headers and body, plus `requiresAuth: true`.
- The **host page's** HostSDK attaches the token (`_addAuthorizationHeader`) and makes the HTTP call. **Confirmed:** none of the error's strings (`[HostSDK]`, `_addAuthorizationHeader`, `getAccessToken method not provided`, `Error processing generic api request`) appear anywhere in `@sitecore-marketplace-sdk/client`, `core` or `xmc`. The error is raised by Sitecore code the app doesn't ship. Why that HostSDK has no `getAccessToken` can't be seen without the host's code.
- `ClientSDK.init` takes `target`, `origin`, `timeout`, `modules`, `events` and `navbarItems`. There's **no option for an app to supply a token** to the built-in path. The public `ClientSDK` methods offer no raw request either.
- **Lead:** the host message type (`GenericRequestData` in `core`) has an optional `contextId` ("An optional context ID associated with the request"), but `ClientSDK._fetch` never sets it. Our calls carry the Context ID only as the `sitecoreContextId` query parameter. If the dashboard host picks its token provider by `contextId`, that would explain why the panel works and the dashboard doesn't. Only Sitecore can confirm this, and only the SDK or the host can change it.
- **Confirmed (git):** the dashboard's SDK calls (`ClientSDK.init`, every `client.query/mutate` line in `useSitePages.ts` and `useMarketplaceClient.ts`) are unchanged between `7af212a` (2026-06-02, when the dashboard last worked) and `main`. v1 ran the same code on client 0.3.2 / xmc 0.4.1. So whatever changed is outside this repo: either the Sitecore host, or this app's Cloud Portal configuration or installation. These findings don't tell which.
- **Confirmed: no SDK change since June needs handling in our code.**
  - `_fetch` (the code that sends every built-in call to the host) is identical in client 0.3.2 (v1, June) and 0.4.1, and on the SDK repo's `main`.
  - The client changelog from 0.3.2 to 0.4.1 lists security fixes, core bumps, `getPageHTML` and dependency clean-up. Core 0.3.2 → 0.5.0 adds per-request timeouts, developer info, URL state and a stricter message filter (2026-10-30, after the error was first seen). Neither touches authorization or the request message.
  - xmc 0.4.1 → 0.4.4 only swapped the bundled HTTP client ("runtime behaviour are unchanged").
  - The repo has no host SDK package, so the host side can't be read.
  - Sources: [client](https://github.com/Sitecore/sitecore-marketplace-sdk/blob/main/packages/client/CHANGELOG.md), [core](https://github.com/Sitecore/sitecore-marketplace-sdk/blob/main/packages/core/CHANGELOG.md) and [xmc](https://github.com/Sitecore/sitecore-marketplace-sdk/blob/main/packages/xmc/CHANGELOG.md) changelogs, and the npm tarballs.
- **Confirmed: the panel and the dashboard call the host the same way.** Same `ClientSDK.init` (`target: window.parent`, `modules: [XMC]`), same `pickContextId` logic, and the same `sitecoreContextId` query parameter on every call.
- **The dashboard host's behaviour changed.** The June code (`48b4f9c`, 2026-06-01) handles a "401 M2M error" from `retrieveSite` and falls back to GraphQL. So in June the dashboard host **did** attach the built-in machine token: GraphQL worked and only the Sites scope was refused. Now that host attaches no token at all, with unchanged app code and an unchanged SDK protocol.
- **Confirmed (dashboard console, 2026-11-01, after PR #8's first deploy):** `application.context` has `type: "custom"`, `hasContextId: true` and one resource, plus extension points `xmc:dashboardblocks` and `xmc:pages:contextpanel` (`/pages-contextpanel-extension`).
  - `type` is the **Marketplace app type** (custom / public), **not** the host type. The first version of the log mislabelled it `appType`; it's now `marketplaceAppType`.
  - The dashboard gets an environment Context ID, so a missing Context ID or a missing environment install doesn't explain the refusal.
  - The `xmc:dashboardblocks` top-level `route` is `null` by design: dashboard blocks keep one route per widget in `meta[]`, each entry with a required `route` (core types `ApplicationExtensionPointMetaContext`; core 0.1.6 "support multiple dashboard blocks"). The log now prints those under `blocks`.
  - `tenantName` is empty, which matters for the Pages editor deep-links, not for this error.
- **Confirmed (2026-11-01): the dashboard and the panel report the same host type, but only the panel gets a token.** The SDK knows three host types (`AppType`), and `host.state` tells them apart by shape:

  | Host type | `host.state` shape (SDK types) | Dashboard | Panel |
  |---|---|---|---|
  | `portal` (Cloud Portal) | `null` | no | no |
  | `xmc:xmapps` (SitecoreAI apps) | `{ environment, language }` | no | no |
  | `xmc:pages-contextview` (Pages editor) | `{ organizationId, xmCloudTenantInfo, userInfo }` | **yes** | **yes** |

  - Dashboard: from PR #9's `[sitePages] host.state →` log (`isNull: false`, `environment: undefined`).
  - Panel: from the DevTools console in the panel iframe: `Object.keys((await window.sitecore_marketplace__clientSdk.query("host.state")).data ?? {})`. Select the iframe first (right-click in the panel, then Inspect), otherwise the console runs in Sitecore's top window, where the global doesn't exist.
  - One installation, the same host-state shape and the same SDK code, yet only the dashboard's requests lose their token. So the difference is in how Sitecore mounts the dashboard widget: that HostSDK instance appears to be created without `getAccessToken`. The shape match is read from the SDK's types, since the host code isn't public.
- So the app couldn't fix this through built-in authorization. Sitecore confirmed the cause was on their side (7.6).

### 7.2 What the docs say about custom authorization

**From docs** (sources in 7.7):

| Question | Answer | Source |
|---|---|---|
| App-wide or per extension point? | Framed per app: you can "replace the built-in authorization with Auth0 authorization". No per-extension-point setting is documented. | [Architecture and authorization options](https://doc.sitecore.com/mp/en/developers/marketplace/app-architecture-and-authorization-options.html) |
| Do built-in `xmc.*` calls stop once client credentials exist? | **Not documented.** Sitecore's own full-stack quick-start page (`app/page.tsx`) renders a built-in XMC example next to the custom-auth examples, which hints that both work together. Unconfirmed: ask support. | [quickstart-with-full-stack-xmc.json](https://blok.sitecore.com/r/marketplace/next/quickstart-with-full-stack-xmc.json) |
| Does revoking credentials bring built-in back? | **Not documented.** Revoking is under *Settings > Revoke access*. | [Create client credentials](https://doc.sitecore.com/mp/en/developers/marketplace/create-client-credentials.html) |
| App type | **Single-page app (SPA):** client ID only, used with `@auth0/auth0-react`. **Regular web app:** client ID and secret, for server-side `@auth0/nextjs-auth0`. The quick start says to pick SPA "even if you're building a full-stack Next.js app". Maximum of two sets per type. | [Create client credentials](https://doc.sitecore.com/mp/en/developers/marketplace/create-client-credentials.html), [Quick start (CLI)](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/quick-start--cli-.html) |
| Cloud Portal fields | Allowed callback, logout, origin and web origin URLs. All are optional and editable later. They "must correspond to the deployment URL, and the localhost URL or custom DNS you develop your app on". | [Create client credentials](https://doc.sitecore.com/mp/en/developers/marketplace/create-client-credentials.html) |
| Local development | Custom DNS and HTTPS are required. Use `next dev --experimental-https --hostname myapp.local`, and the deployment URL is set to that custom DNS. | [Quick start (CLI)](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/quick-start--cli-.html), [Configure and activate a custom app](https://doc.sitecore.com/mp/en/developers/marketplace/configure-and-activate-a-custom-app.html) |
| Whose identity | Built-in swaps the user's token for "a machine token, which has admin rights". The custom flow uses the signed-in user's own token. | [Built-in authorization](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/built-in-authorization.html) |
| Dashboard widgets | Not mentioned on any page read. | — |
| When custom authorization arrived | Announced as new on 2025-10-23 ("This involves creating client credentials for your app"). No Marketplace changelog entry from 2026-06 to 2026-11 changes authorization or dashboard widgets. The feed only covers 2026-01-27 onward. | [Changelog 2025-10-23](https://developers.sitecore.com/changelog/marketplace/23102025/introducing-full-stack-marketplace-apps-and-granular-app-access-control), [changelog feed](https://developers.sitecore.com/changelog/marketplace) |
| Has this app ever used custom authorization? | **Confirmed not, as far as the repo shows:** no commit since the first (2026-05-24) mentions Auth0, a client ID or a client secret, and neither `.env.example` nor `.env.local` has any. The user doesn't recall creating credentials, and the Cloud Portal itself hasn't been checked. | `git log --all -S` |
| Status | The token tooling is labelled "experimental phase". | [experimental-xmc.md](https://github.com/Sitecore/marketplace-sdk/blob/main/docs/experimental-xmc.md) |

**The quick start's custom-auth template** ([quickstart-with-custom-auth.json](https://blok.sitecore.com/r/marketplace/next/quickstart-with-custom-auth.json)) uses an SPA credential:

- `Auth0Provider` with `domain`, `clientId` and `authorizationParams` (`organization_id`, `tenant_id`, `product_codes: mkp_<app id>`, `audience`, `redirect_uri`, `scope`). The whole app is wrapped in `withAuthenticationRequired`.
- `getAccessTokenSilently` is wrapped to always send `organization_id` and `tenant_id`.
- Env vars:
  - `NEXT_PUBLIC_AUTH0_DOMAIN=https://auth.sitecorecloud.io`
  - `NEXT_PUBLIC_AUTH0_AUDIENCE=https://api-webapp.sitecorecloud.io`
  - `NEXT_PUBLIC_AUTH0_SCOPE="openid profile email offline_access"`
  - `NEXT_PUBLIC_AUTH0_CLIENT_ID`
  - `NEXT_PUBLIC_SITECORE_APP_ID`
  - `NEXT_PUBLIC_APP_BASE_URL`
  - `NEXT_PUBLIC_SITECORE_ORGANIZATION_ID`
  - `NEXT_PUBLIC_SITECORE_TENANT_ID` (known only after installation)
- It sets CSP `frame-ancestors` to `marketplace-app.sitecorecloud.io`, `pages.sitecorecloud.io` and `xmapps.sitecorecloud.io`.
- In the [full-stack XMC template](https://blok.sitecore.com/r/marketplace/next/quickstart-with-full-stack-xmc.json), the browser gets the token and sends it as `Authorization: Bearer …` to an API route or a server action. On the server, that code calls `experimental_createXMCClient({ getAccessToken: async () => token })` and passes `sitecoreContextId` on every call. The Context ID comes from `application.context` → `resourceAccess[0].context.preview`.
- The template doesn't set `useRefreshTokens` or `cacheLocation`. It doesn't say how login works inside the Sitecore iframe either: with these defaults, auth0-react redirects, and silent renewal uses a hidden iframe.

### 7.3 What the experimental XMC client does

**From docs/types** (xmc 0.4.4 bundle):

- `experimental_createXMCClient({ getAccessToken })` builds plain HTTP clients against `https://edge-platform.sitecorecloud.io`, or `EDGE_PLATFORM_PROXY_URL` if set. It calls `getAccessToken()` for every request and sends `Authorization: Bearer <token>`, `sc-resource: marketplace` and `sc-marketplace-auth: interactive/v1`. **The Sitecore host isn't involved,** so the dashboard host's missing `getAccessToken` can't affect it.
- It logs to `console.log` on every call (`🎭 [experimental_XMC] Calling …`, `🔑 … Getting access token`).
- Every operation the app uses exists with the same parameters:

| App call today (built-in) | Experimental equivalent | Used by |
|---|---|---|
| `xmc.authoring.graphql` (×4) | `authoring.graphql` (`/v1/authoring/graphql`) | panel fields + FAQ items, dashboard page enumeration ×2 |
| `xmc.pages.retrievePage` | `pages.retrievePage` | panel |
| `xmc.pages.updateFields` | `pages.updateFields` | panel (meta Populate, the only write) |
| `xmc.sites.retrieveSite` | `sites.retrieveSite` | dashboard |

The call shape differs: built-in takes `{ params: { path, query, body } }`, the experimental client takes `{ path, query, body }`. Host-only calls stay on the ClientSDK because they don't use a SitecoreAI token: `application.context`, `pages.context`, `site.context`, the `pages.content.fieldsUpdated` subscription, `getPageHTML` and `navigateToExternalUrl`.

### 7.4 Contingency: custom authorization for the whole app

**Shelved (2026-11-02):** Sitecore is fixing the cause (7.6). Kept for reference in case the fix slips or a later feature needs server-side SitecoreAI calls.

**Cloud Portal** (only once the plan is agreed):

1. Recommended: first create a **separate test custom app** in App Studio, pointing at a Vercel preview deployment, with the same two extension points and the same APIs. Then the production app's authorization never changes until the flow is proven.
2. On the test app, create **SPA** client credentials. Fill in callback, logout, origin and web origin URLs for the preview URL and for the local custom DNS (e.g. `https://agentready.local:3000`).
3. Activate and install it, then note the organization ID and tenant ID.
4. Once validated, do the same on the production app with the production URL.

**Code** (behind a switch, so it can ship before the credentials exist):

- `@auth0/auth0-react` with the template's provider, and `withAuthenticationRequired` only when `NEXT_PUBLIC_AUTH0_CLIENT_ID` is set. Never in `?demo=1`.
- One `src/lib/xmc/` module with the four operations above. It has two implementations: built-in (today's calls) and custom. The custom one sends the bearer token to a small server route that allows only these four operations and calls `experimental_createXMCClient`. It never logs the token. The 7 call sites in `usePageFields.ts`, `useSitePages.ts` and `MetaGenerator.tsx` move to this module.
- The server route follows Sitecore's template. Calling the experimental client straight from the browser would skip a hop, but whether CORS allows that from our origin is unverified.
- Env vars: the eight `NEXT_PUBLIC_*` values above, per environment in Vercel.
- `next.config.ts`: add the template's `frame-ancestors` CSP, and keep `Authorization` out of the `/api/*` wildcard CORS.
- Tests for the module (both implementations) and the route's allow-list. Update `*-TECHNICAL.md` too.

**Effort:**

| Step | Estimate |
|---|---|
| Test app setup in Cloud Portal (user) | ~30 min |
| Spike on the test app: auth provider and one read in both extension points, Chrome and Edge, plus Safari if used | ~1 day |
| Full migration behind the switch: module, route, 7 call sites, demo exemption, tests, docs | ~1.5–2 days |
| Production cutover with the user: credentials, env vars, redeploy, smoke test both extension points | ~1–2 h |
| **Total** | **~3 working days** |

**What could break** (all **Open** until the spike):

1. **Login inside the iframe.** The template's default is a redirect to `auth.sitecorecloud.io` inside the extension iframe. If that page refuses to be framed, we'd need `loginWithPopup`, which needs the app's pop-up permission.
2. **Silent token renewal.** Without refresh tokens, auth0-react renews through a hidden iframe to `auth.sitecorecloud.io`, which needs third-party cookies. Safari, Firefox strict mode and Chrome with third-party cookies blocked would then log users out or loop. The template asks for `offline_access`, so `useRefreshTokens` should work, but only if Sitecore's Auth0 client has refresh-token rotation on.
3. **Permissions change.** Built-in calls run as a machine user with admin rights. Custom calls run as the author. Authors without write access to an item would get a 403 on Populate, and reads follow item security.
4. **The panel during cutover.** If built-in calls stop once credentials exist (7.2, not documented), the panel breaks between creating the credentials and deploying the custom flow. The test app avoids this for validation. For production, deploy the switch first, then create the credentials and set the env vars in one sitting.
5. **Rollback.** Whether revoking the credentials restores built-in authorization isn't documented.
6. **Demo mode.** `withAuthenticationRequired` would force a login on a standalone `?demo=1` tab unless demo mode is exempt.
7. **Experimental API.** It's labelled experimental and may change between SDK versions. Pin the version.
8. **Tenant ID per install.** It's only known after installation, so a reinstall means updating the env var.

### 7.5 `?demo=1` as the Symposium fallback

**From code reading** of `main` before the hardening at the end of this section (not run in a browser, see the check below):

- Both routes swap their *displayed* data for fixtures. The live hooks still mount: `useMarketplaceClient`, `useSitePages` and `usePageFields`.
- **Standalone tab (outside Sitecore): no SitecoreAI calls.** The ClientSDK handshake has no host to talk to, so `client` stays null and every live hook returns before its first `xmc.*`, `application.context` or `site.context` call. The SDK only uses `postMessage`, so nothing goes to `*.sitecorecloud.io`.
- **Inside Sitecore with `?demo=1` (if the extension URL carried it): SitecoreAI calls still run.** The live hooks run behind the fixture display. In the panel, Populate would write the generated value to the **real** open page, because `writeContext` comes from the live hook.
- Other network calls in demo mode, all to the app's own `/api` routes:
  - Panel auto-scan: `preview-fetch` of the fixture URL `https://example.com/blog/…`, then `ai-check` (Claude, paid) if that page returns main text. The result is cached in localStorage after the first run, at about $0.01 per browser.
  - `robots-check` and `footer-check` for `example.com`: free.
  - Only on click: Generate meta and Citation forecast (Claude, paid), and PSI.
- Check to run before the Symposium (free, about 5 minutes): open `/pages-contextpanel-extension?demo=1` and `/dashboard-widget-extension?demo=1` in a normal tab. In DevTools > Network, filter by `sitecorecloud` and confirm there are no requests. Then filter by `/api/` and note which calls appear.
- **Hardening done on this branch:** demo mode no longer initialises the ClientSDK (`useMarketplaceClient` checks `isDemoUrl()`), and the panel no longer auto-scans the fixture URL. Demo mode now makes no Sitecore calls and no paid calls on load, wherever it runs. The browser check above still applies after deploy.

### 7.6 Support case CS0746928

| Date | Event |
|---|---|
| 2026-11-01 | Raised. The support AI replied: built-in authorization is documented to work in dashboard widgets, and client credentials would switch the whole app to custom authorization. It handed the case to a support engineer. |
| 2026-11-01 | Diagnostics from 7.1 prepared for the engineer: June machine-token evidence, the same `_fetch` in client 0.3.2 and 0.4.1, the Context ID present, the `host.state` comparison, and the `contextId` question. |
| 2026-11-02 | Engineer: "We have identified the root cause of the issue and are currently completing the final validation and testing before deploying the fix to production." The production deploy is targeted for the middle of that week. They'll confirm once it's deployed. |

Sitecore hasn't said what the root cause was. Ask when they confirm the deploy, and record it here.

**After Sitecore confirms the deploy** (all **Open**):

- [ ] The dashboard Overview lists pages, with no "Sitecore didn't authorize…" message.
- [ ] Check the console for `retrieveSite`. In June the Sites API returned a 401 for its scope. If that comes back, the dashboard falls back to the content-tree walk and still loads pages, so it isn't a blocker.
- [ ] Panel regression: fields load, and Generate → Populate still writes.
- [ ] Plan section 13, item 2: the parity check between panel and dashboard for the same page.
- [ ] Record the root cause and these results here, then close plan item 1.

### 7.7 Sources

- [App architecture and authorization options](https://doc.sitecore.com/mp/en/developers/marketplace/app-architecture-and-authorization-options.html)
- [Choosing the right architecture and authorization](https://doc.sitecore.com/mp/en/developers/marketplace/choosing-the-right-architecture-and-authorization.html)
- [Create client credentials](https://doc.sitecore.com/mp/en/developers/marketplace/create-client-credentials.html)
- [Configure and activate a custom app](https://doc.sitecore.com/mp/en/developers/marketplace/configure-and-activate-a-custom-app.html)
- [Built-in authorization](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/built-in-authorization.html)
- [Quick start (CLI)](https://doc.sitecore.com/mp/en/developers/sdk/0/sitecore-marketplace-sdk/quick-start--cli-.html)
- [Changelog: full-stack apps and granular access control (2025-10-23)](https://developers.sitecore.com/changelog/marketplace/23102025/introducing-full-stack-marketplace-apps-and-granular-app-access-control)
- [marketplace-sdk docs/experimental-xmc.md](https://github.com/Sitecore/marketplace-sdk/blob/main/docs/experimental-xmc.md)
- Templates: [quickstart-with-custom-auth.json](https://blok.sitecore.com/r/marketplace/next/quickstart-with-custom-auth.json), [quickstart-with-full-stack-xmc.json](https://blok.sitecore.com/r/marketplace/next/quickstart-with-full-stack-xmc.json)
- SDK bundles: `node_modules/@sitecore-marketplace-sdk/xmc/dist/index.esm.js` (`experimental_XMC`, `createCustomClients`) and `node_modules/@sitecore-marketplace-sdk/client/dist/index.esm.js` (`_fetch`)

---

## 8. accept-md with the Sitecore Content SDK (Phase 7)

**Question (plan Phase 7):** does `npx accept-md init` coexist with the Sitecore Content SDK middleware for redirects, personalisation and multisite?

**Test bed:** the BrandX replica (hztl-page-health-checker-demo.vercel.app, the Sitecore site's hostname), repo `hztl-xcelerate-blueprint-copy`, app `headapps/nextjs-starter`: Content SDK 1.3.2, Next.js 15 Pages Router, i18n (`en`, `es-MX`, `fr-CA`, `ar-AE`), `src/middleware.ts` = `defineMiddleware(multisiteMiddleware, redirectsMiddleware, personalizeMiddleware, smallCaseMiddleware)` with a matcher that skips `/api/`, `/_next/`, `/sitecore/api/`, `/-/` and `/healthz`. accept-md **5.0.2** (CLI, `@accept-md/core` and `accept-md-runtime`, read from the published packages on 2026-11-02). Branch `feature/accept-md` on the replica.

### 8.1 What accept-md does (Confirmed, from its published code)

- **`init`** adds a rewrite to `next.config` (`beforeFiles`: `/:path*` → `/api/accept-md?path=:path*` when the `accept` header contains `text/markdown`), writes the handler (`src/pages/api/accept-md/index.ts` for the Pages Router), creates `accept-md.config.js` (`include: ['/**']`, `exclude: ['/api/**', '/_next/**']`, `cleanSelectors: ['nav', 'footer', '.no-markdown']`, `cache: true`), adds `accept-md-runtime` (exact version) to `dependencies` and a `postbuild` script `npx accept-md fix-routes`. It doesn't run an install.
- **The handler** fetches the page's own HTML from the public origin (the request's `host`, else `VERCEL_URL`) with `Accept: text/html` and the request's other headers (cookies included), converts it with Turndown, and answers `Content-Type: text/markdown; charset=utf-8`, **`Vary: Accept`**, `Cache-Control: public, s-maxage=60, stale-while-revalidate`. Results are cached in memory per path (expiry from the page's `s-maxage`/`revalidate`, cleared on a new `BUILD_ID`).
- **The Markdown** starts with YAML front matter built from the head: `title` (`<title>`), `description` (meta description), `canonical`, `language`, Open Graph, article and Twitter fields, robots, and JSON-LD blocks as code. `nav` and `footer` are removed before conversion; `header` isn't, so a site header outside `<nav>` stays in.
- **Order of operations in Next.js:** middleware runs before `beforeFiles` rewrites, so the Sitecore middleware (multisite, redirects, personalize) sees a Markdown request first. A redirect therefore answers the agent before accept-md runs. The handler's own HTML fetch goes back through the public URL and the middleware.

### 8.2 `init` on the Content SDK starter (Confirmed, 2026-11-02)

- **`init` breaks `next.config.js`.** Its "has rewrites?" test only matches `rewrites:` or `rewrites =`, not the starter's method form `async rewrites() { return [...] }`. It then looks for the end of `nextConfig` with a brace counter, which loses track in the starter's `webpack()` function (regex literals such as `/src\components\.*\.tsx$/`), and inserts `rewrites: async () => { return { beforeFiles: [...] } }` **inside `webpack()`, after `return config;`**: a syntax error, so the build fails. Even placed correctly, a second `rewrites` key would override Sitecore's method and drop its rewrites (`/sitecore/api/*`, `/-/*` media, `/healthz`, `/sitecore/service/*`).
- **First hand fix, failed on Vercel:** returning `{ beforeFiles: [acceptMd], afterFiles: [...Sitecore's rules] }` from `rewrites()`. The starter's next-config plugins `feaas`, `robots` and `sitemap` (`src/lib/next-config/plugins/`) each wrap `rewrites()` with `return [...(await nextConfig.rewrites()), …]`, so an object fails the build: `TypeError: (intermediate value) is not iterable at Object.rewrites (src/lib/next-config/plugins/feaas.js:8:13)`.
- **Fix (by hand, `5a124fb`):** `rewrites()` stays as it was. `withAcceptMd` wraps the final config in `module.exports`, after the plugins, and returns `{ beforeFiles: [acceptMd], afterFiles: <the plugins' array>, fallback: [] }` (a plain array is `afterFiles`, so nothing moves). Checked by loading `next.config.js` with its plugins (uninstalled modules stubbed) and calling `rewrites()`: the accept-md rule in `beforeFiles`, the seven Sitecore and plugin rewrites in `afterFiles` in their original order (`/sitecore/api`, `/-/`, `/healthz`, `/sitecore/service`, `/feaas-render`, `/robots.txt`, the sitemap). The handler and `accept-md.config.js` stay as generated.
- **The generated handler fails the starter's lint**, which `next build` runs: `prefer-const` (`let pathRaw`) and three `prettier/prettier` errors (the starter's `.prettierrc`: `printWidth: 100`, CRLF). Fixed (`e852400`) by formatting it with the repo's Prettier 3.3.2 and making `pathRaw` a `const`, with no change in behaviour. It passes the starter's TypeScript settings (`strict`, `noImplicitReturns`, `noUnusedLocals`; checked with next 15.5.12 and TypeScript 5.8.3).
- **`postbuild: npx accept-md fix-routes`** is only needed for `next start` on Next.js 15+ ("routesManifest.dataRoutes is not iterable"). On Vercel it isn't needed, and it would download an unpinned CLI on every build, so it was removed.
- **`npx` inside the repo** fails on this machine: the repo's `.nvmrc` asks for Node 22 and nvm-windows refuses ("Node.js v22.x.x is not installed"). `init` takes the app's path, so it ran from outside: `npx --yes accept-md@5.0.2 init <path>`. The lockfile was updated with `npm install --package-lock-only` (adds `accept-md-runtime`, Turndown, linkedom; no other versions changed).
- **Fix card:** the accept-md card says to check `next.config` after `init` on a Content SDK app (see 8.4).

### 8.3 On the deployed replica (Confirmed, 2026-11-02)

Deployed to the replica's production in three steps: ksorthiya/hztl-xcelerate-blueprint-copy#4 (accept-md), #5 (the build fixes in 8.2) and #6 (the path fix below). Tested through `/api/markdown-check`, plain requests and the agent-access scan.

**After #4 and #5** (13 requests and one scan):
- Every Markdown request reached the handler and got **`404 {"error":"Not found"}`** (`application/json`, no `Vary`); browsers still got the HTML. Cause: the generated Pages Router handler reads the page path from `x-accept-md-path`, then the matched-path headers, then the rewrite's `?path=`. On Vercel, `x-matched-path` is the route that matched, `/api/accept-md`, so the path starts with `/api/`, and its "Exclude /api and /_next paths" branch answers 404 (the only place that body comes from).
- **Fix (#6):** `?path=` first whenever it's present (it's `''` for the home page, so a plain `||` wouldn't do). Worth reporting to accept-md.

**After #6** (6 requests and one scan: 43 requests in 2.5 s):
- [x] **A page serves Markdown, 4/4 (P5):** `/`, `/services` and `/contact-and-support` answer `Accept: text/markdown` with `text/markdown; charset=utf-8` and `Vary: Accept`, browsers still get `text/html`, and the Markdown is 97–98% smaller (home: 214,718 → 6,045 bytes, about 53,700 → 1,500 tokens). **S1, S2 and S3 pass.** This is the Phase 7 accept-when "supported site shows 4/4 green" on a real site.
- [x] **P6 on the home page: full credit.** The front matter title and description match the page's, 100% of the main content is in the Markdown, and menus, header and footer are 5% of it. (A first run counted footer headings such as "Legal" as missing content; P6 now counts only headings in the main text.)
- [x] **Multisite:** each page's Markdown is its own page on this site (title and canonical), so the multisite rewrite and the handler's own HTML fetch resolve the right site.
- [ ] A Sitecore redirect still answers a Markdown request with the redirect. **Not configured on the replica's site** (user, 2026-11-02): untested.
- [ ] A personalised page: the Markdown is the variant the visitor's cookies select, or the default. **Not configured on the replica's site**: untested. The handler forwards the request's cookies to its HTML fetch, so it should follow the visitor's variant; customers who personalise pages should check it.
- [ ] A missing page: not retested after #6. The browser request returns a 200 "not found" page (2.6 KB), the soft 404 S8 already reports, and accept-md converts what the page returns.
- [x] **Sitecore's rewrites still work** (after #5): `/healthz` 200, `/robots.txt` 200, `/sitemap.xml` 200 (117 KB, 149 URLs). Every search and user agent still gets 200.
- **What accept-md's Markdown looks like here:** the site header stays in (the logo, the menu as a list, the country selector), because accept-md removes `nav` and `footer` but not `header`; links and images stay relative (`/services`, `/_next/image?url=…`); the front matter carries title, description, canonical, language, Open Graph and robots.

### 8.4 Recommendation

**accept-md works with the Content SDK, with three hand fixes** (5.0.2, Next.js 15 Pages Router on Vercel):
1. `npx accept-md init` breaks `next.config.js`: undo its edit and add the rewrite after the next-config plugins, in `beforeFiles`, with their array as `afterFiles` (8.2).
2. Format the generated handler for the project's lint rules (8.2).
3. On Vercel, make the handler read `?path=` before `x-matched-path` (8.3).

Then test it with the site's own redirects and personalisation. The fix card and P5's developer note list these steps. Redirects and personalisation stay untested here (not configured on the replica).

## 9. Phase 9: write-back to Sitecore (plan section 10, Phase 9)

Date: 2026-11-02 · Branch: `feature/v2-phase-9-ai-assist`

| # | Question | Answer | Status |
|---|---|---|---|
| a1 | The authoring GraphQL mutation that writes a field on a datasource or media item (name, input shape) | — | **Open** |
| a2 | A media item's Alt field: its name, and whether the image field value can carry its own `alt` (a per-use override) | — | **Open** |
| a3 | Is the media item used by other pages, and can the app find out (link lookups or search)? | — | **Open** |
| a4 | Does a write go into the current version and keep the workflow state (no new version, no publish)? | — | **Open** |
| b1 | Where author items live (the Authors folder) and their template | — | **Open** |
| b2 | The byline field on article pages: its name, type and stored value | — | **Open** |
| c1 | How FAQ answers are stored: the AccordionItem datasource fields (plan section 13, item 4) | — | **Open** |
| c2 | Does any template have a JSON-LD / structured-data field? | — | **Open** |

**How to run the spike** (in Page Builder, on production after deployment):

1. Turn the box on in the panel's iframe: open the browser's developer tools, pick the extension's frame in the console's context menu, run `localStorage.setItem("iiar-spike", "9")`, and reload the panel. (Or add `?spike=9` to the panel's URL.) An amber "Phase 9 spike" box appears under the panel header.
2. Open the article page (…/Banking-Sector-Earnings-Point-to-Resilience), label the run `article`, keep **Schema** ticked, and click **Run spike**. Then open /Contact-and-Support/FAQs, label it `faq`, untick **Schema**, and run it again.
3. Click **Copy N reports** and paste the JSON into the session. Each run is also logged with `console.groupCollapsed("[spike:assist] …")`.
4. "Run spike" only reads. The free-form box refuses a mutation unless **Run write…** is used, which shows the full text in a confirm first. The one test write (a4) is sent only after the user agrees to the item and the value, and the old value is written back straight after.

Implementation: `src/components/spike/AssistSpike.tsx` (temporary; removed before Phase 9 is merged).
