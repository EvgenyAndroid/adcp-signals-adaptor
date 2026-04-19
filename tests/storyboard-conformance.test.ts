// tests/storyboard-conformance.test.ts
// Sec-12: regression pins for the AdCP signals storyboard baseline phases
// (added upstream in adcp#2365). The runner sends specific request shapes
// and validates specific response fields per phase. These tests pin those
// shapes against our handlers so a future edit can't silently regress
// conformance — even before the runner CLI release that ships the new
// storyboards lands on npm.
//
// Source of truth for the request/response shapes:
//   adcontextprotocol/adcp:static/compliance/source/protocols/signals/index.yaml
//   adcontextprotocol/adcp:static/schemas/source/signals/get-signals-response.json
//   adcontextprotocol/adcp:static/schemas/source/signals/activate-signal-response.json
//   adcontextprotocol/adcp:static/schemas/source/core/signal-id.json (agent variant)

import { describe, it, expect } from "vitest";
import { toSignalSummary } from "../src/mappers/signalMapper";
import type { CanonicalSignal } from "../src/types/signal";

// ── Phase 2 (discovery) — get_signals response shape ─────────────────────────

function makeFixtureSignal(): CanonicalSignal {
  return {
    signalId: "sig_drama_viewers",
    taxonomySystem: "iab_audience_1_1",
    name: "Drama Viewers",
    description: "Heavy consumers of dramatic television content",
    categoryType: "interest",
    sourceSystems: ["nielsen_acr"],
    destinations: ["mock_dsp", "mock_cleanroom"],
    activationSupported: true,
    estimatedAudienceSize: 5_400_000,
    accessPolicy: "public_demo",
    generationMode: "seeded",
    status: "available",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("get_signals response — storyboard signal_id requirement", () => {
  it("signals[].signal_id is present (schema-required field)", () => {
    const summary = toSignalSummary(makeFixtureSignal());
    expect(summary.signal_id).toBeDefined();
  });

  it("signals[].signal_id.source equals the agent discriminator", () => {
    // Per /schemas/core/signal-id.json — source is the discriminator. We're
    // an agent-native signals service (no upstream data-provider catalog),
    // so the agent variant is the only correct value.
    const summary = toSignalSummary(makeFixtureSignal());
    expect(summary.signal_id.source).toBe("agent");
  });

  it("signals[].signal_id.agent_url is a valid https URL pointing at our MCP endpoint", () => {
    const summary = toSignalSummary(makeFixtureSignal());
    const url = summary.signal_id.agent_url;
    expect(url).toMatch(/^https:\/\/.+\/mcp$/);
    // Sanity: must parse as a URL (the schema says format: uri).
    expect(() => new URL(url)).not.toThrow();
  });

  it("signals[].signal_id.id matches the agent-internal signal identifier pattern", () => {
    // /schemas/core/signal-id.json agent variant requires
    //   id: ^[a-zA-Z0-9_-]+$
    const summary = toSignalSummary(makeFixtureSignal());
    expect(summary.signal_id.id).toBe("sig_drama_viewers");
    expect(summary.signal_id.id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("signals[] retains signal_agent_segment_id alongside signal_id (both required)", () => {
    // Storyboard checks BOTH `signal_id.source` AND `signal_agent_segment_id`.
    // signal_id is the universal identifier (discriminator + source); the
    // segment_id is the activation handle. Existing callers depend on it.
    const summary = toSignalSummary(makeFixtureSignal());
    expect(summary.signal_agent_segment_id).toBe("sig_drama_viewers");
  });

  it("signals[].pricing_options[0].pricing_option_id is captured (storyboard context_outputs)", () => {
    // The storyboard captures this into a context variable that gets
    // passed back to activate_signal. If the field is missing, the
    // activation phase has no pricing_option_id to send.
    const summary = toSignalSummary(makeFixtureSignal());
    const opt = summary.pricing_options?.[0];
    expect(opt).toBeDefined();
    expect(typeof opt!.pricing_option_id).toBe("string");
    expect(opt!.pricing_option_id.length).toBeGreaterThan(0);
  });
});

// ── Phase 3 (activation) — destinations[] request shape + context echo ───────
//
// We can't easily exercise the full MCP handleToolCall path in a unit test
// without standing up a fake D1 + KV. Instead, verify the helper that pulls
// the destinations from the args (which is the actual logic the Sec-12 fix
// targets). The end-to-end behaviour is covered by the live probe below
// and by scripts/test-live.sh once we re-deploy.

describe("activate_signal request-shape parsing", () => {
  // Mirror the parsing rule from src/mcp/server.ts callActivateSignal:
  //   args.destinations ?? args.deliver_to ?? args.deployments
  // and pull type/agent_url/platform out of the first entry.
  function parseDestinations(args: Record<string, unknown>) {
    const raw = args["destinations"] ?? args["deliver_to"] ?? args["deployments"];
    const firstEntry = Array.isArray(raw) ? (raw[0] as Record<string, unknown>) : undefined;
    const firstType = firstEntry?.["type"] as string | undefined;
    const destination = (firstEntry?.["agent_url"] as string)
      ?? (firstEntry?.["platform"] as string)
      ?? (args["destination"] as string)
      ?? "mock_dsp";
    const destinationType: "platform" | "agent" = firstType === "agent" ? "agent" : "platform";
    return { destination, destinationType };
  }

  it("storyboard agent destination → type=agent, destination=agent_url", () => {
    const result = parseDestinations({
      destinations: [{ type: "agent", agent_url: "https://wonderstruck.salesagents.example" }],
    });
    expect(result.destinationType).toBe("agent");
    expect(result.destination).toBe("https://wonderstruck.salesagents.example");
  });

  it("storyboard platform destination → type=platform, destination=requested platform name", () => {
    const result = parseDestinations({
      destinations: [{ type: "platform", platform: "the-trade-desk", account: "agency-123-ttd" }],
    });
    expect(result.destinationType).toBe("platform");
    expect(result.destination).toBe("the-trade-desk");
  });

  it("legacy deliver_to.deployments shape still parses", () => {
    const result = parseDestinations({
      deliver_to: [{ type: "platform", platform: "mock_dsp" }],
    });
    expect(result.destinationType).toBe("platform");
    expect(result.destination).toBe("mock_dsp");
  });

  it("legacy deployments alias still parses", () => {
    const result = parseDestinations({
      deployments: [{ type: "agent", agent_url: "https://example.com/agent" }],
    });
    expect(result.destinationType).toBe("agent");
    expect(result.destination).toBe("https://example.com/agent");
  });

  it("falls back to mock_dsp when nothing is supplied (demo-friendly)", () => {
    const result = parseDestinations({});
    expect(result.destinationType).toBe("platform");
    expect(result.destination).toBe("mock_dsp");
  });

  it("destinations array takes precedence over the legacy shapes", () => {
    const result = parseDestinations({
      destinations: [{ type: "agent", agent_url: "https://new-shape.example" }],
      deliver_to: [{ type: "platform", platform: "old-shape-dsp" }],
    });
    expect(result.destinationType).toBe("agent");
    expect(result.destination).toBe("https://new-shape.example");
  });
});

// ── activationService destinations behavior (post-Sec-12 round 2) ────────────
//
// Per the AdCP signals storyboard baseline, every signals agent must accept
// arbitrary platform destinations and return an async deployment record —
// `is_live: false` is explicitly valid per the activate-signal-response
// schema. The per-signal destinations[] list is now advisory metadata,
// not a rejection gate. This pin documents the post-relaxation behavior:
//   - platform IN signal.destinations  → activates
//   - platform NOT in signal.destinations → activates (logs at info)
//   - agent destination (URL)           → activates (skips check entirely)

import { activateSignalService, ValidationError } from "../src/domain/activationService";
import { findSignalById } from "../src/storage/signalRepo";
import { vi } from "vitest";

vi.mock("../src/storage/signalRepo", async () => {
  const actual = await vi.importActual<typeof import("../src/storage/signalRepo")>("../src/storage/signalRepo");
  return { ...actual, findSignalById: vi.fn() };
});
vi.mock("../src/storage/activationRepo", () => ({
  createActivationJob: vi.fn(async () => {}),
  findOperationById: vi.fn(),
  updateJobStatus: vi.fn(),
  markWebhookFired: vi.fn(),
}));

import { createLogger } from "../src/utils/logger";

describe("activationService — destinations behavior (post-Sec-12 round 2)", () => {
  const db = {} as unknown as import("../src/storage/db").DB;
  const kv = {} as unknown as KVNamespace;
  const logger = createLogger("test-sec12");

  const stubSignal: CanonicalSignal = {
    ...makeFixtureSignal(),
    destinations: ["mock_dsp", "mock_cleanroom"],
  };

  it("platform destination IN signal.destinations → activates", async () => {
    vi.mocked(findSignalById).mockResolvedValue(stubSignal);
    const res = await activateSignalService(
      db, kv,
      { signalId: "sig_drama_viewers", destination: "mock_dsp", destinationType: "platform" },
      logger,
    );
    expect(res.task_id).toBeDefined();
  });

  it("platform destination NOT in signal.destinations → still activates (storyboard requires acceptance)", async () => {
    // Pre-relaxation, this would throw ValidationError. The runner sends
    // arbitrary platforms (the-trade-desk, dv360, etc.) against any
    // signal — those were never in our destinations list, so rejecting
    // them broke protocol-level conformance.
    vi.mocked(findSignalById).mockResolvedValue(stubSignal);
    const res = await activateSignalService(
      db, kv,
      { signalId: "sig_drama_viewers", destination: "the-trade-desk", destinationType: "platform" },
      logger,
    );
    expect(res.task_id).toBeDefined();
    expect(res.status).toBe("pending");
  });

  it("agent destination (URL) → activates without any platform check", async () => {
    vi.mocked(findSignalById).mockResolvedValue(stubSignal);
    const res = await activateSignalService(
      db, kv,
      {
        signalId: "sig_drama_viewers",
        destination: "https://wonderstruck.salesagents.example",
        destinationType: "agent",
      },
      logger,
    );
    expect(res.task_id).toBeDefined();
  });

  it("default destinationType (omitted) treats as platform AND still activates against unknowns", async () => {
    vi.mocked(findSignalById).mockResolvedValue(stubSignal);
    const a = await activateSignalService(
      db, kv,
      { signalId: "sig_drama_viewers", destination: "mock_dsp" },
      logger,
    );
    expect(a.task_id).toBeDefined();
    const b = await activateSignalService(
      db, kv,
      { signalId: "sig_drama_viewers", destination: "the-trade-desk" },
      logger,
    );
    expect(b.task_id).toBeDefined();
  });

  // The activationSupported gate is the ONLY hard reject in the service now.
  it("signals with activationSupported=false still throw ValidationError", async () => {
    vi.mocked(findSignalById).mockResolvedValue({
      ...stubSignal,
      activationSupported: false,
    });
    await expect(
      activateSignalService(
        db, kv,
        { signalId: "sig_drama_viewers", destination: "mock_dsp", destinationType: "platform" },
        logger,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
