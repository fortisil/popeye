/**
 * Tests for project types and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  ProjectSpecSchema,
  OutputLanguageSchema,
  OpenAIModelSchema,
  isWorkspace,
  languageToApps,
  hasApp,
} from '../../src/types/project.js';
import type { OutputLanguage } from '../../src/types/project.js';

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

    it('should accept new/custom OpenAI model names', () => {
      const spec = {
        idea: 'Build something great',
        language: 'python',
        openaiModel: 'gpt-5.2-turbo',
      };

      const result = ProjectSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it('should reject empty OpenAI model', () => {
      const spec = {
        idea: 'Build something great',
        language: 'python',
        openaiModel: '',
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
  it('should accept all 5 valid languages', () => {
    const validLanguages = ['python', 'typescript', 'fullstack', 'website', 'all'];
    for (const lang of validLanguages) {
      const result = OutputLanguageSchema.safeParse(lang);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid language', () => {
    const result = OutputLanguageSchema.safeParse('ruby');
    expect(result.success).toBe(false);
  });
});

describe('isWorkspace', () => {
  it('should return true for fullstack', () => {
    expect(isWorkspace('fullstack')).toBe(true);
  });

  it('should return true for all', () => {
    expect(isWorkspace('all')).toBe(true);
  });

  it('should return false for python', () => {
    expect(isWorkspace('python')).toBe(false);
  });

  it('should return false for typescript', () => {
    expect(isWorkspace('typescript')).toBe(false);
  });

  it('should return false for website', () => {
    expect(isWorkspace('website')).toBe(false);
  });
});

describe('languageToApps', () => {
  it('should return backend for python', () => {
    expect(languageToApps('python')).toEqual(['backend']);
  });

  it('should return frontend for typescript', () => {
    expect(languageToApps('typescript')).toEqual(['frontend']);
  });

  it('should return frontend and backend for fullstack', () => {
    expect(languageToApps('fullstack')).toEqual(['frontend', 'backend']);
  });

  it('should return website for website', () => {
    expect(languageToApps('website')).toEqual(['website']);
  });

  it('should return all three for all', () => {
    expect(languageToApps('all')).toEqual(['frontend', 'backend', 'website']);
  });
});

describe('hasApp', () => {
  it('should detect backend in python', () => {
    expect(hasApp('python', 'backend')).toBe(true);
    expect(hasApp('python', 'frontend')).toBe(false);
  });

  it('should detect all apps in all', () => {
    expect(hasApp('all', 'frontend')).toBe(true);
    expect(hasApp('all', 'backend')).toBe(true);
    expect(hasApp('all', 'website')).toBe(true);
  });
});

describe('OpenAIModelSchema', () => {
  it('should accept known models', () => {
    const knownModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'];

    for (const model of knownModels) {
      const result = OpenAIModelSchema.safeParse(model);
      expect(result.success).toBe(true);
    }
  });

  it('should accept new/unknown models (flexible)', () => {
    expect(OpenAIModelSchema.safeParse('gpt-5').success).toBe(true);
    expect(OpenAIModelSchema.safeParse('gpt-5.2-turbo').success).toBe(true);
  });

  it('should reject empty string', () => {
    const result = OpenAIModelSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});
