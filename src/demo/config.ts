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

// Viewer auth: SHA-256 hashes of the accepted passwords (never plaintext)
// so they aren't grep-able from a GitHub clone. Threat model: filter URL
// scrapers + casual lurkers; workshop attendees are told the password
// verbally. Backend auth (DEMO_API_KEY) is the actual security layer.
//
// Multiple hashes are accepted to support a primary workshop password
// + a short alias (faster to type when standing on stage). Both unlock
// the same UI; the backend sees no difference between them. Add or
// remove entries here without touching the auth flow itself — the
// auth fragment imports the array and tests `includes(hash)`.
//
// To add or rotate: pick a new password, compute SHA-256
//   echo -n "newpass" | sha256sum
// or
//   python -c "import hashlib; print(hashlib.sha256(b'newpass').hexdigest())"
// Append or replace below. Don't commit the plaintext anywhere in this
// repo (label entries by purpose, not value).
export const DEMO_VIEWER_PASSWORD_HASHES: ReadonlyArray<string> = [
  // Primary: workshop attendee password (told verbally on May 7).
  "91bac7b38ed9c2883da874f1488cda40b035b66089b1590ccd75a0bd76f83e5c",
  // Alias: short, low-friction option for stage typing.
  "e55b153174b25f7c60672eced3878c1a8cd9bb7ed97ccb415ade0af890ce084e",
];

// Backwards-compatibility export: the original single-hash constant
// stays exported (it's the first/primary password) so any caller that
// imported it continues to compile. New callers should use the array.
export const DEMO_VIEWER_PASSWORD_SHA256 = DEMO_VIEWER_PASSWORD_HASHES[0]!;
