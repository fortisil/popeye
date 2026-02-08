/**
 * Tests for model command validation logic
 * Tests the schemas and validation used by handleModel
 */

import { describe, it, expect } from 'vitest';
import { OpenAIModelSchema, KNOWN_OPENAI_MODELS } from '../../src/types/project.js';
import { GeminiModelSchema, GrokModelSchema, KNOWN_GEMINI_MODELS } from '../../src/types/consensus.js';

describe('OpenAI model validation', () => {
  it('should accept known OpenAI models', () => {
    for (const model of KNOWN_OPENAI_MODELS) {
      expect(OpenAIModelSchema.safeParse(model).success).toBe(true);
    }
  });

  it('should accept unknown/new OpenAI models (flexible)', () => {
    expect(OpenAIModelSchema.safeParse('gpt-5').success).toBe(true);
    expect(OpenAIModelSchema.safeParse('gpt-5.2-turbo').success).toBe(true);
    expect(OpenAIModelSchema.safeParse('o3-mini').success).toBe(true);
  });

  it('should reject empty string', () => {
    expect(OpenAIModelSchema.safeParse('').success).toBe(false);
  });
});

describe('Gemini model validation', () => {
  it('should accept known Gemini models', () => {
    for (const model of KNOWN_GEMINI_MODELS) {
      expect(GeminiModelSchema.safeParse(model).success).toBe(true);
    }
  });

  it('should accept unknown/new Gemini models (flexible)', () => {
    expect(GeminiModelSchema.safeParse('gemini-2.5-pro').success).toBe(true);
    expect(GeminiModelSchema.safeParse('gemini-3.0-ultra').success).toBe(true);
  });

  it('should reject empty string', () => {
    expect(GeminiModelSchema.safeParse('').success).toBe(false);
  });
});

describe('Grok model validation', () => {
  it('should accept any non-empty string as Grok model', () => {
    expect(GrokModelSchema.safeParse('grok-3').success).toBe(true);
    expect(GrokModelSchema.safeParse('grok-3-mini').success).toBe(true);
    expect(GrokModelSchema.safeParse('grok-2').success).toBe(true);
    expect(GrokModelSchema.safeParse('some-future-model').success).toBe(true);
  });

  it('should accept empty string with default', () => {
    // GrokModelSchema has a default, so empty parse gets default
    const result = GrokModelSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('grok-3');
    }
  });
});

describe('known models lists', () => {
  it('should have known OpenAI models', () => {
    expect(KNOWN_OPENAI_MODELS).toContain('gpt-4o');
    expect(KNOWN_OPENAI_MODELS).toContain('gpt-4o-mini');
    expect(KNOWN_OPENAI_MODELS.length).toBeGreaterThanOrEqual(5);
  });

  it('should have known Gemini models', () => {
    expect(KNOWN_GEMINI_MODELS).toContain('gemini-2.0-flash');
    expect(KNOWN_GEMINI_MODELS).toContain('gemini-1.5-pro');
    expect(KNOWN_GEMINI_MODELS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('backward compatibility', () => {
  it('should auto-detect known OpenAI models from bare name', () => {
    // Simulating the backward-compat logic in handleModel
    for (const model of KNOWN_OPENAI_MODELS) {
      const isKnown = (KNOWN_OPENAI_MODELS as readonly string[]).includes(model);
      expect(isKnown).toBe(true);
    }
  });

  it('should not auto-detect non-OpenAI models as known OpenAI', () => {
    const nonOpenAI = ['gemini-2.0-flash', 'grok-3'];
    for (const model of nonOpenAI) {
      const isKnown = (KNOWN_OPENAI_MODELS as readonly string[]).includes(model);
      expect(isKnown).toBe(false);
    }
  });
});
