/**
 * Tests for Grok adapter - parseConsensusResponse
 */

import { describe, it, expect } from 'vitest';
import { parseConsensusResponse } from '../../src/adapters/grok.js';

describe('Grok parseConsensusResponse', () => {
  it('should parse a complete response with blocking issues', () => {
    const response = `
ANALYSIS:
Solid plan with room for improvement.

STRENGTHS:
- Clean API design
- Good test coverage plan

CONCERNS:
- Consider adding monitoring

BLOCKING_ISSUES:
- Missing database migration strategy
- No rollback plan defined

RECOMMENDATIONS:
- Add observability layer

CONSENSUS: 70%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(70);
    expect(result.approved).toBe(false);
    expect(result.concerns).toEqual(['Consider adding monitoring']);
    expect(result.blockingIssues).toEqual([
      'Missing database migration strategy',
      'No rollback plan defined',
    ]);
  });

  it('should return empty blocking issues when "None"', () => {
    const response = `
ANALYSIS:
Great plan.

STRENGTHS:
- Well-structured

CONCERNS:
- Minor style inconsistencies

BLOCKING_ISSUES:
- None

RECOMMENDATIONS:
- Apply consistent formatting

CONSENSUS: 95%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(95);
    expect(result.approved).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('should filter none-variant blocking issues like "No blocking issues found"', () => {
    const response = `
ANALYSIS:
Solid implementation plan.

STRENGTHS:
- Good architecture

CONCERNS:
- Consider monitoring

BLOCKING_ISSUES:
- No blocking issues found

RECOMMENDATIONS:
- Add monitoring

CONSENSUS: 93%
`;
    const result = parseConsensusResponse(response);
    expect(result.blockingIssues).toEqual([]);
  });

  it('should filter "None identified" from blocking issues', () => {
    const response = `
ANALYSIS:
Well-considered approach.

STRENGTHS:
- Comprehensive coverage

CONCERNS:
- Minor style issues

BLOCKING_ISSUES:
- None identified

RECOMMENDATIONS:
- Standardize formatting

CONSENSUS: 91%
`;
    const result = parseConsensusResponse(response);
    expect(result.blockingIssues).toEqual([]);
  });

  it('should handle missing BLOCKING_ISSUES section (backward compat)', () => {
    const response = `
ANALYSIS:
Reasonable plan.

STRENGTHS:
- Good overall approach

CONCERNS:
- Needs more detail

RECOMMENDATIONS:
- Expand on implementation details

CONSENSUS: 82%
`;

    const result = parseConsensusResponse(response);

    expect(result.blockingIssues).toEqual([]);
    expect(result.score).toBe(82);
  });
});
