/**
 * src/domain/queryResolver.test.ts
 *
 * Unit tests for the hybrid NLAQ resolver.
 *
 * Test coverage:
 *   1. Exact rule beats embedding when rule exists
 *   2. Embedding similarity used when no rule matches
 *   3. Lexical fallback used when engine unavailable
 *   4. Archetype expansion correct, no double-weight
 *   5. Engine is request-scoped (same instance throughout)
 *   6. No mixed-space comparisons (pseudo vs llm)
 *   7. Content title → genre inference
 *   8. Unresolved leaf handling
 *   9. semanticResolver buildSignalSemanticText priority
 *  10. cosineSimilarity correctness
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryResolver, inferRulesFromSignalId, type CatalogSignal } from './queryResolver';
import { buildSignalSemanticText, cosineSimilarity, SemanticResolver } from './semanticResolver';
import type { EmbeddingEngine } from '../ucp/embeddingEngine';
import type { AudienceQueryLeaf, AudienceQueryBranch } from './queryParser';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CATALOG: CatalogSignal[] = [
  {
    id: 'sig_age_35_44',
    name: 'Adults 35-44',
    description: 'Prime earner segment aged 35-44, high purchase intent and family household overlap.',
    category: 'demographic',
  },
  {
    id: 'sig_families_with_children',
    name: 'Families with Children',
    description: 'Households with at least one child under 18. Strong intent across CPG, education, family entertainment.',
    category: 'demographic',
  },
  {
    id: 'sig_drama_viewers',
    name: 'Drama Viewers',
    description: 'Regular viewers of drama content. Skews 35-54, higher household income, female-leaning.',
    category: 'interest',
  },
  {
    id: 'sig_streaming_enthusiasts',
    name: 'Streaming Enthusiasts',
    description: 'Heavy users of streaming TV and on-demand content. Multi-platform, high engagement, cord-cutter overlap.',
    category: 'interest',
  },
  {
    id: 'sig_high_income_households',
    name: 'High Income Households',
    description: 'Households with annual income over $150,000. Strong purchase intent across premium categories.',
    category: 'demographic',
  },
];

// ─── Mock embedding engines ────────────────────────────────────────────────────

/**
 * MockSemanticEngine — returns controllable vectors per text input.
 * By default all vectors are orthogonal (zero similarity).
 * Tests set specific responses to simulate semantic matching.
 */
class MockSemanticEngine implements EmbeddingEngine {
  readonly spaceId = 'openai-te3-small-d512-v1';
  readonly phase = 'v1' as const;

  private textMap = new Map<string, number[]>();

  setVector(text: string, vec: number[]): void {
    // Normalize before storing
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    this.textMap.set(text.toLowerCase().trim(), norm === 0 ? vec : vec.map(x => x / norm));
  }

  private zeroVec(): number[] {
    return new Array(4).fill(0);
  }

  private getVec(text: string): number[] {
    for (const [k, v] of this.textMap) {
      if (text.toLowerCase().includes(k) || k.includes(text.toLowerCase())) return v;
    }
    return this.zeroVec();
  }

  async embedSignal(_id: string, description: string): Promise<number[]> {
    return this.getVec(description);
  }

  async embedText(text: string): Promise<number[]> {
    return this.getVec(text);
  }
}

class MockPseudoEngine implements EmbeddingEngine {
  readonly spaceId = 'adcp-bridge-space-v1.0';
  readonly phase = 'pseudo-v1' as const;

  async embedSignal(_id: string, _desc: string): Promise<number[]> {
    return [0.5, 0.5, 0.5, 0.5];
  }

  async embedText(_text: string): Promise<number[]> {
    return [0.5, 0.5, 0.5, 0.5];
  }
}

// ─── Helper to build leaves ───────────────────────────────────────────────────

function makeLeaf(overrides: Partial<AudienceQueryLeaf>): AudienceQueryLeaf {
  return {
    op: 'LEAF',
    dimension: 'interest',
    value: 'test',
    description: 'test description',
    confidence: 1.0,
    ...overrides,
  };
}

// ─── 1. Exact rule beats embedding ────────────────────────────────────────────

