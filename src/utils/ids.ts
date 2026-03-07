// src/utils/ids.ts

/**
 * Generate a signal ID from a human-readable slug.
 * Keeps IDs deterministic for seeded signals.
 */
export function signalIdFromSlug(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `sig_${normalized}`;
}

/**
 * Generate a deterministic dynamic signal ID from rules content.
 * Same rules always produce the same ID — ensures upsert idempotency
 * so repeated brief calls don't accumulate duplicate segments in D1.
 */
export function dynamicSignalId(prefix: string, rulesKey?: string): string {
  const slug = prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  // Deterministic suffix: hash of the rules content if provided, else random
  const suffix = rulesKey ? deterministicHash(rulesKey) : randomHex(6);
  return `sig_dyn_${slug}_${suffix}`;
}

/**
 * Compute a short deterministic hex string from a content key.
 * Uses a simple djb2-style hash — no crypto needed, just needs to be stable.
 */
function deterministicHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0").slice(0, 12);
}

/**
 * Generate a unique operation ID.
 * Uses @adcp/client createOperationId for spec-compliant format,
 * falls back to local implementation if unavailable (e.g. test env).
 */
export function operationId(): string {
  try {
    // @adcp/client is a dev dep — dynamic import guards against Worker bundle issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createOperationId } = require("@adcp/client") as { createOperationId: () => string };
    return createOperationId();
  } catch {
    return `op_${Date.now()}_${randomHex(8)}`;
  }
}

/**
 * Generate a request correlation ID for logging.
 */
export function requestId(): string {
  return `req_${Date.now()}_${randomHex(6)}`;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}