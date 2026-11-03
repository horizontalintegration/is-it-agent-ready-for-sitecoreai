# Page Matrix Explained — A Guide for Marketers

The **dashboard** in **Is It Agent-Ready? for SitecoreAI** grades every page on your site and shows the results at a glance: one site score, one card per category, a heatmap of every page, and a **Fix first** list grouped by issue. Where the Page Builder panel is the detailed checklist for one page, the dashboard is the **scorecard for the whole site**.

This guide explains what you see on the dashboard and why it matters. Use it as a demo cheat sheet.

---

## The big idea: four questions every page must answer

AI assistants (ChatGPT, Claude, Gemini, Perplexity) and AI search now read your pages to answer people's questions. The dashboard scores each page on four plain questions:

| Category | The question | What feeds into it |
|----------|-------------|--------------------|
| **Reach** | Can AI agents get to it? | The page points search and AI at its official address |
| **Read** | Can they read it? | Markdown for AI agents; clear page structure; page speed (checked in the panel) |
| **Understand** | Do they understand it? | Headings, title and description, schema labels, sharing tags, FAQ answers, question headings, readability, image descriptions |
| **Trust** | Will they trust and cite it? | Original content (AI-judged), named author on articles, freshness, depth, descriptive links |

**The order makes sense:** an AI agent has to get to the page, read it, understand it, and trust it before it quotes you.

**The dashboard and the panel use exactly the same checks and scoring.** The dashboard scores **the published page**; the panel scores **the draft you're editing**. So a page with unpublished changes can score differently in the two places. Two checks only run in the Page Builder panel: "Content is there without JavaScript" (it needs the editor's view of the page) and "Page loads fast" (it runs when you ask). The dashboard marks them "Page Builder panel only" and leaves them out of its scores. The full list of checks is in the Page Checks guide.

---

## How to read the scorecard

- Each page gets a **score out of 100**.
- **Essential** checks carry most of it (80 points between them), **Recommended** checks the rest (20 points), and a **Bonus** check can add up to 5. Fix the Essential ones first.
- That score becomes a **verdict**, always shown as a word, never by colour alone:

| Verdict | Score | Meaning |
|-------|-------|---------|
| 🟢 **Agent-ready** | 80–100 | AI can reach, read, understand and trust it |
| 🟡 **Almost there** | 60–79 | Some gaps holding it back |
| 🔴 **Not ready** | Below 60 | Major issues — likely passed over by AI |

