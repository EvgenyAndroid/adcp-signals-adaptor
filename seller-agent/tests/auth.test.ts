// Posture matrix for the fail-closed auth guard. These assertions are the
// reason the guard cannot silently regress into "open when unconfigured",
// which is what it used to do.

import { describe, it, expect } from "vitest";
import { resolveAuthPosture, isAuthed, bearerToken } from "../src/auth";
import type { Env } from "../src/env";

const GOOD_TOKEN = "a-sufficiently-long-token";

function env(overrides: Partial<Env> = {}): Env {
    return {
        ENVIRONMENT: "development",
        PUBLISHER: "Signal Ledger Media",
        AGENT_DOMAIN: "example.invalid",
        ...overrides,
    };
}

function reqWith(header?: string): Request {
    return new Request("https://example.invalid/mcp", {
        method: "POST",
        ...(header ? { headers: { Authorization: header } } : {}),
    });
}

describe("resolveAuthPosture", () => {
    it("enforces when a long-enough token is set", () => {
        expect(resolveAuthPosture(env({ ADCP_TEST_TOKEN: GOOD_TOKEN })))
            .toEqual({ mode: "enforced", token: GOOD_TOKEN });
    });

    it("refuses to serve when no token and no explicit opt-in", () => {
        const p = resolveAuthPosture(env());
        expect(p.mode).toBe("misconfigured");
    });

    it("refuses a token below the 16-char minimum", () => {
        const p = resolveAuthPosture(env({ ADCP_TEST_TOKEN: "short" }));
        expect(p.mode).toBe("misconfigured");
    });

    it("allows open mode only with the explicit dev opt-in", () => {
        expect(resolveAuthPosture(env({ ALLOW_UNAUTHENTICATED: "true" })).mode).toBe("open");
    });

    it("does NOT accept a truthy-ish opt-in other than the literal 'true'", () => {
        expect(resolveAuthPosture(env({ ALLOW_UNAUTHENTICATED: "1" })).mode).toBe("misconfigured");
        expect(resolveAuthPosture(env({ ALLOW_UNAUTHENTICATED: "yes" })).mode).toBe("misconfigured");
    });

    it("refuses the open-mode opt-in in production", () => {
        const p = resolveAuthPosture(env({
            ENVIRONMENT: "production",
            ALLOW_UNAUTHENTICATED: "true",
        }));
        expect(p.mode).toBe("misconfigured");
    });

    it("still enforces in production when the token is set", () => {
        const p = resolveAuthPosture(env({
            ENVIRONMENT: "production",
            ADCP_TEST_TOKEN: GOOD_TOKEN,
            ALLOW_UNAUTHENTICATED: "true",
        }));
        expect(p.mode).toBe("enforced");
    });

    it("treats a whitespace-only token as unset", () => {
        expect(resolveAuthPosture(env({ ADCP_TEST_TOKEN: "   " })).mode).toBe("misconfigured");
    });
});

describe("isAuthed", () => {
    const enforced = { mode: "enforced", token: GOOD_TOKEN } as const;

    it("accepts the matching bearer token", () => {
        expect(isAuthed(reqWith(`Bearer ${GOOD_TOKEN}`), enforced)).toBe(true);
    });

    it("rejects a missing header, wrong token, and wrong scheme", () => {
        expect(isAuthed(reqWith(), enforced)).toBe(false);
        expect(isAuthed(reqWith("Bearer nope-nope-nope-nope"), enforced)).toBe(false);
        expect(isAuthed(reqWith(`Basic ${GOOD_TOKEN}`), enforced)).toBe(false);
    });

    it("denies every request under a misconfigured posture", () => {
        const bad = { mode: "misconfigured", reason: "x" } as const;
        expect(isAuthed(reqWith(`Bearer ${GOOD_TOKEN}`), bad)).toBe(false);
        expect(isAuthed(reqWith(), bad)).toBe(false);
    });

    it("allows anything under open mode", () => {
        expect(isAuthed(reqWith(), { mode: "open" })).toBe(true);
    });
});

describe("bearerToken", () => {
    it("parses case-insensitively and trims", () => {
        expect(bearerToken(reqWith("bearer abc123"))).toBe("abc123");
        expect(bearerToken(reqWith("  Bearer   abc123  "))).toBe("abc123");
    });

    it("returns null when absent or malformed", () => {
        expect(bearerToken(reqWith())).toBeNull();
        expect(bearerToken(reqWith("Bearer"))).toBeNull();
    });
});
