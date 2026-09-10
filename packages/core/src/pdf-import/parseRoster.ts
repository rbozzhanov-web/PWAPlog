import { parserRules } from './rules';
import { ExtractedPage, ParseResult } from './types';

/** Picks the first rule whose matches() heuristic accepts this document and runs it. */
export function parseRoster(pages: ExtractedPage[]): ParseResult {
  const rule = parserRules.find((candidate) => candidate.matches(pages));
  if (!rule) {
    return { ruleId: 'none', candidates: [], crossChecks: [] };
  }
  return rule.parse(pages);
}
