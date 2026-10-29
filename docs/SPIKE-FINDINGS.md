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
- **Open:** a runtime smoke test inside Page Builder. Load the panel, change page, and run **Generate → Populate** in the meta generator. Then load the dashboard and run a site scan.

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
| 1 | Return type: `string` or `{ html }`? | Declared as `Promise<string>`. The implementation is a pass-through, `coreSdk.request("pages.getPageHTML", {})`, so the real shape is whatever the host returns. The spike records `typeof` and the object keys. Phase 4 should accept both until this is confirmed. | From types · **Open** (runtime) |
| 2 | Is `<head>` included (title, canonical, meta, JSON-LD)? | Spike reports title, canonical, description, `og:` count and JSON-LD `@type`s | **Open** |
| 3 | Are unsaved edits included, or only saved ones? | Spike "unsaved-edit" + marker check | **Open** |
| 4 | Is content rendered by client-side scripts included? | Spike diffs draft headings and paragraphs against `/api/preview-fetch` (server HTML). Text only in the draft means client-rendered content is captured. | **Open** |
| 5 | Placeholders, empty datasources, editor `data-*`? | Spike counts editor-chrome patterns and the top 25 `data-*` attribute names | **Open** |
| 6 | Which extension points support it? | Plan says Page Builder only. The spike runs in the context panel; the dashboard isn't tested. | **Open** (context panel) |

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
