// tests/tokenCrypto.test.ts
// Sec-4: AES-GCM envelope encryption for secrets stored in KV at rest.
// Sec-9 (C): passphrases must meet a minimum length (32 chars) to ensure
// the post-SHA-256 key has enough entropy. Tests exercise both the
// happy-path (long passphrase) and the tripwire.

import { describe, it, expect } from "vitest";
import {
  encryptToken,
  decryptToken,
  isEncrypted,
  encryptIfConfigured,
  decryptIfNeeded,
  WeakPassphraseError,
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
    // Use a passphrase that ALSO meets the length floor — we want to
    // exercise AES-GCM's integrity failure, not the length tripwire.
    await expect(
      decryptToken(enc, "a-different-but-equally-long-passphrase"),
    ).rejects.toThrow();
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
    const enc = await encryptToken("x", "passphrase-meeting-the-32-char-floor");
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
  const passphrase = "config-passphrase-thirty-two-chars-long";

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
    await expect(
      decryptIfNeeded(enc, "different-passphrase-that-also-meets-min"),
    ).rejects.toThrow();
  });

  it("null/empty/undefined read returns null", async () => {
    expect(await decryptIfNeeded(null, passphrase)).toBe(null);
    expect(await decryptIfNeeded(undefined, passphrase)).toBe(null);
    expect(await decryptIfNeeded("", passphrase)).toBe(null);
  });
});

describe("passphrase length tripwire (Sec-9 C)", () => {
  it("encryptToken throws WeakPassphraseError when passphrase < 32 chars", async () => {
    await expect(encryptToken("x", "hunter2")).rejects.toBeInstanceOf(
      WeakPassphraseError,
    );
  });

  it("decryptToken throws WeakPassphraseError when passphrase < 32 chars", async () => {
    // Encrypt with a valid passphrase so we have real ciphertext on hand
    const valid = "sufficient-entropy-passphrase-32+";
    const enc = await encryptToken("payload", valid);
    await expect(decryptToken(enc, "short-key")).rejects.toBeInstanceOf(
      WeakPassphraseError,
    );
  });

  it("encryptIfConfigured refuses a short passphrase rather than silently passing through", async () => {
    // Without the tripwire this would be ambiguous — did the operator
    // intend plaintext (undefined) or did they fat-finger a short secret?
    // The length check forces the error case to be loud.
    await expect(encryptIfConfigured("token", "too-short")).rejects.toBeInstanceOf(
      WeakPassphraseError,
    );
  });

  it("decryptIfNeeded raises on a short passphrase against an encrypted value", async () => {
    const valid = "sufficient-entropy-passphrase-32+";
    const enc = await encryptToken("t", valid);
    await expect(decryptIfNeeded(enc, "short")).rejects.toBeInstanceOf(
      WeakPassphraseError,
    );
  });

  it("decryptIfNeeded passes plaintext through even when the passphrase is too short", async () => {
    // The length check is about KEY strength for encrypt/decrypt, not
    // plaintext round-tripping. A legacy plaintext value should still be
    // readable regardless of what operator-provided passphrase is set.
    const out = await decryptIfNeeded("legacy-plaintext", "short");
    expect(out).toBe("legacy-plaintext");
  });

  it("accepts exactly 32 chars (boundary)", async () => {
    const exactly32 = "a".repeat(32);
    const enc = await encryptToken("boundary-test", exactly32);
    expect(await decryptToken(enc, exactly32)).toBe("boundary-test");
  });

  it("rejects exactly 31 chars (boundary minus one)", async () => {
    const short = "a".repeat(31);
    await expect(encryptToken("b", short)).rejects.toBeInstanceOf(
      WeakPassphraseError,
    );
  });

  it("error message cites the actual length and the fix", async () => {
    try {
      await encryptToken("x", "ten-chars!");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WeakPassphraseError);
      const message = (err as Error).message;
      expect(message).toMatch(/10 chars/);
      expect(message).toMatch(/at least 32/);
      expect(message).toMatch(/openssl rand -base64 24/);
    }
  });
});