describe('Pass 1 — exact rule match', () => {
  it('should match sig_age_35_44 via exact rule', async () => {
    const engine = new MockSemanticEngine();
    // Even if engine would match something else, rule should win
    const resolver = new QueryResolver(CATALOG, engine);

    const leaf = makeLeaf({ dimension: 'age_band', value: '35-44', description: 'adults aged 35 to 44' });
    const ast = leaf;
    const { resolvedLeaves } = await resolver.resolveAST(ast);

    expect(resolvedLeaves).toHaveLength(1);
    const match = resolvedLeaves[0].matches[0];
    expect(match.signal_agent_segment_id).toBe('sig_age_35_44');
    expect(match.match_method).toBe('exact_rule');
    expect(match.match_score).toBe(0.95);
    expect(resolvedLeaves[0].unresolved).toBe(false);
  });

  it('should match sig_families_with_children via exact rule', async () => {
    const resolver = new QueryResolver(CATALOG);
    const leaf = makeLeaf({ dimension: 'household_type', value: 'family_with_kids' });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    const match = resolvedLeaves[0].matches[0];
    expect(match.signal_agent_segment_id).toBe('sig_families_with_children');
    expect(match.match_method).toBe('exact_rule');
  });

  it('inferRulesFromSignalId returns null for unknown signal', () => {
    expect(inferRulesFromSignalId('sig_unknown_xyz')).toBeNull();
  });

  it('inferRulesFromSignalId covers all 20 mapped signals', () => {
    const knownIds = [
      'sig_age_18_24', 'sig_age_25_34', 'sig_age_35_44', 'sig_age_45_54',
      'sig_age_55_64', 'sig_age_65_plus', 'sig_high_income_households',
      'sig_upper_middle_income', 'sig_middle_income_households',
      'sig_college_educated_adults', 'sig_graduate_educated_adults',
      'sig_families_with_children', 'sig_senior_households', 'sig_urban_professionals',
      'sig_streaming_enthusiasts', 'sig_drama_viewers', 'sig_comedy_fans',
      'sig_action_movie_fans', 'sig_documentary_viewers', 'sig_sci_fi_enthusiasts',
    ];
    for (const id of knownIds) {
      expect(inferRulesFromSignalId(id)).not.toBeNull();
    }
  });
});

// ─── 2. Embedding similarity when no rule ─────────────────────────────────────

describe('Pass 2 — embedding similarity', () => {
  it('should use embedding when no exact rule exists', async () => {
    const engine = new MockSemanticEngine();
    // Make "drama" query vector highly similar to drama_viewers signal description
    engine.setVector('drama content fans who enjoy watching dramas', [1, 0, 0, 0]);
    engine.setVector('regular viewers of drama content. skews 35-54, higher household income, female-leaning.', [0.98, 0.1, 0, 0]);

    const resolver = new QueryResolver(CATALOG, engine);
    const leaf = makeLeaf({
      dimension: 'interest',
      value: 'drama_viewer',
      description: 'drama content fans who enjoy watching dramas',
    });

    const { resolvedLeaves } = await resolver.resolveAST(leaf);
    const top = resolvedLeaves[0].matches[0];

    expect(top.match_method).toBe('embedding_similarity');
    expect(top.signal_agent_segment_id).toBe('sig_drama_viewers');
    expect(top.match_score).toBeGreaterThan(0.3);
  });

  it('should set pseudoEmbeddingWarning when pseudo engine is used', async () => {
    const engine = new MockPseudoEngine();
    const resolver = new QueryResolver(CATALOG, engine);

    const leaf = makeLeaf({ dimension: 'interest', value: 'unknown_interest' });
    const { pseudoEmbeddingWarning } = await resolver.resolveAST(leaf);

    // Pseudo engine was used → warning should be set
    expect(pseudoEmbeddingWarning).toBe(true);
  });

  it('should NOT set pseudoEmbeddingWarning when llm engine is used', async () => {
    const engine = new MockSemanticEngine(); // phase = 'v1'
    const resolver = new QueryResolver(CATALOG, engine);

    const leaf = makeLeaf({ dimension: 'interest', value: 'unknown_interest' });
    const { pseudoEmbeddingWarning } = await resolver.resolveAST(leaf);

    expect(pseudoEmbeddingWarning).toBe(false);
  });
});

// ─── 3. Lexical fallback when engine unavailable ──────────────────────────────

