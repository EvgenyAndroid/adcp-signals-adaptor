/**
 * src/activations/adapters/index.ts
 *
 * Platform adapter registry.
 * Add new platforms here as they are implemented.
 *
 * Current status:
 *   linkedin  ✅ implemented — Development Tier, App ID 239110166
 *   meta      ⬜ scaffold only
 *   ttd       ⬜ scaffold only
 */

export { LinkedInAdapter } from './linkedin';
export { MetaAdapter } from './meta';
export { TTDAdapter } from './ttd';

export const SUPPORTED_PLATFORMS = ['linkedin'] as const;
export type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number];

export function isSupportedPlatform(p: string): p is SupportedPlatform {
  return SUPPORTED_PLATFORMS.includes(p as SupportedPlatform);
}
