# Is It Agent-Ready? — Symposium Demo Script

A 5-minute walk-through of **Is It Agent-Ready? for SitecoreAI**, run from the app's built-in demo data. It needs no internet, no Sitecore login and no AI calls, so nothing can fail on stage because of the venue Wi-Fi.

**The story:** BrandX is a financial adviser. Its article **"Retirement planning in your 40s"** is good content, but AI assistants rarely cite it. In five minutes we show why, fix part of it in Page Builder, and show what the whole site looks like to AI agents.

**The flow:** panel verdict → Top fixes → Apply → Agent View → dashboard → AI citations.

BrandX is the fictional company of the demo data. The numbers below are the demo's and always the same. The real BrandX demo site in Sitecore scores differently.

---

## Before you go on stage

### Set up (once, with internet)

- Get the repo and run `npm ci`, then `npm run build`.
- Start it with `npx next start -p 3000`. Use the production build: the dev server (`npm run dev`) is slower and can show Next.js's error overlay.
- From here on the laptop can be offline. Demo mode makes no request outside the app and calls none of the app's AI or site-check routes.

### Open three browser tabs

| Tab | URL | Window |
|---|---|---|
| 1. Panel | `http://localhost:3000/pages-contextpanel-extension?demo=1` | About 420 px wide, as in Page Builder. Use the browser's device toolbar or a narrow window. |
| 2. Dashboard | `http://localhost:3000/dashboard-widget-extension?demo=1` | Full width. |
| 3. "After" state (optional) | `http://localhost:3000/pages-contextpanel-extension?demo=1&md=1` | As tab 1. The same page once the site serves Markdown to agents. |

- Zoom to 125% if the room is large.
- **Check before you start:** the panel shows **70 · Almost there** and the dashboard shows **62 · Almost there** with "Demo data" in the header. If either doesn't, check that the URL has `?demo=1`.
- **Reset between runs:** reload the tab. Nothing in demo mode is saved.
- Stay on the app's own buttons and links. A link to another website (a page URL, a vendor's docs) needs the internet.

---

## The 5 minutes

### 1. The verdict (0:00–0:45) · Panel, Score tab

- **Point at:** the score ring **70**, **Almost there**, "▲ 6 since last scan" and the sentence "1 fix would make this page agent-ready."
- **Point at:** the four bars, **Reach 100 · Read 31 · Understand 88 · Trust 40**. Every check answers one of four plain questions: can AI agents get to the page, read it, understand it, and trust it.
- **Point at:** the banner "Scored from your draft. It differs from the live page." The panel scores what the author is editing, before it's published.
- **Say:** "This is the panel inside Page Builder. One score, one verdict, one sentence on what it takes. No SEO jargon: four questions anyone on the team can answer."

### 2. Top fixes (0:45–1:30) · Panel, Score tab

- **Point at:** **Top fixes**, ranked by points: "Agents can get this page as Markdown" **+13 pts**, "Content is there without JavaScript" **+7 pts** (both Developer · Send to developer), and "Structured data is present and valid" **+4 pts** (Developer · Copy snippet).
- **Point at:** the red strip above them: "1 site issue affects every page: ChatGPT-User and Perplexity-User get HTTP 403 from your firewall."
- **Say:** "Each fix says what it's worth and who fixes it. Developer fixes go out with **Send to developer**: a ready-made note with the page and the fix. And this strip is the surprise: the firewall blocks ChatGPT when someone asks it about this page. No edit to the page can fix that."

### 3. Apply (1:30–2:30) · Panel, Score → AI Assist

- **Click:** under **All checks**, the row **Images are described** (Improve, Understand). It opens: "1 image missing alt text … inline-figure-1.jpg", **+1 pts**, **You can fix**.
- **Click:** **Generate**. The panel switches to **AI Assist** at the **Image alt text** card.
- **Click:** **Suggest alt text**. The suggestion: "Line chart of retirement savings growing from age 40 to 65" (58 characters, target up to 125).
- **Click:** **Apply to field**. The confirmation shows the item (Data/Figure 1), the field ("image"), the language, and **Before: empty → After:** the new text.
- **Click:** **Write to Sitecore**. The toast says "Demo: nothing was written to Sitecore."
- **Say:** "Authors fix things themselves without leaving Page Builder. AI writes the suggestion, the author checks it, and nothing is saved without this confirmation. In Sitecore it saves to the page's current version and follows your workflow. Nothing is ever published automatically."
- **If asked about the other cards:** the same tab writes meta and social text, tighter FAQ answers and the author byline, and suggests question headings and a summary paragraph.

### 4. Agent View (2:30–3:15) · Panel, Agent View tab

- **Click:** the **Agent View** tab.
- **Point at:** "Agents ask for Markdown. Your site sends them the full HTML page instead.", and the four checks (Markdown response ✕, HTML fallback ✓, Vary: Accept ✕, Distinct versions —).
- **Point at:** "If you served Markdown: about 92% fewer tokens", HTML **6,150** vs Markdown **511**.
- **Click:** **Human** / **Agent** in the preview to compare the page with the Markdown an agent would get.
- **Say:** "This is what an AI agent actually receives. Markdown is a fraction of the size, so agents read more of your content and less of your menus. It's one developer change for the whole site, and the fix cards show how: accept-md for Next.js sites, or a switch in Cloudflare."
- **Optional (10 seconds):** switch to tab 3 (`&md=1`). The same page now scores **84 · Agent-ready**.

