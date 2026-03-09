/**
 * src/activations/adapters/linkedin/index.ts
 */
export { LinkedInAdapter } from './adapter';
export { mapDimensionsToLinkedIn } from './mapper';
export { createCampaign, validateToken, getAdAccount, LinkedInApiError } from './client';
export type { LinkedInEnv, LinkedInActivationRequest, LinkedInActivationResult } from '../../types/linkedin';
