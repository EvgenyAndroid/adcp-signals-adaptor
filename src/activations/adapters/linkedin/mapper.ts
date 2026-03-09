/**
 * src/activations/adapters/linkedin/mapper.ts
 *
 * Maps AdCP signal dimensions → LinkedIn Marketing API v2 targeting facets.
 *
 * LinkedIn native support matrix:
 *   ✅ age_band        → ageRanges          (4 LinkedIn bands vs IAB 6)
 *   ✅ geo             → locations          (geo URN lookup)
 *   ✅ education       → educationLevels
 *   ⚠️ income_band     → seniorityLevels    (proxy — no HHI field on LinkedIn)
 *   ⚠️ household_type  → seniorityLevels    (urban_professional only)
 *   ❌ content_genre   → not supported
 *   ❌ streaming_affinity → not supported
 *   ❌ interest        → not supported
 *   ❌ archetype       → constituents resolved individually by caller
 *
 * LinkedIn Marketing API docs:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/targeting/targeting-facets
 */

import type { SignalDimension, DimensionMappingResult } from '../../types/shared';
import type { LinkedInTargetingCriteria } from '../../types/linkedin';
import { buildCoverageNote } from '../../types/shared';

// ─── Age range URNs ───────────────────────────────────────────────────────────
// LinkedIn compresses IAB 6 bands into 4:
//   18-24 → urn:li:ageRange:(1,2)
//   25-34 → urn:li:ageRange:(2,3)
//   35-54 → urn:li:ageRange:(3,4)   NOTE: 35-44 and 45-54 share one LinkedIn bucket
//   55+   → urn:li:ageRange:(4,5)

const AGE_MAP: Record<string, { urn: string; note?: string }> = {
  '18-24': { urn: 'urn:li:ageRange:(1,2)' },
  '25-34': { urn: 'urn:li:ageRange:(2,3)' },
  '35-44': { urn: 'urn:li:ageRange:(3,4)', note: 'LinkedIn 35-54 bucket — cannot isolate 35-44 only' },
  '45-54': { urn: 'urn:li:ageRange:(3,4)', note: 'LinkedIn 35-54 bucket — cannot isolate 45-54 only' },
  '55-64': { urn: 'urn:li:ageRange:(4,5)', note: 'LinkedIn 55+ bucket includes 65+' },
  '65+':   { urn: 'urn:li:ageRange:(4,5)', note: 'LinkedIn 55+ bucket — cannot isolate 65+ only' },
};

// ─── Education URNs ───────────────────────────────────────────────────────────

const EDUCATION_MAP: Record<string, string[]> = {
  'high_school':  ['urn:li:educationLevel:HIGH_SCHOOL'],
  'some_college': ['urn:li:educationLevel:SOME_COLLEGE'],
  'college':      ['urn:li:educationLevel:BACHELOR'],
  'bachelors':    ['urn:li:educationLevel:BACHELOR'],
  'graduate':     ['urn:li:educationLevel:MASTER', 'urn:li:educationLevel:DOCTORATE'],
  'master':       ['urn:li:educationLevel:MASTER'],
  'doctorate':    ['urn:li:educationLevel:DOCTORATE'],
};

// ─── Income → Seniority proxy ─────────────────────────────────────────────────
// LinkedIn seniority levels:
//   1=Unpaid  2=Training  3=Entry  4=Senior  5=Manager
//   6=Director  7=VP  8=CXO  9=Partner  10=Owner

const INCOME_MAP: Record<string, { urns: string[]; note: string }> = {
  '150k+':     { urns: ['urn:li:seniority:7','urn:li:seniority:8','urn:li:seniority:9','urn:li:seniority:10'], note: 'No HHI on LinkedIn — VP/CXO/Owner seniority proxy (B2B bias)' },
  '150k_plus': { urns: ['urn:li:seniority:7','urn:li:seniority:8','urn:li:seniority:9','urn:li:seniority:10'], note: 'No HHI on LinkedIn — VP/CXO/Owner seniority proxy (B2B bias)' },
  '100k-150k': { urns: ['urn:li:seniority:6','urn:li:seniority:7'], note: 'No HHI on LinkedIn — Director/VP seniority proxy (B2B bias)' },
  '100k_150k': { urns: ['urn:li:seniority:6','urn:li:seniority:7'], note: 'No HHI on LinkedIn — Director/VP seniority proxy (B2B bias)' },
  '50k-100k':  { urns: ['urn:li:seniority:4','urn:li:seniority:5'], note: 'No HHI on LinkedIn — Senior/Manager seniority proxy (B2B bias)' },
  '50k_100k':  { urns: ['urn:li:seniority:4','urn:li:seniority:5'], note: 'No HHI on LinkedIn — Senior/Manager seniority proxy (B2B bias)' },
};

