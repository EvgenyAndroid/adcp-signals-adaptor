#!/usr/bin/env bash
# scripts/test-live.sh
# End-to-end live API tests for the AdCP Signals Adaptor.
# Mirrors curl-tests.cmd but runs each call and checks HTTP status + response shape.
#
# Usage:
#   npm run test:live
#   BASE=https://staging.example.workers.dev API_KEY=xxx npm run test:live
#
# Exit code: 0 on all-pass, 1 on any failure.

set -u

BASE="${BASE:-https://adcp-signals-adaptor.evgeny-193.workers.dev}"
KEY="${API_KEY:-demo-key-adcp-signals-v1}"

PASS=0
FAIL=0
FAILS=()

# Pipe response body via stdin to node so large bodies (e.g. 3MB projector
# matrix) don't blow argv limits. The check expression is evaluated against
# `b` (parsed JSON body).
check_shape() {
  local check="$1" body="$2"
  printf '%s' "$body" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c).on('end',()=>{
      let b;
      try { b = JSON.parse(d); }
      catch(e) { console.log('NOTJSON:'+e.message); process.exit(0); }
      try {
        const ok = ($check);
        console.log(ok ? 'OK' : 'BADSHAPE');
      } catch(e) { console.log('CHECKERR:'+e.message); }
    });
  " 2>&1
}

# Args: label, expected_status, node_check (or "" to skip shape), curl_args...
run() {
  local label="$1" expected="$2" check="$3"
  shift 3
  local out status body
  out=$(curl -s -w "\n%{http_code}" "$@" 2>&1)
  status=$(printf '%s' "$out" | tail -n 1)
  body=$(printf '%s' "$out" | sed '$d')

  local grade="PASS" detail=""
  if [ "$status" != "$expected" ]; then
    grade="FAIL"; detail="http=$status want=$expected"
    FAIL=$((FAIL + 1)); FAILS+=("$label  ($detail)")
  elif [ -n "$check" ]; then
    local node_out
    node_out=$(check_shape "$check" "$body")
    if [ "$node_out" = "OK" ]; then
      PASS=$((PASS + 1))
    else
      grade="FAIL"; detail="$node_out"
      FAIL=$((FAIL + 1)); FAILS+=("$label  ($detail)")
    fi
  else
    PASS=$((PASS + 1))
  fi

  local preview
  preview=$(printf '%s' "$body" | head -c 88 | tr '\n' ' ')
  printf '%-4s %-46s http=%-3s  %s\n' "$grade" "$label" "$status" "$preview"
}

echo "Target: $BASE"
echo ""
echo "=== SYSTEM ==="
run "health"                          200 'b.status==="ok"'                                                      "$BASE/health"
run "capabilities unfiltered"         200 'b.adcp && Array.isArray(b.adcp.major_versions) && b.ext && b.ext.ucp' "$BASE/capabilities"
run "capabilities ?protocols=signals" 200 'b.signals && b.ext && b.ext.ucp && !("media_buy" in b)'               "$BASE/capabilities?protocols=signals"
run "capabilities ?protocol=signals (singular alias)" 200 'b.signals && b.ext && b.ext.ucp && !("media_buy" in b)' "$BASE/capabilities?protocol=signals"
run "capabilities has adcp.idempotency.replay_ttl_seconds (HEAD schema)" 200 'b.adcp.idempotency && typeof b.adcp.idempotency.replay_ttl_seconds==="number" && b.adcp.idempotency.replay_ttl_seconds>=3600 && b.adcp.idempotency.replay_ttl_seconds<=604800' "$BASE/capabilities"
run "capabilities echoes ?correlation_id=" 200 'b.context && b.context.correlation_id==="test-corr-abc"' "$BASE/capabilities?correlation_id=test-corr-abc"

echo ""
echo "=== UCP HANDSHAKE ==="
run "handshake: direct_match"   200 'b.outcome==="direct_match"'        -X POST "$BASE/ucp/simulate-handshake" -H "Content-Type: application/json" -d '{"buyer_space_ids":["openai-te3-small-d512-v1"],"buyer_ucp_version":"ucp-v1"}'
run "handshake: projector_req"  200 'b.outcome==="projector_required"'  -X POST "$BASE/ucp/simulate-handshake" -H "Content-Type: application/json" -d '{"buyer_space_ids":["bert-base-uncased-v1"],"buyer_ucp_version":"ucp-v1"}'
run "handshake: legacy_fallbk"  200 'b.outcome==="legacy_fallback"'     -X POST "$BASE/ucp/simulate-handshake" -H "Content-Type: application/json" -d '{"buyer_space_ids":[],"buyer_ucp_version":"ucp-v0"}'
run "handshake: multi-space"    200 'b.outcome==="direct_match"'        -X POST "$BASE/ucp/simulate-handshake" -H "Content-Type: application/json" -d '{"buyer_space_ids":["bert-base-uncased-v1","openai-te3-small-d512-v1"],"buyer_ucp_version":"ucp-v1","buyer_agent_id":"test-buyer-agent"}'

