import { FlightLogEntry } from '../logbook/types';

/** A single positioned text chunk as extracted from a PDF page. */
export interface TextItem {
  str: string;
  /** Distance from the left edge of the page, in PDF points. */
  x: number;
  /** Distance from the TOP of the page, in PDF points (normalized so ascending y = reading order). */
  y: number;
  width: number;
}

export interface ExtractedPage {
  items: TextItem[];
  width: number;
  height: number;
}

export type ParseConfidence = 'high' | 'medium' | 'low';

/** A flight entry the parser proposes, always shown to the user for review before saving. */
export interface ParsedCandidate {
  fields: Partial<FlightLogEntry>;
  rawSourceLine: string;
  confidence: ParseConfidence;
  /**
   * Human-readable notes on what this row needs checked, shown verbatim on the review screen.
   * Written as sentences rather than field names so the pilot can act on them without knowing
   * the internals — an import that quietly says "Check this" is not actionable.
   */
  unmatchedFields: string[];
}

export interface CrossCheck {
  label: string;
  parsedTotalMinutes: number;
  reportedTotalMinutes: number;
  matches: boolean;
}

export interface ParseResult {
  ruleId: string;
  candidates: ParsedCandidate[];
  crossChecks: CrossCheck[];
}

export interface ParserRule {
  id: string;
  /** Cheap heuristic: does this rule know how to parse this document? */
  matches(pages: ExtractedPage[]): boolean;
  parse(pages: ExtractedPage[]): ParseResult;
}
