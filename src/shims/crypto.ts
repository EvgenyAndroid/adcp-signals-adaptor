// src/shims/crypto.ts
//
// workerd ES256 VERIFY SHIM — built 2026-10-10. Bundled in place of the bare
// `crypto` module by wrangler.toml `[alias] "crypto"`; everything is
// node:crypto unchanged except `verify`.
//
// Why it exists: the @adcp/sdk 13.1.3 request verifier used by
// src/domain/requestSigning.ts verifies synchronously through node:crypto,
// and for ES256 it calls
//
//   verify("sha256", data, { key: <KeyObject>, dsaEncoding: "ieee-p1363" }, sig)
//
// workerd's node:crypto (nodejs_compat, already on) rejects that key shape
// with a TypeError, which the SDK swallows into `false` — every valid ES256
// signature would read request_signature_invalid, and the conformance runner
// signs with an ES256 key. workerd does accept a bare KeyObject with a
// DER-encoded signature, so P1363 (r||s) is converted to DER here and the
// key is passed directly. Node accepts the SDK's original shape, so vitest
// never needs this; tests/request-signing.test.ts checks the conversion.
//
// src/domain/webhookSigning.ts deliberately signs with WebCrypto
// (crypto.subtle, the global — not this module) and keeps node:crypto out
// of our own code. This shim exists only because the SDK verifier verifies
// synchronously through node:crypto. Only the synchronous four-argument
// form is provided: the SDK's signing/crypto module is the one importer of
// `verify` from "crypto". Delete this file and the alias once the SDK passes
// workerd a call shape it accepts.

import * as nodeCrypto from "node:crypto";

export * from "node:crypto";
export default nodeCrypto;

/** IEEE P1363 (r||s) ECDSA signature → ASN.1 DER SEQUENCE { INTEGER r, INTEGER s }. */
function p1363ToDer(sig: Uint8Array): Uint8Array {
  const half = sig.length / 2;
  const derInt = (bytes: Uint8Array): number[] => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    const v = [...bytes.subarray(i)];
    if ((v[0] ?? 0) & 0x80) v.unshift(0);
    return [0x02, v.length, ...v];
  };
  const r = derInt(sig.subarray(0, half));
  const s = derInt(sig.subarray(half));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
}

export function verify(
  algorithm: string | null | undefined,
  data: NodeJS.ArrayBufferView,
  key: Parameters<typeof nodeCrypto.verify>[2],
  signature: NodeJS.ArrayBufferView,
): boolean {
  if (
    typeof key === "object" && key !== null && "dsaEncoding" in key && key.dsaEncoding === "ieee-p1363" &&
    "key" in key && key.key instanceof nodeCrypto.KeyObject
  ) {
    const raw = new Uint8Array(signature.buffer, signature.byteOffset, signature.byteLength);
    return nodeCrypto.verify(algorithm, data, key.key, p1363ToDer(raw));
  }
  return nodeCrypto.verify(algorithm, data, key, signature);
}
