/**
 * Workspace manager module
 * Handles loading, saving, and querying workspace configuration for fullstack projects
 * Also provides app-specific context for AI reviews
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { WorkspaceConfig, WorkspaceApp } from '../types/project.js';
import type { ReviewAppTarget } from '../types/consensus.js';

/**
 * Context for AI review of a specific app
 */
export interface AppReviewContext {
  appName: 'frontend' | 'backend';
  language: 'python' | 'typescript';
  path: string;
  /** Key source files content for review */
  sourceFiles: Array<{ path: string; content: string }>;
  /** UI spec for frontend */
  uiSpec?: string;
  /** API contracts (OpenAPI) */
  apiContracts?: string;
  /** Test file content */
  testFiles?: Array<{ path: string; content: string }>;
  /** Dependencies (package.json or pyproject.toml) */
  dependencies?: string;
}

/**
 * Combined review context for fullstack projects
 */
export interface FullstackReviewContext {
  frontend?: AppReviewContext;
  backend?: AppReviewContext;
  /** Shared contracts (OpenAPI spec) */
  contracts?: string;
  /** Project-level context */
  projectName: string;
  projectIdea?: string;
}

/**
 * Workspace manager class
 */
export class WorkspaceManager {
  private projectDir: string;
  private config: WorkspaceConfig | null = null;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Get the path to workspace.json
   */
  private getWorkspacePath(): string {
    return path.join(this.projectDir, '.popeye', 'workspace.json');
  }

