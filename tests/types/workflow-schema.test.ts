/**
 * Tests for ProjectStateSchema accepting all 5 language types
 */

import { describe, it, expect } from 'vitest';
import { ProjectStateSchema } from '../../src/types/workflow.js';

/**
 * Minimal valid project state for testing schema validation
 */
function makeMinimalState(language: string) {
  return {
    id: 'test-id',
    name: 'test-project',
    idea: 'A test project idea that is long enough',
    language,
    openaiModel: 'gpt-4o',
    phase: 'plan',
    status: 'pending',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('ProjectStateSchema language validation', () => {
  it('should accept python', () => {
    const result = ProjectStateSchema.safeParse(makeMinimalState('python'));
    expect(result.success).toBe(true);
  });

  it('should accept typescript', () => {
    const result = ProjectStateSchema.safeParse(makeMinimalState('typescript'));
    expect(result.success).toBe(true);
  });

  it('should accept fullstack', () => {
    const result = ProjectStateSchema.safeParse(makeMinimalState('fullstack'));
    expect(result.success).toBe(true);
  });

  it('should accept website', () => {
    const result = ProjectStateSchema.safeParse(makeMinimalState('website'));
    expect(result.success).toBe(true);
  });

  it('should accept all', () => {
    const result = ProjectStateSchema.safeParse(makeMinimalState('all'));
    expect(result.success).toBe(true);
  });

  it('should reject invalid language', () => {
    const result = ProjectStateSchema.safeParse(makeMinimalState('java'));
    expect(result.success).toBe(false);
  });
});