echo ""
echo "=== UCP GTS + PROJECTOR ==="
run "gts (public)"                       200 'b.gts_version && Array.isArray(b.pairs) && b.pairs.length>0'  "$BASE/ucp/gts"
run "projector no-auth (rejects)"        401 ''                                                             "$BASE/ucp/projector"
run "projector with-auth"                200 'b.from_space && b.to_space && Array.isArray(b.matrix) && b.matrix.length===512' -H "Authorization: Bearer $KEY" "$BASE/ucp/projector"

echo ""
echo "=== SIGNALS SEARCH ==="
run "search: query=high income" 200 'Array.isArray(b.signals) && typeof b.count==="number"' -X POST "$BASE/signals/search" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"query":"high income households","limit":5}'
run "search: categoryType=demo" 200 'Array.isArray(b.signals) && b.signals.length>=1'       -X POST "$BASE/signals/search" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"categoryType":"demographic","limit":10}'

echo ""
echo "=== NL QUERY ==="
NL_CHECK='b.success===true && b.result && (b.result.matched_signals || b.result.estimated_size!==undefined)'
run "nl: affluent streaming"    200 "$NL_CHECK"  -X POST "$BASE/signals/query" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"query":"affluent families 35-44 who stream heavily","limit":5}'
run "nl: cord cutters"          200 "$NL_CHECK"  -X POST "$BASE/signals/query" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"query":"streaming heavy watchers cord cutters","limit":5}'
run "nl: complex Nashville"     200 "$NL_CHECK"  -X POST "$BASE/signals/query" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"query":"soccer moms 35+ in Nashville who don'"'"'t drink coffee but watch Desperate Housewives in the afternoon","limit":10}'
run "nl: negation"              200 "$NL_CHECK"  -X POST "$BASE/signals/query" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"query":"graduate educated adults who are not low income","limit":5}'

echo ""
echo "=== EMBEDDINGS ==="
EMB_CHECK='b.signal_agent_segment_id && b.embedding && (Array.isArray(b.embedding.vector) ? b.embedding.vector.length===512 : (b.embedding.dimensions===512 || typeof b.embedding.model_id==="string"))'
run "embed: sig_drama_viewers"  200 "$EMB_CHECK"  -H "Authorization: Bearer $KEY" "$BASE/signals/sig_drama_viewers/embedding"
run "embed: sig_high_income"    200 "$EMB_CHECK"  -H "Authorization: Bearer $KEY" "$BASE/signals/sig_high_income_households/embedding"
run "embed: dyn signal"         200 "$EMB_CHECK"  -H "Authorization: Bearer $KEY" "$BASE/signals/sig_dyn_high_income_150k_70ea9fdf/embedding"

echo ""
echo "=== CONCEPTS ==="
run "concepts: list"                   200 'Array.isArray(b.concepts) && b.concepts.length>=15'  "$BASE/ucp/concepts"
run "concepts: SOCCER_MOM_US"          200 'b.concept_id==="SOCCER_MOM_US"'                      "$BASE/ucp/concepts/SOCCER_MOM_US"
run "concepts: AUTO_PURCHASE_INTENT"   200 'b.concept_id==="AUTO_PURCHASE_INTENT_US"'            "$BASE/ucp/concepts/AUTO_PURCHASE_INTENT_US"
run "concepts: q=afternoon drama"      200 'Array.isArray(b.concepts) && b.concepts.length>0'    "$BASE/ucp/concepts?q=afternoon+drama"
run "concepts: cat=archetype"          200 'Array.isArray(b.concepts) && b.concepts.length>0'    "$BASE/ucp/concepts?category=archetype"
run "concepts: cat=purchase_intent"    200 'Array.isArray(b.concepts) && b.concepts.length>0'    "$BASE/ucp/concepts?category=purchase_intent"
run "concepts: seed (auth)"            200 'typeof b.seeded==="number"' -X POST -H "Authorization: Bearer $KEY" "$BASE/ucp/concepts/seed"

echo ""
echo "=== ACTIVATION (end-to-end) ==="
ACT_BODY=$(curl -s -X POST "$BASE/signals/activate" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"signalId":"sig_drama_viewers","destination":"mock_dsp"}')
ACT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/signals/activate" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"signalId":"sig_drama_viewers","destination":"mock_dsp"}')
TASK=$(printf '%s' "$ACT_BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).task_id||'');}catch{}});")
if [ "$ACT_STATUS" = "202" ] && [ -n "$TASK" ]; then
  PASS=$((PASS + 1)); printf 'PASS %-46s http=%-3s  task_id=%s\n' "activate: drama -> mock_dsp" "$ACT_STATUS" "$TASK"
  run "operations: poll (->completed)"  200 'b.status==="completed" || b.status==="working" || b.status==="submitted"' -H "Authorization: Bearer $KEY" "$BASE/operations/$TASK"
else
  FAIL=$((FAIL + 1)); FAILS+=("activate: drama -> mock_dsp")
  printf 'FAIL %-46s http=%-3s  body=%s\n' "activate: drama -> mock_dsp" "$ACT_STATUS" "$(printf '%s' "$ACT_BODY" | head -c 100)"