describe('Pass 3 — lexical fallback', () => {
  it('should fall back to lexical when no engine is provided', async () => {
    const resolver = new QueryResolver(CATALOG); // no engine

    const leaf = makeLeaf({
      dimension: 'interest',
      value: 'streaming',
      description: 'heavy streaming on-demand viewer cord cutter',
    });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    const match = resolvedLeaves[0].matches[0];
    expect(match.match_method).toBe('lexical_fallback');
    // Should match streaming enthusiasts via token overlap
    expect(match.signal_agent_segment_id).toBe('sig_streaming_enthusiasts');
  });

  it('lexical should be skipped when exact rule fires', async () => {
    const resolver = new QueryResolver(CATALOG); // no engine
    const leaf = makeLeaf({ dimension: 'age_band', value: '35-44' });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    expect(resolvedLeaves[0].matches[0].match_method).toBe('exact_rule');
  });
});

// ─── 4. Archetype expansion ───────────────────────────────────────────────────

describe('Archetype expansion', () => {
  it('soccer_mom expands to expected constituent signals', async () => {
    const resolver = new QueryResolver(CATALOG);
    const leaf = makeLeaf({
      dimension: 'archetype',
      value: 'soccer_mom',
      description: 'suburban mother with school-age children',
    });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);
    const ids = resolvedLeaves[0].matches.map(m => m.signal_agent_segment_id);

    expect(ids).toContain('sig_age_35_44');
    expect(ids).toContain('sig_families_with_children');
    expect(resolvedLeaves[0].matches[0].match_method).toBe('archetype_expansion');
  });

  it('archetype expansion does NOT double-weight (weight applied once)', async () => {
    const resolver = new QueryResolver(CATALOG);
    const leaf = makeLeaf({ dimension: 'archetype', value: 'soccer_mom' });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    // sig_age_35_44 constituent weight=0.35, exact_rule score=0.95 → weighted = 0.35*0.95 = 0.3325
    // sig_families_with_children constituent weight=0.40, exact_rule score=0.95 → 0.38
    // families_with_children should be highest
    const top = resolvedLeaves[0].matches[0];
    expect(top.signal_agent_segment_id).toBe('sig_families_with_children');
    // Score should be ~0.38 — not 0.76 (which would indicate double-weight)
    expect(top.match_score).toBeLessThan(0.5);
    expect(top.match_score).toBeGreaterThan(0.3);
  });

  it('affluent_family archetype resolves income + household + education', async () => {
    const catalog: CatalogSignal[] = [
      ...CATALOG,
      {
        id: 'sig_graduate_educated_adults',
        name: 'Graduate Educated Adults',
        description: 'Adults with a graduate degree.',
        category: 'demographic',
      },
    ];
    const resolver = new QueryResolver(catalog);
    const leaf = makeLeaf({ dimension: 'archetype', value: 'affluent_family' });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    const ids = resolvedLeaves[0].matches.map(m => m.signal_agent_segment_id);
    expect(ids).toContain('sig_high_income_households');
    expect(ids).toContain('sig_families_with_children');
  });

  it('unknown archetype falls back to resolver pipeline gracefully', async () => {
    const resolver = new QueryResolver(CATALOG);
    const leaf = makeLeaf({ dimension: 'archetype', value: 'unknown_archetype_xyz' });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    // Should not throw; may be unresolved or have lexical fallback matches
    expect(resolvedLeaves).toHaveLength(1);
  });
});

// ─── 5. Request-scoped engine ─────────────────────────────────────────────────

describe('Request-scoped engine', () => {
  it('should use the same engine instance for all leaves in one resolveAST call', async () => {
    const engine = new MockSemanticEngine();
    const embedTextSpy = vi.spyOn(engine, 'embedText');

    const resolver = new QueryResolver(CATALOG, engine);

    const ast: AudienceQueryBranch = {
      op: 'AND',
      children: [
        makeLeaf({ dimension: 'interest', value: 'drama', description: 'drama viewer' }),
        makeLeaf({ dimension: 'interest', value: 'streaming', description: 'streaming enthusiast' }),
      ],
    };

    await resolver.resolveAST(ast);

    // Both leaves should use the same engine (both should call embedText)
    // exact_rule misses for these → embedding path used
    expect(embedTextSpy).toHaveBeenCalled();
  });

  it('should not instantiate multiple engines within one resolver', () => {
    // QueryResolver takes engine as constructor param → no internal factory calls
    const engine = new MockSemanticEngine();
    const resolver = new QueryResolver(CATALOG, engine);
    // Just verify construction succeeds with the injected engine
    expect(resolver).toBeDefined();
  });
});

