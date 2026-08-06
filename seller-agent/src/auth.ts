// RFC 6750 Bearer-token check. Constant-time compare to avoid timing leaks.
// Returns true when the request carries the configured token; false otherwise.
// If the agent has no ADCP_TEST_TOKEN configured (dev convenience), every
// request is treated as authed — but the worker logs a warning at boot.

export function bearerToken(req: Request): string | null {
    const h = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m && m[1] ? m[1] : null;
}

export function isAuthed(req: Request, expected: string | undefined): boolean {
    if (!expected) return true; // unset → open mode for local dev
    const got = bearerToken(req);
    if (!got) return false;
    return constantTimeEqual(got, expected);
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
