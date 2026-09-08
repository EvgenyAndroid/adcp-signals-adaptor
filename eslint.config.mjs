// eslint.config.js — flat config (ESLint 9+).
// Scoped to src/ only, matching the original `lint` script's intent.
// Type-aware linting is intentionally NOT enabled here — `npm run type-check`
// (tsc --noEmit) already covers type correctness; adding a typed lint pass
// would duplicate that work and slow every run down for no new signal.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".compliance/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      // Signal-agnostic bridges (D1 rows, KV JSON, third-party SDK shapes)
      // are cast through `unknown`/`any` throughout this codebase by
      // design — flagging every one would be noise, not signal.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