  /**
   * Check if this is a workspace project
   */
  async isWorkspaceProject(): Promise<boolean> {
    try {
      await fs.access(this.getWorkspacePath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load workspace configuration
   */
  async load(): Promise<WorkspaceConfig | null> {
    try {
      const content = await fs.readFile(this.getWorkspacePath(), 'utf-8');
      this.config = JSON.parse(content) as WorkspaceConfig;
      return this.config;
    } catch {
      return null;
    }
  }

  /**
   * Save workspace configuration
   */
  async save(config: WorkspaceConfig): Promise<void> {
    const workspacePath = this.getWorkspacePath();
    const dir = path.dirname(workspacePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write config
    await fs.writeFile(workspacePath, JSON.stringify(config, null, 2), 'utf-8');
    this.config = config;
  }

  /**
   * Get the loaded configuration
   */
  getConfig(): WorkspaceConfig | null {
    return this.config;
  }

  /**
   * Get a specific app configuration
   */
  getApp(appName: 'frontend' | 'backend'): WorkspaceApp | undefined {
    return this.config?.apps[appName];
  }

  /**
   * Get the absolute path to an app
   */
  getAppPath(appName: 'frontend' | 'backend'): string | null {
    const app = this.getApp(appName);
    if (!app) return null;
    return path.join(this.projectDir, app.path);
  }

  /**
   * Get all app names
   */
  getAppNames(): ('frontend' | 'backend')[] {
    if (!this.config) return [];
    const names: ('frontend' | 'backend')[] = [];
    if (this.config.apps.frontend) names.push('frontend');
    if (this.config.apps.backend) names.push('backend');
    return names;
  }

  /**
   * Get test command for a specific app
   */
  getTestCommand(appName: 'frontend' | 'backend'): string | null {
    const app = this.getApp(appName);
    return app?.commands.test ?? null;
  }

  /**
   * Get all test commands (returns object with app names as keys)
   */
  getAllTestCommands(): Record<string, { path: string; command: string }> {
    if (!this.config) return {};

    const commands: Record<string, { path: string; command: string }> = {};

    for (const appName of this.getAppNames()) {
      const app = this.getApp(appName);
      if (app) {
        commands[appName] = {
          path: path.join(this.projectDir, app.path),
          command: app.commands.test,
        };
      }
    }

    return commands;
  }

  /**
   * Get the combined test-all command
   */
  getTestAllCommand(): string | null {
    return this.config?.commands.testAll ?? null;
  }

  /**
   * Get lint command for a specific app
   */
  getLintCommand(appName: 'frontend' | 'backend'): string | null {
    const app = this.getApp(appName);
    return app?.commands.lint ?? null;
  }

  /**
   * Get all lint commands
   */
  getAllLintCommands(): Record<string, { path: string; command: string }> {
    if (!this.config) return {};

    const commands: Record<string, { path: string; command: string }> = {};

    for (const appName of this.getAppNames()) {
      const app = this.getApp(appName);
      if (app) {
        commands[appName] = {
          path: path.join(this.projectDir, app.path),
          command: app.commands.lint,
        };
      }
    }

    return commands;
  }

  /**
   * Get the combined lint-all command
   */
  getLintAllCommand(): string | null {
    return this.config?.commands.lintAll ?? null;
  }

  /**
   * Get build command for a specific app
   */
  getBuildCommand(appName: 'frontend' | 'backend'): string | null {
    const app = this.getApp(appName);
    return app?.commands.build ?? null;
  }

  /**
   * Get all build commands
   */
  getAllBuildCommands(): Record<string, { path: string; command: string }> {
    if (!this.config) return {};

    const commands: Record<string, { path: string; command: string }> = {};

    for (const appName of this.getAppNames()) {
      const app = this.getApp(appName);
      if (app) {
        commands[appName] = {
          path: path.join(this.projectDir, app.path),
          command: app.commands.build,
        };
      }
    }

    return commands;
  }

  /**
   * Get the combined build-all command
   */
  getBuildAllCommand(): string | null {
    return this.config?.commands.buildAll ?? null;
  }

  /**
   * Get dev command for a specific app
   */
  getDevCommand(appName: 'frontend' | 'backend'): string | null {
    const app = this.getApp(appName);
    return app?.commands.dev ?? null;
  }

  /**
   * Get all dev commands
   */
  getAllDevCommands(): Record<string, { path: string; command: string }> {
    if (!this.config) return {};

    const commands: Record<string, { path: string; command: string }> = {};

    for (const appName of this.getAppNames()) {
      const app = this.getApp(appName);
      if (app) {
        commands[appName] = {
          path: path.join(this.projectDir, app.path),
          command: app.commands.dev,
        };
      }
    }

    return commands;
  }

  /**
   * Get the combined dev-all command (usually docker-compose up)
   */
  getDevAllCommand(): string | null {
    return this.config?.commands.devAll ?? null;
  }

  /**
   * Get docker-compose path
   */
  getDockerComposePath(): string | null {
    if (!this.config) return null;
    return path.join(this.projectDir, this.config.docker.composePath);
  }

  /**
   * Get context roots for an app (files to include in AI context)
   */
  getContextRoots(appName: 'frontend' | 'backend'): string[] {
    const app = this.getApp(appName);
    if (!app || !app.contextRoots) return [];

    return app.contextRoots.map((root) => path.join(this.projectDir, app.path, root));
  }

  /**
   * Get UI spec path (for frontend)
   */
  getUiSpecPath(): string | null {
    const frontend = this.getApp('frontend');
    if (!frontend || !frontend.uiSpec) return null;
    return path.join(this.projectDir, frontend.uiSpec);
  }

  /**
   * Get contracts path (OpenAPI spec)
   */
  getContractsPath(): string | null {
    if (!this.config?.shared?.contracts) return null;
    return path.join(this.projectDir, this.config.shared.contracts);
  }

  /**
   * Get app language
   */
  getAppLanguage(appName: 'frontend' | 'backend'): 'python' | 'typescript' | null {
    const app = this.getApp(appName);
    return app?.language ?? null;
  }

  /**
   * Determine which app should handle a file based on path
   */
  getAppForFile(filePath: string): 'frontend' | 'backend' | null {
    const relativePath = path.relative(this.projectDir, filePath);

    for (const appName of this.getAppNames()) {
      const app = this.getApp(appName);
      if (app && relativePath.startsWith(app.path)) {
        return appName;
      }
    }

    return null;
  }

  /**
   * Get review context for a specific app
   * Reads key files from contextRoots to provide to AI reviewers
   */
  async getAppReviewContext(
    appName: 'frontend' | 'backend',
    options: {
      maxFiles?: number;
      maxFileSize?: number;
      includeTests?: boolean;
    } = {}
  ): Promise<AppReviewContext | null> {
    const { maxFiles = 20, maxFileSize = 50000, includeTests = true } = options;

    const app = this.getApp(appName);
    if (!app) return null;

    const appPath = this.getAppPath(appName);
    if (!appPath) return null;

    const context: AppReviewContext = {
      appName,
      language: app.language,
      path: app.path,
      sourceFiles: [],
    };

    // Read files from context roots
    const contextRoots = this.getContextRoots(appName);
    let filesRead = 0;

    for (const root of contextRoots) {
      if (filesRead >= maxFiles) break;

      try {
        const files = await this.readDirectoryRecursive(root, maxFileSize);
        for (const file of files) {
          if (filesRead >= maxFiles) break;
          context.sourceFiles.push(file);
          filesRead++;
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    // Read UI spec for frontend
    if (appName === 'frontend') {
      const uiSpecPath = this.getUiSpecPath();
      if (uiSpecPath) {
        try {
          context.uiSpec = await fs.readFile(uiSpecPath, 'utf-8');
        } catch {
          // UI spec doesn't exist
        }
      }
    }

    // Read API contracts
    const contractsPath = this.getContractsPath();
    if (contractsPath) {
      try {
        context.apiContracts = await fs.readFile(contractsPath, 'utf-8');
      } catch {
        // Contracts don't exist
      }
    }

    // Read test files
    if (includeTests) {
      const testDir = path.join(appPath, appName === 'frontend' ? 'src' : 'tests');
      try {
        const testFiles = await this.findTestFiles(testDir, app.language);
        context.testFiles = testFiles.slice(0, 5); // Limit test files
      } catch {
        // Test directory doesn't exist
      }
    }

    // Read dependencies file
    try {
      const depsFile = app.language === 'typescript'
        ? path.join(appPath, 'package.json')
        : path.join(appPath, 'pyproject.toml');
      context.dependencies = await fs.readFile(depsFile, 'utf-8');
    } catch {
      // Dependencies file doesn't exist
    }

    return context;
  }

  /**
   * Get combined review context for fullstack project
   */
  async getFullstackReviewContext(
    projectName: string,
    projectIdea?: string,
    options: {
      maxFilesPerApp?: number;
      includeTests?: boolean;
    } = {}
  ): Promise<FullstackReviewContext> {
    const { maxFilesPerApp = 15, includeTests = true } = options;

    const context: FullstackReviewContext = {
      projectName,
      projectIdea,
    };

    // Get frontend context
    const frontend = await this.getAppReviewContext('frontend', {
      maxFiles: maxFilesPerApp,
      includeTests,
    });
    if (frontend) {
      context.frontend = frontend;
    }

    // Get backend context
    const backend = await this.getAppReviewContext('backend', {
      maxFiles: maxFilesPerApp,
      includeTests,
    });
    if (backend) {
      context.backend = backend;
    }

    // Get shared contracts
    const contractsPath = this.getContractsPath();
    if (contractsPath) {
      try {
        context.contracts = await fs.readFile(contractsPath, 'utf-8');
      } catch {
        // Contracts don't exist
      }
    }

    return context;
  }

  /**
   * Format app context for AI review prompt
   */
  formatContextForReview(context: AppReviewContext): string {
    const lines: string[] = [];

    lines.push(`## ${context.appName.toUpperCase()} (${context.language})`);
    lines.push(`Path: ${context.path}`);
    lines.push('');

    if (context.dependencies) {
      lines.push('### Dependencies');
      lines.push('```');
      lines.push(context.dependencies.slice(0, 2000)); // Limit size
      lines.push('```');
      lines.push('');
    }

    if (context.uiSpec) {
      lines.push('### UI Specification');
      lines.push('```json');
      lines.push(context.uiSpec.slice(0, 3000));
      lines.push('```');
      lines.push('');
    }

    if (context.apiContracts) {
      lines.push('### API Contracts (OpenAPI)');
      lines.push('```yaml');
      lines.push(context.apiContracts.slice(0, 3000));
      lines.push('```');
      lines.push('');
    }

    if (context.sourceFiles.length > 0) {
      lines.push('### Key Source Files');
      for (const file of context.sourceFiles) {
        const relativePath = path.relative(this.projectDir, file.path);
        lines.push(`#### ${relativePath}`);
        lines.push('```');
        lines.push(file.content.slice(0, 5000)); // Limit per file
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format fullstack context for review prompt
   */
  formatFullstackContextForReview(context: FullstackReviewContext): string {
    const lines: string[] = [];

    lines.push(`# Project: ${context.projectName}`);
    if (context.projectIdea) {
      lines.push(`**Idea:** ${context.projectIdea}`);
    }
    lines.push('');

    if (context.contracts) {
      lines.push('## Shared API Contracts');
      lines.push('```yaml');
      lines.push(context.contracts.slice(0, 3000));
      lines.push('```');
      lines.push('');
    }

    if (context.frontend) {
      lines.push(this.formatContextForReview(context.frontend));
    }

    if (context.backend) {
      lines.push(this.formatContextForReview(context.backend));
    }

    return lines.join('\n');
  }

  /**
   * Determine review app target based on plan content
   * Analyzes plan text to determine if it's frontend, backend, or unified
   */
  categorizeByPlanContent(planContent: string): ReviewAppTarget {
    const lowerContent = planContent.toLowerCase();

    // Frontend indicators
    const frontendKeywords = [
      'react', 'component', 'jsx', 'tsx', 'css', 'tailwind', 'ui',
      'button', 'form', 'page', 'layout', 'style', 'vite', 'frontend',
      'client', 'browser', 'dom', 'render', 'hook', 'state',
    ];

    // Backend indicators
    const backendKeywords = [
      'api', 'endpoint', 'route', 'database', 'model', 'schema',
      'fastapi', 'flask', 'django', 'express', 'server', 'backend',
      'authentication', 'middleware', 'orm', 'sql', 'query', 'crud',
    ];

    const frontendScore = frontendKeywords.filter(kw => lowerContent.includes(kw)).length;
    const backendScore = backendKeywords.filter(kw => lowerContent.includes(kw)).length;

    // Threshold for classification
    if (frontendScore > backendScore * 2 && frontendScore >= 3) {
      return 'frontend';
    }
    if (backendScore > frontendScore * 2 && backendScore >= 3) {
      return 'backend';
    }

    // Mixed or unclear - unified
    return 'unified';
  }

  /**
   * Read directory recursively and return file contents
   */
  private async readDirectoryRecursive(
    dir: string,
    maxFileSize: number
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, __pycache__, etc.
        if (entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === '__pycache__' ||
            entry.name === 'dist' ||
            entry.name === 'build') {
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = await this.readDirectoryRecursive(fullPath, maxFileSize);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Only read code files
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.yaml', '.yml'].includes(ext)) {
            try {
              const stat = await fs.stat(fullPath);
              if (stat.size <= maxFileSize) {
                const content = await fs.readFile(fullPath, 'utf-8');
                files.push({ path: fullPath, content });
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }

    return files;
  }

  /**
   * Find test files in a directory
   */
  private async findTestFiles(
    dir: string,
    language: 'python' | 'typescript'
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    const testPatterns = language === 'typescript'
      ? ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx']
      : ['test_', '_test.py'];

    try {
      const allFiles = await this.readDirectoryRecursive(dir, 30000);

      for (const file of allFiles) {
        const fileName = path.basename(file.path);
        const isTestFile = testPatterns.some(pattern =>
          language === 'typescript'
            ? fileName.endsWith(pattern)
            : fileName.startsWith(pattern) || fileName.endsWith(pattern)
        );

        if (isTestFile) {
          files.push(file);
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return files;
  }

  /**
   * Get feedback document paths for workspace
   */
  getFeedbackPaths(): {
    master: { unified: string; frontend: string; backend: string };
    getMilestonePaths: (milestoneId: string) => { unified: string; frontend: string; backend: string };
    getTaskPaths: (milestoneId: string, taskId: string) => { unified: string; frontend: string; backend: string };
  } {
    const plansDir = path.join(this.projectDir, 'docs', 'plans');

    return {
      master: {
        unified: path.join(plansDir, 'master', 'unified', 'feedback.md'),
        frontend: path.join(plansDir, 'master', 'frontend', 'feedback.md'),
        backend: path.join(plansDir, 'master', 'backend', 'feedback.md'),
      },
      getMilestonePaths: (milestoneId: string) => ({
        unified: path.join(plansDir, `milestone-${milestoneId}`, 'unified', 'feedback.md'),
        frontend: path.join(plansDir, `milestone-${milestoneId}`, 'frontend', 'feedback.md'),
        backend: path.join(plansDir, `milestone-${milestoneId}`, 'backend', 'feedback.md'),
      }),
      getTaskPaths: (milestoneId: string, taskId: string) => ({
        unified: path.join(plansDir, `milestone-${milestoneId}`, 'tasks', `task-${taskId}`, 'unified', 'feedback.md'),
        frontend: path.join(plansDir, `milestone-${milestoneId}`, 'tasks', `task-${taskId}`, 'frontend', 'feedback.md'),
        backend: path.join(plansDir, `milestone-${milestoneId}`, 'tasks', `task-${taskId}`, 'backend', 'feedback.md'),
      }),
    };
  }
}

/**
 * Load workspace configuration from a project directory
 *
 * @param projectDir - Project directory
 * @returns WorkspaceConfig or null if not a workspace project
 */
export async function loadWorkspace(projectDir: string): Promise<WorkspaceConfig | null> {
  const manager = new WorkspaceManager(projectDir);
  return manager.load();
}

/**
 * Save workspace configuration to a project directory
 *
 * @param projectDir - Project directory
 * @param config - Workspace configuration
 */
export async function saveWorkspace(projectDir: string, config: WorkspaceConfig): Promise<void> {
  const manager = new WorkspaceManager(projectDir);
  return manager.save(config);
}

/**
 * Check if a directory is a workspace project
 *
 * @param projectDir - Project directory
 * @returns True if workspace project
 */
export async function isWorkspaceProject(projectDir: string): Promise<boolean> {
  const manager = new WorkspaceManager(projectDir);
  return manager.isWorkspaceProject();
}

/**
 * Get app context for AI code generation
 *
 * @param projectDir - Project directory
 * @param appName - App name
 * @returns Object with app info and context files
 */
export async function getAppContext(
  projectDir: string,
  appName: 'frontend' | 'backend'
): Promise<{
  app: WorkspaceApp | undefined;
  language: 'python' | 'typescript' | null;
  contextRoots: string[];
  path: string | null;
} | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  const app = manager.getApp(appName);

  return {
    app,
    language: manager.getAppLanguage(appName),
    contextRoots: manager.getContextRoots(appName),
    path: manager.getAppPath(appName),
  };
}

/**
 * Get test commands for workspace
 *
 * @param projectDir - Project directory
 * @returns Test commands per app and combined command
 */
export async function getTestCommands(projectDir: string): Promise<{
  perApp: Record<string, { path: string; command: string }>;
  combined: string | null;
} | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  return {
    perApp: manager.getAllTestCommands(),
    combined: manager.getTestAllCommand(),
  };
}

/**
 * Get build commands for workspace
 *
 * @param projectDir - Project directory
 * @returns Build commands per app and combined command
 */
export async function getBuildCommands(projectDir: string): Promise<{
  perApp: Record<string, { path: string; command: string }>;
  combined: string | null;
} | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  return {
    perApp: manager.getAllBuildCommands(),
    combined: manager.getBuildAllCommand(),
  };
}

/**
 * Get app-specific review context
 *
 * @param projectDir - Project directory
 * @param appName - App name (frontend or backend)
 * @returns Review context with source files and metadata
 */
export async function getAppReviewContext(
  projectDir: string,
  appName: 'frontend' | 'backend'
): Promise<AppReviewContext | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  return manager.getAppReviewContext(appName);
}

/**
 * Get fullstack review context for AI reviews
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param projectIdea - Original project idea
 * @returns Combined review context for both apps
 */
export async function getFullstackReviewContext(
  projectDir: string,
  projectName: string,
  projectIdea?: string
): Promise<FullstackReviewContext | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  return manager.getFullstackReviewContext(projectName, projectIdea);
}

/**
 * Format context for AI review prompt
 *
 * @param projectDir - Project directory
 * @param projectName - Project name
 * @param projectIdea - Original project idea
 * @returns Formatted string for AI review
 */
export async function formatContextForAIReview(
  projectDir: string,
  projectName: string,
  projectIdea?: string
): Promise<string | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  const context = await manager.getFullstackReviewContext(projectName, projectIdea);
  return manager.formatFullstackContextForReview(context);
}

/**
 * Categorize a task/plan as frontend, backend, or unified
 *
 * @param projectDir - Project directory
 * @param planContent - Plan or task content to analyze
 * @returns App target category
 */
export async function categorizePlanContent(
  projectDir: string,
  planContent: string
): Promise<ReviewAppTarget> {
  const manager = new WorkspaceManager(projectDir);
  await manager.load();
  return manager.categorizeByPlanContent(planContent);
}

/**
 * Get feedback paths for a workspace project
 *
 * @param projectDir - Project directory
 * @returns Object with feedback path getters
 */
export async function getWorkspaceFeedbackPaths(projectDir: string): Promise<{
  master: { unified: string; frontend: string; backend: string };
  getMilestonePaths: (milestoneId: string) => { unified: string; frontend: string; backend: string };
  getTaskPaths: (milestoneId: string, taskId: string) => { unified: string; frontend: string; backend: string };
} | null> {
  const manager = new WorkspaceManager(projectDir);
  const config = await manager.load();

  if (!config) return null;

  return manager.getFeedbackPaths();
}
