/**
 * conceptRegistry.ts
 * Concept-Level VAC — UCP v0.2 §4
 *
 * Maintains the canonical concept registry: ~50 advertising concepts with
 * constituent dimensions, cross-taxonomy member nodes, and description text
 * for embedding-based semantic search.
 *
 * Production path:
 *   - Registry stored in KV (SIGNALS_CACHE) keyed by concept_id
 *   - Seeded from this file on first request or /ucp/concepts/seed
 *   - Phase 2b: canonical_embedding vectors added when IAB publishes reference model
 *
 * Search strategy (no vector store):
 *   Token overlap on concept_description + label fields.
 *   Upgradeable to cosine similarity in Phase 2b by adding embedding vectors to each entry.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConceptMemberNode {
  vendor: "iab" | "liveramp" | "tradedesk" | "experian" | "nielsen" | "epsilon" | "samba" | string;
  node_id: string;
  label?: string;
  similarity: number; // 0–1, embedding cosine vs canonical (placeholder = 1.0 for exact IAB matches)
  source: "concept_registry" | "embedding_inference" | "manual_crosswalk";
}

export interface ConceptConstituent {
  dimension: string;
  value: string;
  weight: number;
  description: string;
}

export interface ConceptEntry {
  concept_id: string;
  label: string;
  concept_description: string;
  category: "demographic" | "interest" | "behavioral" | "geo" | "archetype" | "content" | "purchase_intent";
  constituent_dimensions?: ConceptConstituent[];
  member_nodes: ConceptMemberNode[];
  /** IAB AT 1.1 primary node if applicable */
  iab_primary?: string;
  similarity_threshold: number;
  validated_at: string;
  /** Phase 2b: will carry float32 vector when IAB reference model published */
  canonical_embedding?: null;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const CONCEPT_REGISTRY: ConceptEntry[] = [
  // ── Archetypes ──────────────────────────────────────────────────────────────
  {
    concept_id: "SOCCER_MOM_US",
    label: "Soccer Mom",
    concept_description: "US female adult 35-54 with school-age children, suburban, high vehicle miles driven, active in children's extracurricular activities",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "household_type", value: "family_with_kids", weight: 0.30, description: "household with school-age children" },
      { dimension: "age_band", value: "35-44", weight: 0.25, description: "female adult aged 35 to 44" },
      { dimension: "age_band", value: "45-54", weight: 0.15, description: "female adult aged 45 to 54" },
      { dimension: "metro_tier", value: "top_50", weight: 0.15, description: "suburban or mid-size metro resident" },
      { dimension: "streaming_affinity", value: "medium", weight: 0.15, description: "moderate streaming consumption daytime" },
    ],
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-208", label: "Parenting", similarity: 0.71, source: "manual_crosswalk" },
      { vendor: "liveramp", node_id: "LR_SUBURBAN_MOM_35_50", label: "Suburban Moms 35-50", similarity: 0.94, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_FAMILY_DRIVER", label: "Family Driver", similarity: 0.88, source: "embedding_inference" },
    ],
    similarity_threshold: 0.85,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "URBAN_PROFESSIONAL_US",
    label: "Urban Professional",
    concept_description: "US adult 25-39 living in top-10 metro, college educated, household income 100K+, career-focused",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "age_band", value: "25-34", weight: 0.35, description: "young adult professional aged 25 to 34" },
      { dimension: "metro_tier", value: "top_10", weight: 0.30, description: "resident of top-10 US metro area" },
      { dimension: "education", value: "bachelors", weight: 0.20, description: "bachelor's degree holder" },
      { dimension: "income_band", value: "100k_150k", weight: 0.15, description: "household income 100K to 150K" },
    ],
    member_nodes: [
      { vendor: "liveramp", node_id: "LR_URBAN_PROFESSIONAL", label: "Urban Professionals", similarity: 0.96, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_METRO_CAREER", label: "Metro Career Adults", similarity: 0.89, source: "embedding_inference" },
    ],
    similarity_threshold: 0.85,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "AFFLUENT_FAMILY_US",
    label: "Affluent Family",
    concept_description: "US household with children, income 150K+, graduate education, suburban or top-25 metro",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "household_type", value: "family_with_kids", weight: 0.35, description: "household with children" },
      { dimension: "income_band", value: "150k_plus", weight: 0.35, description: "high income household above 150K" },
      { dimension: "education", value: "graduate", weight: 0.30, description: "graduate degree holder" },
    ],
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-178", label: "Affluent", similarity: 0.82, source: "manual_crosswalk" },
      { vendor: "experian", node_id: "MOSAIC_GROUP_A", label: "Wealthy Executives", similarity: 0.91, source: "embedding_inference" },
    ],
    similarity_threshold: 0.85,
    validated_at: "2026-03-07T00:00:00Z",
  },

  // ── Demographic ──────────────────────────────────────────────────────────────
  {
    concept_id: "HIGH_INCOME_HOUSEHOLD_US",
    label: "High Income Household",
    concept_description: "US households with annual income exceeding 150,000 USD",
    category: "demographic",
    iab_primary: "IAB-AT-1.1-178",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-178", label: "HHI $150K+", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_SEG_HHI_150K_PLUS", label: "HHI 150K+", similarity: 0.97, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_PREMIUM_INTENT_047", label: "Premium Intent", similarity: 0.91, source: "embedding_inference" },
      { vendor: "experian", node_id: "MOSAIC_GROUP_A_WEALTHY_EXECUTIVES", label: "Wealthy Executives", similarity: 0.88, source: "embedding_inference" },
      { vendor: "nielsen", node_id: "DMA_501_HHI_150K_QUINTILE_1", label: "HHI Q1", similarity: 0.85, source: "embedding_inference" },
    ],
    similarity_threshold: 0.85,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "PARENTS_WITH_YOUNG_CHILDREN_US",
    label: "Parents with Young Children",
    concept_description: "US adults with children under 12 in household",
    category: "demographic",
    iab_primary: "IAB-AT-1.1-208",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-208", label: "Parenting", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_PARENTS_U12", label: "Parents Under 12", similarity: 0.93, source: "embedding_inference" },
    ],
    similarity_threshold: 0.82,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "SENIOR_HOUSEHOLD_US",
    label: "Senior Household",
    concept_description: "US households with primary adult 65 or older, retired or near-retirement",
    category: "demographic",
    member_nodes: [
      { vendor: "liveramp", node_id: "LR_SENIOR_65PLUS", label: "Seniors 65+", similarity: 0.95, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_SENIOR_HH", label: "Senior Households", similarity: 0.91, source: "embedding_inference" },
    ],
    similarity_threshold: 0.82,
    validated_at: "2026-03-07T00:00:00Z",
  },

  // ── Interest ─────────────────────────────────────────────────────────────────
  {
    concept_id: "LUXURY_GOODS_INTEREST_US",
    label: "Luxury Goods Interest",
    concept_description: "US adults with demonstrated interest in luxury brands, premium fashion, high-end goods",
    category: "interest",
    iab_primary: "IAB-AT-1.1-596",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-596", label: "Luxury Products", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_LUXURY_AFFINITY", label: "Luxury Affinity", similarity: 0.95, source: "embedding_inference" },
    ],
    similarity_threshold: 0.82,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "COFFEE_ENTHUSIAST_US",
    label: "Coffee Enthusiast",
    concept_description: "US adults who regularly consume coffee, visit cafes, purchase premium coffee products",
    category: "interest",
    member_nodes: [
      { vendor: "liveramp", node_id: "LR_COFFEE_DRINKER", label: "Coffee Drinkers", similarity: 0.96, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_COFFEE_BUYER", label: "Coffee Buyers", similarity: 0.90, source: "embedding_inference" },
    ],
    similarity_threshold: 0.80,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "SPORTS_ENTHUSIAST_US",
    label: "Sports Enthusiast",
    concept_description: "US adults who actively follow or participate in sports — spectators and players",
    category: "interest",
    iab_primary: "IAB-AT-1.1-480",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-480", label: "Sports", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_SPORTS_FAN", label: "Sports Fans", similarity: 0.93, source: "embedding_inference" },
    ],
    similarity_threshold: 0.80,
    validated_at: "2026-03-07T00:00:00Z",
  },

  // ── Content / Behavioral ─────────────────────────────────────────────────────
  {
    concept_id: "DRAMA_VIEWER_US",
    label: "Drama TV Viewer",
    concept_description: "US adults who regularly watch drama television series across broadcast and streaming",
    category: "content",
    iab_primary: "IAB-AT-1.1-155",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-155", label: "TV Drama", similarity: 1.0, source: "concept_registry" },
      { vendor: "samba", node_id: "SAMBA_GENRE_DRAMA_VIEWER", label: "ACR Drama Viewers", similarity: 1.0, source: "concept_registry" },
    ],
    similarity_threshold: 0.80,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "AFTERNOON_DRAMA_VIEWER_US",
    label: "Afternoon Drama Viewer",
    concept_description: "US adults who watch drama television during afternoon daypart (12pm–5pm local), high index of non-full-time employment",
    category: "behavioral",
    constituent_dimensions: [
      { dimension: "content_genre", value: "drama", weight: 0.60, description: "drama television viewer" },
      { dimension: "streaming_affinity", value: "medium", weight: 0.40, description: "mid-day streaming or live TV viewer" },
    ],
    member_nodes: [
      { vendor: "samba", node_id: "SAMBA_DAYPART_AFTERNOON_DRAMA", label: "ACR Afternoon Drama 12-5pm", similarity: 1.0, source: "concept_registry" },
    ],
    similarity_threshold: 0.82,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "HEAVY_STREAMER_US",
    label: "Heavy Streamer",
    concept_description: "US adults consuming 4+ hours of streaming video daily across OTT platforms",
    category: "behavioral",
    member_nodes: [
      { vendor: "samba", node_id: "SAMBA_HEAVY_STREAMER_4H", label: "Heavy Streamers 4h+", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_OTT_HEAVY_USER", label: "OTT Heavy Users", similarity: 0.91, source: "embedding_inference" },
    ],
    similarity_threshold: 0.80,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "SCI_FI_VIEWER_US",
    label: "Sci-Fi Viewer",
    concept_description: "US adults who watch science fiction television and film content",
    category: "content",
    iab_primary: "IAB-AT-1.1-157",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-157", label: "Sci-Fi/Fantasy", similarity: 1.0, source: "concept_registry" },
      { vendor: "samba", node_id: "SAMBA_GENRE_SCI_FI", label: "ACR Sci-Fi Viewers", similarity: 1.0, source: "concept_registry" },
    ],
    similarity_threshold: 0.80,
    validated_at: "2026-03-07T00:00:00Z",
  },

  // ── Purchase Intent ───────────────────────────────────────────────────────────
  {
    concept_id: "AUTO_PURCHASE_INTENT_US",
    label: "Auto Purchase Intent",
    concept_description: "US adults in-market for a new or used vehicle within 90 days",
    category: "purchase_intent",
    iab_primary: "IAB-AT-1.1-714",
    member_nodes: [
      { vendor: "iab", node_id: "IAB-AT-1.1-714", label: "Auto Purchase Intent", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_AUTO_IN_MARKET_90D", label: "Auto In-Market 90d", similarity: 0.95, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_AUTO_INTENDER", label: "Auto Intenders", similarity: 0.92, source: "embedding_inference" },
    ],
    similarity_threshold: 0.85,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "HOME_PURCHASE_INTENT_US",
    label: "Home Purchase Intent",
    concept_description: "US adults actively searching for a home to buy or recently relocated",
    category: "purchase_intent",
    member_nodes: [
      { vendor: "liveramp", node_id: "LR_HOME_BUYER_INTENT", label: "Home Buyer Intent", similarity: 0.94, source: "embedding_inference" },
      { vendor: "tradedesk", node_id: "TTD_REAL_ESTATE_INTENDER", label: "Real Estate Intenders", similarity: 0.89, source: "embedding_inference" },
    ],
    similarity_threshold: 0.83,
    validated_at: "2026-03-07T00:00:00Z",
  },

  // ── Geo ───────────────────────────────────────────────────────────────────────
  {
    concept_id: "NASHVILLE_DMA_US",
    label: "Nashville DMA",
    concept_description: "Residents of Nashville Tennessee metro area, DMA 659",
    category: "geo",
    member_nodes: [
      { vendor: "samba", node_id: "SAMBA_GEO_DMA_659", label: "Nashville DMA ACR", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_GEO_DMA_659", label: "Nashville DMA", similarity: 0.99, source: "manual_crosswalk" },
    ],
    similarity_threshold: 0.90,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "NYC_DMA_US",
    label: "New York City DMA",
    concept_description: "Residents of New York City metro area, DMA 501",
    category: "geo",
    member_nodes: [
      { vendor: "samba", node_id: "SAMBA_GEO_DMA_501", label: "NYC DMA ACR", similarity: 1.0, source: "concept_registry" },
      { vendor: "liveramp", node_id: "LR_GEO_DMA_501", label: "NYC DMA", similarity: 0.99, source: "manual_crosswalk" },
    ],
    similarity_threshold: 0.90,
    validated_at: "2026-03-07T00:00:00Z",
  },
  {
    concept_id: "LA_DMA_US",
    label: "Los Angeles DMA",
    concept_description: "Residents of Los Angeles metro area, DMA 803",
    category: "geo",
    member_nodes: [
      { vendor: "samba", node_id: "SAMBA_GEO_DMA_803", label: "LA DMA ACR", similarity: 1.0, source: "concept_registry" },
    ],
    similarity_threshold: 0.90,
    validated_at: "2026-03-07T00:00:00Z",
  },

  // ── B2B ad-tech & data professionals ────────────────────────────────────────
  // Added 2026-08-07. WHY: the registry was consumer/CTV only, so a publisher
  // selling B2B ad-tech inventory had no shared noun to map onto. A mapping run
  // over 20 such audiences returned 0 usable concepts, and token overlap
  // cheerfully matched "engineers working with embeddings and AI infrastructure"
  // to PARENTS_WITH_YOUNG_CHILDREN_US. A registry that cannot name an audience
  // should say so, not return the nearest consumer stereotype.
  //
  // Deliberately publisher-INDEPENDENT: roles and domains any B2B ad-tech
  // publisher could map onto, not a mirror of one publisher's segment list.
  // No _US suffix — unlike the archetypes above, these are not geo-scoped.
  //
  // member_nodes are EMPTY on purpose. The consumer entries carry IAB /
  // LiveRamp / TradeDesk crosswalks; no verified equivalent exists for these,
  // and inventing plausible vendor node ids would fabricate exactly the kind of
  // claim a buyer acts on. Empty means unmapped, and unmapped is the truth
  // until a real crosswalk is sourced.
  //
  // Dimensions reuse the vocabulary already in seed/b2b-firmographic.csv
  // (function / seniority / industry / company_size_band) rather than inventing
  // a parallel one.
  {
    concept_id: "AGENTIC_STANDARDS_EVALUATOR",
    label: "Agentic Standards Evaluator",
    concept_description: "Practitioners evaluating agentic advertising protocols and standards including AdCP, AAMP, UCP and MCP, covering protocol governance, interoperability and conformance. Typically technical strategy leads, standards working group participants and platform architects.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "cross_functional", weight: 0.30, description: "spans product, engineering and standards strategy" },
      { dimension: "seniority", value: "director_plus", weight: 0.30, description: "director and above, decision-influencing" },
      { dimension: "industry", value: "technology_software", weight: 0.25, description: "advertising technology and software" },
      { dimension: "topic_affinity", value: "agentic_protocols", weight: 0.15, description: "tracks agentic advertising protocol development" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "CLEAN_ROOM_PRACTITIONER",
    label: "Clean Room Practitioner",
    concept_description: "Professionals operating or evaluating data clean rooms and privacy enhancing technologies for cross-party data collaboration, including matching, measurement and activation without raw data movement.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "it", weight: 0.30, description: "data engineering and platform functions" },
      { dimension: "seniority", value: "director_plus", weight: 0.25, description: "director and above" },
      { dimension: "industry", value: "all", weight: 0.20, description: "cross-industry, concentrated in retail, finance and media" },
      { dimension: "topic_affinity", value: "data_collaboration", weight: 0.25, description: "clean rooms, PETs and privacy preserving measurement" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "CDP_ARCHITECT",
    label: "CDP and Customer Data Architect",
    concept_description: "Architects and decision makers for customer data platforms and the surrounding data stack, covering composable and packaged CDPs, warehouse native activation, reverse ETL, identity and schema design.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "it", weight: 0.30, description: "data architecture and engineering" },
      { dimension: "seniority", value: "director_plus", weight: 0.25, description: "director and above, budget influencing" },
      { dimension: "company_size_band", value: "mid_enterprise", weight: 0.20, description: "mid-market and enterprise data estates" },
      { dimension: "topic_affinity", value: "customer_data_architecture", weight: 0.25, description: "CDP, warehouse native and composable data stacks" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "ADTECH_PLATFORM_ENGINEER",
    label: "AdTech Platform Engineer",
    concept_description: "Engineers building and operating advertising delivery infrastructure including bidders, exchanges, header bidding, ad servers, server side ad insertion and the latency bound serving path.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "it", weight: 0.35, description: "software and platform engineering" },
      { dimension: "seniority", value: "ic_manager", weight: 0.30, description: "individual contributor through engineering manager" },
      { dimension: "industry", value: "technology_software", weight: 0.20, description: "advertising technology" },
      { dimension: "topic_affinity", value: "ad_serving_infrastructure", weight: 0.15, description: "bidding, serving and delivery systems" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "MEASUREMENT_ANALYST",
    label: "Measurement and Attribution Analyst",
    concept_description: "Analysts and marketing scientists working on attribution, incrementality, media mix modelling and experiment design, deciding what a reported advertising outcome actually proves.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "marketing", weight: 0.30, description: "marketing analytics and measurement science" },
      { dimension: "seniority", value: "ic_manager", weight: 0.25, description: "analyst through measurement lead" },
      { dimension: "industry", value: "all", weight: 0.20, description: "cross-industry advertiser and agency side" },
      { dimension: "topic_affinity", value: "measurement_attribution", weight: 0.25, description: "incrementality, media mix modelling and experiment design" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "PUBLISHER_MONETIZATION_LEAD",
    label: "Publisher Monetization Lead",
    concept_description: "Supply side leaders responsible for yield, inventory strategy and demand partnerships, including direct sold, programmatic and agent mediated selling.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "sales", weight: 0.30, description: "revenue, yield and demand partnerships" },
      { dimension: "seniority", value: "director_plus", weight: 0.30, description: "director and above" },
      { dimension: "industry", value: "media_publishing", weight: 0.25, description: "publishers and media owners" },
      { dimension: "topic_affinity", value: "yield_monetization", weight: 0.15, description: "inventory yield and monetization strategy" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "AGENCY_MEDIA_STRATEGIST",
    label: "Agency Media Strategist",
    concept_description: "Agency side planners and strategists responsible for channel mix, buying approach and client media recommendations across programmatic, retail media and emerging agentic channels.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "marketing", weight: 0.35, description: "media planning and strategy" },
      { dimension: "seniority", value: "vp_director", weight: 0.25, description: "senior planner through vice president" },
      { dimension: "industry", value: "advertising_agency", weight: 0.25, description: "media and creative agencies" },
      { dimension: "topic_affinity", value: "media_strategy", weight: 0.15, description: "channel mix and buying strategy" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "REVENUE_OPERATIONS_LEADER",
    label: "Revenue Operations Leader",
    concept_description: "Commercial leaders responsible for go to market operations, covering pipeline architecture, packaging and pricing, sales productivity and the systems connecting marketing spend to booked revenue.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "sales", weight: 0.30, description: "revenue operations and commercial strategy" },
      { dimension: "seniority", value: "vp_director", weight: 0.30, description: "vice president and director level" },
      { dimension: "company_size_band", value: "mid_market_500_5000", weight: 0.20, description: "mid-market and scaling organisations" },
      { dimension: "topic_affinity", value: "revenue_operations", weight: 0.20, description: "go to market operations, packaging and pipeline" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "AI_INFRASTRUCTURE_ENGINEER",
    label: "AI and Embeddings Infrastructure",
    concept_description: "Engineers and architects working with embeddings, vector databases, retrieval pipelines and model infrastructure underneath AI driven advertising and data products.",
    category: "archetype",
    constituent_dimensions: [
      { dimension: "function", value: "it", weight: 0.35, description: "machine learning and data infrastructure engineering" },
      { dimension: "seniority", value: "ic_manager", weight: 0.30, description: "engineer through architect" },
      { dimension: "industry", value: "technology_software", weight: 0.20, description: "technology and software" },
      { dimension: "topic_affinity", value: "ai_infrastructure", weight: 0.15, description: "embeddings, vector search and retrieval systems" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "IDENTITY_RESOLUTION_STRATEGIST",
    label: "Identity and Addressability Strategist",
    concept_description: "Strategists working on identity resolution and addressability after third party cookies, covering identity graphs, alternative identifiers, consent bound matching and cross device resolution.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "cross_functional", weight: 0.30, description: "spans data, product and privacy" },
      { dimension: "seniority", value: "director_plus", weight: 0.25, description: "director and above" },
      { dimension: "topic_affinity", value: "identity_addressability", weight: 0.45, description: "identity graphs, alternative identifiers and addressability" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "FIRST_PARTY_DATA_STRATEGY",
    label: "First Party Data Strategy",
    concept_description: "Interest in first party and zero party data strategy, covering collection, consent, enrichment and activation of owned customer data as third party signal degrades.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "marketing", weight: 0.30, description: "marketing and customer data ownership" },
      { dimension: "seniority", value: "director_plus", weight: 0.25, description: "director and above" },
      { dimension: "topic_affinity", value: "first_party_data", weight: 0.45, description: "owned data collection, consent and activation" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "RETAIL_MEDIA_OPERATOR",
    label: "Retail and Commerce Media Operator",
    concept_description: "Professionals building or buying retail and commerce media, covering onsite and offsite retail networks, closed loop measurement, in store digital and commerce data collaboration.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "cross_functional", weight: 0.30, description: "spans commercial, media and data" },
      { dimension: "industry", value: "retail_cpg", weight: 0.30, description: "retail, consumer packaged goods and commerce platforms" },
      { dimension: "topic_affinity", value: "retail_commerce_media", weight: 0.40, description: "retail media networks and commerce measurement" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "CONTEXTUAL_TARGETING_PRACTITIONER",
    label: "Contextual Targeting Practitioner",
    concept_description: "Practitioners using contextual and content derived targeting, covering semantic page understanding, brand suitability and cookieless context signals as an alternative to audience identifiers.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "marketing", weight: 0.30, description: "media and targeting strategy" },
      { dimension: "seniority", value: "ic_manager", weight: 0.25, description: "practitioner through lead" },
      { dimension: "topic_affinity", value: "contextual_intelligence", weight: 0.45, description: "semantic context and cookieless targeting" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "AD_FRAUD_QUALITY_DEFENDER",
    label: "Ad Fraud and Media Quality Defender",
    concept_description: "Professionals defending media quality, covering invalid traffic detection, verification, brand safety and supply chain transparency including AI native fraud patterns.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "it", weight: 0.30, description: "verification, security and quality engineering" },
      { dimension: "seniority", value: "director_plus", weight: 0.25, description: "director and above" },
      { dimension: "topic_affinity", value: "fraud_media_quality", weight: 0.45, description: "invalid traffic, verification and supply chain integrity" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "AI_SEARCH_VISIBILITY_LEAD",
    label: "AI Search and Answer Engine Visibility",
    concept_description: "Marketers and strategists working on brand visibility inside AI answer engines and generative search, covering retrieval eligibility, citation and how brands get surfaced when an agent answers instead of a results page.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "marketing", weight: 0.35, description: "search, content and demand generation" },
      { dimension: "seniority", value: "director_plus", weight: 0.20, description: "director and above" },
      { dimension: "topic_affinity", value: "ai_search_visibility", weight: 0.45, description: "answer engines, generative engine optimisation and retrieval eligibility" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
  {
    concept_id: "ATTENTION_MEASUREMENT_RESEARCHER",
    label: "Attention and Relevance Measurement",
    concept_description: "Researchers and strategists working on attention metrics and relevance science, covering attention adjusted currencies, eye tracking and panel methodologies, and what attention predicts about outcomes.",
    category: "interest",
    constituent_dimensions: [
      { dimension: "function", value: "marketing", weight: 0.30, description: "insight, research and measurement" },
      { dimension: "seniority", value: "ic_manager", weight: 0.25, description: "researcher through lead" },
      { dimension: "topic_affinity", value: "attention_measurement", weight: 0.45, description: "attention metrics and relevance science" },
    ],
    member_nodes: [],
    similarity_threshold: 0.85,
    validated_at: "2026-08-07T00:00:00Z",
  },
];

// ─── KV cache helpers ─────────────────────────────────────────────────────────

const KV_PREFIX = "concept:";
const KV_INDEX_KEY = "concept:__index__";
const CACHE_TTL_SECONDS = 86400; // 24h

export async function seedConceptsToKV(kv: KVNamespace): Promise<number> {
  const index = CONCEPT_REGISTRY.map((c) => c.concept_id);
  await kv.put(KV_INDEX_KEY, JSON.stringify(index), { expirationTtl: CACHE_TTL_SECONDS });
  for (const entry of CONCEPT_REGISTRY) {
    await kv.put(`${KV_PREFIX}${entry.concept_id}`, JSON.stringify(entry), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }
  return CONCEPT_REGISTRY.length;
}

export async function getConceptFromKV(
  kv: KVNamespace,
  concept_id: string
): Promise<ConceptEntry | null> {
  const raw = await kv.get(`${KV_PREFIX}${concept_id}`);
  if (!raw) return null;
  return JSON.parse(raw) as ConceptEntry;
}

// ─── Lookup ────────────────────────────────────────────────────────────────────

/** Exact lookup by concept_id — check KV first, fall back to in-memory */
export function getConceptById(concept_id: string): ConceptEntry | null {
  return CONCEPT_REGISTRY.find((c) => c.concept_id === concept_id) ?? null;
}

/** Semantic search — token overlap on label + description */
export function searchConcepts(query: string, limit = 10): ConceptEntry[] {
  return searchConceptsScored(query, limit).map((s) => s.entry);
}

/**
 * Same ranking, but keeps the score.
 *
 * searchConcepts() computed a relevance score and then threw it away on the
 * way out, so every consumer saw an unranked list with no way to tell a
 * strong match from a 0.06 token coincidence. A downstream publisher tried
 * to quality-gate a concept mapping on this and found its gate inert:
 * "engineers working with embeddings and AI infrastructure" came back
 * beside PARENTS_WITH_YOUNG_CHILDREN_US with nothing to separate them.
 *
 * Exposing the score lets a caller set its own floor. Note it is Jaccard
 * token overlap, NOT cosine similarity — treat it as a weak lexical signal
 * and set floors accordingly until Phase 2b adds real embeddings.
 */
export function searchConceptsScored(
  query: string,
  limit = 10,
): Array<{ entry: ConceptEntry; score: number }> {
  const qTokens = tokenise(query.toLowerCase());

  const scored = CONCEPT_REGISTRY.map((c) => {
    const text = `${c.concept_id} ${c.label} ${c.concept_description} ${c.category}`.toLowerCase();
    const score = jaccardOverlap(qTokens, tokenise(text));
    return { entry: c, score };
  });

  return scored
    .filter((s) => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Filter by category */
export function getConceptsByCategory(category: ConceptEntry["category"]): ConceptEntry[] {
  return CONCEPT_REGISTRY.filter((c) => c.category === category);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenise(text: string): Set<string> {
  return new Set(text.split(/\W+/).filter((t) => t.length > 2));
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
