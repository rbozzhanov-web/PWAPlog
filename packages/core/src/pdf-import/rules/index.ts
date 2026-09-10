import { ParserRule } from '../types';
import { airAstanaRule } from './airlines/airAstana';
import { genericRule } from './genericRule';

/** Airline-specific rules are tried first (most specific), the generic fallback always last. */
export const parserRules: ParserRule[] = [airAstanaRule, genericRule];
