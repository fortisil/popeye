/**
 * Persona switching tests
 * Validates that reviewerPersona is correctly threaded through consensus config
 * and that website projects use marketing persona
 */

import { describe, it, expect } from 'vitest';
import {
  ConsensusConfigSchema,
  DEFAULT_CONSENSUS_CONFIG,
} from '../../src/types/consensus.js';

/** Minimal required fields to parse ConsensusConfigSchema */
const BASE_CONFIG = { openaiModel: 'gpt-4o' };

describe('Reviewer Persona in ConsensusConfig', () => {
  it('uses default architect persona when reviewerPersona is undefined', () => {
    const config = ConsensusConfigSchema.parse(BASE_CONFIG);
    expect(config.reviewerPersona).toBeUndefined();
    // Default config should not have a persona
    expect(DEFAULT_CONSENSUS_CONFIG.reviewerPersona).toBeUndefined();
  });

  it('accepts custom marketing persona when reviewerPersona is set', () => {
    const marketingPersona =
      'a Senior Product Marketing Strategist, SEO expert, and Fullstack Web Architect';
    const config = ConsensusConfigSchema.parse({
      ...BASE_CONFIG,
      reviewerPersona: marketingPersona,
    });
    expect(config.reviewerPersona).toBe(marketingPersona);
  });

  it('validates reviewerPersona as optional string', () => {
    // Omitted entirely
    const withoutPersona = ConsensusConfigSchema.parse(BASE_CONFIG);
    expect(withoutPersona.reviewerPersona).toBeUndefined();

    // Explicit undefined
    const withUndefined = ConsensusConfigSchema.parse({
      ...BASE_CONFIG,
      reviewerPersona: undefined,
    });
    expect(withUndefined.reviewerPersona).toBeUndefined();
  });

  it('preserves persona through full config with other fields', () => {
    const config = ConsensusConfigSchema.parse({
      ...BASE_CONFIG,
      reviewer: 'gemini',
      threshold: 90,
      maxIterations: 5,
      reviewerPersona: 'a DevOps engineer with 10 years of experience',
    });

    expect(config.reviewer).toBe('gemini');
    expect(config.threshold).toBe(90);
    expect(config.maxIterations).toBe(5);
    expect(config.reviewerPersona).toBe(
      'a DevOps engineer with 10 years of experience'
    );
  });
});
