# Is It Agent-Ready? for SitecoreAI

Make every page reachable, readable and citable by AI agents, then fix it right in Sitecore.

**Is It Agent-Ready?** is a Sitecore Marketplace app for SitecoreAI. It checks whether AI agents and answer engines (ChatGPT, Perplexity, Copilot, Gemini, Claude) can reach, parse and cite your pages, and it writes fixes back into Sitecore fields from inside the editor.

> The Marketplace listing name is "Is It Agent-Ready? for SitecoreAI". Keep the hyphen and the "for SitecoreAI" suffix: it tells us apart from Cloudflare's "Is It Agent Ready?" scanner.

The v2 roadmap is in [docs/IS-IT-AGENT-READY-PLAN.md](docs/IS-IT-AGENT-READY-PLAN.md), and the spike results it depends on are in [docs/SPIKE-FINDINGS.md](docs/SPIKE-FINDINGS.md).

## Extension points

| Extension point | Route | What it does |
|---|---|---|
| **Pages context panel** | `src/app/pages-contextpanel-extension/page.tsx` | "Is this page agent-ready?" Scores the page open in Page Builder in four categories (Reach, Read, Understand, Trust), runs the AI uniqueness check on the page's main text, and its **AI Assist** tab suggests fixes in your brand voice: meta and Open Graph values, quotable FAQ answers, image alt text, the author byline, structured data, question headings and a summary paragraph. **Apply** writes a fix to its Sitecore field after a confirm that shows before → after (current version, never published); fixes without a field are copy-only. |
| **Dashboard widget** | `src/app/dashboard-widget-extension/page.tsx` | "Is this site agent-ready?" Scans every page of the site with the same checks: site score, category cards, site checks (robots.txt, home page Organization schema), Fix first (with **Generate for all** for missing meta descriptions, reviewed and approved page by page before it writes), "What changed since last scan", the Agent access checklist and bot grid, AI citations (a readiness estimate per engine and on-demand citation probes), the llms.txt generator and the robots.txt helper. |
| **Full screen** | `src/app/fullscreen-extension/page.tsx` | The dashboard at full size, opened from the **Apps** menu in SitecoreAI's header. The same header and five tabs, using the width (from 1280 px the Overview puts What changed beside the hero). The Apps menu sits outside any site, so a **site picker** lists the organisation's sites (`xmc.sites.listSites`) and remembers the pick per organisation; it opens on the remembered site, else the site on `NEXT_PUBLIC_DEFAULT_SITE_DOMAIN`, else the first site with a public host name. It shares the widget's browser cache and history. |

All three run inside the Sitecore iframe and share one dashboard component (`src/components/dashboard/DashboardApp.tsx`). Opening their routes directly in a browser only works in demo mode (below); the full-screen route then says to open it from the Apps menu.

Server routes in `src/app/api/*` fetch and parse pages (`preview-fetch`, `agent-access` for the site checks, `markdown-check` for Markdown, `psi-check`) and call Claude (`ai-check`, `generate-meta`, `assist`, `citation-probe`). Writes to Sitecore happen in the browser through the Marketplace SDK (`src/lib/sitecore/write.ts`), never from the server. Every server-side fetch of a caller-supplied URL goes through `src/lib/server/safe-fetch.ts`, which blocks private, loopback and cloud-metadata addresses.

The panel and the dashboard share one check engine (`src/lib/checks/`), so the same page gets the same score in both. Each page is scored out of 100: Essential checks share 80 points, Recommended checks 20, and Bonus checks add up to 5 (capped at 100). Checks that don't apply are skipped, not failed. Scores use the same thresholds everywhere: 80 and above is good (Agent-ready), 60–79 is a warning (Almost there), and below 60 is critical (Not ready). Details: `docs/PAGE-CHECKS-TECHNICAL.md`.

## Setup

Requirements: Node.js 24 (Vitest needs `^22.12 || ^24 || >=26`) and a SitecoreAI environment where you can register Marketplace apps.

```sh
npm install
cp .env.example .env.local   # or create .env.local by hand, see below
npm run dev                  # http://localhost:3000
```

Then register the app in the Sitecore Cloud Portal:

