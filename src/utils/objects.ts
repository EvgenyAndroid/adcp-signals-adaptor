// src/utils/objects.ts
// Tiny helpers for object shape manipulation.

/**
 * Strip keys whose value is `undefined`. Used at construction sites that
 * build option/request objects from possibly-undefined inputs — without
 * this, `exactOptionalPropertyTypes: true` rejects literal-with-undefined
 * even when the target type marks the field optional.
 *
 * Returns a typed object whose keys are guaranteed non-undefined values.
 * Mutates nothing; original object untouched.
 */
export function compactObj<T extends Record<string, unknown>>(obj: T): {
  [K in keyof T]?: Exclude<T[K], undefined>;
} {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}