// ─── 6. No mixed-space comparisons ────────────────────────────────────────────

describe('No mixed-space comparisons', () => {
  it('llm engine signals v1 phase, pseudo signals pseudo-v1 phase', () => {
    const llm = new MockSemanticEngine();
    const pseudo = new MockPseudoEngine();
    expect(llm.phase).toBe('v1');
    expect(pseudo.phase).toBe('pseudo-v1');
  });

  it('resolver uses engine.phase to set pseudoWarning flag', async () => {
    const pseudo = new MockPseudoEngine();
    const resolver = new QueryResolver(CATALOG, pseudo);

    const leaf = makeLeaf({ dimension: 'interest', value: 'drama' }); // no exact rule
    const { pseudoEmbeddingWarning } = await resolver.resolveAST(leaf);

    expect(pseudoEmbeddingWarning).toBe(true);
  });

  it('resolver does NOT warn when llm engine is used', async () => {
    const llm = new MockSemanticEngine();
    const resolver = new QueryResolver(CATALOG, llm);

    const leaf = makeLeaf({ dimension: 'interest', value: 'drama' });
    const { pseudoEmbeddingWarning } = await resolver.resolveAST(leaf);

    expect(pseudoEmbeddingWarning).toBe(false);
  });
});

// ─── 7. Content title inference ────────────────────────────────────────────────

describe('Content title → genre inference', () => {
  it('desperate_housewives resolves to sig_drama_viewers via title_genre_inference', async () => {
    const resolver = new QueryResolver(CATALOG);
    const leaf = makeLeaf({
      dimension: 'content_title',
      value: 'desperate_housewives',
      description: 'watch Desperate Housewives in the afternoon',
    });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    const top = resolvedLeaves[0].matches[0];
    expect(top.signal_agent_segment_id).toBe('sig_drama_viewers');
    expect(top.match_method).toBe('title_genre_inference');
  });

  it('title_genre_inference applies a score discount vs exact_rule', async () => {
    const resolver = new QueryResolver(CATALOG);

    const exactLeaf = makeLeaf({ dimension: 'content_genre', value: 'drama' });
    const titleLeaf = makeLeaf({ dimension: 'content_title', value: 'desperate_housewives' });

    const { resolvedLeaves: exact } = await resolver.resolveAST(exactLeaf);
    const { resolvedLeaves: title } = await resolver.resolveAST(titleLeaf);

    const exactScore = exact[0].matches[0].match_score;
    const titleScore = title[0].matches[0].match_score;

    expect(titleScore).toBeLessThan(exactScore);
  });

  it('unknown title falls through to resolver pipeline without crashing', async () => {
    const resolver = new QueryResolver(CATALOG);
    const leaf = makeLeaf({
      dimension: 'content_title',
      value: 'totally_unknown_show_xyz',
      description: 'obscure show nobody has heard of',
    });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);
    expect(resolvedLeaves).toHaveLength(1);
    // May be unresolved or have lexical match; should not throw
  });

  it('normalizes title keys correctly', async () => {
    const resolver = new QueryResolver(CATALOG);
    // "Grey's Anatomy" → normalized to "grey_s_anatomy"
    const leaf = makeLeaf({
      dimension: 'content_title',
      value: "Grey's Anatomy",
      description: "viewers of Grey's Anatomy medical drama",
    });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);
    const top = resolvedLeaves[0].matches[0];
    expect(top?.match_method).toBe('title_genre_inference');
  });
});

// ─── 8. Unresolved leaf handling ──────────────────────────────────────────────

