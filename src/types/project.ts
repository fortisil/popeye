/**
 * Project-related type definitions
 * Defines output languages, models, and project specifications
 */

import { z } from 'zod';

/**
 * Supported output languages for generated projects
 */
/**
 * Supported output languages for generated projects
 * - python: Backend only (FastAPI)
 * - typescript: Frontend only (React/Vite)
 * - fullstack: FE + BE
 * - website: Website only (Next.js SSG/SSR)
 * - all: FE + BE + Website (everything)
 */
export const OutputLanguageSchema = z.enum([
  'python',
  'typescript',
  'fullstack',
  'website',
  'all',
]);
export type OutputLanguage = z.infer<typeof OutputLanguageSchema>;

/**
 * App types that can be generated
 */
export type AppType = 'frontend' | 'backend' | 'website';

/**
 * Maps a language to the apps it will generate
 *
 * @param language - The output language
 * @returns Array of app types to generate
 */
export function languageToApps(language: OutputLanguage): AppType[] {
  const mapping: Record<OutputLanguage, AppType[]> = {
    python: ['backend'],
    typescript: ['frontend'],
    fullstack: ['frontend', 'backend'],
    website: ['website'],
    all: ['frontend', 'backend', 'website'],
  };
  return mapping[language];
}

/**
 * Checks if a language generates a specific app type
 *
 * @param language - The output language
 * @param app - The app type to check
 * @returns True if the language generates the app
 */
export function hasApp(language: OutputLanguage, app: AppType): boolean {
  return languageToApps(language).includes(app);
}

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
  /** Shared UI components package path */
  ui?: string;
  /** Design tokens package path */
  designTokens?: string;
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
 * Workspace configuration for fullstack/website/all projects
 */
export interface WorkspaceConfig {
  version: '1.0';
  apps: {
    frontend?: WorkspaceApp;
    backend?: WorkspaceApp;
    website?: WorkspaceApp;
  };
  shared?: WorkspaceShared;
  /** Repo-level commands that orchestrate across apps */
  commands: WorkspaceCommands;
  docker: WorkspaceDocker;
}

/**
 * Brand colors for website design
 */
export interface WebsiteBrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}

/**
 * Typography configuration for website
 */
export interface WebsiteTypography {
  headingFont: string;
  bodyFont: string;
}

/**
 * SEO configuration for website
 */
export interface WebsiteSeo {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  twitterHandle?: string;
  locale: string;
}

/**
 * Page configuration for website
 */
export interface WebsitePage {
  name: string;
  path: string;
  type: 'landing' | 'pricing' | 'docs' | 'blog' | 'changelog' | 'legal';
  seo?: {
    title?: string;
    description?: string;
  };
}

/**
 * Call-to-action configuration
 */
export interface WebsiteCta {
  primary: {
    text: string;
    href: string;
  };
  secondary?: {
    text: string;
    href: string;
  };
}

/**
 * Feature flags for website
 */
export interface WebsiteFeatures {
  analytics?: boolean;
  newsletter?: boolean;
  mdxBlog?: boolean;
  docsSearch?: boolean;
}

/**
 * Website specification for Next.js marketing sites
 */
export interface WebsiteSpec {
  version: '1.0';
  brand: {
    name: string;
    tagline?: string;
    colors: WebsiteBrandColors;
    typography: WebsiteTypography;
  };
  seo: WebsiteSeo;
  pages: WebsitePage[];
  cta: WebsiteCta;
  features?: WebsiteFeatures;
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
