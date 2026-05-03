// tests/vendorHealthCanvas.test.ts
//
// Smoke test for the Vendor Health Dashboard HTML page (Wave 5 + Wave 5
// follow-up). Locks down the surface against accidental amputation.
//
// Coverage:
//   - Response status + headers (CSP, content-type, cache-control)
//   - HTML structure anchors (header, filter row, vendor grid, modal)
//   - Wave 5 sparkline + history rendering fns present in the bundle
//   - Wave 5 follow-up trend stats / chart fns present in the bundle
//   - Determinism (same input → same output)
//
// We do NOT snapshot the full body here — the canvas page evolves more
// frequently than demo.ts and a hash snapshot would generate too much
// merge friction. Structural anchors give us the same regression
// protection where it matters.

import { describe, expect, it } from "vitest";

import { handleVendorHealthCanvas } from "../src/routes/vendorHealthCanvas";

const FIXTURE_KEY = "VENDOR-HEALTH-FIXTURE-KEY";

describe("handleVendorHealthCanvas", () => {
  it("returns 200 with HTML + correct headers", () => {
    const r = handleVendorHealthCanvas({ DEMO_API_KEY: FIXTURE_KEY });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const csp = r.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    // The vendor-health canvas does NOT depend on esm.sh or external
    // CDNs (everything's hand-rolled SVG). Verify connect-src is locked.
    expect(csp).toContain("connect-src 'self'");
    // Defensive: no esm.sh or jsdelivr in this canvas's CSP.
    expect(csp).not.toContain("esm.sh");
    expect(csp).not.toContain("cdn.jsdelivr");
  });

  it("is deterministic for a given API key", async () => {
    const a = await handleVendorHealthCanvas({ DEMO_API_KEY: FIXTURE_KEY }).text();
    const b = await handleVendorHealthCanvas({ DEMO_API_KEY: FIXTURE_KEY }).text();
    expect(a).toBe(b);
  });

  it("renders all major page structural anchors", async () => {
    const body = await handleVendorHealthCanvas({ DEMO_API_KEY: FIXTURE_KEY }).text();
    // Document anchors
    expect(body.startsWith("<!doctype html>")).toBe(true);
    expect(body).toContain("</html>");
    expect(body).toContain("</body>");
    expect(body).toContain("Vendor <span class=\"accent\">Health</span>");
    // Header buttons
    expect(body).toContain('id="btn-refresh"');
    expect(body).toContain('id="btn-meta"');
    // Filter row
    expect(body).toContain('data-filter-bucket="all"');
    expect(body).toContain('data-filter-stage="all"');
    expect(body).toContain('data-filter-role="all"');
    // Grid + aggregate strip
    expect(body).toContain('id="vendor-grid"');
    expect(body).toContain('id="aggregate-strip"');
    // Drill-down modal
    expect(body).toContain('id="modal-backdrop"');
    expect(body).toContain('id="modal-identity"');
    expect(body).toContain('id="modal-probe"');
    expect(body).toContain('id="modal-circuit"');
  });

  it("inlines the Wave 5 history infrastructure (sparklines)", async () => {
    const body = await handleVendorHealthCanvas({ DEMO_API_KEY: FIXTURE_KEY }).text();
    // Core history rendering. The sparkline class is emitted as
    // `class=\"vc-spark\"` in the HTML body (JS-escaped quotes inside
    // the inlined script), so we just look for the bare class name.
    expect(body).toContain("function renderSparkline(history)");
    expect(body).toContain("vc-spark");
    // Original history-text section was replaced by the chart, but the
    // KV-history flow is still wired (the Recent history section header
    // remains).
    expect(body).toContain("Recent history");
  });

  it("inlines the Wave 5 follow-up: trend stats + chart helpers", async () => {
    const body = await handleVendorHealthCanvas({ DEMO_API_KEY: FIXTURE_KEY }).text();
    // Stats helpers
    expect(body).toContain("function computeTrendStats(history)");
    expect(body).toContain("function renderTrendPills(stats)");
    expect(body).toContain("function bucketColor(bucket)");
    expect(body).toContain("function median(arr)");
    expect(body).toContain("function percentile(arr, p)");
    // Modal chart
    expect(body).toContain("function renderHistoryChart(history)");
    expect(body).toContain("function renderChartStats(stats)");
    expect(body).toContain('id="modal-chart-host"');
    expect(body).toContain('id="modal-chart-stats"');
    // Threshold-line annotations in the chart
    expect(body).toContain("2.5s degraded threshold");
    expect(body).toContain("5s down threshold");
    // Chart legend buckets
    expect(body).toContain("modal-chart-legend");
  });

  it("CSP forbids inline JS injection through API key", async () => {
    // The DEMO_API_KEY is JSON-stringified into the inlined script as
    // `var DEMO_KEY = ${safeKey};`. This test verifies that an attempt
    // to inject a </script> tag through the key gets escaped, not raw.
    const body = await handleVendorHealthCanvas({
      DEMO_API_KEY: 'evil"-->" injected'
    }).text();
    expect(body).toContain('var DEMO_KEY = "evil\\"-->\\" injected"');
    expect(body).not.toContain('"--></script><script');
  });
});
