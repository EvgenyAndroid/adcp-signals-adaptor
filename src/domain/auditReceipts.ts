// src/domain/auditReceipts.ts
//
// Wave 6 (Race Canvas) — audit receipts for vendor calls.
//
// Each agent call in the race emits a receipt: a small, deterministic,
// inspectable record of what we asked, what came back, how long it took,
// and a content digest for replay verification.
//
// Why this matters for the workshop:
//   - The governance-flavored audience pushes back on multi-agent
//     orchestration with "isn't this a black box?" The receipt stack is
//     the answer — every agent call has a paper trail with hashes.
//   - Connects AdCP's `idempotency_key` story (HEAD-spec) to a visible
//     artifact. The same idempotency key would replay safely; the digest
//     proves the response payload is the one we got.
//   - The receipt is shown in real-time in the right sidebar of the
//     Race Canvas. Clicking a receipt opens a modal with full input/output.
//
// Hash algorithm: FNV-1a (32-bit). Same as our HEAD-spec idempotency
// implementation. NOT cryptographically secure — fine for replay
// verification, NOT for tamper resistance. Real audit trails would use
// SHA-256 + a signature; the workshop demo uses the cheaper hash for
// determinism and zero-dep portability.

export interface AuditReceipt {
  receipt_id: string;
  ts: string;
  vendor_id: string;
  vendor_name: string;
  /** Tool/action invoked, e.g. "get_signals" / "synthesize_audience_size". */
  action: string;
  /** Hex of FNV-1a over the canonicalized input args. */
  input_hash: string;
  /** Hex of FNV-1a over the canonicalized output content. */
  output_digest: string;
  /** Stable replay key. Same input + same vendor → same key. */
  idempotency_key: string;
  latency_ms: number;
  /** True if the input/output round-trip is consistent. Always true for
   * synthesized vendors; for live calls this is a future hook. */
  verified: boolean;
  /** Optional — the raw input + output for the modal click-through. */
  inspect?: { input: unknown; output: unknown };
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function fnv1aHex(s: string): string {
  return fnv1a(s).toString(16).padStart(8, "0");
}

/**
 * Canonicalize an object for hashing. Sorts keys recursively so equivalent
 * objects always produce the same JSON string regardless of insertion order.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k]));
    return "{" + parts.join(",") + "}";
  }
  return JSON.stringify(value);
}

export interface BuildReceiptInput {
  vendor_id: string;
  vendor_name: string;
  action: string;
  input: unknown;
  output: unknown;
  latency_ms: number;
  /** Optional — if omitted, derived from input+vendor for replay determinism. */
  idempotency_key?: string;
  /** If false, omits the inspect blob (smaller payload). Default true. */
  include_inspect?: boolean;
}

let _receiptCounter = 0;

export function buildReceipt(args: BuildReceiptInput): AuditReceipt {
  _receiptCounter++;
  const ts = new Date().toISOString();
  const inputCanon = canonicalize(args.input);
  const outputCanon = canonicalize(args.output);
  const input_hash = fnv1aHex(inputCanon);
  const output_digest = fnv1aHex(outputCanon);
  const idempotency_key = args.idempotency_key
    ?? fnv1aHex(args.vendor_id + "::" + args.action + "::" + input_hash);

  const receipt: AuditReceipt = {
    receipt_id: "rcpt_" + ts.replace(/[^0-9]/g, "").slice(0, 14) + "_" + _receiptCounter.toString(36),
    ts,
    vendor_id: args.vendor_id,
    vendor_name: args.vendor_name,
    action: args.action,
    input_hash,
    output_digest,
    idempotency_key,
    latency_ms: args.latency_ms,
    verified: true,
  };
  if (args.include_inspect !== false) {
    receipt.inspect = { input: args.input, output: args.output };
  }
  return receipt;
}
