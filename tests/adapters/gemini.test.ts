/**
 * Tests for Gemini adapter - parseConsensusResponse
 */

import { describe, it, expect } from 'vitest';
import { parseConsensusResponse } from '../../src/adapters/gemini.js';

describe('Gemini parseConsensusResponse', () => {
  it('should parse a complete response with blocking issues', () => {
    const response = `
ANALYSIS:
Well-structured plan with clear goals.

STRENGTHS:
- Good module separation
- Clear API design

CONCERNS:
- Consider adding rate limiting

BLOCKING_ISSUES:
- Missing authentication middleware
- No input validation strategy

RECOMMENDATIONS:
- Add rate limiting middleware

CONSENSUS: 72%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(72);
    expect(result.approved).toBe(false);
    expect(result.concerns).toEqual(['Consider adding rate limiting']);
    expect(result.blockingIssues).toEqual([
      'Missing authentication middleware',
      'No input validation strategy',
    ]);
    expect(result.recommendations).toEqual(['Add rate limiting middleware']);
  });

  it('should return empty blocking issues when "None"', () => {
    const response = `
ANALYSIS:
Excellent plan.

STRENGTHS:
- Comprehensive coverage

CONCERNS:
- Minor naming inconsistencies

BLOCKING_ISSUES:
- None

RECOMMENDATIONS:
- Standardize naming conventions

CONSENSUS: 96%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(96);
    expect(result.approved).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.concerns).toHaveLength(1);
  });

  it('should handle missing BLOCKING_ISSUES section (backward compat)', () => {
    const response = `
ANALYSIS:
Good plan overall.

STRENGTHS:
- Solid architecture design

CONCERNS:
- Some performance issue to watch

RECOMMENDATIONS:
- Optimize database queries

CONSENSUS: 88%
`;

    const result = parseConsensusResponse(response);

    expect(result.blockingIssues).toEqual([]);
    expect(result.score).toBe(88);
  });

  it('should filter none-variant blocking issues like "No blocking issues found"', () => {
    const response = `
ANALYSIS:
Good plan with solid foundation.

STRENGTHS:
- Clean design

CONCERNS:
- Minor performance concern

BLOCKING_ISSUES:
- No blocking issues found

RECOMMENDATIONS:
- Optimize queries

CONSENSUS: 91%
`;
    const result = parseConsensusResponse(response);
    expect(result.blockingIssues).toEqual([]);
  });

  it('should filter "None identified" from blocking issues', () => {
    const response = `
ANALYSIS:
Thorough review complete.

STRENGTHS:
- Well-structured code

CONCERNS:
- Could use more tests

BLOCKING_ISSUES:
- None identified

RECOMMENDATIONS:
- Add integration tests

CONSENSUS: 89%
`;
    const result = parseConsensusResponse(response);
    expect(result.blockingIssues).toEqual([]);
  });

  it('should handle ALL-CAPS format for blocking issues', () => {
    const response = `
ANALYSIS:
Detailed review of the plan.

STRENGTHS:
- Good structure

CONCERNS:
- Minor issue noted

BLOCKING_ISSUES:
- Critical security flaw

RECOMMENDATIONS:
- Fix security

CONSENSUS: 60%
`;

    const result = parseConsensusResponse(response);

    expect(result.blockingIssues).toEqual(['Critical security flaw']);
    expect(result.recommendations).toEqual(['Fix security']);
  });
});
