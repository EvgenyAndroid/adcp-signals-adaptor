/**
 * src/activations/adapters/meta/index.ts
 *
 * Meta (Facebook / Instagram) Ads activation adapter — SCAFFOLD
 *
 * Status: Not yet implemented.
 *
 * When implemented, this will use:
 *   Meta Marketing API v20+
 *   https://developers.facebook.com/docs/marketing-apis
 *
 * Native dimension support (planned):
 *   ✅ age_band         → age_min / age_max on AdSet
 *   ✅ geo              → geo_locations.cities / geo_locations.regions
 *   ✅ income_band      → behaviors (income brackets available on Meta)
 *   ✅ household_type   → family_statuses / life_events
 *   ✅ content_genre    → interests (Meta has rich interest taxonomy)
 *   ⚠️ streaming_affinity → behaviors.digital_activities proxy
 *   ✅ education        → education_statuses
 *
 * Meta supports broader demographic and interest targeting than LinkedIn.
 * Particularly strong for B2C audience dimensions (content genre, streaming,
 * household type) that LinkedIn cannot map natively.
 *
 * Required app permissions:
 *   ads_management  — create/edit campaigns
 *   ads_read        — read campaign status
 *
 * Required secrets:
 *   META_ACCESS_TOKEN     — System user access token (long-lived)
 *   META_AD_ACCOUNT_ID    — act_{ad_account_id}
 *   META_APP_ID           — Meta App ID
 *   META_APP_SECRET       — Meta App Secret
 */

export class MetaAdapter {
  readonly platform = 'meta';

  activate(_request: unknown, _env: unknown): Promise<never> {
    throw new Error('Meta adapter not yet implemented. Scaffold only.');
  }

  dryRun(_request: unknown): never {
    throw new Error('Meta adapter not yet implemented. Scaffold only.');
  }
}
