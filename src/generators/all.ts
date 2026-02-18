/**
 * All project generator (FE + BE + Website)
 * Orchestrates Python, TypeScript, and Website generators for complete monorepo
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectSpec, WorkspaceConfig } from '../types/project.js';
import type { GenerationResult } from './python.js';
import { generateFullstackProject } from './fullstack.js';
import { generateWebsiteProject } from './website.js';
import type { WebsiteContentContext } from './website-context.js';
import { buildWebsiteContext, validateWebsiteContext } from './website-context.js';
import {
  generateDesignTokensPackage as generateDesignTokensPackageImpl,
  generateUiPackage as generateUiPackageImpl,
} from './shared-packages.js';
import type { BrandColorOptions } from './shared-packages.js';
import { generateAllDockerComposeWithDb } from './templates/database-docker.js';
import { getAdminWizardFiles } from './admin-wizard.js';
import { getDatabaseFiles } from './database.js';

/**
 * Options for all project generation
 */
export interface AllGeneratorOptions {
  skipWebsite?: boolean;
  skipSharedPackages?: boolean;
  includeExamples?: boolean;
  /** Content context from user docs for populating website templates */
  contentContext?: WebsiteContentContext;
}

/**
 * Create a directory if it doesn't exist
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Write a file with content
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Convert project name to Python package name
 */
