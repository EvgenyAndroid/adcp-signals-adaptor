/**
 * src/activations/routes/activate.ts
 *
 * Generic activation route dispatcher.
 * Routes POST /signals/activate/{platform} to the correct adapter.
 *
 * Add new platforms here as adapters are implemented.
 *
 * Usage:
 *   POST /signals/activate/linkedin  → LinkedInAdapter
 *   POST /signals/activate/meta      → MetaAdapter (when implemented)
 *   POST /signals/activate/ttd       → TTDAdapter (when implemented)
 */

import { handleLinkedInActivate } from './linkedin';
import { isSupportedPlatform } from '../adapters';

export async function handleActivateDispatch(
  request: Request,
  env: Record<string, string>,
  platform: string,
): Promise<Response> {
  if (!isSupportedPlatform(platform)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Platform "${platform}" not supported. Supported: linkedin. Coming soon: meta, ttd.`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  switch (platform) {
    case 'linkedin':
      return handleLinkedInActivate(request, env as any);
    default:
      return new Response(
        JSON.stringify({ success: false, error: `Platform "${platform}" not yet implemented.` }),
        { status: 501, headers: { 'Content-Type': 'application/json' } },
      );
  }
}
