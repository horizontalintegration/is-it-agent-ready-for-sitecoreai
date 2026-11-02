// Discovery files the agent-access scan requests for every site type; S11
// (App/API) and S12 (Commerce) decide what applies. Paths checked 2026-11-02.

import type { WellKnownId } from "./types";

export const WELL_KNOWN_PATHS: Array<{ id: WellKnownId; path: string }> = [
  // S11. The MCP server card's path is still settling (SEP-2127), so both are tried.
  { id: "mcp-server-card", path: "/.well-known/mcp/server-card.json" },
  { id: "mcp-json", path: "/.well-known/mcp.json" },
  { id: "a2a-agent-card", path: "/.well-known/agent-card.json" }, // A2A 0.3 and later
  { id: "a2a-agent-legacy", path: "/.well-known/agent.json" }, // A2A 0.2
  { id: "agent-skills", path: "/.well-known/agent-skills/index.json" },
  { id: "api-catalog", path: "/.well-known/api-catalog" }, // RFC 9727
  { id: "oauth-protected-resource", path: "/.well-known/oauth-protected-resource" }, // RFC 9728
  { id: "oauth-authorization-server", path: "/.well-known/oauth-authorization-server" }, // RFC 8414
  // S12. x402 has no discovery file: it answers 402 on a paid request.
  { id: "ucp", path: "/.well-known/ucp" },
  { id: "acp", path: "/.well-known/acp.json" },
  { id: "openapi", path: "/openapi.json" }, // MPP marks payable operations with x-payment-info
];
