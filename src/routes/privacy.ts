// src/routes/privacy.ts
// Sec-33: minimal privacy-policy page referenced from ext.dts.provider_privacy_policy_url.
//
// Important because every signal's x_dts label cites this URL as the
// provider's privacy policy. Returning 404 here would break any buyer
// agent that follows the DTS label compliance chain. The content is
// demo-appropriate — this agent serves a mock catalog, collects no
// real user-level data, and all signals are modeled / synthetic.

import { SKIN_TOKENS_CSS, THEME_HEAD_SCRIPT } from "../demo/skins";

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
<html lang="en" data-theme="graphite">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Privacy — AdCP Signals Adaptor (Demo)</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%238a6d3b'/%3E%3Ccircle cx='8' cy='8' r='5' fill='none' stroke='%238a6d3b' stroke-width='0.8' opacity='0.6'/%3E%3Ccircle cx='8' cy='8' r='7.5' fill='none' stroke='%238a6d3b' stroke-width='0.5' opacity='0.3'/%3E%3C/svg%3E"/>
${THEME_HEAD_SCRIPT}
<style>
  /* House style (nofluffadvisory.com): the three skins, set as a printed
     policy. Type uses the house families by name only. This page loads
     nothing from a third party (see its footer), so the Fraunces and
     Inter stacks fall back to the local serif and sans when those
     families are not installed. */
  ${SKIN_TOKENS_CSS}
  :root {
    --mat-sheet: color-mix(in srgb, var(--paper) 40%, #fff);
    --mat-edge: color-mix(in srgb, var(--rule) 70%, transparent);
    --shadow-sheet: 0 1px 1px color-mix(in srgb, var(--ink) 5%, transparent),
                    0 30px 60px -36px color-mix(in srgb, var(--ink) 50%, transparent);
    --font-serif: 'Fraunces', 'Iowan Old Style', Georgia, serif;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    --label-size: 0.7rem; --label-track: 0.14em;
    --page-pad: clamp(1.25rem, 2vw, 2rem);
  }
  * { box-sizing: border-box; }
  html { background: var(--paper); }
  html, body { margin: 0; padding: 0; color: var(--ink);
    font-family: var(--font-serif); font-size: 17px; line-height: 1.6;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overflow-x: clip; }
  .shell { max-width: 50rem; margin: 0 auto; padding: 0 var(--page-pad); }

  /* Hero: stamp, title, lead; the accent glow dissolves into the page. */
  .legal-hero {
    padding: clamp(2.5rem, 6vw, 4rem) 0 clamp(2.25rem, 5vw, 3rem);
    border-bottom: 1px solid var(--rule);
    background: radial-gradient(120% 90% at 0% 0%, rgba(var(--accent-rgb), 0.06), transparent 58%);
  }
  .badge {
    display: inline-block; padding: 0.34rem 0.6rem; border-radius: 2px;
    background: var(--ink); color: var(--paper);
    font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; line-height: 1;
    letter-spacing: 0.12em; white-space: nowrap;
  }
  h1 {
    margin: 1.1rem 0 1rem;
    font-family: var(--font-serif); font-weight: 600;
    font-size: clamp(2.4rem, 1.6rem + 3vw, 3.8rem); line-height: 1;
    letter-spacing: -0.03em; font-variation-settings: 'opsz' 144;
  }
  .lead { max-width: 40rem; margin: 0; color: var(--ink-muted); font-size: 1.125rem; line-height: 1.6; text-wrap: pretty; }

  /* The policy: one paper sheet, its sections numbered by a counter. */
  .legal-body { padding: clamp(2rem, 5vw, 3.25rem) 0 clamp(3rem, 7vw, 5rem); }
  .legal-sheet {
    counter-reset: policy;
    padding: clamp(1.5rem, 4vw, 3rem) clamp(1.25rem, 4.5vw, 3.25rem) clamp(1.5rem, 4vw, 2.5rem);
    background: var(--mat-sheet);
    border: 1px solid var(--mat-edge);
    border-radius: 2px;
    box-shadow: var(--shadow-sheet);
    font-size: 1rem; line-height: 1.7;
  }
  h2 {
    position: relative;
    margin: 2.4rem 0 0.9rem; padding-top: 1.3rem;
    border-top: 1px solid var(--rule);
    font-family: var(--font-serif); font-size: clamp(1.4rem, 1.2rem + 0.8vw, 1.75rem);
    font-weight: 600; line-height: 1.2; letter-spacing: -0.015em;
    counter-increment: policy;
  }
  /* The section numeral hangs from a short accent rule over the hairline. */
  h2::before {
    content: counter(policy, decimal-leading-zero);
    content: counter(policy, decimal-leading-zero) / '';
    display: block; margin-bottom: 0.45rem;
    font-family: var(--font-mono); font-size: var(--label-size); font-weight: 600;
    letter-spacing: var(--label-track); color: var(--accent);
  }
  h2::after { content: ''; position: absolute; top: -1px; left: 0; width: 2.6rem; height: 2px; background: var(--accent); }
  .legal-sheet > h2:first-child { margin-top: 0; }
  p { margin: 0 0 1rem; }
  ul { margin: 0 0 1.2rem 1.25rem; padding: 0; }
  li { margin: 0.25rem 0; }
  strong { font-weight: 600; color: var(--ink); }
  a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--rule); padding-bottom: 1px; word-break: break-word;
    transition: border-color 0.15s ease, color 0.15s ease; }
  a:hover, a:focus-visible { color: var(--accent); border-bottom-color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  code, .mono { font-family: var(--font-mono); font-size: 0.82em; color: var(--ink);
    background: var(--paper-2); padding: 0.08rem 0.4rem; border-radius: 2px; }

  /* Colophon: mono, under a hairline. */
  .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--rule);
    font-family: var(--font-mono); font-size: 0.72rem; line-height: 1.9; letter-spacing: 0.02em; color: var(--ink-light); }
  .footer a { color: var(--ink-muted); }

  /* Phones: the sheet runs to the screen edge, ruled top and bottom. */
  @media (max-width: 560px) {
    .legal-sheet { margin-inline: calc(-1 * var(--page-pad)); padding: 1.4rem var(--page-pad) 1.6rem;
      border-inline: 0; border-block: 1px solid var(--mat-edge); border-radius: 0; box-shadow: none; }
    h2 { margin-top: 2.1rem; }
  }
  @media print {
    .legal-hero { background: none; }
    .legal-sheet { padding: 0; border: 0; box-shadow: none; background: none; }
  }
</style>
</head>
<body>
<header class="legal-hero">
  <div class="shell">
    <span class="badge">DEMO AGENT</span>
    <h1>Privacy &amp; Data Handling</h1>
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
  </div>
</header>

<main class="legal-body">
<div class="shell">
<article class="legal-sheet">
  <h2>What this agent does</h2>
  <p>
    Serves a catalog of <strong>synthetic, modeled audience signals</strong>
    over the AdCP Signals Activation Protocol (3.1 GA) for demonstration
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
</article>

  <div class="footer">
    Last updated when the worker deployed. No cookies set. No third-party resources loaded.
    <br/>
    <a href="/">← Back to dashboard</a>
    &nbsp;·&nbsp;
    <a href="/capabilities">/capabilities</a>
  </div>
</div>
</main>
</body>
</html>`;
