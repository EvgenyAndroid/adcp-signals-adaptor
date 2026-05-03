// src/demo/config.ts
//
// Shared constants for the demo UI. Anything that needs to be reachable
// from both the route handler and the inlined browser script lives here.
//
// Threat model note for the password constant: this is UI gating to
// filter URL scrapers + casual lurkers. Real auth is enforced
// independently by every backend route via DEMO_API_KEY. Don't promote
// this constant into a security control — it's grep-resistant on a
// public repo, nothing more.

// Viewer auth: SHA-256 hash of the password (not plaintext) so it isn't
// grep-able from a GitHub clone. Threat model: filter URL scrapers +
// casual lurkers; workshop attendees are told the password verbally.
// Backend auth (DEMO_API_KEY) is the actual security layer.
//
// To rotate: pick a new password, compute SHA-256
//   echo -n "newpass" | sha256sum
// or
//   python -c "import hashlib; print(hashlib.sha256(b'newpass').hexdigest())"
// Replace the constant below with the new hex digest. Don't commit the
// plaintext anywhere in this repo.
export const DEMO_VIEWER_PASSWORD_SHA256 =
  "91bac7b38ed9c2883da874f1488cda40b035b66089b1590ccd75a0bd76f83e5c";
