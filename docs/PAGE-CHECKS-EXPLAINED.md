# Page Checks Explained — A Guide for Marketers

This guide explains, in plain language, what the **Is It Agent-Ready? for SitecoreAI** panel in Page Builder shows, every check it runs, and **why each one matters**. Use it as a cheat sheet during demos so you can confidently answer "what does this check, and why should I care?"

---

## The big idea: four questions every page must answer

AI assistants (ChatGPT, Claude, Gemini, Perplexity) and AI search now read your pages to answer people's questions. Before an AI agent can quote your page, four things have to be true:

| Category | The question | In plain terms |
|----------|-------------|----------------|
| **Reach** | Can AI agents get to it? | The page isn't hidden, blocked or pointing somewhere else |
| **Read** | Can they read it? | The page is laid out so a machine can find the real content |
| **Understand** | Do they understand it? | Clear headings, a good title and summary, and labels that say what the content is |
| **Trust** | Will they trust and cite it? | Original, current, well-written content from a named source |

The panel and the dashboard use the **same four categories and the same scoring**. The difference is what they look at: the panel scores **the page as you're editing it**, and the dashboard scores **the published page**. So when you've made changes you haven't published yet, the two scores can differ, and the panel tells you so.

---

## How scoring works (the 30-second version)

- Every page gets a score **out of 100**.
- Checks come in three kinds:
  - **Essential** — the must-haves. Together they're worth **80 points**.
  - **Recommended** — the things that make a good page great. Together they're worth **20 points**.
  - **Bonus** — extra credit, up to **+5 points** (the score still tops out at 100).
