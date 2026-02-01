/**
 * Tests for project types and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  ProjectSpecSchema,
  OutputLanguageSchema,
  OpenAIModelSchema,
} from '../../src/types/project.js';

describe('ProjectSpecSchema', () => {
  describe('valid inputs', () => {
    it('should accept a valid project spec with all fields', () => {
      const spec = {
        idea: 'Build a REST API for managing tasks',
        name: 'task-api',
        language: 'python',
        openaiModel: 'gpt-4o',
        outputDir: '/tmp/projects',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.idea).toBe(spec.idea);
        expect(result.data.language).toBe('python');
      }
    });

    it('should accept spec with only required fields', () => {
      const spec = {
        idea: 'Simple CLI tool',
        language: 'typescript',
        openaiModel: 'gpt-4o-mini',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it('should accept all valid OpenAI models', () => {
      const models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'];

      for (const model of models) {
        const spec = {
          idea: 'Test project idea here',
          language: 'python',
          openaiModel: model,
        };

        const result = ProjectSpecSchema.safeParse(spec);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid inputs', () => {
    it('should reject idea shorter than 10 characters', () => {
      const spec = {
        idea: 'Too short',
        language: 'python',
        openaiModel: 'gpt-4o',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it('should reject invalid language', () => {
      const spec = {
        idea: 'Build something great',
        language: 'java',
        openaiModel: 'gpt-4o',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it('should reject invalid OpenAI model', () => {
      const spec = {
        idea: 'Build something great',
        language: 'python',
        openaiModel: 'invalid-model',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const spec = {
        name: 'my-project',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });
  });
});

describe('OutputLanguageSchema', () => {
  it('should accept python', () => {
    const result = OutputLanguageSchema.safeParse('python');
    expect(result.success).toBe(true);
  });

  it('should accept typescript', () => {
    const result = OutputLanguageSchema.safeParse('typescript');
    expect(result.success).toBe(true);
  });

  it('should reject invalid language', () => {
    const result = OutputLanguageSchema.safeParse('ruby');
    expect(result.success).toBe(false);
  });
});

describe('OpenAIModelSchema', () => {
  it('should accept all valid models', () => {
    const validModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'];

    for (const model of validModels) {
      const result = OpenAIModelSchema.safeParse(model);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid model', () => {
    const result = OpenAIModelSchema.safeParse('gpt-5');
    expect(result.success).toBe(false);
  });
});
