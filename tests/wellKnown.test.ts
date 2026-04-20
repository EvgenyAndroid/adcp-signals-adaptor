// tests/wellKnown.test.ts
// Sec-25d: CORS + shape sanity on RFC 9728 + RFC 8414 endpoints.
//
// Browser-based buyer tooling discovers OAuth metadata with a cross-origin
// fetch. Without Access-Control-Allow-Origin the browser blocks the read
// silently and the agent appears unreachable — worse than a real 404
// because the agent is serving the document, just behind CORS. These
// tests pin the header presence so a future refactor of the response
// builders can't regress it.

import { describe, it, expect } from "vitest";
import {
  handleProtectedResourceMetadata,
  handleAuthorizationServerMetadata,
  handleOAuthTokenStub,
} from "../src/routes/wellKnown";

function req(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("well-known OAuth endpoints — CORS + shape", () => {
  it("protected-resource metadata serves Access-Control-Allow-Origin: *", () => {
    const res = handleProtectedResourceMetadata(
      req("https://agent.example.com/.well-known/oauth-protected-resource/mcp"),
      "/mcp",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("protected-resource metadata has required RFC 9728 fields + resource matches agent URL", async () => {
    const res = handleProtectedResourceMetadata(
      req("https://agent.example.com/.well-known/oauth-protected-resource/mcp"),
      "/mcp",
    );
    const body = await res.json() as Record<string, unknown>;
    expect(body.resource).toBe("https://agent.example.com/mcp");
    expect(Array.isArray(body.authorization_servers)).toBe(true);
    expect((body.authorization_servers as unknown[]).length).toBeGreaterThan(0);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it("authorization-server metadata serves Access-Control-Allow-Origin: *", () => {
    const res = handleAuthorizationServerMetadata(
      req("https://agent.example.com/.well-known/oauth-authorization-server"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("authorization-server metadata advertises empty grants (Sec-24a contract)", async () => {
    // Sec-24a: we don't implement any OAuth grant, so grant_types_supported
    // and response_types_supported MUST be empty arrays. Advertising grants
    // we don't honor breaks any client that auto-discovers and attempts
    // the flow.
    const res = handleAuthorizationServerMetadata(
      req("https://agent.example.com/.well-known/oauth-authorization-server"),
    );
    const body = await res.json() as Record<string, unknown>;
    expect(body.issuer).toBe("https://agent.example.com");
    expect(body.token_endpoint).toBe("https://agent.example.com/oauth/token");
    expect(body.grant_types_supported).toEqual([]);
    expect(body.response_types_supported).toEqual([]);
  });

  it("/oauth/token stub returns 501 with OAuth-shaped error body", async () => {
    const res = handleOAuthTokenStub();
    expect(res.status).toBe(501);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json() as Record<string, unknown>;
    // RFC 6749 §5.2 error shape — `error` + `error_description`
    expect(body.error).toBe("unsupported_grant_type");
    expect(typeof body.error_description).toBe("string");
  });
});