// ─── Geo URNs (top US DMAs + cities) ─────────────────────────────────────────
// Full list via: GET https://api.linkedin.com/v2/geo?q=typeahead&query={city}&locale.language=en&locale.country=US

const GEO_MAP: Record<string, { urn: string; name: string }> = {
  // Major metros
  'new york':      { urn: 'urn:li:geo:102571732', name: 'New York, NY' },
  'new_york':      { urn: 'urn:li:geo:102571732', name: 'New York, NY' },
  'los angeles':   { urn: 'urn:li:geo:102448347', name: 'Los Angeles, CA' },
  'los_angeles':   { urn: 'urn:li:geo:102448347', name: 'Los Angeles, CA' },
  'chicago':       { urn: 'urn:li:geo:103112676', name: 'Chicago, IL' },
  'houston':       { urn: 'urn:li:geo:102567501', name: 'Houston, TX' },
  'dallas':        { urn: 'urn:li:geo:103571740', name: 'Dallas, TX' },
  'miami':         { urn: 'urn:li:geo:102093800', name: 'Miami, FL' },
  'seattle':       { urn: 'urn:li:geo:101730032', name: 'Seattle, WA' },
  'boston':        { urn: 'urn:li:geo:101189330', name: 'Boston, MA' },
  'san francisco': { urn: 'urn:li:geo:102277331', name: 'San Francisco Bay Area' },
  'sf':            { urn: 'urn:li:geo:102277331', name: 'San Francisco Bay Area' },
  'atlanta':       { urn: 'urn:li:geo:100293800', name: 'Atlanta, GA' },
  'denver':        { urn: 'urn:li:geo:101709677', name: 'Denver, CO' },
  'phoenix':       { urn: 'urn:li:geo:102081352', name: 'Phoenix, AZ' },
  'nashville':     { urn: 'urn:li:geo:103644278', name: 'Nashville, TN' },
  'dma-659':       { urn: 'urn:li:geo:103644278', name: 'Nashville, TN' },
  'austin':        { urn: 'urn:li:geo:104204571', name: 'Austin, TX' },
  'minneapolis':   { urn: 'urn:li:geo:104193774', name: 'Minneapolis, MN' },
  'san diego':     { urn: 'urn:li:geo:102095887', name: 'San Diego, CA' },
  // Country fallback
  'us':            { urn: 'urn:li:geo:101165590', name: 'United States' },
  'usa':           { urn: 'urn:li:geo:101165590', name: 'United States' },
  'united states': { urn: 'urn:li:geo:101165590', name: 'United States' },
};

// ─── Household type ───────────────────────────────────────────────────────────

const HOUSEHOLD_MAP: Record<string, { urns: string[]; note: string } | null> = {
  'urban_professional': { urns: ['urn:li:seniority:4','urn:li:seniority:5','urn:li:seniority:6'], note: 'Proxied via Senior/Manager/Director seniority' },
  'family_with_kids':   null,
  'senior':             null,
  'couple_no_kids':     null,
  'single':             null,
};

// ─── Dimensions with no LinkedIn equivalent ───────────────────────────────────

const UNSUPPORTED = new Set([
  'content_genre',
  'streaming_affinity',
  'content_title',
  'behavioral_absence',
  'metro_tier',
  'archetype',
  'interest',
]);

// ─── Main mapper ──────────────────────────────────────────────────────────────

export interface MapResult {
  criteria: LinkedInTargetingCriteria;
  dimensionResults: DimensionMappingResult[];
  supportedCount: number;
  proxiedCount: number;
  unsupportedCount: number;
  coverageNote: string;
}

