// tests/demo-labels-3-2.test.ts
//
// The three static strings #348 left naming "3.1 GA" with SERVE_ADCP_3_2 ON:
// the demo sidebar's Version, the demo endpoints panel's /capabilities note,
// and /privacy. They name the release served, so they follow the flag
// (servedReleaseLine, src/constants/specVersion.ts). The sidebar also shows
// the vendored schema corpus (SPEC_VERSION, 3.1.20, what the trace inspector
// validates payloads against), which the flag does not change; with the flag
// ON it gets its own "Schemas" row, so 3.1.20 never reads as a 3.2 patch.
//
// Flag OFF is byte for byte what it was: tests/demo-render-snapshot.test.ts
// pins the demo body with the flag unset; here "false" must equal unset, and
// the flag-ON page must be the flag-OFF page with exactly the intended edits.

import { describe, it, expect } from "vitest";
import worker from "../src/index";
import { SPEC_LABEL, SPEC_VERSION } from "../src/constants/specVersion";
import type { Env } from "../src/types/env";

const ctx = { waitUntil(p: Promise<unknown>) { void p.catch(() => {}); }, passThroughOnException() {} } as unknown as ExecutionContext;

function makeEnv(flag?: string): Env {
  const kv = {
    async get() { return null; },
    async put() {},
    async delete() {},
    async list() { return { keys: [], list_complete: true } as never; },
    async getWithMetadata() { return { value: null, metadata: null } as never; },
  } as unknown as KVNamespace;
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: {} }; },
      };
    },
    async batch() { return []; },
  } as unknown as D1Database;
  return {
    ENVIRONMENT: "test",
    API_VERSION: "3.1",
    DEMO_API_KEY: "demo-key-labels-test",
    LINKEDIN_CLIENT_ID: "c",
    LINKEDIN_CLIENT_SECRET: "s",
    LINKEDIN_REDIRECT_URI: "https://example.com/cb",
    LINKEDIN_AD_ACCOUNT_ID: "1",
    SIGNALS_CACHE: kv,
    DB: db,
    ...(flag === undefined ? {} : { SERVE_ADCP_3_2: flag }),
  } as unknown as Env;
}

async function page(path: string, flag?: string): Promise<string> {
  const res = await worker.fetch(new Request(`https://adcp.signal-stack.io${path}`), makeEnv(flag), ctx);
  expect(res.status).toBe(200);
  return res.text();
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const VERSION_ROW_OFF = `<div class="kv"><span class="k">Version</span><span class="v mono">${SPEC_LABEL}</span></div>`;
const VERSION_ROWS_ON =
  `<div class="kv"><span class="k">Version</span><span class="v mono">3.2 GA</span></div>\n` +
  `      <div class="kv"><span class="k">Schemas</span><span class="v mono" title="The vendored AdCP schema corpus the trace inspector validates payloads against">${SPEC_VERSION}</span></div>`;
const HANDSHAKE_OFF = "AdCP 3.1 GA capabilities handshake · public";
const HANDSHAKE_ON = "AdCP 3.2 GA capabilities handshake · public";

describe("demo page (/)", () => {
  it("flag OFF: \"false\" renders the same bytes as unset, still 3.1 GA", async () => {
    const off = await page("/");
    expect(await page("/", "false")).toBe(off);
    expect(count(off, VERSION_ROW_OFF)).toBe(1);
    expect(SPEC_LABEL).toBe(`3.1 GA · ${SPEC_VERSION}`);
    expect(count(off, HANDSHAKE_OFF)).toBe(1);
  });

  it("flag ON: the sidebar Version names the release served, and 3.1.20 is labelled as the schemas", async () => {
    const on = await page("/", "true");
    expect(on).toContain(VERSION_ROWS_ON);
    expect(on).not.toContain(SPEC_LABEL);
    expect(on).not.toMatch(new RegExp(`3\\.2 GA\\s*·\\s*${SPEC_VERSION.replace(/\./g, "\\.")}`));
  });

  it("flag ON: the endpoints panel names the release served", async () => {
    const on = await page("/", "true");
    expect(on).toContain(HANDSHAKE_ON);
    expect(on).not.toContain("3.1 GA");
  });

  it("flag ON is the flag-OFF page with exactly those two edits", async () => {
    const off = await page("/");
    expect(await page("/", "true")).toBe(off.replace(VERSION_ROW_OFF, VERSION_ROWS_ON).replace(HANDSHAKE_OFF, HANDSHAKE_ON));
  });
});

describe("/privacy", () => {
  it("flag OFF: \"false\" renders the same bytes as unset, still 3.1 GA", async () => {
    const off = await page("/privacy");
    expect(await page("/privacy", "false")).toBe(off);
    expect(count(off, "(3.1 GA)")).toBe(1);
  });

  it("flag ON: names the release served, and that is the only change", async () => {
    const off = await page("/privacy");
    const on = await page("/privacy", "true");
    expect(on).not.toContain("3.1 GA");
    expect(on).toBe(off.replace("(3.1 GA)", "(3.2 GA)"));
  });
});
