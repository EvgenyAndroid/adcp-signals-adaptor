# Seed / reference datasets

This directory contains CSV reference datasets that describe the dimensional
breadth of the signal catalog served by this agent. The live signals
themselves are defined in code under `src/domain/signals/` (one file per
vertical) and seeded into D1 by the pipeline in `src/domain/seedPipeline.ts`.
These CSVs are **reference material for catalog inspectors** — a buyer agent,
auditor, or integration partner who wants to understand the taxonomy and
dimension coverage without reading TypeScript.

They are NOT read at runtime. The live catalog is code-authored.

## Files

| File | Vertical | Rows | Dimensions |
|---|---|---|---|
| `demographics-sample.csv` | Demographic | 25 | age × income × education × household × region × metro |
| `interests-sample.csv` | Interest / Affinity | 28 | genre × affinity × age × income × metro |
| `geo-sample.csv` | Geographic | 30 | city × state × metro tier × region × population |
| `automotive.csv` | Automotive | 20 | segment × body-style × intent × age × income |
| `financial.csv` | Financial | 20 | product × wealth tier × credit tier × age band |
| `health.csv` | Health & Wellness | 20 | category × intent × age × region |
| `b2b-firmographic.csv` | B2B / Firmographic | 20 | function × seniority × industry × company size |
| `life-events.csv` | Life Events | 20 | event × window × age × household type |
| `behavioral.csv` | Behavioral | 20 | behavior × intensity × device × age |
| `intent.csv` | Intent / In-Market | 20 | vertical × product × window × intent tier |
| `transactional.csv` | Transactional / Purchase | 20 | category × channel × spend tier × frequency |
| `media-device.csv` | Media / Device | 20 | surface × daypart × device × subscription status |
| `retail-cpg.csv` | Retail / CPG | 20 | category × retailer × brand preference × frequency |
| `seasonal.csv` | Seasonal / Occasion | 20 | event × window × gift-type × spend tier |
| `psychographic.csv` | Psychographic / Lifestyle | 20 | archetype × attitude × spend orientation |

## Schema conventions

All CSVs share these conventions:

- Header row is lowercase, snake_case.
- Numeric fields (counts, scores, spend tiers) are unquoted numbers.
- Categorical fields use stable, agent-internal enum values — see
  `src/types/signal.ts` for the canonical list.
- `estimated_count` is the US adult population estimate matching the row's
  full dimensional intersection. These are illustrative, not precise.
- Geography uses ISO-3166-1 alpha-2 for country, USPS two-letter for US states,
  and internal shorthand for DMA / region cluster (e.g. `US-NYC-DMA`,
  `US-SUNBELT`).

## Why CSVs if they aren't read?

The live catalog is code-authored for type safety, versioning, and
validation — generating signals from a CSV at runtime would sacrifice all
three. But an inspector shouldn't have to read TypeScript to understand
the dimensional coverage of the catalog. These CSVs are the human-readable
summary: one row = one dimensional intersection = one named segment in the
live catalog.

If a future contributor wants to add new signals at scale (>50 in a
vertical), a pattern would be: add the rows to the CSV here, regenerate the
vertical file via a small script, review the diff, commit both.
