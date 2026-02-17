/**
 * Tests for the review CLI command.
 */
import { describe, it, expect } from 'vitest';
import { createReviewCommand } from '../../../src/cli/commands/review.js';

describe('createReviewCommand', () => {
  it('should create a command named review', () => {
    const cmd = createReviewCommand();
    expect(cmd.name()).toBe('review');
  });

  it('should have audit as an alias', () => {
    const cmd = createReviewCommand();
    expect(cmd.aliases()).toContain('audit');
  });

  it('should accept the depth option', () => {
    const cmd = createReviewCommand();
    const depthOpt = cmd.options.find((o) => o.long === '--depth');
    expect(depthOpt).toBeDefined();
  });

  it('should accept the strict option', () => {
    const cmd = createReviewCommand();
    const strictOpt = cmd.options.find((o) => o.long === '--strict');
    expect(strictOpt).toBeDefined();
  });

  it('should accept the format option', () => {
    const cmd = createReviewCommand();
    const formatOpt = cmd.options.find((o) => o.long === '--format');
    expect(formatOpt).toBeDefined();
  });

  it('should accept the no-recover option', () => {
    const cmd = createReviewCommand();
    const recoverOpt = cmd.options.find((o) => o.long === '--no-recover');
    expect(recoverOpt).toBeDefined();
  });

  it('should accept the target option', () => {
    const cmd = createReviewCommand();
    const targetOpt = cmd.options.find((o) => o.long === '--target');
    expect(targetOpt).toBeDefined();
  });

  it('should have a description', () => {
    const cmd = createReviewCommand();
    expect(cmd.description()).toBeTruthy();
  });
});
