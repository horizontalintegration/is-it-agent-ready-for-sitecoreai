import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/server/extract-html";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// IMPORTANT: The Marketplace SDK runs only in the iframe (window.parent.postMessage)
// so we cannot import @sitecore-marketplace-sdk/xmc on the server. To fetch a
// site-wide page list server-side, this route uses the XM Cloud Authoring
// GraphQL API directly with a service-account token. Configure via env vars:
//   SITECORE_AUTHORING_ENDPOINT (e.g. https://xmcloudcm.localhost/sitecore/api/authoring/graphql/v1/)
//   SITECORE_AUTHORING_TOKEN     (PAT or service-account JWT)
//
// If the env vars are missing, the route returns an empty pages array and a
// warning. The dashboard hook (Phase 8.1) can fall back to the client-side SDK
// in that case.

interface PageSummary {
  id: string;
  name: string;
  path: string;
  templateId: string;
  lastModified: string;
  fields: {
    pageTitle: string | null;
    metaDescription: string | null;
    author: string | null;
    publishDate: string | null;
    lastUpdatedDate: string | null;
    noIndex: boolean;
    richTextParagraphs: string[];
    images: Array<{ componentName: string; alt: string | null }>;
    links: Array<{ componentName: string; anchorText: string | null }>;
    headings: Array<{ level: number; text: string; componentName: string }>;
    faqItems: Array<{ question: string; answer: string }>;
    hasFaqComponent: boolean;
    hasHowToComponent: boolean;
  };
}

interface SiteScanResponse {
  siteId: string;
  pages: PageSummary[];
  fetchedAt: string;
  warning?: string;
}

const PAGES_QUERY = `
  query SitePages($siteId: String!, $limit: Int!) {
    item(path: $siteId, language: "en") {
      children(first: $limit, includeTemplateIDs: []) {
        nodes {
          itemId
          name
          path
          template { templateId }
          updated: field(name: "__Updated") { value }
          pageTitle: field(name: "Page Title") { value }
          metaDescription: field(name: "Meta Description") { value }
          author: field(name: "Author") { value }
          publishDate: field(name: "PublishDate") { value }
          lastUpdated: field(name: "LastUpdated") { value }
          noIndex: field(name: "NoIndex") { value }
        }
      }
    }
  }
`;

interface GqlNode {
  itemId?: string;
  name?: string;
  path?: string;
  template?: { templateId?: string };
  updated?: { value?: string };
  pageTitle?: { value?: string };
  metaDescription?: { value?: string };
  author?: { value?: string };
  publishDate?: { value?: string };
  lastUpdated?: { value?: string };
  noIndex?: { value?: string };
}

interface GqlResponse {
  data?: {
    item?: {
      children?: {
        nodes?: GqlNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

function emptyFields(): PageSummary["fields"] {
  return {
    pageTitle: null,
    metaDescription: null,
    author: null,
    publishDate: null,
    lastUpdatedDate: null,
    noIndex: false,
    richTextParagraphs: [],
    images: [],
    links: [],
    headings: [],
    faqItems: [],
    hasFaqComponent: false,
    hasHowToComponent: false,
  };
}

function nodeToPage(node: GqlNode): PageSummary {
  return {
    id: node.itemId ?? "",
    name: node.name ?? "",
    path: node.path ?? "",
    templateId: node.template?.templateId ?? "",
    lastModified: node.updated?.value ?? "",
    fields: {
      ...emptyFields(),
      pageTitle: node.pageTitle?.value ?? null,
      metaDescription: node.metaDescription?.value ?? null,
      author: node.author?.value ?? null,
      publishDate: node.publishDate?.value ?? null,
      lastUpdatedDate: node.lastUpdated?.value ?? null,
      noIndex: node.noIndex?.value === "1",
    },
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

  if (!siteId) {
    return NextResponse.json({ error: "missing_siteId" }, { status: 400, headers: CORS_HEADERS });
  }

  const endpoint = process.env.SITECORE_AUTHORING_ENDPOINT;
  const authToken = process.env.SITECORE_AUTHORING_TOKEN;

  if (!endpoint || !authToken) {
    const response: SiteScanResponse = {
      siteId,
      pages: [],
      fetchedAt: new Date().toISOString(),
      warning:
        "SITECORE_AUTHORING_ENDPOINT and SITECORE_AUTHORING_TOKEN env vars are not set. " +
        "Server-side site scan is disabled; the dashboard hook will fall back to the in-iframe SDK.",
    };
    return NextResponse.json(response, { headers: CORS_HEADERS });
  }

  try {
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query: PAGES_QUERY, variables: { siteId, limit } }),
      timeoutMs: 20_000,
    });

    const body = (await res.json()) as GqlResponse;

    if (!res.ok || body.errors) {
      const msg = body.errors?.map((e) => e.message).join("; ") ?? `status ${res.status}`;
      return NextResponse.json(
        { error: "xmc_failed", detail: msg },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const nodes = body.data?.item?.children?.nodes ?? [];
    const pages = nodes.map(nodeToPage);

    const response: SiteScanResponse = {
      siteId,
      pages,
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(response, { headers: CORS_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { error: "xmc_failed", detail: message },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
