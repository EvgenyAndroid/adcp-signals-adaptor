/**
 * src/activations/adapters/linkedin/index.ts
 */
export { LinkedInAdapter } from './adapter';
export { mapDimensionsToLinkedIn } from './mapper';
// getAdAccount was referenced here but never existed in ./client — removed.
export { createCampaign, validateToken, LinkedInApiError } from './client';
export type { LinkedInEnv, LinkedInActivationRequest, LinkedInActivationResult } from '../../types/linkedin';
