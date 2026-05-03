// src/demo/script/fragments/auth.ts
//
// Auth overlay: SHA-256 password gate + form IIFE + manual sign-out
// button + 5-min idle auto-logout. Imports the hashed password constant
// from ../../config.
//
// Threat model context: this is UI gating to filter URL scrapers + casual
// lurkers. Real auth (DEMO_API_KEY) is enforced independently by every
// backend route. The idle-logout exists so a workshop laptop left on a
// chair doesn't stay unlocked for the next person to walk by.
//
// Source range (in pre-refactor src/demo/script.ts): lines 295..352 (58 lines).
// Concatenated by ../index.ts into the inlined <script> bundle.
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
import { DEMO_VIEWER_PASSWORD_HASHES } from "../../config";

export const authJs = `
//────────────────────────────────────────────────────────────────────────
// Auth overlay — UI gate, password validation via SHA-256 compare.
// Hashes are hardcoded in source (not plaintext); attacker would need
// rainbow tables or brute-force to recover the passwords. Filters URL
// scrapers; backend auth (DEMO_API_KEY) is the actual security.
//
// AUTH_PASSWORD_HASHES is an array — multiple passwords unlock the same
// UI. Workshop attendees get the primary; the alias is for fast stage
// typing. Add or rotate by editing src/demo/config.ts (no flow changes
// here).
//────────────────────────────────────────────────────────────────────────
const AUTH_PASSWORD_HASHES = ${JSON.stringify(DEMO_VIEWER_PASSWORD_HASHES)};

async function _sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

(function() {
  const form = document.getElementById("auth-form");
  if (!form) return;
  const input = document.getElementById("auth-password");
  const errEl = document.getElementById("auth-error");
  const card = form;
  const submit = form.querySelector(".auth-submit");
  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    submit.disabled = true;
    submit.textContent = "Checking...";
    try {
      const hash = await _sha256Hex(value);
      if (AUTH_PASSWORD_HASHES.indexOf(hash) !== -1) {
        try { sessionStorage.setItem("demo-authed", "1"); } catch (e) {}
        document.documentElement.classList.remove("is-locked");
        // Hide overlay smoothly.
        const overlay = document.getElementById("auth-overlay");
        if (overlay) overlay.style.display = "none";
      } else {
        errEl.textContent = "Wrong password.";
        card.classList.remove("is-shake");
        // Force reflow so the animation re-triggers on consecutive failures.
        void card.offsetWidth;
        card.classList.add("is-shake");
        input.value = "";
        input.focus();
      }
    } catch (err) {
      errEl.textContent = "Hash failed: " + (err && err.message ? err.message : String(err));
    } finally {
      submit.disabled = false;
      submit.textContent = "Unlock";
    }
  });
})();

//────────────────────────────────────────────────────────────────────────
// Sign-out + 5-min idle auto-logout.
//
// Manual: click the "Sign out" button in the sidebar footer.
// Automatic: any 5-minute window without mousemove/keydown/click/scroll/
//   touchstart triggers logout. We update _lastActivity on each user
//   event and re-check every 30s. (setInterval keeps firing across tab
//   visibility changes — when a backgrounded tab returns, the next tick
//   sees a stale lastActivity and logs out promptly.)
//
// Logout flow: clear sessionStorage flag → re-add is-locked → reset
// overlay inline-style override (set on successful auth) → clear form
// → focus password input. The overlay reappears via the existing
// CSS rule "html:not(.is-locked) .auth-overlay { display: none; }".
//────────────────────────────────────────────────────────────────────────
const SESSION_IDLE_MS = 5 * 60 * 1000;
let _lastActivity = Date.now();
function _markActivity() { _lastActivity = Date.now(); }
function _logout(reason) {
  try { sessionStorage.removeItem("demo-authed"); } catch (e) {}
  document.documentElement.classList.add("is-locked");
  // The auth flow sets overlay.style.display = "none" inline on success.
  // We must clear that override so the CSS gate ("html:not(.is-locked)")
  // takes effect again. Setting to "" (not "flex") preserves the
  // stylesheet's default display value if it ever changes.
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.style.display = "";
  const input = document.getElementById("auth-password");
  if (input) {
    input.value = "";
    setTimeout(function() { try { input.focus(); } catch (e) {} }, 50);
  }
  const errEl = document.getElementById("auth-error");
  if (errEl) errEl.textContent = "";
  if (typeof showToast === "function") {
    showToast(reason === "idle" ? "Session timed out — please re-enter password" : "Signed out", reason === "idle");
  }
  _lastActivity = Date.now();
}
// Track user activity to keep the session alive while in use.
["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(function(ev) {
  document.addEventListener(ev, _markActivity, { passive: true, capture: true });
});
// Periodic check — fires logout when idle window exceeded. We only
// auto-logout when the user IS authed (no point timing out the auth
// overlay itself, which is already the locked state).
setInterval(function() {
  try {
    if (sessionStorage.getItem("demo-authed") !== "1") return;
  } catch (e) { return; }
  if (Date.now() - _lastActivity > SESSION_IDLE_MS) {
    _logout("idle");
  }
}, 30 * 1000);
// Manual sign-out button (sidebar footer).
(function() {
  const btn = document.getElementById("logout-btn");
  if (!btn) return;
  btn.addEventListener("click", function() { _logout("manual"); });
})();
`;
