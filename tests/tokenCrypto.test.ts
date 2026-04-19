// tests/tokenCrypto.test.ts
// Sec-4: AES-GCM envelope encryption for secrets stored in KV at rest.

import { describe, it, expect } from "vitest";
import {
  encryptToken,
  decryptToken,
  isEncrypted,
  encryptIfConfigured,
  decryptIfNeeded,
} from "../src/utils/tokenCrypto";

describe("tokenCrypto round-trip", () => {
  const passphrase = "demo-passphrase-not-a-production-value";

  it("encrypts and decrypts a string correctly", async () => {
    const enc = await encryptToken("hello world", passphrase);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    const dec = await decryptToken(enc, passphrase);
    expect(dec).toBe("hello world");
  });

  it("produces different ciphertext each call (fresh IV)", async () => {
    const a = await encryptToken("same plaintext", passphrase);
    const b = await encryptToken("same plaintext", passphrase);
    expect(a).not.toBe(b);
    // …but both decrypt to the same value
    expect(await decryptToken(a, passphrase)).toBe("same plaintext");
    expect(await decryptToken(b, passphrase)).toBe("same plaintext");
  });

  it("decrypt with wrong passphrase throws (auth tag fails)", async () => {
    const enc = await encryptToken("secret", passphrase);
    await expect(decryptToken(enc, "wrong-passphrase")).rejects.toThrow();
  });

  it("tampering the ciphertext throws on decrypt (integrity check)", async () => {
    const enc = await encryptToken("secret", passphrase);
    // Flip a byte in the middle of the base64url payload.
    const body = enc.slice("enc:v1:".length);
    const flipIdx = Math.floor(body.length / 2);
    const flipped =
      body.slice(0, flipIdx) +
      (body[flipIdx] === "A" ? "B" : "A") +
      body.slice(flipIdx + 1);
    await expect(decryptToken("enc:v1:" + flipped, passphrase)).rejects.toThrow();
  });

  it("handles long tokens (LinkedIn access tokens are ~400 chars)", async () => {
    const long = "A".repeat(512);
    const enc = await encryptToken(long, passphrase);
    const dec = await decryptToken(enc, passphrase);
    expect(dec).toBe(long);
    expect(dec.length).toBe(512);
  });

  it("handles unicode cleanly", async () => {
    const input = "grüße — 日本語 — 🎯";
    const enc = await encryptToken(input, passphrase);
    expect(await decryptToken(enc, passphrase)).toBe(input);
  });

  it("rejects non-enc prefix on decrypt", async () => {
    await expect(decryptToken("plaintext-lookalike", passphrase)).rejects.toThrow(
      /not enc:v1:/,
    );
  });

  it("rejects truncated payload", async () => {
    await expect(decryptToken("enc:v1:AA", passphrase)).rejects.toThrow(/truncated/);
  });
});

describe("isEncrypted", () => {
  it("true for enc:v1: prefixed values", async () => {
    const enc = await encryptToken("x", "p");
    expect(isEncrypted(enc)).toBe(true);
  });

  it("false for plaintext", () => {
    expect(isEncrypted("AQW12345-plain-linkedin-access-token")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it("false for a near-match prefix (case-sensitive / version-sensitive)", () => {
    expect(isEncrypted("ENC:V1:abc")).toBe(false);
    expect(isEncrypted("enc:v2:abc")).toBe(false);
  });
});

describe("encryptIfConfigured / decryptIfNeeded (opt-in wrappers)", () => {
  const passphrase = "config-passphrase";

  it("no passphrase ⇒ pass-through plaintext on write", async () => {
    const out = await encryptIfConfigured("raw-token", undefined);
    expect(out).toBe("raw-token");
    expect(isEncrypted(out)).toBe(false);
  });

  it("passphrase ⇒ encrypts on write", async () => {
    const out = await encryptIfConfigured("raw-token", passphrase);
    expect(isEncrypted(out)).toBe(true);
    expect(await decryptToken(out, passphrase)).toBe("raw-token");
  });

  it("read plaintext returns it unchanged (legacy migration)", async () => {
    const out = await decryptIfNeeded("legacy-plaintext-token", passphrase);
    expect(out).toBe("legacy-plaintext-token");
  });

  it("read plaintext without a passphrase returns it unchanged", async () => {
    const out = await decryptIfNeeded("legacy-plaintext-token", undefined);
    expect(out).toBe("legacy-plaintext-token");
  });

  it("read encrypted value with no passphrase configured throws", async () => {
    const enc = await encryptToken("x", passphrase);
    await expect(decryptIfNeeded(enc, undefined)).rejects.toThrow(
      /encrypted but TOKEN_ENCRYPTION_KEY is not configured/,
    );
  });

  it("read encrypted with wrong passphrase throws (via AES-GCM)", async () => {
    const enc = await encryptToken("x", passphrase);
    await expect(decryptIfNeeded(enc, "other")).rejects.toThrow();
  });

  it("null/empty/undefined read returns null", async () => {
    expect(await decryptIfNeeded(null, passphrase)).toBe(null);
    expect(await decryptIfNeeded(undefined, passphrase)).toBe(null);
    expect(await decryptIfNeeded("", passphrase)).toBe(null);
  });
});