### 5. The dashboard (3:15–4:15) · Dashboard, Overview

- **Switch to:** tab 2.
- **Point at:** the site score **62 · Almost there**, the last 8 scans, and the counts: **2 Agent-ready · 4 Almost there · 5 Not ready · 1 Blocked**.
- **Point at:** the four category cards, then **Fix first**, grouped by issue rather than by page: "AI agents can open your site · Whole site · Developer", "Agents can get this page as Markdown · 11 pages · +16 pts each".
- **Point at:** **What changed since last scan**: a page down 18 after a publish two days ago, "ChatGPT-User now gets 403 from your firewall (it got 200 last time)", 2 pages that became agent-ready once their structured data was fixed, and "Cited in 2 AI answers more" for the retirement article.
- **Say:** "The same rules for every page on the site. Fix first says where one change lifts the most pages. What changed is the news: a page that got worse after a publish, a firewall that started blocking ChatGPT."
- **Optional:** the **Agent access** tab shows each AI agent's live request: ChatGPT-User and Perplexity-User **403 · Blocked by firewall**, although robots.txt allows them.

### 6. AI citations (4:15–5:00) · Dashboard, AI citations tab

- **Click:** the **AI citations** tab. It opens on "Retirement planning in your 40s".
- **Point at:** the estimate: **ChatGPT Limited** and **Perplexity Limited** (the firewall's 403s), Claude, Gemini and Copilot **Ready**.
- **Point at:** the measured result: **Cited in the answer: 2 of 7 · Found in search results: 5 of 7 · Most cited instead: retirementwise.example (4 of 8 answers)**, and "▲ 2 since last run".
- **Point at:** the table. "Is it too late to open a Roth IRA in my 40s?" cites this page; "What are catch-up contributions…?" finds it but cites a competitor.
- **Say:** "This isn't guessed. We ask real questions with live web search and count who the answer actually cites. Found in 5, cited in 2: the gap is what the fixes you just saw are for."
- **Close:** "Reach, read, understand, trust: one score in Page Builder and the dashboard, fixes authors can apply themselves, and a measured answer to 'are AI assistants citing us?'. For every SitecoreAI customer, with no extra licence."

---

## If you have more time

- **Generate for all** (Overview): **Show all 18 issues** → "Meta description missing" → **Generate for all** → **Generate 3 descriptions**. Each page gets a suggestion to edit and an unticked **Approve**. Tick two, **Write 2 approved**, and the one confirmation lists both. "Saving for retirement at any age" can't be approved: "This page's template has no "MetaDescription" field." That's the app checking the template before it offers to write.
- **Pages:** the heatmap with full category names, filters and sorting. **Open in Page Builder** on "Retirement planning in your 40s" opens the panel demo; on other rows the demo says what would open.
- **Files:** the llms.txt generator (with its "When should AI tools use this site?" text) and the robots.txt helper with search, user and training bots as separate choices. "robots.txt is a request, not a lock: firewall rules decide who actually gets in."
- **The "after" state:** `?demo=1&md=1` on the dashboard shows the site once it serves Markdown: site score **79**, **5 Agent-ready**.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| A page that says it can't reach Sitecore, or no "Demo data" label | The URL is missing `?demo=1`. |
| "This site can't be reached" | The server isn't running: `npx next start -p 3000` in the repo. |
| Port 3000 is in use | Start with `-p 3001` and change the URLs. |
| A suggestion or toast you didn't expect, or a dialog left open | Reload the tab. Demo mode keeps nothing. |
| A new tab opened on another website | Close it and go back. Only the app's own buttons work offline. |
| The Wi-Fi drops | Nothing changes: the demo doesn't use it. |

**Presenting live in Sitecore instead?** That uses the real BrandX demo site, real AI calls and real writes. Use the test pages only, and press **Cancel** in the confirmation unless you mean to save.

---

## Likely questions

| Question | Answer |
|---|---|
| Does it need Scrunch or another licence? | No. It runs on SitecoreAI with the app's own checks. Citation probes use Claude with web search. |
| Where does the score come from? | The same rules in the panel and the dashboard. The panel scores the draft you're editing; the dashboard scores the published pages. |
| Does Apply publish anything? | No. It saves to the item's current version and follows your workflow, after a confirmation that shows before and after. |
| How are citations measured? | Each question is asked once with live web search; we count whether your domain is in the results and in the answer's citations. Results are kept 7 days. About 3 cents a question. |
| What does the AI cost otherwise? | About 1 cent per generated description. Asking again for unchanged content is free (cached). |
| Does blocking AI training lower the score? | No. Opting out of training is your choice and costs nothing. Blocking AI search and AI assistants does. |
| How do we serve Markdown? | One developer change for the whole site: accept-md for Next.js (Content SDK) sites, or Markdown for Agents in Cloudflare. |
| Which sites does it work on? | Any SitecoreAI site. Field names are configurable for each site's templates. |

More detail: `PAGE-CHECKS-EXPLAINED` (the panel) and `PAGE-MATRIX-EXPLAINED` (the dashboard).
