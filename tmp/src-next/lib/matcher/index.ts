// src/lib/matcher/index.ts
// URL pattern matching with specificity scoring

import type { MatchCandidate, MatchOutcome, MatchScore, SpecificityReason } from './types';

/**
 * Scores a URL glob pattern for specificity:
 * - Higher scores for exact origins and hosts
 * - Higher scores for longer paths and literal segments
 * - Lower scores for wildcards
 */
function scorePattern(pattern: string, url: string): MatchScore | null {
  const reasons: SpecificityReason[] = [];
  let score = 0;

  try {
    const patternUrl = new URL(pattern.replace(/\*/g, 'WILDCARD'));
    const targetUrl = new URL(url);

    // Scheme matching
    if (pattern.startsWith('https://')) {
      score += 10;
      reasons.push('origin-exact');
    } else if (pattern.startsWith('*://')) {
      score += 1;
      reasons.push('scheme-wildcard');
    }

    // Host matching
    const patternHost = patternUrl.hostname.replace(/WILDCARD/g, '*');
    if (patternHost === targetUrl.hostname) {
      score += 20;
      reasons.push('host-exact');
    } else if (patternHost.includes('*')) {
      const hostRegex = new RegExp(
        '^' + patternHost.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      if (hostRegex.test(targetUrl.hostname)) {
        score += 5;
      } else {
        return null;
      }
    } else {
      return null;
    }

    // Path matching
    const patternPath = patternUrl.pathname.replace(/WILDCARD/g, '*');
    const targetPath = targetUrl.pathname;

    if (patternPath === targetPath) {
      score += 30;
      reasons.push('path-literal');
    } else if (patternPath.includes('*')) {
      const pathRegex = new RegExp(
        '^' + patternPath.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      if (pathRegex.test(targetPath)) {
        const literalSegments = patternPath.split('/').filter((s) => s && s !== '*').length;
        score += literalSegments * 5;
        reasons.push('path-wildcard');
      } else {
        return null;
      }
    } else {
      return null;
    }

    return { pattern, score, reasons };
  } catch {
    return null;
  }
}

/**
 * Finds the best matching automator for a given URL.
 * Returns error if multiple automators have equal best scores.
 */
export function matchUrl(url: string, candidates: MatchCandidate[]): MatchOutcome | null {
  const scored = new Map<string, MatchScore[]>();

  for (const candidate of candidates) {
    const score = scorePattern(candidate.pattern, url);
    if (score) {
      if (!scored.has(candidate.slug)) {
        scored.set(candidate.slug, []);
      }
      scored.get(candidate.slug)!.push(score);
    }
  }

  if (scored.size === 0) {
    return null;
  }

  const outcomes: Array<{ slug: string; best: MatchScore; all: MatchScore[] }> = [];
  for (const [slug, scores] of scored.entries()) {
    const sorted = scores.sort((a, b) => b.score - a.score);
    outcomes.push({ slug, best: sorted[0], all: sorted });
  }

  outcomes.sort((a, b) => b.best.score - a.best.score);

  if (outcomes.length > 1 && outcomes[0].best.score === outcomes[1].best.score) {
    throw new Error(
      `MULTIPLE_MATCH: Multiple automators matched with equal specificity: ${outcomes
        .filter((o) => o.best.score === outcomes[0].best.score)
        .map((o) => o.slug)
        .join(', ')}`
    );
  }

  return outcomes[0];
}
