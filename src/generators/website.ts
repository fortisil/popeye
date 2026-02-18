/**
 * Website project generator
 * Creates SEO-ready Next.js marketing website
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectSpec } from '../types/project.js';
import {
  generateWebsiteLayout,
  generateWebsiteGlobalsCss,
  generateWebsiteLandingPage,
  generateWebsitePricingPage,
  generateWebsiteReadme,
  generateWebsiteSpec,
  generateWebsiteTest,
  generateWebsiteDocsPage,
  generateWebsiteBlogPage,
} from './templates/website.js';
import {
  generateWebsitePackageJson,
  generateNextConfig,
  generateWebsiteTsconfig,
  generateWebsiteTailwindConfig,
  generateWebsitePostcssConfig,
  generateWebsiteDockerfile,
  generateWebsiteVitestConfig,
  generateWebsiteVitestSetup,
  generateWebsiteNextEnv,
} from './templates/website-config.js';
import {
  generateWebsiteHeader,
  generateWebsiteFooter,
  generateWebsiteNavigation,
} from './templates/website-components.js';
import {
  generateJsonLdComponent,
  generateEnhancedSitemap,
  generateEnhancedRobots,
  generate404Page,
  generate500Page,
  generateWebManifest,
  generateMetaHelper,
} from './templates/website-seo.js';
import {
  generateLeadCaptureRoute,
  generateContactForm,
  generateLeadCaptureEnvExample,
} from './templates/website-conversion.js';
import { generateFaqSectionComponent } from './templates/website-sections.js';
import type { WebsiteContentContext } from './website-context.js';
import { validateWebsiteContextOrThrow } from './website-context.js';
import { scanGeneratedContent } from './website-content-scanner.js';
import { printDebugTrace, isDebugEnabled } from './website-debug.js';
import type { WebsiteDebugTrace } from './website-debug.js';

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
  /** Content context from user docs for populating templates */
  contentContext?: WebsiteContentContext;
  /** Skip content validation (scaffold-only use) */
  skipValidation?: boolean;
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
    contentContext,
    skipValidation = false,
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
    await ensureDir(path.join(projectDir, 'src', 'app', 'api', 'lead'));
    await ensureDir(path.join(projectDir, 'src', 'components'));
    await ensureDir(path.join(projectDir, 'src', 'lib'));
    await ensureDir(path.join(projectDir, 'content', 'blog'));
    await ensureDir(path.join(projectDir, 'content', 'docs'));
    await ensureDir(path.join(projectDir, 'public'));
    await ensureDir(path.join(projectDir, 'public', 'brand'));
    await ensureDir(path.join(projectDir, 'tests'));

    // Only create .popeye dir in standalone mode
    if (!workspaceMode) {
      await ensureDir(path.join(projectDir, '.popeye'));
    }

    // Validate content context quality gate
    if (!skipValidation) {
      const validationContext = contentContext || {
        productName: projectName,
        features: [],
        rawDocs: '',
      };
      validateWebsiteContextOrThrow(validationContext, projectName);
    }

    // Debug trace
    if (isDebugEnabled() && contentContext) {
      const trace: WebsiteDebugTrace = {
        workspaceRoot: projectDir,
        docsFound: contentContext.rawDocs
          ? contentContext.rawDocs.split(/^--- .+ ---$/m).filter(Boolean).map((s, i) => ({
              path: `doc-${i}`,
              size: s.length,
            }))
          : [],
        brandAssets: {
          logoPath: contentContext.brand?.logoPath,
          logoOutputPath: contentContext.brandAssets?.logoOutputPath || 'public/brand/logo.svg',
        },
        productName: {
          value: contentContext.productName,
          source: contentContext.rawDocs ? 'docs' : 'directory',
        },
        primaryColor: {
          value: contentContext.brand?.primaryColor,
          source: contentContext.brand?.primaryColor ? 'brand-docs' : 'defaults',
        },
        strategyStatus: contentContext.strategy ? 'success' : 'skipped',
        templateValues: {
          headline: contentContext.strategy?.messaging.headline,
          features: contentContext.features.length,
          pricingTiers: contentContext.pricing?.length || 0,
        },
        sectionsRendered: [],
        validationPassed: true,
        validationIssues: [],
      };
      printDebugTrace(trace);
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
        content: generateWebsiteTailwindConfig({
          primaryColor: contentContext?.brand?.primaryColor,
          workspaceMode,
          projectName: workspaceMode ? projectName : undefined,
        }),
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
        content: generateWebsiteLayout(projectName, contentContext),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'globals.css'),
        content: generateWebsiteGlobalsCss(contentContext),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'page.tsx'),
        content: generateWebsiteLandingPage(projectName, contentContext),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'pricing', 'page.tsx'),
        content: generateWebsitePricingPage(projectName, contentContext),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'docs', 'page.tsx'),
        content: generateWebsiteDocsPage(),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'blog', 'page.tsx'),
        content: generateWebsiteBlogPage(),
      },

      // Shared components
      {
        path: path.join(projectDir, 'src', 'components', 'Header.tsx'),
        content: generateWebsiteHeader(projectName, contentContext, contentContext?.strategy),
      },
      {
        path: path.join(projectDir, 'src', 'components', 'Footer.tsx'),
        content: generateWebsiteFooter(projectName, contentContext, contentContext?.strategy),
      },
      {
        path: path.join(projectDir, 'src', 'components', 'JsonLd.tsx'),
        content: generateJsonLdComponent(),
      },
      {
        path: path.join(projectDir, 'src', 'components', 'FaqSection.tsx'),
        content: generateFaqSectionComponent(),
      },
      {
        path: path.join(projectDir, 'src', 'components', 'ContactForm.tsx'),
        content: generateContactForm(contentContext?.strategy),
      },
      {
        path: path.join(projectDir, 'src', 'lib', 'navigation.ts'),
        content: generateWebsiteNavigation(contentContext?.strategy),
      },
      {
        path: path.join(projectDir, 'src', 'lib', 'metadata.ts'),
        content: generateMetaHelper(projectName, contentContext?.strategy),
      },

      // Lead capture API route
      {
        path: path.join(projectDir, 'src', 'app', 'api', 'lead', 'route.ts'),
        content: generateLeadCaptureRoute(
          contentContext?.strategy?.conversionStrategy.leadCapture || 'webhook'
        ),
      },

      // SEO files
      {
        path: path.join(projectDir, 'src', 'app', 'sitemap.ts'),
        content: generateEnhancedSitemap(projectName, contentContext?.strategy),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'robots.ts'),
        content: generateEnhancedRobots(projectName),
      },

      // Error pages
      {
        path: path.join(projectDir, 'src', 'app', 'not-found.tsx'),
        content: generate404Page(projectName, contentContext),
      },
      {
        path: path.join(projectDir, 'src', 'app', 'error.tsx'),
        content: generate500Page(projectName),
      },

      // PWA manifest
      {
        path: path.join(projectDir, 'public', 'manifest.webmanifest'),
        content: generateWebManifest(projectName, contentContext),
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
        content: 'NEXT_PUBLIC_SITE_URL=http://localhost:3001\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n' +
          generateLeadCaptureEnvExample(
            contentContext?.strategy?.conversionStrategy.leadCapture || 'webhook'
          ),
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
        content: generateWebsiteSpec(projectName, contentContext),
      });
    }

    // Copy logo to public/brand/ if brand context has one
    if (contentContext?.brand?.logoPath) {
      try {
        const logoExt = path.extname(contentContext.brand.logoPath);
        const destPath = path.join(projectDir, 'public', 'brand', `logo${logoExt}`);
        await fs.copyFile(contentContext.brand.logoPath, destPath);
        filesCreated.push(destPath);
      } catch {
        // Non-blocking: logo copy failure should not stop generation
      }
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

    // Post-generation content scan for placeholder fingerprints
    try {
      const scanResult = await scanGeneratedContent(projectDir);
      if (scanResult.issues.length > 0) {
        for (const issue of scanResult.issues) {
          console.warn(`[content-scan] ${issue.severity}: ${issue.message} in ${issue.file}`);
        }
      }
    } catch {
      // Non-blocking: scan failures should not stop generation
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
