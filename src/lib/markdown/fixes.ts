// ─────────────────────────────────────────────────────────────────────────────
// How to serve Markdown (plan Phase 7): the fix cards in the panel's Agent
// View and under S3 on the dashboard, and the options in P5's developer note.
// ─────────────────────────────────────────────────────────────────────────────

export interface MarkdownFix {
  id: "accept-md" | "cloudflare" | "middleware";
  title: string;
  /** One or two sentences. */
  text: string;
  /** A command to copy. */
  command?: string;
  /** Code behind "Show code". */
  code?: string;
}

/**
 * A Content SDK route handler that converts the page's own HTML. Pair it with
 * a rewrite for `Accept: text/markdown` (see the text).
 */
const MIDDLEWARE_SNIPPET = `// app/api/markdown/route.ts: serves a page as Markdown
// npm install node-html-markdown
import { NextRequest, NextResponse } from "next/server";
import { NodeHtmlMarkdown } from "node-html-markdown";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "/";
  const page = await fetch(new URL(path, req.nextUrl.origin), {
    headers: { accept: "text/html", cookie: req.headers.get("cookie") ?? "" },
  });
  if (!page.ok) return new NextResponse(null, { status: page.status });
  const html = await page.text();
  const main = /<main[\\s\\S]*<\\/main>/i.exec(html)?.[0] ?? html;
  const title = /<title>([^<]*)<\\/title>/i.exec(html)?.[1] ?? "";
  const markdown = \`---\\ntitle: \${JSON.stringify(title)}\\nurl: \${page.url}\\n---\\n\\n\` + NodeHtmlMarkdown.translate(main);
  return new NextResponse(markdown, {
    headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept" },
  });
}

// next.config.ts: send Markdown requests to it
// async rewrites() {
//   return { beforeFiles: [], afterFiles: [{
//     source: "/:path((?!api/|_next/).*)",
//     destination: "/api/markdown?path=/:path",
//     has: [{ type: "header", key: "accept", value: "(.*)text/markdown(.*)" }],
//   }], fallback: [] };
// }
// And add Vary: Accept to the HTML pages too (headers() in next.config.ts).`;

export const MARKDOWN_FIXES: MarkdownFix[] = [
  {
    id: "accept-md",
    title: "Next.js site (Sitecore Content SDK)",
    text: "accept-md adds a route that converts each page to Markdown when an agent asks for it. On the Content SDK starter, init breaks next.config.js: undo its edit and add the accept-md rewrite after the next-config plugins, in beforeFiles, keeping the plugins' array as afterFiles. Test it alongside your Sitecore middleware (redirects, personalisation, multisite).",
    command: "npx accept-md init",
  },
  {
    id: "cloudflare",
    title: "Site behind Cloudflare",
    text: "Turn on Markdown for Agents in the Cloudflare dashboard: Cloudflare converts your HTML for requests that ask for text/markdown.",
  },
  {
    id: "middleware",
    title: "Your own route",
    text: "Convert the page's HTML in a route handler and rewrite Markdown requests to it. Send Vary: Accept on both versions.",
    code: MIDDLEWARE_SNIPPET,
  },
];

/** The options in one line, for the developer note. */
export const MARKDOWN_FIX_SUMMARY =
  "Options: `npx accept-md init` in the Next.js head app (on the Content SDK starter, init breaks next.config.js: add accept-md's rewrite after the next-config plugins, in beforeFiles, with their array as afterFiles; test it with the Sitecore middleware: redirects, personalisation, multisite), Cloudflare's Markdown for Agents, or your own route that converts the page and answers Accept: text/markdown with Vary: Accept.";
