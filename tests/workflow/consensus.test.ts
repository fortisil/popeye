/**
 * Tests for consensus workflow
 */

import { describe, it, expect } from 'vitest';
import {
  formatPlanForReview,
  extractConcerns,
  meetsThreshold,
  validatePlanStructure,
  calculateAverageScore,
  getScoreTrend,
} from '../../src/workflow/consensus.js';
import type { ConsensusResult, ConsensusIteration } from '../../src/types/consensus.js';

describe('formatPlanForReview', () => {
  it('should format plan with context', () => {
    const plan = '# My Plan\n\nThis is the plan content.';
    const context = 'Python project for data processing';

    const formatted = formatPlanForReview(plan, context);

    expect(formatted).toContain('## Development Plan');
    expect(formatted).toContain(plan);
    expect(formatted).toContain('## Project Context');
    expect(formatted).toContain(context);
  });

  it('should handle empty context', () => {
    const plan = 'Simple plan';
    const context = '';

    const formatted = formatPlanForReview(plan, context);

    expect(formatted).toContain(plan);
    expect(formatted).toContain('## Project Context');
  });
});

describe('extractConcerns', () => {
  it('should extract concerns from result', () => {
    const result: ConsensusResult = {
      score: 80,
      analysis: 'Good plan overall',
      concerns: ['Missing error handling', 'No tests defined'],
      recommendations: ['Add logging', 'Consider caching'],
      approved: false,
      rawResponse: '',
    };

    const concerns = extractConcerns(result);

    expect(concerns).toContain('Missing error handling');
    expect(concerns).toContain('No tests defined');
    expect(concerns).toContain('Consider: Add logging');
    expect(concerns).toContain('Consider: Consider caching');
  });

  it('should handle empty concerns and recommendations', () => {
    const result: ConsensusResult = {
      score: 95,
      analysis: 'Perfect',
      approved: true,
      rawResponse: '',
    };

    const concerns = extractConcerns(result);

    expect(concerns).toEqual([]);
  });
});

describe('meetsThreshold', () => {
  it('should return true when score meets threshold', () => {
    expect(meetsThreshold(95, 95)).toBe(true);
    expect(meetsThreshold(100, 95)).toBe(true);
  });

  it('should return false when score is below threshold', () => {
    expect(meetsThreshold(94, 95)).toBe(false);
    expect(meetsThreshold(0, 95)).toBe(false);
  });

  it('should use default threshold of 95', () => {
    expect(meetsThreshold(95)).toBe(true);
    expect(meetsThreshold(94)).toBe(false);
  });
});

describe('validatePlanStructure', () => {
  it('should validate plan with all required sections', () => {
    const plan = `
# Background
Some background info

## Goals
1. Goal one
2. Goal two

### Milestones
- Milestone 1
- Milestone 2

#### Tasks
- Task 1
- Task 2

##### Test Plan
- Test case 1
`;

    const result = validatePlanStructure(plan);

    expect(result.valid).toBe(true);
    expect(result.missingSections).toEqual([]);
  });

  it('should detect missing sections', () => {
    const plan = `
# Background
Some background

## Goals
Some goals
`;

    const result = validatePlanStructure(plan);

    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('Milestones');
    expect(result.missingSections).toContain('Tasks');
    expect(result.missingSections).toContain('Test');
  });

  it('should handle case-insensitive matching', () => {
    const plan = `
# BACKGROUND
## GOALS
### MILESTONES
#### TASKS
##### TEST
`;

    const result = validatePlanStructure(plan);

    expect(result.valid).toBe(true);
  });
});

describe('calculateAverageScore', () => {
  it('should calculate average of iteration scores', () => {
    const iterations: ConsensusIteration[] = [
      { iteration: 1, plan: '', result: { score: 80, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 2, plan: '', result: { score: 90, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 3, plan: '', result: { score: 100, analysis: '', approved: true, rawResponse: '' }, timestamp: '' },
    ];

    const average = calculateAverageScore(iterations);

    expect(average).toBe(90);
  });

  it('should return 0 for empty iterations', () => {
    expect(calculateAverageScore([])).toBe(0);
  });

  it('should handle single iteration', () => {
    const iterations: ConsensusIteration[] = [
      { iteration: 1, plan: '', result: { score: 75, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
    ];

    expect(calculateAverageScore(iterations)).toBe(75);
  });
});

describe('getScoreTrend', () => {
  it('should detect improving trend', () => {
    const iterations: ConsensusIteration[] = [
      { iteration: 1, plan: '', result: { score: 70, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 2, plan: '', result: { score: 75, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 3, plan: '', result: { score: 85, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 4, plan: '', result: { score: 90, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
    ];

    expect(getScoreTrend(iterations)).toBe('improving');
  });

  it('should detect declining trend', () => {
    const iterations: ConsensusIteration[] = [
      { iteration: 1, plan: '', result: { score: 90, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 2, plan: '', result: { score: 85, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 3, plan: '', result: { score: 75, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 4, plan: '', result: { score: 70, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
    ];

    expect(getScoreTrend(iterations)).toBe('declining');
  });

  it('should detect stable trend', () => {
    const iterations: ConsensusIteration[] = [
      { iteration: 1, plan: '', result: { score: 80, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 2, plan: '', result: { score: 82, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 3, plan: '', result: { score: 81, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
      { iteration: 4, plan: '', result: { score: 83, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
    ];

    expect(getScoreTrend(iterations)).toBe('stable');
  });

  it('should return stable for single iteration', () => {
    const iterations: ConsensusIteration[] = [
      { iteration: 1, plan: '', result: { score: 80, analysis: '', approved: false, rawResponse: '' }, timestamp: '' },
    ];

    expect(getScoreTrend(iterations)).toBe('stable');
  });

  it('should return stable for empty iterations', () => {
    expect(getScoreTrend([])).toBe('stable');
  });
});
