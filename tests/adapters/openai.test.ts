/**
 * Tests for OpenAI adapter
 */

import { describe, it, expect } from 'vitest';
import { parseConsensusResponse } from '../../src/adapters/openai.js';

describe('parseConsensusResponse', () => {
  it('should parse a complete consensus response', () => {
    const response = `
ANALYSIS:
This is a well-structured plan that covers the main requirements.
The architecture is sound and follows best practices.

STRENGTHS:
- Clear project structure
- Comprehensive test coverage
- Good separation of concerns

CONCERNS:
- Missing error handling strategy
- No deployment plan
- Security considerations not addressed

RECOMMENDATIONS:
- Add error handling middleware
- Include deployment configuration
- Document security measures

CONSENSUS: 85%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(85);
    expect(result.approved).toBe(false);
    expect(result.analysis).toContain('well-structured plan');
    expect(result.strengths).toContain('Clear project structure');
    expect(result.concerns).toContain('Missing error handling strategy');
    expect(result.recommendations).toContain('Add error handling middleware');
    expect(result.rawResponse).toBe(response);
  });

  it('should mark as approved when score >= 95', () => {
    const response = `
ANALYSIS:
Excellent plan.

STRENGTHS:
- Everything is perfect

CONCERNS:
- None

RECOMMENDATIONS:
- None needed

CONSENSUS: 98%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(98);
    expect(result.approved).toBe(true);
  });

  it('should handle missing sections gracefully', () => {
    const response = `
Some random text without proper formatting.

CONSENSUS: 70%
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(70);
    expect(result.approved).toBe(false);
    expect(result.analysis).toBe('');
    expect(result.strengths).toEqual([]);
    expect(result.concerns).toEqual([]);
  });

  it('should handle missing score', () => {
    const response = `
ANALYSIS:
No score provided in this response.

STRENGTHS:
- Some strength
`;

    const result = parseConsensusResponse(response);

    expect(result.score).toBe(0);
    expect(result.approved).toBe(false);
  });

  it('should parse bulleted lists correctly', () => {
    const response = `
ANALYSIS:
Good plan.

STRENGTHS:
- First strength
- Second strength
* Third strength
+ Fourth strength

CONCERNS:
1. First concern
2. Second concern

RECOMMENDATIONS:
- Recommendation one
- Recommendation two

CONSENSUS: 80%
`;

    const result = parseConsensusResponse(response);

    expect(result.strengths).toHaveLength(4);
    expect(result.concerns).toHaveLength(2);
    expect(result.recommendations).toHaveLength(2);
  });

  it('should handle various score formats', () => {
    // With space
    expect(parseConsensusResponse('CONSENSUS: 90%').score).toBe(90);

    // Without space
    expect(parseConsensusResponse('CONSENSUS:95%').score).toBe(95);

    // Lowercase
    expect(parseConsensusResponse('consensus: 88%').score).toBe(88);

    // Mixed case
    expect(parseConsensusResponse('Consensus: 75%').score).toBe(75);
  });

  it('should handle edge case scores', () => {
    expect(parseConsensusResponse('CONSENSUS: 0%').score).toBe(0);
    expect(parseConsensusResponse('CONSENSUS: 100%').score).toBe(100);
  });
});
