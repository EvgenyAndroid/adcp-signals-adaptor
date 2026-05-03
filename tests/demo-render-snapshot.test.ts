// tests/demo-render-snapshot.test.ts
//
// Byte-equivalence test for the demo HTML response. This is the safety
// net for the Sec-31r refactor that split demo.ts into demo/styles.ts +
// demo/script/* fragments. It runs handleDemo() with a fixed API key and
// compares a SHA-256 hash of the response body against a committed
// snapshot. If anything in the rendered HTML drifts by even a single
// byte, this test fails with a hash diff.
//
// CRLF normalization: line-ending differences between local (Windows
// checkout) and CI / production (LF) are noise — we normalize to LF
// before hashing so the snapshot is OS-stable. The deployed Worker runs
// on Linux, so LF is what users actually receive.
//
// To intentionally update the snapshot after a deliberate UI change,
// run `npx vitest run -u tests/demo-render-snapshot.test.ts`.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { handleDemo } from "../src/routes/demo";

const FIXTURE_API_KEY = "BYTE-EQUIVALENCE-FIXTURE-KEY";

function hashBody(body: string): { length: number; hash: string } {
  // Normalize CRLF → LF so the hash is OS-stable. autocrlf=true means
  // local Windows checkouts have CRLF in source files, but the deployed
  // Worker (Linux) emits LF. Snapshotting LF makes the test reliable
  // across platforms.
  const lf = body.replace(/\r\n/g, "\n");
  const hash = createHash("sha256").update(lf, "utf8").digest("hex");
  return { length: lf.length, hash };
}

describe("handleDemo byte-equivalence", () => {
  it("is deterministic for a given API key (same input → same output)", async () => {
    const a = await handleDemo({ DEMO_API_KEY: FIXTURE_API_KEY }).text();
    const b = await handleDemo({ DEMO_API_KEY: FIXTURE_API_KEY }).text();
    expect(a).toBe(b);
  });

  it("matches the committed golden hash (LF-normalized SHA-256 of body)", async () => {
    const body = await handleDemo({ DEMO_API_KEY: FIXTURE_API_KEY }).text();
    expect(hashBody(body)).toMatchSnapshot();
  });

  it("response has the expected status, headers, and CSP directives", async () => {
    const r = handleDemo({ DEMO_API_KEY: FIXTURE_API_KEY });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const csp = r.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("https://esm.sh");
    expect(csp).toContain("https://cdn.jsdelivr.net");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("connect-src 'self'");
  });

  it("body contains every major UI structural anchor (sections survive refactor)", async () => {
    const body = await handleDemo({ DEMO_API_KEY: FIXTURE_API_KEY }).text();
    // Document anchors
    expect(body.startsWith("<!doctype html>")).toBe(true);
    expect(body).toContain('<html lang="en" class="is-locked">');
    expect(body).toContain("</html>");
    expect(body).toContain("</body>");
    // Auth + chrome
    expect(body).toContain('id="auth-overlay"');
    expect(body).toContain('id="auth-form"');
    expect(body).toContain('id="auth-password"');
    // Style + script blocks must both inline
    expect(body).toContain("<style>");
    expect(body).toContain("</style>");
    expect(body).toContain('<script type="module">');
    expect(body).toContain("</script>");
    // Major sections / panes that the refactor must preserve
    const expectedFragments = [
      'data-tab="discover"',
      'data-tab="catalog"',
      'data-tab="concepts"',
      "trace-panel",
      "kbd-overlay",
      // Brand canvas, orchestrator, and other major surfaces shipped before
      // the refactor — sanity-check they didn't get amputated.
      "_canvasApplyEvent",
      "_orchRenderAgentGrid",
      "_wfApplyEvent",
      "_agenticHandleStreamEvent",
      "renderTreemap",
      "_captureTrace",
    ];
    for (const frag of expectedFragments) {
      expect(body, `expected to contain ${frag}`).toContain(frag);
    }
  });

  it("API key is JSON-stringified safely into DEMO_KEY (no injection)", async () => {
    const body = await handleDemo({ DEMO_API_KEY: 'evil"-->" injected' }).text();
    // safeKey is JSON.stringify(demoKey), so all quotes are backslash-escaped.
    // The line in the inlined script is: `const DEMO_KEY = ${safeKey};`
    // → const DEMO_KEY = "evil\"-->\" injected";
    expect(body).toContain('const DEMO_KEY = "evil\\"-->\\" injected"');
    // And there must NOT be an unescaped close-script-tag injection.
    expect(body).not.toContain('"--></script><script');
  });

  it("inlined STYLES block is reachable from the response (extraction smoke test)", async () => {
    const body = await handleDemo({ DEMO_API_KEY: "x" }).text();
    // A representative theme-system selector that exists in the CSS bundle.
    // If the styles import was lost, this would not render.
    expect(body).toMatch(/\[data-theme=["']midnight["']\]/);
    expect(body).toMatch(/\[data-theme=["']daylight["']\]/);
    expect(body).toMatch(/\[data-theme=["']solar["']\]/);
  });
});
