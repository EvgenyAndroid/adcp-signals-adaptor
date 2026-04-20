// scripts/pre-demo-audit.mjs
// Ad-hoc pre-demo audit — exercises every demo-worthy flow end-to-end
// against the live worker, reports a line per check.
//
// Usage:
//   API_KEY=... node scripts/pre-demo-audit.mjs

const BASE = process.env.BASE ?? 'https://adcp-signals-adaptor.evgeny-193.workers.dev';
const KEY = process.env.API_KEY;
if (!KEY) {
  console.error('ERROR: API_KEY not set');
  process.exit(2);
}

const results = [];
function log(label, ok, detail = '') {
  results.push({ label, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${mark.padEnd(4)} ${label}${suffix}`);
}

const auth = { Authorization: `Bearer ${KEY}` };
const json = { 'Content-Type': 'application/json' };

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
  return { status: res.status, body, raw: text };
}

// ── Core protocol ────────────────────────────────────────────────────────────

async function checkHealth() {
  const { status, body } = await fetchJson(`${BASE}/health`);
  log('health', status === 200 && body.status === 'ok', `v=${body.version}`);
}

async function checkCapabilities() {
  const { status, body } = await fetchJson(`${BASE}/capabilities?correlation_id=demo`);
  log('capabilities — 200', status === 200);
  log('capabilities — adcp.major_versions contains 3', Array.isArray(body.adcp?.major_versions) && body.adcp.major_versions.includes(3));
  log('capabilities — adcp.idempotency.replay_ttl_seconds', typeof body.adcp?.idempotency?.replay_ttl_seconds === 'number');
  log('capabilities — supported_protocols includes signals', body.supported_protocols?.includes('signals'));
  log('capabilities — context correlation_id echo', body.context?.correlation_id === 'demo');
  log('capabilities — ext.ucp present', !!body.ext?.ucp);
  // Consistency check vs gts
  const gts = await fetchJson(`${BASE}/ucp/gts`);
  const capPhase = body.ext?.ucp?.phase;
  const gtsPhase = gts.body.engine_phase;
  log(
    'capabilities — ext.ucp.phase matches gts engine_phase',
    capPhase === gtsPhase,
    `capabilities:${capPhase} vs gts:${gtsPhase}`,
  );
  const capSpaces = body.ext?.ucp?.supported_spaces ?? [];
  const gtsSpace = gts.body.space_id;
  log(
    'capabilities — ext.ucp.supported_spaces contains gts.space_id',
    capSpaces.includes(gtsSpace),
    `capabilities:${JSON.stringify(capSpaces)} vs gts:${gtsSpace}`,
  );
}

async function checkGts() {
  const { status, body } = await fetchJson(`${BASE}/ucp/gts`);
  log('ucp/gts — 200', status === 200);
  log('ucp/gts — overall_pass true', body.overall_pass === true);
  log('ucp/gts — pass_rate 1.0', body.pass_rate === 1);
  log('ucp/gts — engine_phase llm-v1', body.engine_phase === 'llm-v1');
  log('ucp/gts — 15 pairs', body.pairs?.length === 15);
}

async function checkProjector() {
  const unauth = await fetchJson(`${BASE}/ucp/projector`);
  log('ucp/projector — unauth 401', unauth.status === 401);
  const authed = await fetchJson(`${BASE}/ucp/projector`, { headers: auth });
  log('ucp/projector — authed 200', authed.status === 200);
  log('ucp/projector — 512-row matrix', Array.isArray(authed.body.matrix) && authed.body.matrix.length === 512);
  log('ucp/projector — status simulated', authed.body.status === 'simulated');
}

async function checkHandshake() {
  for (const [name, spaces, expected] of [
    ['direct_match', ['openai-te3-small-d512-v1'], 'direct_match'],
    ['projector_required', ['bert-base-uncased-v1'], 'projector_required'],
    ['legacy_fallback', [], 'legacy_fallback'],
  ]) {
    const { status, body } = await fetchJson(`${BASE}/ucp/simulate-handshake`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ buyer_space_ids: spaces, buyer_ucp_version: expected === 'legacy_fallback' ? 'ucp-v0' : 'ucp-v1' }),
    });
    log(`handshake — ${name}`, status === 200 && body.outcome === expected);
  }
}

// ── Search + search pagination sanity ────────────────────────────────────────

async function checkSearch() {
  const { status, body } = await fetchJson(`${BASE}/signals/search`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({ query: 'high income', limit: 3 }),
  });
  log('signals/search — 200', status === 200);
  log('signals/search — results returned', body.signals?.length > 0);
  log('signals/search — signal_agent_segment_id populated', !!body.signals?.[0]?.signal_agent_segment_id);
  log('signals/search — totalCount and count consistent',
    typeof body.totalCount === 'number' && typeof body.count === 'number' && body.count <= body.totalCount);
  // destination post-filter correctness (Sec-7)
  const destFiltered = await fetchJson(`${BASE}/signals/search`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({ query: 'income', destination: 'mock_dsp', limit: 2 }),
  });
  log('signals/search — destination filter returns results', destFiltered.body.signals?.length > 0);
  log('signals/search — destination filter totalCount matches filtered set',
    destFiltered.body.signals.every(s => s.deployments?.some(d => d.platform === 'mock_dsp')),
    `destinations: ${destFiltered.body.signals.map(s => s.deployments?.map(d => d.platform).join(',')).join(' | ')}`,
  );
}

// ── NL query ──────────────────────────────────────────────────────────────────

async function checkNlQuery() {
  const cases = [
    'affluent families 35-44 who stream heavily',
    'cord cutters who watch drama in the afternoon',
    "soccer moms 35+ in Nashville who don't drink coffee",
    'graduate educated adults who are not low income',
  ];
  for (const q of cases) {
    const { status, body } = await fetchJson(`${BASE}/signals/query`, {
      method: 'POST', headers: { ...auth, ...json },
      body: JSON.stringify({ query: q, limit: 3 }),
    });
    const count = body.result?.matched_signals?.length ?? 0;
    const hasEstimate = typeof body.result?.estimated_size === 'number';
    // NLAQ returns success=true in two shapes:
    //   - Direct catalog matches (count > 0)
    //   - Dimension-resolved estimate with no exact catalog match
    //     (count=0 but estimated_size populated — valid for composite
    //     queries like "graduate educated adults who are not low income")
    // Same acceptance rule the live runner uses.
    const ok = status === 200 && body.success === true && (count > 0 || hasEstimate);
    log(
      `nl-query — "${q.slice(0, 40)}..."`,
      ok,
      count > 0 ? `${count} matches` : hasEstimate ? `estimate: ${body.result.estimated_size}` : 'empty',
    );
  }
}

// ── Concepts ──────────────────────────────────────────────────────────────────

async function checkConcepts() {
  const list = await fetchJson(`${BASE}/ucp/concepts`);
  log('concepts — list 200', list.status === 200 && list.body.concepts?.length >= 15);
  const byId = await fetchJson(`${BASE}/ucp/concepts/SOCCER_MOM_US`);
  log('concepts — get SOCCER_MOM_US', byId.status === 200 && byId.body.concept_id === 'SOCCER_MOM_US');
  const bySearch = await fetchJson(`${BASE}/ucp/concepts?q=afternoon+drama`);
  log('concepts — search', bySearch.status === 200 && bySearch.body.concepts?.length > 0);
  const seedUnauth = await fetchJson(`${BASE}/ucp/concepts/seed`, { method: 'POST' });
  log('concepts/seed — unauth 401 (Sec-5 pin)', seedUnauth.status === 401);
  const seedAuth = await fetchJson(`${BASE}/ucp/concepts/seed`, { method: 'POST', headers: auth });
  log('concepts/seed — auth 200 with env.DEMO_API_KEY', seedAuth.status === 200);
}

// ── Embeddings ───────────────────────────────────────────────────────────────

async function checkEmbeddings() {
  const { status, body } = await fetchJson(`${BASE}/signals/sig_drama_viewers/embedding`, { headers: auth });
  log('embedding — 200', status === 200);
  log('embedding — 512-dim vector', Array.isArray(body.embedding?.vector) && body.embedding.vector.length === 512);
  log('embedding — space_id openai-te3-small-d512-v1', body.embedding?.space_id === 'openai-te3-small-d512-v1');
}

// ── Activation end-to-end ────────────────────────────────────────────────────

async function checkActivation() {
  const submit = await fetchJson(`${BASE}/signals/activate`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({ signalId: 'sig_drama_viewers', destination: 'mock_dsp' }),
  });
  log('activation — submit 202 + task_id', submit.status === 202 && !!submit.body.task_id);
  const taskId = submit.body.task_id;
  await new Promise(r => setTimeout(r, 500));
  const poll1 = await fetchJson(`${BASE}/operations/${taskId}`, { headers: auth });
  log('activation — poll #1', poll1.status === 200 && ['working', 'completed'].includes(poll1.body.status));
  await new Promise(r => setTimeout(r, 500));
  const poll2 = await fetchJson(`${BASE}/operations/${taskId}`, { headers: auth });
  log('activation — poll #2 completed', poll2.status === 200 && poll2.body.status === 'completed');
  log('activation — deployments populated on completed',
    Array.isArray(poll2.body.deployments) && poll2.body.deployments.length > 0);
}

// ── MCP ───────────────────────────────────────────────────────────────────────

async function checkMcp() {
  const init = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'audit', version: '1' } } }),
  });
  log('mcp — initialize (public)', init.status === 200 && !!init.body.result?.serverInfo?.name);
  log('mcp — serverInfo.ucp.space_id matches real engine',
    init.body.result?.serverInfo?.ucp?.space_id === 'openai-te3-small-d512-v1');

  const tools = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  log('mcp — tools/list 8 tools', tools.body.result?.tools?.length === 8);
  log('mcp — every tool has outputSchema', tools.body.result?.tools?.every(t => !!t.outputSchema));

  const unauthCall = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_adcp_capabilities', arguments: {} } }),
  });
  log('mcp — tools/call unauth returns -32001', unauthCall.body.error?.code === -32001);

  const authedCall = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_adcp_capabilities', arguments: {} } }),
  });
  log('mcp — tools/call authed has structuredContent',
    !!authedCall.body.result?.structuredContent?.adcp);

  const similar = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'get_similar_signals', arguments: { signal_agent_segment_id: 'sig_drama_viewers', top_k: 3, min_similarity: 0.0 } },
    }),
  });
  log('mcp — get_similar_signals min_similarity=0 returns results',
    similar.body.result?.structuredContent?.results?.length > 0);

  const nl = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'query_signals_nl', arguments: { query: 'affluent streaming families', limit: 3 } },
    }),
  });
  log('mcp — query_signals_nl via MCP', nl.body.result?.structuredContent?.success === true);

  const concept = await fetchJson(`${BASE}/mcp`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'get_concept', arguments: { concept_id: 'SOCCER_MOM_US' } },
    }),
  });
  log('mcp — get_concept returns structuredContent',
    concept.body.result?.structuredContent?.concept_id === 'SOCCER_MOM_US');
}

// ── Security-fix probes ──────────────────────────────────────────────────────

async function checkSecurity() {
  // Sec-1: LinkedIn route gating
  const li = await Promise.all([
    fetchJson(`${BASE}/auth/linkedin/init`),
    fetchJson(`${BASE}/auth/linkedin/status`),
    fetchJson(`${BASE}/auth/linkedin/callback?state=fabricated`),
  ]);
  log('linkedin/init unauth 401', li[0].status === 401);
  log('linkedin/status unauth 401', li[1].status === 401);
  // Sec-14 changed this from 200 → 400 (caller-side bad state, not a
  // server-success). Body still contains "Invalid State" HTML for the
  // browser; status now correctly distinguishes from real 200s.
  log('linkedin/callback public + state-invalid HTML (400)',
    li[2].status === 400 && li[2].raw.includes('Invalid State'));
  const liAuth = await fetchJson(`${BASE}/auth/linkedin/status`, { headers: auth });
  log('linkedin/status authed 200', liAuth.status === 200);

  // Sec-1 B: body-size cap
  const bigBody = '"' + 'x'.repeat(1_100_000) + '"';
  const big = await fetch(`${BASE}/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bigBody,
  });
  const bigText = await big.text();
  log('mcp — >1MB body rejected (-32600)', bigText.includes('-32600'));

  // token-debug gone
  const td = await fetchJson(`${BASE}/auth/linkedin/token-debug`);
  log('token-debug — 401 (unauth path)', td.status === 401);
}