export function mapDimensionsToLinkedIn(dimensions: SignalDimension[]): MapResult {
  const dimensionResults: DimensionMappingResult[] = [];
  const facetMap = new Map<string, Set<string>>();
  let supportedCount = 0, proxiedCount = 0, unsupportedCount = 0;

  for (const { dimension, value } of dimensions) {
    const v = value.toLowerCase().trim();

    switch (dimension) {
      case 'age_band': {
        const m = AGE_MAP[v];
        if (m) {
          addFacet(facetMap, 'urn:li:adTargetingFacet:ageRanges', m.urn);
          const proxied = !!m.note;
          dimensionResults.push({ dimension, value, status: proxied ? 'proxied' : 'mapped', platform_facet: 'ageRanges', platform_values: [m.urn], note: m.note });
          proxied ? proxiedCount++ : supportedCount++;
        } else {
          dimensionResults.push({ dimension, value, status: 'not_supported', note: `Unknown age band: ${value}` });
          unsupportedCount++;
        }
        break;
      }

      case 'geo': {
        const key = v.split(',')[0].trim();
        const m = GEO_MAP[key] ?? GEO_MAP[v];
        if (m) {
          addFacet(facetMap, 'urn:li:adTargetingFacet:locations', m.urn);
          dimensionResults.push({ dimension, value, status: 'mapped', platform_facet: 'locations', platform_values: [m.urn], note: `→ ${m.name}` });
          supportedCount++;
        } else {
          dimensionResults.push({ dimension, value, status: 'not_supported', note: `"${value}" not in geo map. Lookup via GET /v2/geo?q=typeahead&query=${encodeURIComponent(value)}` });
          unsupportedCount++;
        }
        break;
      }

      case 'education': {
        const urns = EDUCATION_MAP[v];
        if (urns) {
          urns.forEach(u => addFacet(facetMap, 'urn:li:adTargetingFacet:educationLevels', u));
          dimensionResults.push({ dimension, value, status: 'mapped', platform_facet: 'educationLevels', platform_values: urns });
          supportedCount++;
        } else {
          dimensionResults.push({ dimension, value, status: 'not_supported', note: `Unknown education level: ${value}` });
          unsupportedCount++;
        }
        break;
      }

      case 'income_band': {
        const m = INCOME_MAP[v];
        if (m) {
          m.urns.forEach(u => addFacet(facetMap, 'urn:li:adTargetingFacet:seniorityLevels', u));
          dimensionResults.push({ dimension, value, status: 'proxied', platform_facet: 'seniorityLevels', platform_values: m.urns, note: m.note });
          proxiedCount++;
        } else {
          dimensionResults.push({ dimension, value, status: 'not_supported', note: `Unknown income band: ${value}` });
          unsupportedCount++;
        }
        break;
      }

      case 'household_type': {
        const m = HOUSEHOLD_MAP[v];
        if (m) {
          m.urns.forEach(u => addFacet(facetMap, 'urn:li:adTargetingFacet:seniorityLevels', u));
          dimensionResults.push({ dimension, value, status: 'proxied', platform_facet: 'seniorityLevels', platform_values: m.urns, note: m.note });
          proxiedCount++;
        } else {
          dimensionResults.push({ dimension, value, status: 'not_supported', note: `household_type "${value}" has no LinkedIn native equivalent` });
          unsupportedCount++;
        }
        break;
      }

      default: {
        const note = UNSUPPORTED.has(dimension)
          ? `${dimension} has no LinkedIn native targeting equivalent`
          : `Unknown dimension: ${dimension}`;
        dimensionResults.push({ dimension, value, status: 'not_supported', note });
        unsupportedCount++;
      }
    }
  }

  // Build LinkedIn criteria object
  const andClauses = Array.from(facetMap.entries()).map(([facetUrn, valueSet]) => ({
    or: { [facetUrn]: Array.from(valueSet) },
  }));

  // Fallback: empty criteria would be rejected by LinkedIn API — default to US
  if (andClauses.length === 0) {
    andClauses.push({ or: { 'urn:li:adTargetingFacet:locations': ['urn:li:geo:101165590'] } });
  }

  const criteria: LinkedInTargetingCriteria = { include: { and: andClauses } };
  const coverageNote = buildCoverageNote(supportedCount, proxiedCount, unsupportedCount);

  return { criteria, dimensionResults, supportedCount, proxiedCount, unsupportedCount, coverageNote };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function addFacet(map: Map<string, Set<string>>, key: string, value: string): void {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(value);
}
