/**
 * Project-related type definitions
 * Defines output languages, models, and project specifications
 */

import { z } from 'zod';

/**
 * Supported output languages for generated projects
 */
export const OutputLanguageSchema = z.enum(['python', 'typescript']);
export type OutputLanguage = z.infer<typeof OutputLanguageSchema>;

/**
 * Supported OpenAI models for consensus reviews
 */
export const OpenAIModelSchema = z.enum([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o1-preview',
  'o1-mini',
]);
export type OpenAIModel = z.infer<typeof OpenAIModelSchema>;

/**
 * Project specification provided by user
 */
export const ProjectSpecSchema = z.object({
  idea: z.string().min(10, 'Idea must be at least 10 characters'),
  name: z.string().optional(),
  language: OutputLanguageSchema,
  openaiModel: OpenAIModelSchema,
  outputDir: z.string().optional(),
});
export type ProjectSpec = z.infer<typeof ProjectSpecSchema>;

/**
 * Generated project information
 */
export interface GeneratedProject {
  name: string;
  path: string;
  language: OutputLanguage;
  files: string[];
  testsPath: string;
  dockerComposePath: string;
}

/**
 * Project generation options
 */
export interface GenerationOptions {
  includeDocker: boolean;
  includeTests: boolean;
  includeDocs: boolean;
  packageManager: 'pip' | 'poetry' | 'npm' | 'pnpm';
  testFramework: 'pytest' | 'jest' | 'vitest';
}

/**
 * Available OpenAI models with descriptions
 */
export const OPENAI_MODELS: Record<OpenAIModel, { description: string; recommended: string }> = {
  'gpt-4o': {
    description: 'Most capable, best reasoning',
    recommended: 'Complex projects',
  },
  'gpt-4o-mini': {
    description: 'Fast, cost-effective',
    recommended: 'Simple projects',
  },
  'gpt-4-turbo': {
    description: 'High capability, faster',
    recommended: 'Medium complexity',
  },
  'o1-preview': {
    description: 'Advanced reasoning',
    recommended: 'Architectural decisions',
  },
  'o1-mini': {
    description: 'Efficient reasoning',
    recommended: 'Code review',
  },
};