- The points in each group are **shared equally** between the checks that apply to the page. Fixing an Essential check moves the score much more than fixing a Recommended one, and that's on purpose: it's where to start.
- **Partial credit counts.** A page that's halfway there gets half the points.
- **Checks that don't apply are skipped, never failed.** A page with no images isn't marked down for image descriptions, and a page with no FAQ isn't marked down for FAQ answers. They're listed as **N/A** under "Doesn't apply to this page".
- Some checks need a scan first (page speed, and the AI checks if they haven't run). Until they've run they show **Not checked** with a **Run** button, and don't count either way.
- The verdict is **Agent-ready at 80 or more**, **Almost there from 60 to 79**, and **Not ready below 60**. The dashboard uses the same thresholds.
- The panel doesn't show points, except on fixes: **"+N pts"** shows how much the score would go up if you fixed it.

---

## What the panel shows

**The header:** the app name, a **Draft** or **Live** label (hover or focus it to see what was scored), and **Re-scan**.

**Three tabs:** **Score**, **Agent View** (coming in a later release: the page as an AI agent receives it) and **AI Assist** (the meta & social generator).

**The Score tab, top to bottom:**
1. **The verdict:** a score ring out of 100, the verdict (Agent-ready, Almost there or Not ready), **▲ or ▼ N since last scan**, and one sentence, such as "2 fixes would make this page agent-ready."
2. **Four category bars:** Reach, Read, Understand and Trust, each scored out of 100. Click one to show only that category's checks; click it again to show them all.
3. **Site issues (only when there are any):** a red strip when something about the **whole site** keeps AI agents out of every page, such as a firewall that blocks ChatGPT, or a robots.txt that shuts out AI search. It's not part of this page's score, and it isn't something you fix in the page: **View in dashboard** opens the Agent access tab with the details and a note for your developer.
4. **Top fixes:** the three fixes worth the most, each with "+N pts", a **You can fix** or **Developer** badge, and a button:
   - **Generate** opens AI Assist to write the title or description.
   - **Copy snippet** copies ready-to-paste code, such as structured data.
   - **Send to developer** copies a note with the page address, what we found and the fix, to paste into a ticket or a message.
   - **Show how** opens the check below with the details.
5. **All checks,** grouped by category, with a **Needs work / All** switch. Every check shows a status icon and word (**✓ Pass**, **! Improve**, **✕ Fix**, **— N/A**, or **Not checked**), its outcome, and where the data came from (**Draft**, **Live**, **Fields**, **AI** or **PageSpeed**). Open one to see **why it matters**, **what we found**, and the fix. Code sits behind **Show code**.

On the home page, a **Site check** group at the bottom shows whether your organisation is described for AI. It isn't part of the page's score.

**"Since last scan"** compares with the score from the previous time the page was scanned (opening it, or Re-scan). Edits you make afterwards show against that, so you can watch a fix move the score.

---

## Your draft or the published page?

The panel reads the page **as it is in Page Builder right now**, including edits you haven't saved or published. Change a heading and the score updates by itself a moment later. There's no need to re-scan.

- **Content checks** (headings, paragraphs, images, links, FAQ answers, and the AI checks) read **your draft**.
- **Behind-the-scenes checks** (the title tag, canonical, metadata and structured data) read **the published page**, because they live in a part of the page the editor doesn't show. They catch up when you publish.
- Each check shows where it looked: a small **Draft** or **Live** label next to its name.
- When your draft's text differs from the published page, a note at the top says **"Scored from your draft. It differs from the live page"**, with how many blocks of text changed.
- The AI checks don't re-run on every edit. When you've changed the text since they ran, they say so and offer **Re-run**.
- If the editor can't share the draft, the panel falls back to the published page, as before, and the labels say **Live**.

---

## 🚦 The gate (runs first)

### Is this page allowed to be found?
**What it checks:** Whether the page is deliberately hidden from search engines and AI — the "noindex" setting in Sitecore, or a "noindex" or "nosnippet" tag on the page.

**Why it matters:** If a page is set to "do not index," search won't list it and AI won't quote it, no matter how good the content is. Instead of a score, the panel tells you straight away, so you don't spend time on a page that's invisible by design (or so you catch a live page that was hidden by mistake).

---

## 🟢 Reach — Can AI agents get to it?

### Canonical points to this page — Essential
**What it checks:** Whether the page has a "canonical tag" — a behind-the-scenes label that says "this is the official address of this page" — and that it points to this page.

**Why it matters:** The same content is often reachable at several addresses. Without a canonical tag, search engines and AI treat them as duplicates and split the credit between them, or cite the wrong one. (Usually set in the page template by a developer.)

---

## 🔵 Read — Can they read it?

### Content is there without JavaScript — Essential, Page Builder panel only
**What it checks:** Whether the text on your page is in the page's HTML from the start, or only appears after code runs in the visitor's browser. The panel compares what the editor shows with what the server sends, and lists the components whose text only appears in the browser (for example, a "Related articles" list that loads after the page opens).

**Why it matters:** Most AI crawlers don't run that code. They read the HTML the server sends, so anything added later in the browser is invisible to them, however good it is. (A fix for your developer: render that content on the server.)

**Good to know:** messages like "No articles found" that a listing shows only in the editor aren't counted. New text you haven't published yet can also show up here until you publish. The dashboard can't see your draft, so it doesn't score this check.

### Page structure is machine-readable — Recommended
**What it checks:** Whether the page uses the standard structural labels in its code (`main`, `article`, `nav`, `header`) that mark out the key regions, and whether buttons and icon links have a text label.

**Why it matters:** These labels are like room signs in a building: they help AI agents go straight to the real content and skip menus and footers.

### Page loads fast — Recommended, runs when you ask
**What it checks:** Google's PageSpeed score for the page. Click **Run scan** on the row to check it.

**Why it matters:** Slow pages frustrate visitors, rank lower, and can time out when an AI assistant fetches them on someone's behalf.

---

## 🟣 Understand — Do they understand it?

### One clear H1 and logical headings — Essential
**What it checks:** That the page has exactly **one main headline (H1)** and that sub-headings step down in order (H1 → H2 → H3) without skipping levels.

**Why it matters:** Headings are the page's table of contents. AI uses them to work out what the page is about and where each answer starts.

### Title and description are set — Essential
**What it checks:** The page title (ideally **50–60 characters**) and the meta description (ideally **120–160 characters**). It reads the Sitecore fields you edit.

**Why it matters:** These are the summary that search results and AI show before anyone clicks. If the description is missing, search engines write their own, usually a random snippet you don't control. The panel's **Generate** buttons can write both for you.

### Structured data is present and valid — Essential
**What it checks:** Whether the page has the "schema" labels (hidden code called JSON-LD) that it needs, and that they're complete:
- **Breadcrumbs** on every page except the home page (where the page sits in the site).
- **FAQ** labels when the page has questions and answers.
- **Article** labels on article pages.

If something is missing, the check gives you **the code to paste in**.

**Why it matters:** Schema tells AI exactly what the content is — an article, a set of answers, a page in a section — without guessing. **This used to always pass, even when the labels weren't there. It now looks at the real page**, so it tells you what's actually missing.

### Page identity metadata is complete — Recommended
**What it checks:** The page's language setting and its social sharing tags (type, title, description and image).

**Why it matters:** These tell AI what the page is and in which language, and they decide whether a shared link shows a rich preview card or a bare address.

### FAQ answers are quotable — Recommended
**What it checks:** That each FAQ answer is **40–300 characters** — long enough to be useful, short enough to quote. It finds questions and answers in **any** accordion or expandable section, not just one component.

**Why it matters:** AI assistants lift FAQ answers word for word. A one-line answer is useless; a wall of text won't fit.

### Sections answer real questions — Recommended
**What it checks:** Whether some section headings are phrased as the questions people ask ("How do I…?", "What is…?").

**Why it matters:** People ask AI questions. A section headed by the question it answers is easy to match and cite. Only rephrase where it's natural.

### Easy to read and quote — Recommended
**What it checks:** How easy the writing is to read, paragraph by paragraph (aiming for an early-college reading level or simpler), and whether paragraphs are a comfortable length (about 40–120 words).

**Why it matters:** Clear, well-sized paragraphs are what AI quotes accurately. Dense text gets paraphrased badly or skipped.

### Images are described — Recommended
**What it checks:** What share of images have alt text — a short written description.

**Why it matters:** AI can't see pictures; the alt text is how it learns what an image shows. It's also what screen readers announce.

---

## 🟤 Trust — Will they trust and cite it?

### Content is original, not generic — Recommended
**What it checks:** Our AI reads the page's main text and judges whether it's genuinely **original and valuable**, or generic content that could have come from anywhere. The answer is remembered until the text changes, so revisiting an unchanged page shows the same rating straight away.

**Why it matters:** AI assistants cite the source that adds something. Content that repeats what's everywhere else is rarely chosen.

### Author is named and linked — Recommended, article pages only
**What it checks:** Whether the article names its author and links to an author profile.

**Why it matters:** A named author with a profile lets AI judge expertise before citing an article.

### Content is recently updated — Recommended
**What it checks:** When the page was last updated: full marks within six months, partial up to two years.

**Why it matters:** AI favours current sources, especially on fast-moving topics.

### Enough depth to be cited — Recommended
**What it checks:** How much body text the page has (full marks at about 800 words).

**Why it matters:** Thin pages rarely hold a complete answer, so AI looks elsewhere.

### Links say where they go — Recommended
**What it checks:** Whether links use descriptive text ("view our pricing plans") instead of vague phrases ("click here", "read more"). Links like "Download the 2026 report" count as descriptive.

**Why it matters:** The link text tells AI what the linked page is about before it follows it.

### Answers the next question too — Bonus
**What it checks:** Our AI suggests the questions a reader would likely ask next, and checks whether the page answers them.

**Why it matters:** AI prefers sources that also cover the obvious follow-up. Add content only where it genuinely helps readers.

---

## 🏢 Site check on the home page: your organisation

### Your organisation is described for AI
**What it checks:** Whether the home page has **Organization schema**: your company's name, website, logo, social profiles, description and contact details, in machine-readable form.

This is a **site check**: it's about the whole site, so it isn't part of any page's score. The panel shows it when the **home page** is open, and the dashboard shows it on the **Agent access** tab.

| What the home page has | What you see |
|---|---|
| Complete organisation details | Pass |
| Some details missing | A warning listing them, and corrected code to paste in |
| No organisation details at all | A warning, "Not added yet", and ready-to-paste code |
| The home page couldn't be checked | "Couldn't check" — it doesn't count |

**Why it matters:** This is how AI and search engines know who runs the site, so they name and cite your brand correctly (and it feeds Google's knowledge panel). **This also used to always pass.** The BrandX demo site has none, and the check now says so.

---

## Quick reference: the scorecard

| Category | Check | Kind |
|----------|-------|------|
| **Reach** | Canonical points to this page | Essential |
| **Read** | Content is there without JavaScript | Essential (Page Builder panel only) |
| **Read** | Page structure is machine-readable | Recommended |
| **Read** | Page loads fast | Recommended |
| **Understand** | One clear H1 and logical headings | Essential |
| **Understand** | Title and description are set | Essential |
| **Understand** | Structured data is present and valid | Essential |
| **Understand** | Page identity metadata is complete | Recommended |
| **Understand** | FAQ answers are quotable | Recommended |
| **Understand** | Sections answer real questions | Recommended |
| **Understand** | Easy to read and quote | Recommended |
| **Understand** | Images are described | Recommended |
| **Trust** | Content is original, not generic | Recommended |
| **Trust** | Author is named and linked | Recommended (articles) |
| **Trust** | Content is recently updated | Recommended |
| **Trust** | Enough depth to be cited | Recommended |
| **Trust** | Links say where they go | Recommended |
| **Trust** | Answers the next question too | Bonus |
| Site | Your organisation is described for AI | Site check (own score) |

The dashboard's **Agent access** tab has the other site checks: whether AI agents get past your firewall, robots.txt, Markdown, the sitemap, llms.txt, your about, contact and privacy pages, real 404s, and the Bonus protocol checks. The panel only flags the ones that keep agents out of every page (the red strip above). More page checks arrive in later releases, starting with whether AI agents can get the page as Markdown.

---

## AI Assist: the meta & social generator

On the **AI Assist** tab, the panel can write the **meta title, meta description, Open Graph title and Open Graph description** for you. **Generate** on a "Title and description" or "Page identity metadata" fix opens it. Click **Generate** on a field, review the suggestion, then click **Populate field** to write it into the page in Sitecore.

- Suggestions are written **from the page's main text, as in your draft**, so they describe what the page actually says, unpublished edits included. The button waits until the page scan has read the text.
- They follow your **brand voice document**: tone, words to use and avoid, and compliance rules such as "no guaranteed returns". If no brand voice has been set up, the generator uses neutral, plain-language guidelines.
- Suggestions **stay within the character limit** shown next to them (60 for the meta title, 155 for the meta description, 70 and 200 for the Open Graph fields). If the first draft runs long, the tool asks the AI for a shorter one. In the rare case that it's still over, the count turns amber so you can trim it before populating.
- Nothing is saved until you click **Populate field**.

---

## Demo talking points (the big picture)

- **"Four plain questions."** Can AI agents get to it, read it, understand it, and trust it? Every check answers one of them.
- **"Answer first."** One verdict and one sentence: what it would take to make this page agent-ready.
- **"Fix the essentials first."** Top fixes ranks them by what they're worth, and every fix has a button: Generate, Copy snippet or Send to developer.
- **"It checks the real page."** Schema checks look at what's actually on the page, and hand you the code when something's missing.
- **"Fair by design."** Checks that don't apply are skipped, not failed.
- **"Score as you write."** Edit a heading and the score updates by itself, before you publish.
- **"It sees what AI crawlers see."** The panel spots content that only appears after JavaScript runs, which most AI crawlers never see.
- **"One set of rules everywhere."** The panel and the dashboard score with the same rules. The panel scores your draft, the dashboard the published page.
- **"A perfect page can still be invisible."** If the firewall blocks ChatGPT, no page edit helps; the red strip says so and points to the dashboard.