fi

echo ""
echo "=== MCP ==="
run "mcp: initialize"                                  200 'b.result && b.result.serverInfo && b.result.serverInfo.name'           -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0"}}}'
run "mcp: tools/list (8 tools w/ outputSchema)"        200 'b.result.tools.length===8 && b.result.tools.every(t=>!!t.outputSchema)' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
run "mcp: get_adcp_capabilities (structuredContent)"   200 'b.result.structuredContent && b.result.structuredContent.adcp && Array.isArray(b.result.structuredContent.adcp.major_versions)' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_adcp_capabilities","arguments":{}}}'
run "mcp: get_adcp_capabilities (protocols filter)"    200 'b.result.structuredContent.signals && !("media_buy" in b.result.structuredContent)' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_adcp_capabilities","arguments":{"protocols":["signals"]}}}'
# Discriminating test: pass `protocol: "media_buy"` (which we don't declare).
# With singular alias working, response should NOT include `signals`. Without
# the alias, the singular `protocol` arg is ignored and the unfiltered response
# (which DOES include `signals`) is returned.
run "mcp: get_adcp_capabilities (singular protocol alias actually filters)" 200 '!("signals" in b.result.structuredContent)' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_adcp_capabilities","arguments":{"protocol":"media_buy"}}}'
run "mcp: get_adcp_capabilities idempotency block (HEAD schema req)" 200 'b.result.structuredContent.adcp.idempotency && b.result.structuredContent.adcp.idempotency.replay_ttl_seconds>=3600' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_adcp_capabilities","arguments":{}}}'
run "mcp: get_adcp_capabilities echoes context.correlation_id" 200 'b.result.structuredContent.context && b.result.structuredContent.context.correlation_id==="probe-xyz-123"' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_adcp_capabilities","arguments":{"context":{"correlation_id":"probe-xyz-123"}}}}'
run "mcp: query_signals_nl (structuredContent)"        200 'b.result.structuredContent'  -X POST "$BASE/mcp" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"query_signals_nl","arguments":{"query":"affluent streaming families","limit":5}}}'
run "mcp: get_concept (structuredContent)"             200 'b.result.structuredContent && b.result.structuredContent.concept_id==="SOCCER_MOM_US"' -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_concept","arguments":{"concept_id":"SOCCER_MOM_US"}}}'
run "mcp: get_similar_signals (was dead, now wired)" 200 'b.result.structuredContent && b.result.structuredContent.reference_signal_id==="sig_drama_viewers" && Array.isArray(b.result.structuredContent.results)' -X POST "$BASE/mcp" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_similar_signals","arguments":{"signal_agent_segment_id":"sig_drama_viewers","top_k":3,"min_similarity":0.0}}}'
# min_similarity:0 must return results. The bug fix replaces the prior
# `args["min_similarity"] ? ...` truthy check that treated literal 0 as
# missing and silently substituted 0.7 — filtering every candidate out.
run "mcp: get_similar_signals min_similarity=0 returns >0 results" 200 'b.result.structuredContent.results.length>0' -X POST "$BASE/mcp" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_similar_signals","arguments":{"signal_agent_segment_id":"sig_drama_viewers","top_k":5,"min_similarity":0.0}}}'
run "mcp: search_concepts (structuredContent)"         200 'b.result.structuredContent && Array.isArray(b.result.structuredContent.results)'      -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"search_concepts","arguments":{"q":"high income household","limit":5}}}'

echo ""
echo "=== CORS preflight (browser MCP clients) ==="
PRE=$(curl -s -i -X OPTIONS "$BASE/mcp" -H "Origin: https://example.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type, Authorization, Mcp-Session-Id")
PRE_STATUS=$(printf '%s' "$PRE" | head -n 1 | tr -d '\r')
PRE_HEADERS=$(printf '%s' "$PRE" | tr -d '\r' | grep -i '^access-control-allow-headers:' | tr 'A-Z' 'a-z')
if echo "$PRE_HEADERS" | grep -q 'mcp-session-id'; then
  PASS=$((PASS + 1)); printf 'PASS %-46s %s\n' "preflight allows Mcp-Session-Id" "$PRE_STATUS"
else
  FAIL=$((FAIL + 1)); FAILS+=("preflight allows Mcp-Session-Id")
  printf 'FAIL %-46s %s\n' "preflight allows Mcp-Session-Id" "($PRE_HEADERS)"
fi

echo ""
echo "=== AUTH SURFACE ==="
run "token-debug should be gone"        401 ''   "$BASE/auth/linkedin/token-debug"
run "OAuth callback fabricated state"   200 ''   "$BASE/auth/linkedin/callback?state=fabricated"

echo ""
echo "=================================================="
echo "  PASS=$PASS  FAIL=$FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "  Failures:"
  for f in "${FAILS[@]}"; do
    echo "    - $f"
  done
  exit 1
fi
echo "=================================================="
exit 0
