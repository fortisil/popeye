/**
 * Project-related type definitions
 * Defines output languages, models, and project specifications
 */

import { z } from 'zod';

/**
 * Supported output languages for generated projects
 */
export const OutputLanguageSchema = z.enum(['python', 'typescript', 'fullstack']);
export type OutputLanguage = z.infer<typeof OutputLanguageSchema>;

/**
 * Commands configuration for a workspace app
 */
export interface WorkspaceAppCommands {
  test: string;
  lint: string;
  build: string;
  dev: string;
  typecheck?: string;
}

/**
 * Docker configuration for a workspace app
 */
export interface WorkspaceAppDocker {
  dockerfile: string;
  imageName: string;
  context: string;
}

/**
 * Single app configuration in a workspace
 */
export interface WorkspaceApp {
  name: string;
  path: string;
  language: 'python' | 'typescript';
  commands: WorkspaceAppCommands;
  docker?: WorkspaceAppDocker;
  /** Dependencies on other apps or shared packages */
  dependsOn?: string[];
  /** Files to include as context for AI code generation */
  contextRoots?: string[];
  /** UI spec path (frontend only) */
  uiSpec?: string;
}

/**
 * Shared configuration in a workspace
 */
export interface WorkspaceShared {
  /** OpenAPI spec path for contract-first development */
  contracts?: string;
  /** Generator command for FE client from OpenAPI */
  contractsGenerator?: string;
}

/**
 * Repo-level commands for workspace orchestration
 */
export interface WorkspaceCommands {
  testAll: string;
  lintAll: string;
  buildAll: string;
  devAll?: string;
}

/**
 * Docker configuration at workspace level
 */
export interface WorkspaceDocker {
  composePath: string;
  /** Root-level compose for convenience symlink */
  rootComposeSymlink?: boolean;
}

/**
 * Workspace configuration for fullstack projects
 */
export interface WorkspaceConfig {
  version: '1.0';
  apps: {
    frontend?: WorkspaceApp;
    backend?: WorkspaceApp;
  };
  shared?: WorkspaceShared;
  /** Repo-level commands that orchestrate across apps */
  commands: WorkspaceCommands;
  docker: WorkspaceDocker;
}

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
