// src/routes/openApi.ts
// Sec-37 B9: GET /openapi.json — OpenAPI 3.1 spec for every public
// REST surface on this agent. Auto-regenerated from the static route
// list here; the dashboard and CI can both consume it.

export function handleOpenApi(request: Request): Response {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "AdCP Signals Adaptor",
      version: "3.0",
      description:
        "Reference implementation of the Ad Context Protocol Signals Activation Protocol. " +
        "Exposes an MCP endpoint at /mcp plus REST equivalents for every tool. " +
        "Authentication: bearer token on write endpoints; discovery + estimation are public.",
      contact: { url: "https://github.com/EvgenyAndroid/adcp-signals-adaptor" },
      license: { name: "MIT" },
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
      },
      schemas: {
        SignalId: {
          type: "object",
          required: ["source", "id"],
          properties: {
            source: { type: "string", enum: ["agent"] },
            agent_url: { type: "string", format: "uri" },
            id: { type: "string" },
          },
        },
        PricingOption: {
          type: "object",
          required: ["pricing_option_id", "model"],
          properties: {
            pricing_option_id: { type: "string" },
            model: { type: "string", enum: ["cpm", "flat_fee"] },
            cpm: { type: "number" },
            currency: { type: "string" },
          },
        },
        SignalSummary: {
          type: "object",
          required: ["signal_agent_segment_id", "name", "category_type"],
          properties: {
            signal_agent_segment_id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            category_type: {
              type: "string",
              enum: ["demographic", "interest", "purchase_intent", "geo", "composite"],
            },
            signal_type: { type: "string", enum: ["marketplace", "custom", "owned"] },
            estimated_audience_size: { type: "integer", minimum: 0 },
            coverage_percentage: { type: "number" },
            pricing_options: { type: "array", items: { $ref: "#/components/schemas/PricingOption" } },
          },
        },
        Rule: {
          type: "object",
          required: ["dimension", "operator", "value"],
          properties: {
            dimension: { type: "string" },
            operator: { type: "string", enum: ["eq", "in", "not_eq", "gte", "lte", "contains", "range"] },
            value: { oneOf: [{ type: "string" }, { type: "number" }, { type: "array" }] },
          },
        },
        DeliverTo: {
          type: "object",
          properties: {
            deployments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["platform", "agent"] },
                  platform: { type: "string" },
                  agent_url: { type: "string", format: "uri" },
                },
              },
            },
            countries: { type: "array", items: { type: "string" } },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            code: { type: "string" },
            details: {},
          },
        },
      },
    },
    paths: {
      "/capabilities": {
        get: {
          summary: "Agent capabilities (handshake)",
          description: "Protocol versions, supported signals, destinations, ext.ucp + ext.dts blocks.",
          responses: { "200": { description: "OK" } },
        },
      },
      "/mcp": {
        post: {
          summary: "MCP JSON-RPC 2.0 endpoint",
          description: "Discovery methods (initialize / tools/list / ping) are public; tools/call requires bearer auth.",
          security: [{ bearerAuth: [] }, {}],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jsonrpc", "method"],
                  properties: {
                    jsonrpc: { type: "string", enum: ["2.0"] },
                    id: { type: ["integer", "string", "null"] },
                    method: { type: "string", enum: ["initialize", "tools/list", "tools/call", "ping", "notifications/initialized"] },
                    params: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "JSON-RPC response" },
            "401": { description: "Missing or invalid bearer on tools/call (single-request path)" },
          },
        },
      },
      "/mcp/recent": {
        get: {
          summary: "Recent tool-call log",
          description: "D1-backed ring buffer of recent tools/call invocations. Public (arg values never stored).",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "tool", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/signals/search": {
        post: {
          summary: "Signal search (REST equivalent of tools/call get_signals)",
          responses: { "200": { description: "OK" } },
        },
      },
      "/signals/estimate": {
        post: {
          summary: "Dry-run audience sizer",
          description: "Read-only. Returns estimated_audience_size, coverage_percentage, rule_count, dimensions_used, confidence.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    rules: { type: "array", items: { $ref: "#/components/schemas/Rule" } },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "OK" }, "400": { description: "Validation failed" } },
        },
      },
      "/signals/overlap": {
        post: {
          summary: "Audience overlap across 2-6 signals",
          description:
            "Heuristic Jaccard estimate using category_affinity × min/max signal sizes. Returns pairwise + UpSet-style subset estimates. Refinable with real embedding cosine.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["signal_ids"],
                  properties: {
                    signal_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "OK" }, "400": { description: "Invalid request" } },
        },
      },
      "/signals/generate": {
        post: {
          summary: "Persist a composite signal from rules",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" }, "401": { description: "Missing bearer" } },
        },
      },
      "/signals/activate": {
        post: {
          summary: "Activate a signal to a platform destination",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" }, "401": { description: "Missing bearer" } },
        },
      },
      "/signals/{signal_id}/embedding": {
        get: {
          summary: "Raw UCP embedding vector for a signal",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "signal_id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK — 512-d float32 vector" } },
        },
      },
      "/signals/query": {
        post: {
          summary: "NL audience query (REST equivalent of tools/call query_signals_nl)",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" } },
        },
      },
      "/operations": {
        get: {
          summary: "List recent activation jobs",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
            { name: "status", in: "query", schema: { type: "string", enum: ["submitted", "working", "completed", "failed", "canceled", "rejected"] } },
          ],
          responses: { "200": { description: "OK" } },
        },
      },
      "/operations/{id}": {
        get: {
          summary: "Single activation status",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
        },
      },
      "/admin/reseed": {
        post: {
          summary: "Operator-only force re-seed of the signals table",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "OK" }, "401": { description: "Missing bearer" } },
        },
      },
      "/ucp/concepts": {
        get: {
          summary: "UCP concept registry",
          responses: { "200": { description: "OK" } },
        },
      },
      "/ucp/gts": {
        get: {
          summary: "UCP Global Trust Score endpoint",
          responses: { "200": { description: "OK" } },
        },
      },
      "/.well-known/oauth-protected-resource": {
        get: {
          summary: "RFC 9728 OAuth protected resource metadata",
          responses: { "200": { description: "OK" } },
        },
      },
      "/.well-known/oauth-authorization-server": {
        get: {
          summary: "RFC 8414 OAuth authorization server metadata",
          responses: { "200": { description: "OK" } },
        },
      },
      "/privacy": {
        get: {
          summary: "Privacy policy (referenced from ext.dts.provider_privacy_policy_url)",
          responses: { "200": { description: "OK — text/html" } },
        },
      },
      "/health": {
        get: {
          summary: "Liveness",
          responses: { "200": { description: "OK" } },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