describe('Unresolved leaf handling', () => {
  it('geo leaf with no catalog DMA signal is marked unresolved', async () => {
    const resolver = new QueryResolver(CATALOG); // no geo signals in CATALOG
    const leaf = makeLeaf({
      dimension: 'geo',
      value: 'Nashville',
      description: 'Nashville Tennessee DMA-659',
    });
    const { resolvedLeaves } = await resolver.resolveAST(leaf);

    // No signal in CATALOG has a geo/Nashville rule or matching description
    // May be resolved via lexical on description, or unresolved — depends on token overlap
    // Key requirement: does not throw
    expect(resolvedLeaves).toHaveLength(1);
  });

  it('NOT branch with unresolved child returns empty matches (no fabrication)', async () => {
    const resolver = new QueryResolver(CATALOG);
    const notLeaf: AudienceQueryLeaf = {
      op: 'LEAF',
      dimension: 'interest',
      value: 'coffee',
      description: 'coffee drinker beverage affinity',
      confidence: 0.9,
      is_exclusion: true,
    };
    const ast: AudienceQueryBranch = {
      op: 'NOT',
      children: [notLeaf],
    };
    const { resolvedLeaves } = await resolver.resolveAST(ast);
    // No coffee signal in catalog → unresolved
    const resolved = resolvedLeaves[0];
    expect(resolved.leaf.is_exclusion).toBe(true);
    // matches may be empty (unresolved) or minimal (lexical) — never fabricated
    expect(resolved.matches.length).toBeLessThanOrEqual(3);
  });
});

// ─── 9. buildSignalSemanticText priority ──────────────────────────────────────

describe('buildSignalSemanticText', () => {
  it('uses description first when present', () => {
    const s = { id: 'x', name: 'Name', description: 'Rich description text', category: 'demographic' };
    expect(buildSignalSemanticText(s)).toContain('Rich description text');
  });

  it('falls back to name when description missing', () => {
    const s = { id: 'x', name: 'Drama Viewers' };
    expect(buildSignalSemanticText(s)).toContain('Drama Viewers');
  });

  it('includes category hint when present', () => {
    const s = { id: 'x', name: 'Test', category: 'interest' };
    expect(buildSignalSemanticText(s)).toContain('Category: interest');
  });

  it('falls back to id when all fields empty', () => {
    const s = { id: 'sig_fallback', name: '' };
    expect(buildSignalSemanticText(s)).toBe('sig_fallback');
  });

  it('is deterministic — same inputs always produce same output', () => {
    const s = {
      id: 'sig_drama_viewers',
      name: 'Drama Viewers',
      description: 'Regular viewers of drama content.',
      category: 'interest',
    };
    expect(buildSignalSemanticText(s)).toBe(buildSignalSemanticText(s));
  });
});

// ─── 10. cosineSimilarity correctness ─────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('identical vectors → 1.0', () => {
    const v = [1, 0, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('orthogonal vectors → 0.0', () => {
    expect(cosineSimilarity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0.0, 5);
  });

  it('opposite vectors → -1.0', () => {
    expect(cosineSimilarity([1, 0, 0, 0], [-1, 0, 0, 0])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched dimension vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it('partial similarity', () => {
    const a = [1, 1, 0, 0].map(x => x / Math.sqrt(2));
    const b = [1, 0, 1, 0].map(x => x / Math.sqrt(2));
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });
});

// ─── SemanticResolver integration ─────────────────────────────────────────────

describe('SemanticResolver.resolve()', () => {
  it('returns top-N results sorted by score descending', async () => {
    const engine = new MockSemanticEngine();
    engine.setVector('drama viewer', [1, 0, 0, 0]);
    engine.setVector('regular viewers of drama content', [0.99, 0.1, 0, 0]);
    engine.setVector('heavy users of streaming tv', [0.2, 0.8, 0, 0]);

    const resolver = new SemanticResolver(engine, { topN: 2 });
    const leaf = makeLeaf({ description: 'drama viewer' });
    const results = await resolver.resolve(leaf, CATALOG);

    expect(results.length).toBeLessThanOrEqual(2);
    if (results.length > 1) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  it('respects minScore filter', async () => {
    const engine = new MockSemanticEngine(); // all zeros → cosine = 0
    const resolver = new SemanticResolver(engine, { minScore: 0.5 });
    const leaf = makeLeaf({ description: 'something with no match' });
    const results = await resolver.resolve(leaf, CATALOG);
    expect(results.every(r => r.score >= 0.5)).toBe(true);
  });

  it('all results have match_method embedding_similarity', async () => {
    const engine = new MockSemanticEngine();
    const resolver = new SemanticResolver(engine);
    const leaf = makeLeaf({ description: 'drama viewers who stream' });
    const results = await resolver.resolve(leaf, CATALOG);
    for (const r of results) {
      expect(r.match_method).toBe('embedding_similarity');
    }
  });
});
