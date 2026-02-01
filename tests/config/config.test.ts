/**
 * Tests for configuration management
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { ConfigSchema } from '../../src/config/schema.js';
import { deepMerge } from '../../src/config/index.js';

describe('DEFAULT_CONFIG', () => {
  it('should have all required sections', () => {
    expect(DEFAULT_CONFIG.consensus).toBeDefined();
    expect(DEFAULT_CONFIG.apis).toBeDefined();
    expect(DEFAULT_CONFIG.project).toBeDefined();
    expect(DEFAULT_CONFIG.directories).toBeDefined();
    expect(DEFAULT_CONFIG.output).toBeDefined();
  });

  it('should have valid consensus defaults', () => {
    expect(DEFAULT_CONFIG.consensus.threshold).toBe(95);
    expect(DEFAULT_CONFIG.consensus.max_disagreements).toBe(10);
    expect(DEFAULT_CONFIG.consensus.escalation_action).toBe('pause');
  });

  it('should have valid API defaults', () => {
    expect(DEFAULT_CONFIG.apis.openai.model).toBe('gpt-4o');
    expect(DEFAULT_CONFIG.apis.openai.temperature).toBe(0.3);
    expect(DEFAULT_CONFIG.apis.openai.max_tokens).toBe(4096);
  });

  it('should have valid project defaults', () => {
    expect(DEFAULT_CONFIG.project.default_language).toBe('python');
    expect(DEFAULT_CONFIG.project.python.package_manager).toBe('pip');
    expect(DEFAULT_CONFIG.project.typescript.package_manager).toBe('npm');
  });

  it('should pass schema validation', () => {
    const result = ConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });
});

describe('ConfigSchema', () => {
  it('should accept valid complete config', () => {
    const config = {
      consensus: {
        threshold: 90,
        max_disagreements: 3,
        escalation_action: 'pause' as const,
      },
      apis: {
        openai: {
          model: 'gpt-4o-mini' as const,
          temperature: 0.5,
          max_tokens: 2048,
          available_models: ['gpt-4o', 'gpt-4o-mini'],
        },
        claude: {
          model: 'claude-sonnet-4-20250514',
        },
      },
      project: {
        default_language: 'typescript' as const,
        python: {
          package_manager: 'pip' as const,
          test_framework: 'pytest',
          min_version: '3.10',
        },
        typescript: {
          package_manager: 'npm' as const,
          test_framework: 'vitest' as const,
          min_version: '18',
        },
      },
      directories: {
        docs: './docs',
        tests: './tests',
        plans: './plans',
      },
      output: {
        format: 'markdown' as const,
        verbose: true,
        timestamps: false,
        show_consensus_dialog: true,
      },
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should accept partial config', () => {
    const config = {
      consensus: {
        threshold: 80,
      },
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid threshold', () => {
    const config = {
      consensus: {
        threshold: 150,
      },
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid language', () => {
    const config = {
      project: {
        default_language: 'java',
      },
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid model', () => {
    const config = {
      apis: {
        openai: {
          model: 'gpt-5',
        },
      },
    };

    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('deepMerge', () => {
  it('should merge simple objects', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };

    const result = deepMerge(target, source);

    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('should deep merge nested objects', () => {
    const target = {
      level1: {
        level2: {
          a: 1,
          b: 2,
        },
      },
    };
    const source = {
      level1: {
        level2: {
          b: 3,
          c: 4,
        },
      },
    };

    const result = deepMerge(target, source);

    expect(result).toEqual({
      level1: {
        level2: {
          a: 1,
          b: 3,
          c: 4,
        },
      },
    });
  });

  it('should not modify original objects', () => {
    const target = { a: 1 };
    const source = { b: 2 };

    deepMerge(target, source);

    expect(target).toEqual({ a: 1 });
    expect(source).toEqual({ b: 2 });
  });

  it('should handle arrays by replacement', () => {
    const target = { arr: [1, 2, 3] };
    const source = { arr: [4, 5] };

    const result = deepMerge(target, source);

    expect(result.arr).toEqual([4, 5]);
  });

  it('should skip undefined values in source', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, c: 3 };

    const result = deepMerge(target, source);

    // deepMerge skips undefined values, keeping original
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });
});
