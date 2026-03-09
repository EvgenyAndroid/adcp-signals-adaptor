/**
 * src/activations/types/shared.ts
 *
 * Base types shared across all activation adapters (LinkedIn, Meta, TTD, etc.)
 * Each platform adapter extends these with platform-specific fields.
 */

// ─── Dimension ────────────────────────────────────────────────────────────────

export interface SignalDimension {
  dimension: string;
  value: string;
}

// ─── Per-dimension mapping result ─────────────────────────────────────────────

export type DimensionStatus = 'mapped' | 'proxied' | 'not_supported';

export interface DimensionMappingResult {
  dimension: string;
  value: string;
  status: DimensionStatus;
  platform_facet?: string;
  platform_values?: string[];
  note?: string;
}

// ─── Base activation request ──────────────────────────────────────────────────

export interface BaseActivationRequest {
  /** AdCP signal ID — adapter will infer dimensions if set */
  signal_agent_segment_id?: string;
  /** Explicit dimensions — takes priority over signal_agent_segment_id */
  dimensions?: SignalDimension[];
  /** Human-readable campaign name */
  campaign_name?: string;
  /** Preview targeting without creating campaign */
  dry_run?: boolean;
  /** Daily budget in USD */
  daily_budget_usd?: number;
  /** Max bid in USD */
  bid_usd?: number;
}

// ─── Base activation result ───────────────────────────────────────────────────

export interface BaseActivationResult {
  success: boolean;
  platform: string;
  dry_run: boolean;
  dimension_results: DimensionMappingResult[];
  supported_count: number;
  proxied_count: number;
  unsupported_count: number;
  coverage_note: string;
  warnings: string[];
  error?: string;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface PlatformAdapter<
  TRequest extends BaseActivationRequest,
  TResult extends BaseActivationResult,
  TEnv
> {
  readonly platform: string;
  activate(request: TRequest, env: TEnv): Promise<TResult>;
  dryRun(request: TRequest): TResult;
}

// ─── Shared dimension inference (from signal ID) ──────────────────────────────

/**
 * Infer dimensions from a catalog signal ID.
 * Shared across all platform adapters — same rule map as queryResolver Pass 1.
 */
export function inferDimensionsFromSignalId(signalId: string): SignalDimension[] {
  const map: Record<string, SignalDimension> = {
    sig_age_18_24:                { dimension: 'age_band',           value: '18-24' },
    sig_age_25_34:                { dimension: 'age_band',           value: '25-34' },
    sig_age_35_44:                { dimension: 'age_band',           value: '35-44' },
    sig_age_45_54:                { dimension: 'age_band',           value: '45-54' },
    sig_age_55_64:                { dimension: 'age_band',           value: '55-64' },
    sig_age_65_plus:              { dimension: 'age_band',           value: '65+' },
    sig_high_income_households:   { dimension: 'income_band',        value: '150k+' },
    sig_upper_middle_income:      { dimension: 'income_band',        value: '100k-150k' },
    sig_middle_income_households: { dimension: 'income_band',        value: '50k-100k' },
    sig_college_educated_adults:  { dimension: 'education',          value: 'college' },
    sig_graduate_educated_adults: { dimension: 'education',          value: 'graduate' },
    sig_families_with_children:   { dimension: 'household_type',     value: 'family_with_kids' },
    sig_senior_households:        { dimension: 'household_type',     value: 'senior' },
    sig_urban_professionals:      { dimension: 'household_type',     value: 'urban_professional' },
    sig_streaming_enthusiasts:    { dimension: 'streaming_affinity', value: 'high' },
    sig_drama_viewers:            { dimension: 'content_genre',      value: 'drama' },
    sig_comedy_fans:              { dimension: 'content_genre',      value: 'comedy' },
    sig_action_movie_fans:        { dimension: 'content_genre',      value: 'action' },
    sig_documentary_viewers:      { dimension: 'content_genre',      value: 'documentary' },
    sig_sci_fi_enthusiasts:       { dimension: 'content_genre',      value: 'sci_fi' },
  };
  const rule = map[signalId];
  return rule ? [rule] : [];
}

// ─── Coverage note builder ────────────────────────────────────────────────────

export function buildCoverageNote(
  supported: number,
  proxied: number,
  unsupported: number,
): string {
  const total = supported + proxied + unsupported;
  if (total === 0) return 'No dimensions to map.';
  const covered = supported + proxied;
  const pct = Math.round((covered / total) * 100);
  const parts: string[] = [];
  if (supported > 0) parts.push(`${supported} native`);
  if (proxied > 0)   parts.push(`${proxied} proxied`);
  if (unsupported > 0) parts.push(`${unsupported} unsupported`);
  return `${pct}% coverage — ${parts.join(', ')}.`;
}
