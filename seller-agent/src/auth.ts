// RFC 6750 Bearer-token check, with a fail-CLOSED posture.
//
// The earlier version treated a missing ADCP_TEST_TOKEN as "open mode" so
// local dev was frictionless. That is a deploy footgun: `npm run deploy`
// without provisioning the secret would publish create_media_buy and
// get_media_buy_delivery to the internet with no auth at all, and nothing
// in the response would say so.
//
// Posture is now resolved once per request from env:
//
//   token set (>= MIN_TOKEN_LENGTH)          → "enforced"
//   token unset + ALLOW_UNAUTHENTICATED=true → "open"          (dev only)
//   anything else                            → "misconfigured" (refuse)
//
// "misconfigured" makes the worker refuse to serve rather than serve
// openly. A broken deploy is recoverable; a silently unauthenticated one
// that a buyer agent transacts against is not.
//
// ALLOW_UNAUTHENTICATED is rejected outright when ENVIRONMENT=production,
// so the escape hatch cannot be flipped on in prod by editing one var.

import type { Env } from "./env";

/** Shorter than this is indistinguishable from no auth under brute force. */
const MIN_TOKEN_LENGTH = 16;

export type AuthPosture =
    | { mode: "enforced"; token: string }
    | { mode: "open" }
    | { mode: "misconfigured"; reason: string };

export function resolveAuthPosture(env: Env): AuthPosture {
    const token = env.ADCP_TEST_TOKEN?.trim();
    const isProduction = env.ENVIRONMENT === "production";
    const allowOpen = env.ALLOW_UNAUTHENTICATED === "true";

    if (token) {
        if (token.length < MIN_TOKEN_LENGTH) {
            return {
                mode: "misconfigured",
                reason:
                    `ADCP_TEST_TOKEN is shorter than the ${MIN_TOKEN_LENGTH}-character ` +
                    `minimum. Provision a high-entropy value: ` +
                    `\`openssl rand -base64 24 | npx wrangler secret put ADCP_TEST_TOKEN\`.`,
            };
        }
        return { mode: "enforced", token };
    }

    if (allowOpen && isProduction) {
        return {
            mode: "misconfigured",
            reason:
                "ALLOW_UNAUTHENTICATED=true is refused when ENVIRONMENT=production. " +
                "Provision ADCP_TEST_TOKEN via `wrangler secret put ADCP_TEST_TOKEN`.",
        };
    }

    if (allowOpen) return { mode: "open" };

    return {
        mode: "misconfigured",
        reason:
            "ADCP_TEST_TOKEN is not configured. Provision it with " +
            "`wrangler secret put ADCP_TEST_TOKEN` (or, for local dev only, set " +
            "ALLOW_UNAUTHENTICATED=true). Refusing to serve rather than exposing " +
            "unauthenticated media-buy endpoints.",
    };
}

export function bearerToken(req: Request): string | null {
    const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m && m[1] ? m[1] : null;
}

export function isAuthed(req: Request, posture: AuthPosture): boolean {
    // A misconfigured worker never reaches here — index.ts refuses the
    // request first — but default to deny if that guard is ever bypassed.
    if (posture.mode === "misconfigured") return false;
    if (posture.mode === "open") return true;
    const got = bearerToken(req);
    if (!got) return false;
    return constantTimeEqual(got, posture.token);
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
