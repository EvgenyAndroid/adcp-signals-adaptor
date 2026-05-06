// tests/adagents-self-publish.test.ts
//
// Pin two contracts on the AdCP discovery anchor we publish:
//   1. Our /.well-known/adagents.json document validates against the
//      vendored 3.0.6 schema. If we ever drift (new required field,
//      removed property, etc.), the test fails before deploy.
//   2. The build helper produces a different agent_url per origin so
//      a preview deploy doesn't hardcode the prod URL.
//
// Also exercises validateAdagentsDocument's negative path so the
// peer-probe pipeline gets coverage on its core dependency.

import { describe, it, expect } from "vitest";
import {
  buildAdagentsDocument,
  validateAdagentsDocument,
  handleAdAgents,
} from "../src/routes/adagents";

function fakeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("adagents self-publish", () => {
  it("buildAdagentsDocument produces a 3.0.6-conformant doc", () => {
    const doc = buildAdagentsDocument(
      fakeRequest("https://adcp-signals-adaptor.evgeny-193.workers.dev/.well-known/adagents.json"),
    );
    const r = validateAdagentsDocument(doc);
    if (!r.valid) {
      // Surface validation errors so a regression diff is readable.
      // eslint-disable-next-line no-console
      console.log("Validation errors:", JSON.stringify(r.errors, null, 2));
    }
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(doc.authorized_agents[0]?.url).toBe(
      "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp",
    );
  });

  it("agent URL adapts to the request origin (preview vs prod)", () => {
    const previewDoc = buildAdagentsDocument(
      fakeRequest("https://preview-abc.adcp-signals-adaptor.evgeny-193.workers.dev/.well-known/adagents.json"),
    );
    const localDoc = buildAdagentsDocument(
      fakeRequest("http://localhost:8787/.well-known/adagents.json"),
    );
    expect(previewDoc.authorized_agents[0]?.url).toContain("preview-abc");
    expect(localDoc.authorized_agents[0]?.url).toBe("http://localhost:8787/mcp");
    // Both still validate.
    expect(validateAdagentsDocument(previewDoc).valid).toBe(true);
    expect(validateAdagentsDocument(localDoc).valid).toBe(true);
  });

  it("declares authorization for every signal via signal_tags=[\"all\"]", () => {
    const doc = buildAdagentsDocument(fakeRequest("https://example.com/.well-known/adagents.json"));
    const agent = doc.authorized_agents[0];
    expect(agent?.authorization_type).toBe("signal_tags");
    expect(agent?.signal_tags).toEqual(["all"]);
    // The "all" tag is defined at the top level so the schema's tag
    // resolution rule (signal_tags reference top-level signal_tags map)
    // is satisfied.
    expect(doc.signal_tags["all"]).toBeDefined();
    expect(doc.signal_tags["all"]?.name).toBeTruthy();
    expect(doc.signal_tags["all"]?.description).toBeTruthy();
  });

  it("contact info includes the responsible domain + privacy policy", () => {
    const doc = buildAdagentsDocument(
      fakeRequest("https://adcp-signals-adaptor.evgeny-193.workers.dev/.well-known/adagents.json"),
    );
    expect(doc.contact.name).toBeTruthy();
    expect(doc.contact.domain).toBe("adcp-signals-adaptor.evgeny-193.workers.dev");
    expect(doc.contact.privacy_policy_url).toContain("/privacy");
  });

  it("contact.domain strips port for ports-in-URL deploys (localhost:8787)", () => {
    // Schema's domain regex doesn't allow colons; we use hostname (not host).
    const doc = buildAdagentsDocument(fakeRequest("http://localhost:8787/.well-known/adagents.json"));
    expect(doc.contact.domain).toBe("localhost");
  });

  it("last_updated is an ISO 8601 datetime", () => {
    const doc = buildAdagentsDocument(fakeRequest("https://example.com/.well-known/adagents.json"));
    // Round-trip through Date — should not produce NaN
    const parsed = new Date(doc.last_updated);
    expect(parsed.toString()).not.toBe("Invalid Date");
    expect(parsed.toISOString()).toBe(doc.last_updated);
  });

  it("handleAdAgents returns 200 + JSON with cache + CORS headers", async () => {
    const env = {} as never;
    const res = handleAdAgents(
      fakeRequest("https://adcp-signals-adaptor.evgeny-193.workers.dev/.well-known/adagents.json"),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json();
    expect((body as { authorized_agents: unknown[] }).authorized_agents).toHaveLength(1);
  });

  it("validateAdagentsDocument flags a doc missing required authorized_agents", () => {
    const r = validateAdagentsDocument({
      $schema: "https://adcontextprotocol.org/schemas/v3/adagents.json",
      contact: { name: "Test" },
      last_updated: "2026-05-06T12:00:00Z",
    });
    expect(r.valid).toBe(false);
    // The error list should mention the missing authorized_agents
    // somewhere; we don't pin the exact path/keyword because
    // @cfworker/json-schema's oneOf reporting is verbose.
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
