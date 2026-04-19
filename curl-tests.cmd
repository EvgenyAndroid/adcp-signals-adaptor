:: ============================================================
:: AdCP Signals Adaptor — Windows curl test commands
:: Base URL: https://adcp-signals-adaptor.evgeny-193.workers.dev
::
:: Usage:
::   set DEMO_API_KEY=<the-key-you-provisioned-via-wrangler-secret>
::   curl-tests.cmd
::
:: The API key is a Worker secret. Export it into this shell before
:: running any of the gated calls below. Do NOT hardcode it here —
:: prior revisions shipped the value in-tree, which made the "secret"
:: effectively public.
:: ============================================================


:: ── SYSTEM ───────────────────────────────────────────────────

:: Health check
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/health

:: Capabilities (includes full UCP block with GTS + projector)
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/capabilities


:: ── UCP PHASE 1 — HANDSHAKE SIMULATOR (public) ───────────────

:: Direct match (buyer speaks same space as seller)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake -H "Content-Type: application/json" -d "{\"buyer_space_ids\":[\"openai-te3-small-d512-v1\"],\"buyer_ucp_version\":\"ucp-v1\"}"

:: Projector required (buyer speaks different model)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake -H "Content-Type: application/json" -d "{\"buyer_space_ids\":[\"bert-base-uncased-v1\"],\"buyer_ucp_version\":\"ucp-v1\"}"

:: Legacy fallback (incompatible UCP version)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake -H "Content-Type: application/json" -d "{\"buyer_space_ids\":[],\"buyer_ucp_version\":\"ucp-v0\"}"

:: Multiple spaces — seller space included, should direct_match
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/simulate-handshake -H "Content-Type: application/json" -d "{\"buyer_space_ids\":[\"bert-base-uncased-v1\",\"openai-te3-small-d512-v1\"],\"buyer_ucp_version\":\"ucp-v1\",\"buyer_agent_id\":\"test-buyer-agent\"}"


:: ── UCP PHASE 2b — GTS (public) ──────────────────────────────

:: Full GTS results
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/gts

:: ── UCP PHASE 2b — PROJECTOR (auth required) ────────────────

:: Projector matrix (512x512 — large response)
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/projector -H "Authorization: Bearer %DEMO_API_KEY%"


:: ── SIGNALS — SEARCH (auth required) ─────────────────────────

:: Search by brief
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"query\":\"high income households\",\"limit\":5}"

:: Search by category
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/search -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"categoryType\":\"demographic\",\"limit\":10}"


:: ── SIGNALS — NL QUERY (auth required) ───────────────────────

:: Simple query — should hit medium confidence
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/query -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"query\":\"affluent families 35-44 who stream heavily\",\"limit\":5}"

:: Archetype query — cord_cutter
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/query -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"query\":\"streaming heavy watchers cord cutters\",\"limit\":5}"

:: Complex query — multiple dimensions, expect narrow tier
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/query -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"query\":\"soccer moms 35+ in Nashville who don't drink coffee but watch Desperate Housewives in the afternoon\",\"limit\":10}"

:: Negation query
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/query -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"query\":\"graduate educated adults who are not low income\",\"limit\":5}"


:: ── EMBEDDINGS (auth required) ────────────────────────────────

:: Real v1 vector — drama viewers
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/sig_drama_viewers/embedding -H "Authorization: Bearer %DEMO_API_KEY%"

:: Real v1 vector — high income
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/sig_high_income_households/embedding -H "Authorization: Bearer %DEMO_API_KEY%"

:: Pseudo-v1 fallback — dynamic signal (will return pseudo-v1 phase)
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/sig_dyn_high_income_150k_70ea9fdf/embedding -H "Authorization: Bearer %DEMO_API_KEY%"


:: ── CONCEPT REGISTRY (public) ────────────────────────────────

:: List all concepts
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts

:: Exact lookup — Soccer Mom archetype
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts/SOCCER_MOM_US

:: Exact lookup — Auto Purchase Intent
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts/AUTO_PURCHASE_INTENT_US

:: Semantic search
curl "https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts?q=afternoon+drama"

:: Filter by category
curl "https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts?category=archetype"

:: Filter by purchase intent
curl "https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts?category=purchase_intent"

:: Seed concept registry (auth required)
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/ucp/concepts/seed -H "Authorization: Bearer %DEMO_API_KEY%"


:: ── ACTIVATION (auth required) ────────────────────────────────

:: Activate a signal
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/signals/activate -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"signalId\":\"sig_drama_viewers\",\"destination\":\"mock_dsp\"}"

:: Poll activation status (replace TASK_ID with value from activate response)
curl https://adcp-signals-adaptor.evgeny-193.workers.dev/operations/TASK_ID -H "Authorization: Bearer %DEMO_API_KEY%"


:: ── MCP (public) ──────────────────────────────────────────────

:: MCP initialize — see full serverInfo.ucp with GTS + projector advertised
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}}}"

:: MCP tools/list — see all 8 tools
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}"

:: MCP get_adcp_capabilities
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"get_adcp_capabilities\",\"arguments\":{}}}"

:: MCP query_signals_nl
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Authorization: Bearer %DEMO_API_KEY%" -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"query_signals_nl\",\"arguments\":{\"query\":\"affluent streaming families\",\"limit\":5}}}"

:: MCP get_concept
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"get_concept\",\"arguments\":{\"concept_id\":\"SOCCER_MOM_US\"}}}"

:: MCP search_concepts
curl -X POST https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"search_concepts\",\"arguments\":{\"q\":\"high income household\",\"limit\":5}}}"
