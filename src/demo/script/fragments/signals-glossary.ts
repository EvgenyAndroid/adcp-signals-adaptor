// src/demo/script/fragments/signals-glossary.ts
//
// Marketing-speak ↔ AdCP Signals protocol Rosetta Stone. Used by the
// shared signals-trace-viewer to annotate JSON fields with their
// human-readable meaning, and rendered as an expandable Glossary
// section at the bottom of the viewer modal.
//
// Source range (in pre-refactor): n/a — new module.
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith via the snapshot test.
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and ${...} inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.

export const signalsGlossaryJs = `
// SIGNALS_GLOSSARY: maps protocol field names → marketing concept + note.
// Lookup is by leaf key only (not full JSON path) — same field name
// on different schemas almost always means the same thing for our
// audience.
const SIGNALS_GLOSSARY = {
  signal_agent_segment_id:    { label: "Target audience",     note: "the signal you'll activate" },
  signal_id:                  { label: "Signal identifier",   note: "discriminated by source: catalog vs agent-native" },
  data_provider:              { label: "Data provider",       note: "human-readable owner of the signal" },
  data_provider_domain:       { label: "Data provider",       note: "domain that publishes adagents.json (e.g. experian.com)" },
  source:                     { label: "Signal source",       note: "catalog (verifiable) or agent (agent-native)" },
  signal_type:                { label: "Catalog type",        note: "owned / marketplace / custom" },
  signal_spec:                { label: "Audience brief",      note: "natural-language description of the desired signal" },
  signal_ids:                 { label: "Signal lookup",       note: "specific signals to fetch by ID" },
  coverage_percentage:        { label: "Audience size",       note: "% of addressable universe covered" },
  estimated_audience_size:    { label: "Audience size (abs)", note: "absolute reach number" },
  pricing_options:            { label: "Data cost",           note: "CPM / flat / revenue share — buyer picks one" },
  pricing_option_id:          { label: "Selected price",      note: "the pricing the buyer committed to" },
  destinations:               { label: "Activate on my DSP",  note: "platform or agent target(s)" },
  deployments:                { label: "Where activated",     note: "per-platform/per-agent deployment records" },
  activation_key:             { label: "Targeting key",       note: "segment_id / key_value the DSP uses for targeting" },
  is_live:                    { label: "Activation live",     note: "true once segment is propagated to the destination" },
  estimated_activation_duration_minutes: { label: "Activation ETA", note: "expected time until is_live: true" },
  idempotency_key:            { label: "Idempotency key",     note: "prevents duplicate activations on retries" },
  task_id:                    { label: "Async task id",       note: "poll get_operation_status to track progress" },
  status:                     { label: "Task status",         note: "submitted / working / completed / failed / etc." },
  context:                    { label: "Correlation context", note: "opaque round-tripped — used for tracing" },
  correlation_id:             { label: "Correlation id",      note: "ties request + response together for audit" },
  pagination:                 { label: "Pagination",          note: "max_results + cursor for page walks" },
  filters:                    { label: "Discovery filters",   note: "category / max_cpm / min_coverage / etc." },
  countries:                  { label: "Geo filter",          note: "ISO codes — where the signal will be used" },
  ext:                        { label: "Extension data",      note: "vendor-specific extras (additionalProperties)" },
  // Adagents.json / signal catalog
  adcp:                       { label: "Protocol metadata",   note: "AdCP version + idempotency support" },
  supported_protocols:        { label: "Protocol surfaces",   note: "signals / media-buy / governance / etc." },
  specialisms:                { label: "Specialisms",         note: "fine-grained roles (signal-owned / signal-marketplace)" },
};

function lookupGlossary(key) {
  return SIGNALS_GLOSSARY[key] || null;
}

// Rosetta-style field annotation: returns "fieldName" + small italic
// "Marketing label · note" if the key is in the glossary, else
// just the field name. Used inline by the trace viewer's JSON
// formatter.
function annotateGlossaryField(key) {
  const g = lookupGlossary(key);
  if (!g) return null;
  return g;
}
`;
