/**
 * Configuration schema definitions using Zod
 * Matches popeye-cli-spec.md section 9.1 exactly
 */

import { z } from 'zod';

/**
 * Consensus settings schema
 */
export const ConsensusSettingsSchema = z.object({
  threshold: z.number().min(0).max(100).default(95),
  max_disagreements: z.number().min(1).max(10).default(5),
  escalation_action: z.enum(['pause', 'continue', 'abort']).default('pause'),
  // Reviewer and arbitrator settings (persisted across sessions)
  reviewer: z.enum(['openai', 'gemini']).default('openai'),
  arbitrator: z.enum(['openai', 'gemini', 'off']).default('off'),
  enable_arbitration: z.boolean().default(false),
});

/**
 * OpenAI API settings schema
 */
export const OpenAISettingsSchema = z.object({
  model: z
    .enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'])
    .default('gpt-4o'),
  temperature: z.number().min(0).max(2).default(0.3),
  max_tokens: z.number().min(100).max(32000).default(4096),
  available_models: z
    .array(z.string())
    .default(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini']),
});

/**
 * Claude API settings schema
 */
export const ClaudeSettingsSchema = z.object({
  model: z.string().default('claude-sonnet-4-20250514'),
});

/**
 * API configuration schema
 */
export const APISettingsSchema = z.object({
  openai: OpenAISettingsSchema.default({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 4096,
    available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
  }),
  claude: ClaudeSettingsSchema.default({
    model: 'claude-sonnet-4-20250514',
  }),
});

/**
 * Python project settings schema
 */
export const PythonSettingsSchema = z.object({
  package_manager: z.enum(['pip', 'poetry', 'pipenv']).default('pip'),
  test_framework: z.string().default('pytest'),
  min_version: z.string().default('3.10'),
});

/**
 * TypeScript project settings schema
 */
export const TypeScriptSettingsSchema = z.object({
  package_manager: z.enum(['npm', 'pnpm', 'yarn']).default('npm'),
  test_framework: z.enum(['jest', 'vitest']).default('jest'),
  min_version: z.string().default('18'),
});

/**
 * Project defaults schema
 */
export const ProjectSettingsSchema = z.object({
  default_language: z.enum(['python', 'typescript']).default('python'),
  python: PythonSettingsSchema.default({
    package_manager: 'pip',
    test_framework: 'pytest',
    min_version: '3.10',
  }),
  typescript: TypeScriptSettingsSchema.default({
    package_manager: 'npm',
    test_framework: 'jest',
    min_version: '18',
  }),
});

/**
 * Directory structure settings schema
 */
export const DirectorySettingsSchema = z.object({
  docs: z.string().default('docs'),
  tests: z.string().default('docs/tests'),
  plans: z.string().default('docs/plans'),
});

/**
 * Output settings schema
 */
export const OutputSettingsSchema = z.object({
  format: z.enum(['markdown', 'json']).default('markdown'),
  verbose: z.boolean().default(false),
  timestamps: z.boolean().default(true),
  show_consensus_dialog: z.boolean().default(true),
});

/**
 * Complete configuration schema
 */
export const ConfigSchema = z.object({
  consensus: ConsensusSettingsSchema.default({
    threshold: 95,
    max_disagreements: 5,
    escalation_action: 'pause',
    reviewer: 'openai',
    arbitrator: 'off',
    enable_arbitration: false,
  }),
  apis: APISettingsSchema.default({
    openai: {
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 4096,
      available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
    },
    claude: {
      model: 'claude-sonnet-4-20250514',
    },
  }),
  project: ProjectSettingsSchema.default({
    default_language: 'python',
    python: {
      package_manager: 'pip',
      test_framework: 'pytest',
      min_version: '3.10',
    },
    typescript: {
      package_manager: 'npm',
      test_framework: 'jest',
      min_version: '18',
    },
  }),
  directories: DirectorySettingsSchema.default({
    docs: 'docs',
    tests: 'docs/tests',
    plans: 'docs/plans',
  }),
  output: OutputSettingsSchema.default({
    format: 'markdown',
    verbose: false,
    timestamps: true,
    show_consensus_dialog: true,
  }),
});

/**
 * Configuration type inferred from schema
 */
export type Config = z.infer<typeof ConfigSchema>;
export type ConsensusSettings = z.infer<typeof ConsensusSettingsSchema>;
export type OpenAISettings = z.infer<typeof OpenAISettingsSchema>;
export type ClaudeSettings = z.infer<typeof ClaudeSettingsSchema>;
export type PythonSettings = z.infer<typeof PythonSettingsSchema>;
export type TypeScriptSettings = z.infer<typeof TypeScriptSettingsSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type DirectorySettings = z.infer<typeof DirectorySettingsSchema>;
export type OutputSettings = z.infer<typeof OutputSettingsSchema>;
