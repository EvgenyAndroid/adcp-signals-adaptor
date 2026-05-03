// src/demo/script/fragments/auth.ts
//
// Auth overlay: SHA-256 password gate + form IIFE. Imports the hashed password constant from ../../config.
//
// Source range (in pre-refactor src/demo/script.ts): lines 295..352 (58 lines).
// Concatenated by ../index.ts into the inlined <script> bundle. Byte-
// equivalent to the pre-refactor monolith (verified by
// tests/demo-render-snapshot.test.ts via SHA-256 hash).
//
// SCRIPT_TAG_TRAP NOTE: this is browser JS embedded in a TS template
// literal. All template-literal backticks and `${...}` inside the
// inner JS must be escaped with a backslash so the outer literal
// doesn't interpolate them. Trap audit: tmp-mining/trap_audit.py.
import { DEMO_VIEWER_PASSWORD_SHA256 } from "../../config";

export const authJs = `
//────────────────────────────────────────────────────────────────────────
// Auth overlay — UI gate, password validation via SHA-256 compare.
// Hash is hardcoded in source (not plaintext); attacker would need
// rainbow tables or brute-force to recover the password. Filters URL
// scrapers; backend auth (DEMO_API_KEY) is the actual security.
//────────────────────────────────────────────────────────────────────────
const AUTH_PASSWORD_SHA256 = ${JSON.stringify(DEMO_VIEWER_PASSWORD_SHA256)};

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
      if (hash === AUTH_PASSWORD_SHA256) {
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
`;