- The dashboard doesn't show points. Category scores are out of 100 too, and the only points you'll see are on fixes ("+5 pts each": what fixing it would add to each page's score).

**Fair by design:** a page is only graded on what applies to it. Your home page isn't marked down for missing article labels, and a page without images isn't marked down for image descriptions.

**Blocked pages:** a page set to "noindex" in Sitecore (or tagged noindex/nosnippet) can't appear in AI answers at all, so it doesn't get a score. The dashboard shows it as **Blocked** and leaves it out of the site average.

---

## The header

The app name, your site's name and address, the **Site type** setting, when the site was last scanned, and **Scan site**, which rescans every page and re-runs the agent access checks. **Site type** (Content site, Commerce, or App or API) tells the app which kind of site this is: App or API sites also get the agent protocols check, and Commerce sites the agentic checkout check.

The dashboard has five tabs: **Overview · Pages · Agent access · AI citations · Files**.

---

## Overview

### The site score
A ring with the average score of all scored pages, the verdict, and one sentence on what would make the biggest difference. Next to it:
- **▲ / ▼ N since last scan**: how much the score moved since the previous full scan.
- **Last 8 scans**: a small trend line, once there are two scans to compare. The history is kept in your browser.
- How many pages are **Agent-ready**, **Almost there** and **Not ready**, plus any **Blocked** pages.

A progress bar shows the scan filling in.

### The four category cards
One card per category (Reach, Read, Understand, Trust) with its question, the site's score in that category, and how many pages **need work** in it (they score under 60 there). **What's included** lists the checks behind each card.

When pages don't serve Markdown to AI agents, the **Read** card says so instead: **"11 of 11 pages not served as Markdown"**. It's usually one site-wide setting, so it's often the biggest single gain on the dashboard.

### Fix first
The issues worth fixing, **grouped by issue rather than by page**, biggest gain first:
- **Site issues** come first because they affect every page, for example a firewall blocking ChatGPT, robots.txt blocking an AI search engine, or missing organisation details on the home page. Their button is **Send to developer**.
- **Page issues** say how many pages have them and what fixing them adds to each page ("6 pages · +18 pts each"). Each has a **You can fix** or **Developer** badge.
  - **Review pages** opens the Pages tab showing only the pages with that issue, so you can open each one in Page Builder.
  - **Send to developer** copies a ready-to-paste note: the issue, why it matters, and the pages it affects.
- **Markdown for agents** shows once: as **Agents can get this page as Markdown**, with how many pages it affects and what it adds to each, right after the site issues. Your developer fixes it once for the whole site.

Every status has an icon and a word: ✓ Pass, ! Improve, ✕ Fix.

### What changed since last scan
Next to Fix first, the news since the previous scan, worst first:
- **▼ 18 /services dropped after the Oct 28 publish. Now needs work: One clear H1 and logical headings.** A page lost 5 points or more; when it was published since the last scan, the card says when, and it names the checks that newly need work.
- **New: ChatGPT-User now gets 403 from your firewall (it got 200 last time).** A search or user agent that could read the site and now can't (or **▲** can again). Training agents are left out: blocking them is your choice.
- **▲ 2 pages became agent-ready**, and the fix they had in common when there is one.
- **▲ Cited in 2 AI answers more** for a page, when its citation probe was run again with the same questions (see AI citations).

The comparison needs two scans, so on the first one the card says changes will show after the next. Like the trend line, the history is kept in your browser: someone else, or another browser, starts its own.

---

## Pages

A heatmap of every page: its score and its score in each of the four categories, each cell coloured by verdict and showing the number. **Search** by name or address, filter by verdict (**Not ready**, **Almost there**, **Agent-ready**), and sort by lowest score, highest score, recently updated or name. **Open in Page Builder** jumps straight to the page. Pages that haven't been scanned yet have a **Scan** button.

---

## Agent access

Things that are about the **whole site**, not one page. They're checked once, every page inherits them, and they never change a page's score. The check takes up to 20 seconds and is remembered for an hour; **Scan site** runs it again.

AI agents come in three kinds, and the checks treat them differently:
- **Search** agents (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Amazonbot) find and cite your pages in AI search.
- **User** agents (ChatGPT-User, Claude-User, Perplexity-User) open a page because someone asked the assistant to.
- **Training** agents (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, meta-externalagent) collect content to train models.

Blocking search or user agents keeps you out of AI answers, so it fails. Blocking only training agents is a legitimate business choice: the dashboard notes it and never lowers the score for it.

**Site checklist** (Essential first, then Recommended, then Bonus):
- **AI agents can open your site** — we request your home page and two pages it links to, once as each AI agent and once as a normal browser, and compare. A firewall or CDN that answers an agent with "403 Forbidden" or a challenge page blocks it, even when robots.txt lets it in. This is the check robots.txt can't do.
- **robots.txt lets AI search in** — whether robots.txt keeps out any search or user agent.
- **Your site can serve Markdown to agents** — whether the home page answers with a clean Markdown version when an agent asks for one, and how many of the scanned pages do. **See fixes** shows the options for your developer (accept-md for Next.js sites, Cloudflare's Markdown for Agents, or a route of their own), with **Send to developer**. Each page is checked too, in the panel's **Agent View** tab and in every page's Read score.
- **Sitemap is published and linked** — whether the sitemap exists, lists dates of last change, and is named in robots.txt.
- **llms.txt is published** — whether `/llms.txt` exists and has a title, a summary, links and a "When to use this site" section. **Open generator** takes you to the Files tab.
- **About, contact and privacy pages exist** — whether the home page links them and each one opens (the privacy page needs real text, 500 characters or more). Terms, a security page and a postal address are noted but not scored.
- **Your organisation is described for AI** — whether the home page has Organization schema: your company's name, website, logo, social profiles, description and contact details, in machine-readable form. If it's missing, the dashboard says **"Not added yet"** and **Copy snippet** gives you the code to paste in; if it's incomplete, it lists what's missing and gives you corrected code. This is how AI knows who runs the site, so it names and cites your brand correctly.
- **Missing pages return a real 404** — whether a page that doesn't exist says so, instead of showing a "not found" page with an OK status that agents might store as content.
- **Bonus:** content-use signals in robots.txt, discovery links in the home page's HTTP headers, agent protocols (App or API sites) and agentic checkout protocols (Commerce sites). Bonus checks only add points; when one isn't set it says **Not set**.

**Can each AI agent get in?** A table of the twelve agents: who runs them, what they're for (filter by **Search**, **User** or **Training**), what robots.txt says, the live request's result, and the verdict (**Can read**, **Blocked by firewall**, **Opted out (your choice)**, or **No separate crawler** for Google-Extended and Applebot-Extended, which are robots.txt rules only). We don't request your pages as an agent that robots.txt asks to stay out. When the firewall blocks agents, a red box says which, with **Send to developer**.

One honest caveat, shown under the table: we send these requests from our server, not from each AI company's network. A firewall that checks a bot's IP address may treat the real agent differently.

In the **Page Builder panel**, a red strip says when a site issue keeps agents out of every page (a firewall block or a robots.txt block), with **View in dashboard**.

---

## AI citations

Will AI answers cite this page? Pick a page from the list, or type the address of any page on your site. The tab has two parts, clearly labelled.

**Can each engine cite this page?** (*Estimate · instant · from your checks*). For ChatGPT, Claude, Perplexity, Gemini and Copilot: **Ready**, **Limited** or **Blocked**, with the reason. It comes from the Agent access results and the page's score, with no AI involved, so it's the same every time:
- **Blocked**: both the engine's search agent and its user agent are kept out (by robots.txt or the firewall), or the page is set to noindex or nosnippet.
- **Limited**: one of them is kept out (for example "The search crawler can read it, but ChatGPT-User gets 403 from the firewall"), or the page scores **Not ready**. For Gemini, Google-Extended being disallowed in robots.txt also limits it. Not serving Markdown doesn't: engines cite ordinary web pages.
- Copilot relies on Bing's index, so it only depends on the page being indexable.

**Are AI answers citing this page?** (*Measured · citation probe*). The real test: we ask Claude 5 to 10 questions this page should answer, with live web search, and look at what came back.
1. **Suggest questions** writes 8 realistic questions about the page's topic, never naming your brand (people asking about a topic don't know your name yet). Change, add or remove them with **Edit questions**, choose the country to ask from, and list any other hosts that count as your site (a staging or regional domain), so they don't show up as competitors.
2. **Run probe** asks each question. It takes about 20 seconds, and the rows fill in as answers arrive.
3. For each question: **Found** means your site was in the search results Claude saw; **Cited** means the answer linked to it; **Cited instead** lists the other sites the answer linked to. "(this page)" means the exact page, not just your site. Click a question for the answer's start, what Claude searched for, and what it means.

The totals read like **"Cited in the answer: 2 of 7 · Found in search results: 5 of 7 · Most cited instead: contentmarketinghub.example"**, with **▲ N since last run** when the same questions were asked before. These are counted from the search results and the answer's links, never by asking the AI whether it cited you.

Sometimes Claude answers from memory without searching, even when asked to search. We then ask once more; if it still doesn't search, the question shows **Not searched** and is left out of the totals, because it says nothing about your site.

**Cost and limits:** each question costs about 3 to 8 cents (Claude plus one web search; measured at about 3 cents on the BrandX replica), so a run of 8 is usually under $0.65. Probes run only when you click, never during a site scan. Results are kept for 7 days: **Run again** within a week shows the same results without asking again, except for questions that weren't searched. Editing one question asks only that one. The history of the last 10 runs is kept in your browser. A site can run at most 40 new probe questions an hour.

The caveat under the results says it plainly: **AI answers vary by time, location and engine. This is a sample, not a ranking.** The probes use Claude; other engines answer differently.

---

## Files

- **llms.txt:** a short guide to your site for AI tools, built from your pages and their meta descriptions. Write a one-line summary and, in **When should AI tools use this site?**, a sentence or two on what the site is for; it becomes a "When to use this site" section in the file. Tick **Only include pages scoring 60 or more** to leave weak pages out. Then **Copy**, **Download**, or **Send to developer to publish**, which copies the file with a note on where to put it.
  The card also says whether `/llms.txt` is published today.
- **robots.txt helper:** tick what AI tools may do with your content: be found and cited by AI search, open pages when a user asks, train models, and add a **Content-Signal** line that states those choices in a machine-readable way. The ticks start from what your robots.txt allows today, and the lines update as you tick, including your sitemap's address. **Copy** them or **Send to developer**. Remember that robots.txt is a request, not a lock: firewall rules decide who actually gets in (see Agent access).

---

## Quick reference: what to fix when a category is low

| Category | The question | What to fix if it's low |
|----------|--------------|-------------------------|
| **Reach** | Can AI agents get to it? | Add a canonical tag that points to the page itself (developer); on Agent access, let AI search and user agents through the firewall and robots.txt |
| **Read** | Can they read it? | Serve Markdown to AI agents (developer, once for the whole site); add the main page landmarks and label icon buttons (developer); improve page speed |
| **Understand** | Do they understand it? | One H1 and ordered headings; set the title and description; add the schema code the panel gives you; complete the sharing tags; tighten FAQ answers and paragraphs; describe images |
| **Trust** | Will they trust and cite it? | Add original insight and depth; name and link the author on articles; refresh old pages; make link text descriptive |

---

## Demo talking points

- **"Four questions, one scorecard."** Reach, Read, Understand, Trust — anyone can scan it and know which pages need help.
- **"One set of rules in the panel and the dashboard."** The dashboard shows what's live; the panel shows your draft before you publish.
- **"Fix the essentials first."** They carry most of the score, so a few fixes move the needle.
- **"It checks the real page."** Schema checks look at what's actually published — and the BrandX demo site's missing organisation details show up straight away, with the code to fix it.
- **"robots.txt says yes, the firewall says no."** The demo site's robots.txt welcomes ChatGPT, but its firewall answers ChatGPT-User with 403. Only a live request as each agent shows that.
- **"Blocking training is your choice."** Opting out of model training never costs points; blocking AI search does.
- **"One switch for every page."** Serving Markdown to AI agents is a single developer change, and it shows on every page's score. On the BrandX demo site the home page is about 54,000 tokens as HTML and about 1,500 as the Markdown it now serves.
- **"Fix first, grouped by issue."** One fix in a template or a firewall rule can lift dozens of pages; the dashboard shows which ones and what each is worth.
- **"Every status says what it is."** An icon, a colour and a word, so nobody has to decode a colour.
- **"Measured, not guessed."** The citation probe asks real questions with live web search and counts who the answer actually links to: "Cited in 2 of 7, found in 5 of 7, and this competitor was cited instead." The estimate beside it says why an engine can't cite you, straight from the Agent access results.
- **"What changed since last scan."** A page that dropped after a publish, a firewall that started blocking ChatGPT-User, pages that became agent-ready: the news, without comparing reports by hand.
