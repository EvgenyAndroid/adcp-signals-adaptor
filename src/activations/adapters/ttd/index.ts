/**
 * src/activations/adapters/ttd/index.ts
 *
 * The Trade Desk activation adapter — SCAFFOLD
 *
 * Status: Not yet implemented.
 *
 * When implemented, this will use:
 *   TTD Platform API
 *   https://api.thetradedesk.com/v3/doc
 *
 * Native dimension support (planned):
 *   ✅ age_band          → AgeRange targeting
 *   ✅ geo               → GeoSegment (DMA codes map directly)
 *   ✅ income_band        → ThirdPartyDataSegment (Experian/Oracle HHI)
 *   ✅ content_genre      → SupplyVendorDealList + contextual segments
 *   ✅ streaming_affinity → ConnectedTV inventory targeting
 *   ✅ household_type     → ThirdPartyDataSegment (LiveRamp)
 *
 * TTD is the strongest platform for CTV/streaming audience activation —
 * sig_streaming_enthusiasts and sig_drama_viewers map natively.
 * Best fit for CTV ACR signal activation.
 *
 * Required credentials:
 *   TTD_API_KEY           — TTD API Key
 *   TTD_ADVERTISER_ID     — TTD Advertiser ID
 *   TTD_PARTNER_ID        — TTD Partner ID
 */

export class TTDAdapter {
  readonly platform = 'ttd';

  activate(_request: unknown, _env: unknown): Promise<never> {
    throw new Error('TTD adapter not yet implemented. Scaffold only.');
  }

  dryRun(_request: unknown): never {
    throw new Error('TTD adapter not yet implemented. Scaffold only.');
  }
}
