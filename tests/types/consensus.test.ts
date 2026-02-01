/**
 * Tests for consensus types and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  ConsensusConfigSchema,
  DEFAULT_CONSENSUS_CONFIG,
} from '../../src/types/consensus.js';

describe('ConsensusConfigSchema', () => {
  describe('valid inputs', () => {
    it('should accept valid config with all fields', () => {
      const config = {
        threshold: 90,
        maxIterations: 3,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
        escalationAction: 'pause' as const,
        temperature: 0.5,
        maxTokens: 2048,
      };

      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept config with required fields only', () => {
      const config = {
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };

      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept threshold at boundaries', () => {
      // Minimum threshold
      const minResult = ConsensusConfigSchema.safeParse({
        threshold: 0,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      });
      expect(minResult.success).toBe(true);

      // Maximum threshold
      const maxResult = ConsensusConfigSchema.safeParse({
        threshold: 100,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      });
      expect(maxResult.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject threshold below 0', () => {
      const config = {
        threshold: -1,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject threshold above 100', () => {
      const config = {
        threshold: 101,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations below 1', () => {
      const config = {
        maxIterations: 0,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations above 20', () => {
      const config = {
        maxIterations: 21,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject temperature below 0', () => {
      const config = {
        temperature: -0.1,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject temperature above 2', () => {
      const config = {
        temperature: 2.1,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject maxTokens below 100', () => {
      const config = {
        maxTokens: 50,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject maxTokens above 32000', () => {
      const config = {
        maxTokens: 200000,
        openaiKey: 'sk-test-key',
        openaiModel: 'gpt-4o' as const,
      };
      const result = ConsensusConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});

describe('DEFAULT_CONSENSUS_CONFIG', () => {
  it('should have valid default values', () => {
    expect(DEFAULT_CONSENSUS_CONFIG.threshold).toBe(95);
    expect(DEFAULT_CONSENSUS_CONFIG.maxIterations).toBe(10);
    expect(DEFAULT_CONSENSUS_CONFIG.openaiModel).toBe('gpt-4o');
    expect(DEFAULT_CONSENSUS_CONFIG.temperature).toBe(0.3);
    expect(DEFAULT_CONSENSUS_CONFIG.maxTokens).toBe(4096);
  });

  it('should have escalation action', () => {
    expect(DEFAULT_CONSENSUS_CONFIG.escalationAction).toBe('pause');
  });
});
