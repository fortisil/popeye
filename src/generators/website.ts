/**
 * Website project generator
 * Creates SEO-ready Next.js marketing website
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectSpec } from '../types/project.js';
import {
  generateWebsitePackageJson,
  generateNextConfig,
  generateWebsiteTsconfig,
  generateWebsiteTailwindConfig,
  generateWebsitePostcssConfig,
  generateWebsiteLayout,
  generateWebsiteGlobalsCss,
  generateWebsiteLandingPage,
  generateWebsitePricingPage,
  generateWebsiteSitemap,
  generateWebsiteRobots,
  generateWebsiteDockerfile,
  generateWebsiteReadme,
  generateWebsiteSpec,
  generateWebsiteVitestConfig,
  generateWebsiteVitestSetup,
  generateWebsiteTest,
  generateWebsiteDocsPage,
  generateWebsiteBlogPage,
  generateWebsiteNextEnv,
} from './templates/website.js';

/**
 * Project generation result
 */
export interface GenerationResult {
  success: boolean;
  projectDir: string;
  filesCreated: string[];
  error?: string;
}

/**
 * Website generator options for workspace/monorepo support
 */
export interface WebsiteGeneratorOptions {
  /** Base directory for project (defaults to outputDir/projectName) */
  baseDir?: string;
  /** Override auto-derived package name */
  packageName?: string;
  /** Adjust paths for monorepo structure */
  workspaceMode?: boolean;
  /** Skip Docker files (fullstack uses root docker-compose) */
  skipDocker?: boolean;
  /** Skip README (fullstack has root README) */
  skipReadme?: boolean;
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
 * Generate a complete Next.js website project
 *
 * @param spec - Project specification
 * @param outputDir - Output directory
 * @param options - Generator options for workspace/monorepo support
 * @returns Generation result
 */
export async function generateWebsiteProject(
  spec: ProjectSpec,
  outputDir: string,
  options: WebsiteGeneratorOptions = {}
): Promise<GenerationResult> {
  const {
    baseDir,
    // packageName reserved for future use
    workspaceMode = false,
    skipDocker = false,
    skipReadme = false,
  } = options;

  const projectName = spec.name || 'my-project';

  // In workspace mode with baseDir, use it directly; otherwise create subdirectory
  const projectDir = baseDir || path.join(outputDir, projectName);
  const filesCreated: string[] = [];

  try {
    // Create project directory structure
    await ensureDir(projectDir);
    await ensureDir(path.join(projectDir, 'src', 'app'));
    await ensureDir(path.join(projectDir, 'src', 'app', 'pricing'));
    await ensureDir(path.join(projectDir, 'src', 'app', 'docs'));
    await ensureDir(path.join(projectDir, 'src', 'app', 'blog'));
    await ensureDir(path.join(projectDir, 'src', 'components'));
    await ensureDir(path.join(projectDir, 'src', 'lib'));
    await ensureDir(path.join(projectDir, 'content', 'blog'));
    await ensureDir(path.join(projectDir, 'content', 'docs'));
    await ensureDir(path.join(projectDir, 'public'));
    await ensureDir(path.join(projectDir, 'tests'));

    // Only create .popeye dir in standalone mode
    if (!workspaceMode) {
      await ensureDir(path.join(projectDir, '.popeye'));
    }

    // Generate and write files
    const files: Array<{ path: string; content: string }> = [
      // Config files
      {
        path: path.join(projectDir, 'package.json'),
        content: generateWebsitePackageJson(projectName),
      },
      {
        path: path.join(projectDir, 'next.config.mjs'),
        content: generateNextConfig(),
      },
      {
        path: path.join(projectDir, 'tsconfig.json'),
        content: generateWebsiteTsconfig(),
      },
      {
        path: path.join(projectDir, 'tailwind.config.ts'),
        content: generateWebsiteTailwindConfig(),
      },
      {
        path: path.join(projectDir, 'postcss.config.js'),
        content: generateWebsitePostcssConfig(),
      },
      {
        path: path.join(projectDir, 'vitest.config.ts'),
        content: generateWebsiteVitestConfig(),
      },
      {
        path: path.join(projectDir, 'next-env.d.ts'),
        content: generateWebsiteNextEnv(),
      },

      // App Router files
      {
        path: path.join(projectDir, 'src', 'app', 'layout.tsx'),
        content: generateWebsiteLayout(projectName),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'globals.css'),
        content: generateWebsiteGlobalsCss(),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'page.tsx'),
        content: generateWebsiteLandingPage(projectName),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'pricing', 'page.tsx'),
        content: generateWebsitePricingPage(projectName),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'docs', 'page.tsx'),
        content: generateWebsiteDocsPage(),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'blog', 'page.tsx'),
        content: generateWebsiteBlogPage(),
      },

      // SEO files
      {
        path: path.join(projectDir, 'src', 'app', 'sitemap.ts'),
        content: generateWebsiteSitemap(projectName),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'robots.ts'),
        content: generateWebsiteRobots(projectName),
      },

      // Test files
      {
        path: path.join(projectDir, 'tests', 'setup.ts'),
        content: generateWebsiteVitestSetup(),
      },
      {
        path: path.join(projectDir, 'tests', 'page.test.tsx'),
        content: generateWebsiteTest(projectName),
      },

      // Placeholder files
      {
        path: path.join(projectDir, 'public', '.gitkeep'),
        content: '',
      },
      {
        path: path.join(projectDir, 'content', 'blog', '.gitkeep'),
        content: '',
      },
      {
        path: path.join(projectDir, 'content', 'docs', '.gitkeep'),
        content: '',
      },
      {
        path: path.join(projectDir, 'src', 'components', '.gitkeep'),
        content: '',
      },
      {
        path: path.join(projectDir, 'src', 'lib', '.gitkeep'),
        content: '',
      },

      // Environment
      {
        path: path.join(projectDir, '.env.example'),
        content: 'NEXT_PUBLIC_SITE_URL=http://localhost:3001\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n',
      },
      {
        path: path.join(projectDir, '.gitignore'),
        content:
          'node_modules/\n.next/\nout/\n.env\n.env.local\n.env.*.local\ncoverage/\n*.log\n.DS_Store\n',
      },
    ];

    // Add website spec in standalone mode
    if (!workspaceMode) {
      files.push({
        path: path.join(projectDir, '.popeye', 'website-spec.json'),
        content: generateWebsiteSpec(projectName),
      });
    }

    // Add README if not skipped
    if (!skipReadme) {
      files.push({
        path: path.join(projectDir, 'README.md'),
        content: generateWebsiteReadme(projectName),
      });
    }

    // Add Docker files if not skipped
    if (!skipDocker) {
      files.push({
        path: path.join(projectDir, 'Dockerfile'),
        content: generateWebsiteDockerfile(),
      });
    }

    // Write all files
    for (const file of files) {
      await writeFile(file.path, file.content);
      filesCreated.push(file.path);
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
 * Get the list of files that would be generated for a website project
 *
 * @param _projectName - Project name
 * @returns List of relative file paths
 */
export function getWebsiteProjectFiles(_projectName: string): string[] {
  return [
    // Config
    'package.json',
    'next.config.mjs',
    'tsconfig.json',
    'tailwind.config.ts',
    'postcss.config.js',
    'vitest.config.ts',
    'next-env.d.ts',
    '.gitignore',
    '.env.example',
    'README.md',
    'Dockerfile',
    // App Router
    'src/app/layout.tsx',
    'src/app/globals.css',
    'src/app/page.tsx',
    'src/app/pricing/page.tsx',
    'src/app/docs/page.tsx',
    'src/app/blog/page.tsx',
    'src/app/sitemap.ts',
    'src/app/robots.ts',
    // Tests
    'tests/setup.ts',
    'tests/page.test.tsx',
    // Content
    'content/blog/.gitkeep',
    'content/docs/.gitkeep',
    // Spec
    '.popeye/website-spec.json',
  ];
}

/**
 * Validate a website project structure
 *
 * @param projectDir - Project directory
 * @returns Validation result
 */
export async function validateWebsiteProject(projectDir: string): Promise<{
  valid: boolean;
  missingFiles: string[];
}> {
  const missingFiles: string[] = [];

  const requiredFiles = [
    'package.json',
    'next.config.mjs',
    'tsconfig.json',
    'src/app/layout.tsx',
    'src/app/page.tsx',
    'src/app/sitemap.ts',
    'src/app/robots.ts',
  ];

  for (const file of requiredFiles) {
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