// ── CORS ──────────────────────────────────────────────────────────────────────

async function checkCors() {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    },
  });
  const allowHdr = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  log('cors — Mcp-Session-Id in allow-headers', allowHdr.includes('mcp-session-id'));
  log('cors — Authorization in allow-headers', allowHdr.includes('authorization'));
  const expose = (res.headers.get('access-control-expose-headers') ?? '').toLowerCase();
  log('cors — Mcp-Session-Id in expose-headers', expose.includes('mcp-session-id'));
}

// ── Error paths (fail loudly, don't leak) ────────────────────────────────────

async function checkErrors() {
  // Intentional posture: top-level auth gate runs BEFORE route
  // matching, so an unauth'd caller hitting an unknown path gets 401
  // (can't enumerate routes). With auth, unknown routes get a clean
  // 404 JSON. Both shapes are correct.
  const notFoundUnauth = await fetchJson(`${BASE}/does-not-exist`);
  log('error — unauth unknown path → 401 (no route enumeration)',
    notFoundUnauth.status === 401);
  const notFoundAuth = await fetchJson(`${BASE}/does-not-exist`, { headers: auth });
  log('error — authed unknown path → 404 with clean JSON',
    notFoundAuth.status === 404 && typeof notFoundAuth.body.error === 'string' && !notFoundAuth.body.error.includes('stack'));
  const badJson = await fetch(`${BASE}/signals/search`, {
    method: 'POST', headers: { ...auth, ...json }, body: 'not json',
  });
  log('error — bad JSON body returns 4xx/5xx', badJson.status >= 400);
  const activateMissing = await fetchJson(`${BASE}/signals/activate`, {
    method: 'POST', headers: { ...auth, ...json },
    body: JSON.stringify({}),
  });
  log('error — activate missing signalId returns 4xx',
    activateMissing.status >= 400 && activateMissing.status < 500);
  const opNotFound = await fetchJson(`${BASE}/operations/op_does_not_exist`, { headers: auth });
  log('error — operation not found 404', opNotFound.status === 404);
}

// ── Run ───────────────────────────────────────────────────────────────────────

(async () => {
  try {
    await checkHealth();
    await checkCapabilities();
    await checkGts();
    await checkProjector();
    await checkHandshake();
    await checkSearch();
    await checkNlQuery();
    await checkConcepts();
    await checkEmbeddings();
    await checkActivation();
    await checkMcp();
    await checkSecurity();
    await checkCors();
    await checkErrors();
  } catch (err) {
    log('audit — fatal error', false, String(err));
  }

  const fails = results.filter(r => !r.ok);
  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL: ${results.length} | PASS: ${results.length - fails.length} | FAIL: ${fails.length}`);
  if (fails.length > 0) {
    console.log('\nFAILURES:');
    for (const f of fails) console.log(`  - ${f.label}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
  }
  process.exit(0);
})();