1. Create a custom app, and point its extension points at your deployment:
   - Pages context panel → `<APP_URL>/pages-contextpanel-extension`
   - Dashboard widget → `<APP_URL>/dashboard-widget-extension`
   - Full screen → Route URL `/fullscreen-extension` (the app's logo is what the Apps menu shows)
2. Grant API access to **SitecoreAI APIs** (the app uses `xmc.pages`, `xmc.sites` and `xmc.authoring.graphql`).
3. Install the app in your environment and open it from Page Builder, the dashboard, or the Apps menu.

See the [Sitecore Marketplace documentation](https://doc.sitecore.com/mp/en/developers/marketplace/introduction-to-sitecore-marketplace.html) for the portal steps.

### Deploying to Vercel

Set the environment variables below in the Vercel project. `next.config.ts` bundles the `brand/` folder into the `generate-meta` function, so a `BRAND_VOICE_FILE` under `brand/` is available at runtime.

## Environment variables

Put these in `.env.local` for development and in your host's settings for deployments. `.env*` files are git-ignored.

**Server only**

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes, for AI features | Claude API key for `ai-check`, `generate-meta` and `citation-probe` (citation probes also use web search, $10 per 1,000 searches). |
| `ANTHROPIC_MODEL` | No | Claude model for `generate-meta` and `citation-probe`. Default `claude-opus-5-5`. |
| `ANTHROPIC_MODEL_BULK` | No | Claude model for `ai-check`, which the dashboard runs for every page (the panel uses it too, so both show the same rating). Defaults to `ANTHROPIC_MODEL`. `claude-sonnet-5-5` costs about half as much as Opus 5.5. |
| `PSI_API_KEY` | No | Google PageSpeed Insights key. Works without one at low rate limits. |
| `BRAND_VOICE_FILE` | No | Markdown brand-voice document, relative to the project root, used to ground meta generation (e.g. `brand/brandx.md`). Without it, a neutral default voice is used. |
| `BRAND_NAME` | No | Brand name used in the generation prompts (e.g. `BrandX`). |
| `SAFE_FETCH_ALLOW_HOSTS` | No | Comma-separated hostnames that skip the private-address check, e.g. `localhost` to scan a local rendering host. **Leave unset in production.** |

**Browser (`NEXT_PUBLIC_*`)**

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL of this app, prefixed to `/api/*` calls from inside the Sitecore iframe. `http://localhost:3000` in development. |
| `NEXT_PUBLIC_DEFAULT_SITE_DOMAIN` | Recommended | Published site URL (e.g. `https://www.example.com`), used when the SDK doesn't give a site hostname. |
| `NEXT_PUBLIC_SITE_ROOT_PATH` | No | Content path of the site's Home item, if the dashboard can't find it through `xmc.sites`. |
| `NEXT_PUBLIC_FIELD_TITLE`, `NEXT_PUBLIC_FIELD_META_DESCRIPTION`, `NEXT_PUBLIC_FIELD_OG_TITLE`, `NEXT_PUBLIC_FIELD_OG_DESCRIPTION` | No | Sitecore field names for the meta fields, if your templates don't use `pageTitle`, `MetaDescription`, `OpenGraphTitle`, `OpenGraphDescription`. |
| `NEXT_PUBLIC_FIELD_AUTHOR`, `NEXT_PUBLIC_FIELD_JSON_LD`, `NEXT_PUBLIC_FIELD_FAQ_QUESTION`, `NEXT_PUBLIC_FIELD_FAQ_ANSWER` | No | Fields AI Assist writes: the author byline (default `authorName`), a JSON-LD field (none by default, so structured data is copy-only), and the FAQ datasource's question and answer (`heading`, `content`). |
| `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_ORG_URL`, `NEXT_PUBLIC_ORG_LOGO`, `NEXT_PUBLIC_ORG_DESCRIPTION`, `NEXT_PUBLIC_ORG_SAME_AS` | No | Organization details for the Organization JSON-LD snippet. `SAME_AS` is a comma-separated list of profile URLs. Without them, the name and URL come from the site in Sitecore, and the rest are placeholders. When `NEXT_PUBLIC_ORG_NAME` is set, the organisation-schema site check also treats it as the expected name and warns if the home page's schema names someone else. |
| `NEXT_PUBLIC_SPIKE_DEBUG` | No | `1` shows the temporary `getPageHTML` spike box in the panel (same as `?spike=1`). |

### Claude API

The AI routes call Claude through `@anthropic-ai/sdk`, with the shared setup in `src/lib/server/anthropic.ts`. Every call returns JSON through structured outputs, sets its effort level explicitly, and falls back to another model on the server when the first one declines (`server-side-fallback-2026-07-01`).

AI check results are cached by a hash of the page title and text, in the browser (localStorage) and on the server (in memory, per instance), so Claude only runs again when the content changes. After changing `ANTHROPIC_MODEL_BULK`, bump `AI_CHECK_VERSION` in `src/lib/ai/content-key.ts` so browsers drop results from the old model.

### Brand voice

`brand/brandx.md` is the brand document for the BrandX demo site. To use your own brand, add a Markdown file under `brand/` (tone of voice, do's and don'ts, approved boilerplate, compliance rules) and set `BRAND_VOICE_FILE` and `BRAND_NAME`. Reading the brand kit directly from SitecoreAI is a planned enhancement.

## Demo mode

Add `?demo=1` to any extension URL to use fixture data from `src/lib/rule-engine/test-fixture.ts` instead of the SDK:

- http://localhost:3000/pages-contextpanel-extension?demo=1
- http://localhost:3000/dashboard-widget-extension?demo=1
- http://localhost:3000/fullscreen-extension?demo=1 (the site picker lists BrandX and Nimbus Goods; picking Nimbus Goods only says what would happen)

By default the demo site doesn't serve Markdown to AI agents (the Agent View shows the local preview and the estimated saving). Add `&md=1` for a site that does (4 of 4 Markdown checks).

Demo mode never turns on by itself, and it makes no Sitecore, paid or write calls: AI Assist and Generate for all show example suggestions, and Apply says "Demo: nothing is written to Sitecore." Every new check or screen needs fixture data so the demo keeps working.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (no network, no paid APIs) |
| `node docs/build-docs.js` | Rebuild the HTML versions of the `docs/*-EXPLAINED.md` and `docs/*-TECHNICAL.md` guides |

## Docs

- [Page checks, explained](docs/PAGE-CHECKS-EXPLAINED.md) and [technical](docs/PAGE-CHECKS-TECHNICAL.md): the context panel.
- [Page matrix, explained](docs/PAGE-MATRIX-EXPLAINED.md) and [technical](docs/PAGE-MATRIX-TECHNICAL.md): the dashboard.
- [docs/history/claude-code-guide.md](docs/history/claude-code-guide.md): the original v1 build guide, kept for reference. The project started from [Sitecore/marketplace-starter](https://github.com/Sitecore/marketplace-starter).

## License

Apache 2.0. See [LICENSE](LICENSE).
