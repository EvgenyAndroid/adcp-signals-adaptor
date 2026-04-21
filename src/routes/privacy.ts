// src/routes/privacy.ts
// Sec-33: minimal privacy-policy page referenced from ext.dts.provider_privacy_policy_url.
//
// Important because every signal's x_dts label cites this URL as the
// provider's privacy policy. Returning 404 here would break any buyer
// agent that follows the DTS label compliance chain. The content is
// demo-appropriate — this agent serves a mock catalog, collects no
// real user-level data, and all signals are modeled / synthetic.

export function handlePrivacy(): Response {
  return new Response(PRIVACY_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

const PRIVACY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Privacy — AdCP Signals Adaptor (Demo)</title>
<style>
  :root {
    --bg: #0b1017; --panel: #121a28; --border: #1c2636;
    --text: #e6edf3; --text-dim: #8b98a9; --text-mut: #5d6b7e;
    --accent: #4f8eff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 15px; line-height: 1.65; }
  main { max-width: 720px; margin: 0 auto; padding: 56px 24px 96px; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; font-weight: 650; }
  .lead { color: var(--text-dim); margin: 0 0 36px; font-size: 15.5px; }
  h2 { font-size: 17px; margin: 28px 0 10px; letter-spacing: -0.005em; }
  p, li { color: var(--text-dim); }
  strong { color: var(--text); font-weight: 600; }
  code, .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13.5px; color: var(--text); background: var(--panel);
    border: 1px solid var(--border); padding: 1px 6px; border-radius: 4px; }
  a { color: var(--accent); }
  .badge { display: inline-block; font-family: ui-monospace, monospace;
    font-size: 11px; padding: 3px 8px; border-radius: 10px;
    background: rgba(79,142,255,0.15); color: var(--accent); letter-spacing: 0.04em; }
  .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border);
    color: var(--text-mut); font-size: 12.5px; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
</style>
</head>
<body>
<main>
  <span class="badge">DEMO AGENT</span>
  <h1 style="margin-top:14px">Privacy &amp; Data Handling</h1>
  <p class="lead">
    This service is the <strong>AdCP Signals Adaptor</strong> —
    a reference implementation of the
    <a href="https://adcontextprotocol.org" target="_blank" rel="noopener">Ad Context Protocol</a>
    signals agent. This page documents the data-handling posture
    cited by the <code>ext.dts.provider_privacy_policy_url</code> field
    in the agent's <a href="/capabilities">capabilities response</a>
    and by the <code>privacy_policy_url</code> field on every signal's
    IAB DTS v1.2 label.
  </p>

  <h2>What this agent does</h2>
  <p>
    Serves a catalog of <strong>synthetic, modeled audience signals</strong>
    over the AdCP Signals Activation Protocol (v3.0-rc) for demonstration
    and conformance-testing purposes. Exposes the catalog via an MCP
    endpoint at <code>/mcp</code>, a REST endpoint at <code>/signals/search</code>,
    and an interactive demo UI at <code>/</code>.
  </p>

  <h2>What data this agent collects</h2>
  <p>
    <strong>No user-level or device-level data is collected, stored, or transmitted.</strong>
    The catalog is entirely code-authored (see
    <a href="https://github.com/EvgenyAndroid/adcp-signals-adaptor/tree/master/src/domain/signals" target="_blank" rel="noopener">src/domain/signals/</a>).
    Audience sizes are heuristic estimates computed from US-Census-level
    aggregates; no matching against real-world identifiers happens at any
    point in the request path.
  </p>

  <h2>What operational data the worker logs</h2>
  <ul>
    <li>Request ID, HTTP method, path, and response status (standard observability)</li>
    <li>MCP tool-call names and latency (surfaced in the
        <a href="/">dashboard's Tool Log tab</a>)</li>
    <li>Activation job records in D1 (signal ID, destination, status,
        timestamps) — retained for the life of the database</li>
  </ul>
  <p>
    Nothing above contains personal data. The
    <a href="https://github.com/EvgenyAndroid/adcp-signals-adaptor/blob/master/SECURITY_MODEL.md" target="_blank" rel="noopener">SECURITY_MODEL.md</a>
    in the repo describes the full data-handling model.
  </p>

  <h2>What the DTS label means on catalog signals</h2>
  <p>
    Every signal returned by <code>get_signals</code> carries an
    <code>x_dts</code> label conforming to
    <a href="https://iabtechlab.com/standards/data-transparency/" target="_blank" rel="noopener">IAB Tech Lab Data Transparency Standard v1.2</a>.
    The label describes the <em>hypothetical</em> provenance of the modeled
    audience (inclusion methodology, precision levels, privacy-framework
    support) as it would appear in a production deployment. The labels are
    structurally valid and machine-readable but do not describe real
    third-party data — this is a demo.
  </p>

  <h2>Contact</h2>
  <p>
    Repository: <a href="https://github.com/EvgenyAndroid/adcp-signals-adaptor" target="_blank" rel="noopener">github.com/EvgenyAndroid/adcp-signals-adaptor</a>.
    Issues and questions go there.
  </p>

  <div class="footer">
    Last updated when the worker deployed. No cookies set. No third-party resources loaded.
    <br/>
    <a href="/">← Back to dashboard</a>
    &nbsp;·&nbsp;
    <a href="/capabilities">/capabilities</a>
  </div>
</main>
</body>
</html>`;
