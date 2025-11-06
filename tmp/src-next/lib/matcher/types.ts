// src/lib/matcher/types.ts
// URL pattern matching and specificity scoring types

import type { AutomatorSlug, UrlGlob } from '../ws/types';

export interface MatchCandidate {
  slug: AutomatorSlug;
  pattern: UrlGlob;
}

export type SpecificityReason =
  | 'origin-exact'
  | 'host-exact'
  | 'path-literal'
  | 'path-wildcard'
  | 'scheme-wildcard';

export interface MatchScore {
  pattern: UrlGlob;
  score: number;
  reasons: ReadonlyArray<SpecificityReason>;
}

export interface MatchOutcome {
  slug: AutomatorSlug;
  best: MatchScore;
  all: ReadonlyArray<MatchScore>;
}