function toPythonPackageName(name: string): string {
  return name.toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Generate workspace.json for "all" projects
 */
export function generateAllWorkspaceJson(projectName: string): string {
  const packageName = toPythonPackageName(projectName);

  const config: WorkspaceConfig = {
    version: '1.0',
    apps: {
      frontend: {
        name: 'frontend',
        path: 'apps/frontend',
        language: 'typescript',
        commands: {
          test: 'npm test',
          lint: 'npm run lint',
          build: 'npm run build',
          dev: 'npm run dev',
          typecheck: 'npm run typecheck',
        },
        docker: {
          dockerfile: 'apps/frontend/Dockerfile',
          imageName: `${projectName}-frontend`,
          context: 'apps/frontend',
        },
        dependsOn: ['packages/design-tokens', 'packages/ui'],
        contextRoots: ['apps/frontend/src'],
        uiSpec: '.popeye/ui-spec.json',
      },
      backend: {
        name: 'backend',
        path: 'apps/backend',
        language: 'python',
        commands: {
          test: 'pytest -v',
          lint: 'ruff check .',
          build: 'pip install -e .',
          dev: `uvicorn src.${packageName}.main:app --reload --port 8000`,
        },
        docker: {
          dockerfile: 'apps/backend/Dockerfile',
          imageName: `${projectName}-backend`,
          context: 'apps/backend',
        },
        contextRoots: ['apps/backend/src'],
      },
      website: {
        name: 'website',
        path: 'apps/website',
        language: 'typescript',
        commands: {
          test: 'npm test',
          lint: 'npm run lint',
          build: 'npm run build',
          dev: 'npm run dev',
          typecheck: 'npm run typecheck',
        },
        // No docker — website runs outside Docker (npm run dev / npm start)
        dependsOn: ['packages/design-tokens'],
        contextRoots: ['apps/website/src'],
      },
    },
    shared: {
      contracts: 'packages/contracts',
      ui: 'packages/ui',
      designTokens: 'packages/design-tokens',
    },
    commands: {
      testAll: 'npm run test --workspaces --if-present && cd apps/backend && pytest',
      lintAll: 'npm run lint --workspaces --if-present && cd apps/backend && ruff check .',
      buildAll:
        'npm run build -w packages/design-tokens && npm run build -w packages/ui && npm run build --workspaces --if-present',
      devAll:
        'concurrently "npm run dev -w apps/frontend" "npm run dev -w apps/website" "cd apps/backend && make dev"',
    },
    docker: {
      composePath: 'infra/docker/docker-compose.yml',
      rootComposeSymlink: true,
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate root package.json for npm workspaces
 */
export function generateRootPackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: `@${projectName}/root`,
      private: true,
      workspaces: ['apps/*', 'packages/*'],
      scripts: {
        dev: 'concurrently "npm run dev -w apps/frontend" "npm run dev -w apps/website"',
        'dev:all':
          'concurrently "npm run dev -w apps/frontend" "npm run dev -w apps/website" "cd apps/backend && make dev"',
        build:
          'npm run build -w packages/design-tokens && npm run build -w packages/ui && npm run build --workspaces --if-present',
        test: 'npm run test --workspaces --if-present',
        'test:all': 'npm run test --workspaces --if-present && cd apps/backend && pytest',
        lint: 'npm run lint --workspaces --if-present',
        'lint:all': 'npm run lint --workspaces --if-present && cd apps/backend && ruff check .',
        typecheck: 'npm run typecheck --workspaces --if-present',
      },
      devDependencies: {
        concurrently: '^8.2.0',
      },
      engines: {
        node: '>=18.0.0',
      },
    },
    null,
    2
  );
}

/**
 * Generate docker-compose.yml for "all" projects
 */
/**
 * Generate docker-compose.yml for "all" projects (FE + BE only).
 * Website runs via `npm run dev` / `npm run build && npm start` outside Docker.
 */
export function generateAllDockerCompose(projectName: string): string {
  return `services:
  frontend:
    build:
      context: apps/frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://backend:8000
    networks:
      - ${projectName}-network

  backend:
    build:
      context: apps/backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DEBUG=false
      - FRONTEND_URL=http://frontend:80
    volumes:
      - backend-data:/app/data
    networks:
      - ${projectName}-network

networks:
  ${projectName}-network:
    driver: bridge

volumes:
  backend-data:
`;
}

/**
 * Generate root README for "all" projects
 */
function generateAllRootReadme(projectName: string, idea: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `# ${title}

${idea}

## Architecture

This is a monorepo containing:

- **Frontend App** (\`apps/frontend\`): React + Vite + Tailwind CSS
- **Backend API** (\`apps/backend\`): FastAPI (Python)
- **Marketing Website** (\`apps/website\`): Next.js (SEO-optimized)
- **Shared Packages** (\`packages/\`): Design tokens, UI components, API contracts

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- npm

### Installation

\`\`\`bash
# Install all dependencies
npm install

# Install backend dependencies
cd apps/backend && pip install -e ".[dev]"
\`\`\`

### Development

\`\`\`bash
# Run all apps in development mode
npm run dev:all

# Or run individual apps:
npm run dev -w apps/frontend  # Frontend on :5173
npm run dev -w apps/website   # Website on :3001
cd apps/backend && make dev   # Backend on :8000
\`\`\`

### Testing

\`\`\`bash
# Run all tests
npm run test:all

# Run frontend tests
npm run test -w apps/frontend

# Run backend tests
cd apps/backend && pytest

# Run website tests
npm run test -w apps/website
\`\`\`

### Building

\`\`\`bash
# Build all apps
npm run build
\`\`\`

### Docker

\`\`\`bash
# Build and run with Docker Compose
docker-compose up --build

# Services:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8000
# - Website: http://localhost:3001
\`\`\`

## Project Structure

\`\`\`
${projectName}/
  apps/
    frontend/       # React + Vite SPA
    backend/        # FastAPI Python API
    website/        # Next.js marketing site
  packages/
    design-tokens/  # Shared colors, typography
    ui/             # Shared UI components
    contracts/      # API contracts (OpenAPI)
  infra/
    docker/         # Docker configuration
  docs/
    PLAN.md         # Development plan
    WORKFLOW_LOG.md # Progress log
  .popeye/
    workspace.json  # Workspace configuration
    ui-spec.json    # UI design spec (frontend)
    website-spec.json # Website design spec
\`\`\`

## Links

- Frontend: http://localhost:5173 (dev) / http://localhost:3000 (prod)
- Backend API: http://localhost:8000
- Website: http://localhost:3001

---

Generated by [Popeye CLI](https://github.com/popeye-cli/popeye)
`;
}

/**
 * Generate design tokens package
 * Delegates to shared-packages.ts with optional brand color passthrough
 */
export function generateDesignTokensPackage(
  projectName: string,
  brandColors?: BrandColorOptions
): {
  files: Array<{ path: string; content: string }>;
} {
  return generateDesignTokensPackageImpl(projectName, brandColors);
}

/**
 * Generate UI components package
 * Delegates to shared-packages.ts
 */
export function generateUiPackage(projectName: string): {
  files: Array<{ path: string; content: string }>;
} {
  return generateUiPackageImpl(projectName);
}

/**
 * Generate a complete "all" project (FE + BE + Website)
 *
 * @param spec - Project specification
 * @param outputDir - Output directory
 * @returns Generation result
 */
export async function generateAllProject(
  spec: ProjectSpec,
  outputDir: string,
  options: AllGeneratorOptions = {}
): Promise<GenerationResult> {
  const projectName = spec.name || 'my-project';
  const projectDir = path.join(outputDir, projectName);
  const filesCreated: string[] = [];

  try {
    // Create root structure
    await ensureDir(projectDir);
    await ensureDir(path.join(projectDir, 'packages'));
    await ensureDir(path.join(projectDir, 'packages', 'design-tokens', 'src'));
    await ensureDir(path.join(projectDir, 'packages', 'ui', 'src'));
    await ensureDir(path.join(projectDir, 'packages', 'contracts'));
    await ensureDir(path.join(projectDir, '.popeye'));

    // Auto-build content context if not provided
    let contentContext = options.contentContext;
    let contextWarning: string | undefined;
    if (!contentContext) {
      try {
        contentContext = await buildWebsiteContext(projectDir, projectName);
      } catch (e) {
        contextWarning = e instanceof Error ? e.message : 'Unknown error building website context';
        // Proceed with defaults, but warning is logged below
      }
    }
    if (contextWarning) {
      // Log warning so user sees it, but don't block generation
      console.warn(`[website-context] Warning: ${contextWarning}`);
    }

    // Soft validation: log quality issues without blocking monorepo generation
    if (contentContext) {
      const validation = validateWebsiteContext(contentContext, projectName);
      for (const issue of [...validation.issues, ...validation.warnings]) {
        console.warn(`[website-context] ${issue}`);
      }
    }

    // Generate fullstack first (creates apps/frontend and apps/backend)
    const fullstackResult = await generateFullstackProject(spec, outputDir);
    if (!fullstackResult.success) {
      return fullstackResult;
    }
    filesCreated.push(...fullstackResult.filesCreated);

    // Generate website app
    const websiteResult = await generateWebsiteProject(spec, projectDir, {
      baseDir: path.join(projectDir, 'apps', 'website'),
      workspaceMode: true,
      skipDocker: true, // Website runs outside Docker (npm run dev / npm start)
      skipReadme: false,
      contentContext: contentContext,
    });
    if (!websiteResult.success) {
      return {
        ...websiteResult,
        filesCreated,
      };
    }
    filesCreated.push(...websiteResult.filesCreated);

    // Generate shared packages (pass brand colors if available)
    const brandColors: BrandColorOptions | undefined = contentContext?.brand?.primaryColor
      ? { primaryColor: contentContext.brand.primaryColor }
      : undefined;
    const designTokens = generateDesignTokensPackage(projectName, brandColors);
    for (const file of designTokens.files) {
      const filePath = path.join(projectDir, 'packages', 'design-tokens', file.path);
      await ensureDir(path.dirname(filePath));
      await writeFile(filePath, file.content);
      filesCreated.push(filePath);
    }

    const uiPackage = generateUiPackage(projectName);
    for (const file of uiPackage.files) {
      const filePath = path.join(projectDir, 'packages', 'ui', file.path);
      await ensureDir(path.dirname(filePath));
      await writeFile(filePath, file.content);
      filesCreated.push(filePath);
    }

    // Contracts placeholder
    await writeFile(path.join(projectDir, 'packages', 'contracts', '.gitkeep'), '');
    filesCreated.push(path.join(projectDir, 'packages', 'contracts', '.gitkeep'));

    // Override root files for "all" project
    const rootFiles: Array<{ path: string; content: string }> = [
      // Root package.json (npm workspaces)
      {
        path: path.join(projectDir, 'package.json'),
        content: generateRootPackageJson(projectName),
      },
      // Workspace config
      {
        path: path.join(projectDir, '.popeye', 'workspace.json'),
        content: generateAllWorkspaceJson(projectName),
      },
      // Docker compose (FE + BE + postgres; website runs outside Docker)
      {
        path: path.join(projectDir, 'docker-compose.yml'),
        content: generateAllDockerComposeWithDb(projectName),
      },
      {
        path: path.join(projectDir, 'infra', 'docker', 'docker-compose.yml'),
        content: generateAllDockerComposeWithDb(projectName),
      },
      // README
      {
        path: path.join(projectDir, 'README.md'),
        content: generateAllRootReadme(projectName, spec.idea),
      },
    ];

    for (const file of rootFiles) {
      await writeFile(file.path, file.content);
      // Only add if not already in list (avoid duplicates)
      if (!filesCreated.includes(file.path)) {
        filesCreated.push(file.path);
      }
    }

    return {
      success: true,
      projectDir,
      filesCreated,
    };
  } catch (error) {
    return {
      success: false,
      projectDir,
      filesCreated,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the list of files that would be generated for an "all" project
 *
 * @param projectName - Project name
 * @returns List of relative file paths
 */
export function getAllProjectFiles(projectName: string): string[] {
  const packageName = toPythonPackageName(projectName);

  return [
    // Root
    'package.json',
    '.popeye/workspace.json',
    '.popeye/ui-spec.json',
    'infra/docker/docker-compose.yml',
    'docker-compose.yml',
    'README.md',
    '.gitignore',
    'docs/PLAN.md',
    'docs/WORKFLOW_LOG.md',
    // Frontend (same as fullstack)
    'apps/frontend/package.json',
    'apps/frontend/src/main.tsx',
    'apps/frontend/src/App.tsx',
    // Backend (same as fullstack)
    'apps/backend/pyproject.toml',
    `apps/backend/src/${packageName}/main.py`,
    // Website
    'apps/website/package.json',
    'apps/website/next.config.mjs',
    'apps/website/src/app/layout.tsx',
    'apps/website/src/app/page.tsx',
    'apps/website/src/app/sitemap.ts',
    'apps/website/src/app/robots.ts',
    // Shared packages
    'packages/design-tokens/package.json',
    'packages/design-tokens/src/index.ts',
    'packages/design-tokens/src/colors.ts',
    'packages/design-tokens/src/tailwind-preset.ts',
    'packages/ui/package.json',
    'packages/ui/src/index.ts',
    'packages/ui/src/button.tsx',
    'packages/ui/src/card.tsx',
    'packages/contracts/.gitkeep',
    // Database layer
    ...getDatabaseFiles(packageName, 'sqlalchemy'),
    // Admin wizard layer
    ...getAdminWizardFiles(packageName),
  ];
}

/**
 * Validate an "all" project structure
 *
 * @param projectDir - Project directory
 * @returns Validation result
 */
export async function validateAllProject(projectDir: string): Promise<{
  valid: boolean;
  missingFiles: string[];
}> {
  const missingFiles: string[] = [];

  const requiredPaths = [
    // Root
    'package.json',
    '.popeye/workspace.json',
    'docker-compose.yml',
    'README.md',
    // Frontend
    'apps/frontend/package.json',
    'apps/frontend/src',
    // Backend
    'apps/backend/pyproject.toml',
    'apps/backend/src',
    // Website
    'apps/website/package.json',
    'apps/website/src/app/layout.tsx',
    'apps/website/src/app/sitemap.ts',
    // Shared packages
    'packages/design-tokens/package.json',
    'packages/ui/package.json',
  ];

  for (const file of requiredPaths) {
    const filePath = path.join(projectDir, file);
    try {
      await fs.access(filePath);
    } catch {
      missingFiles.push(file);
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
  };
}
