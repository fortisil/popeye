/**
 * Website content updater
 * Refreshes website template content after plan mode succeeds,
 * using the expanded specification and discovered user docs
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState } from '../types/workflow.js';
import type { OutputLanguage } from '../types/project.js';
import { isWorkspace } from '../types/project.js';
import { buildWebsiteContext, resolveBrandAssets, validateWebsiteContext } from '../generators/website-context.js';
import { resolveWorkspaceRoot } from '../generators/workspace-root.js';
import { generateWebsiteLandingPage } from '../generators/templates/website-landing.js';
import { generateWebsitePricingPage } from '../generators/templates/website-pricing.js';
import {
  generateWebsiteLayout,
  generateWebsiteGlobalsCss,
} from '../generators/templates/website-layout.js';
import {
  generateWebsiteHeader,
  generateWebsiteFooter,
} from '../generators/templates/website-components.js';
import { loadWebsiteStrategy } from './website-strategy.js';

/**
 * Update website content files with project context after plan mode
 *
 * @param projectDir - The project directory
 * @param state - Current project state (with specification, userDocs, brandContext)
 * @param language - Project language type
 * @param onProgress - Optional progress callback
 */
export async function updateWebsiteContent(
  projectDir: string,
  state: ProjectState,
  language: OutputLanguage,
  onProgress?: (message: string) => void
): Promise<void> {
  // Determine website directory based on project type
  const websiteDir = isWorkspace(language)
    ? path.join(projectDir, 'apps', 'website')
    : projectDir;

  // Check if website directory exists
  try {
    await fs.access(websiteDir);
  } catch {
    onProgress?.('Website directory not found, skipping content update');
    return;
  }

  // Build content context from user docs and specification
  const parentDir = path.dirname(projectDir);
  const context = await buildWebsiteContext(
    parentDir,
    state.name,
    state.specification
  );

  // Apply brand context from state if available
  if (state.brandContext?.primaryColor) {
    context.brand = {
      ...context.brand,
      primaryColor: state.brandContext.primaryColor,
    };
  }
  if (state.brandContext?.logoPath) {
    context.brand = {
      ...context.brand,
      logoPath: state.brandContext.logoPath,
    };
  }

  // Resolve brand assets using workspace root for proper logo resolution
  const workspaceRoot = await resolveWorkspaceRoot(parentDir);
  context.brandAssets = await resolveBrandAssets(workspaceRoot, context.brand);

  // Load website strategy if available
  const strategyData = await loadWebsiteStrategy(projectDir);
  if (strategyData) {
    context.strategy = strategyData.strategy;
    onProgress?.('Loaded website strategy for content update');
  }

  // Soft validation: report quality issues via progress callback
  const validation = validateWebsiteContext(context, state.name);
  for (const msg of [...validation.issues, ...validation.warnings]) {
    onProgress?.(`[quality-gate] ${msg}`);
  }

  onProgress?.('Updating website content with project context...');

  // Re-generate content files
  const updates: Array<{ path: string; content: string }> = [
    {
      path: path.join(websiteDir, 'src', 'app', 'page.tsx'),
      content: generateWebsiteLandingPage(state.name, context),
    },
    {
      path: path.join(websiteDir, 'src', 'app', 'pricing', 'page.tsx'),
      content: generateWebsitePricingPage(state.name, context),
    },
    {
      path: path.join(websiteDir, 'src', 'app', 'layout.tsx'),
      content: generateWebsiteLayout(state.name, context),
    },
    {
      path: path.join(websiteDir, 'src', 'app', 'globals.css'),
      content: generateWebsiteGlobalsCss(context),
    },
    {
      path: path.join(websiteDir, 'src', 'components', 'Header.tsx'),
      content: generateWebsiteHeader(state.name, context, context.strategy),
    },
    {
      path: path.join(websiteDir, 'src', 'components', 'Footer.tsx'),
      content: generateWebsiteFooter(state.name, context, context.strategy),
    },
  ];

  for (const update of updates) {
    try {
      await fs.writeFile(update.path, update.content, 'utf-8');
    } catch {
      // Non-blocking: individual file update failures should not stop the workflow
    }
  }

  // Copy logo to public/brand/ if brand context has one
  if (context.brand?.logoPath) {
    try {
      const logoExt = path.extname(context.brand.logoPath);
      const destPath = path.join(websiteDir, 'public', 'brand', `logo${logoExt}`);
      await fs.copyFile(context.brand.logoPath, destPath);
    } catch {
      // Non-blocking
    }
  }

  onProgress?.('Website content updated with project context');
}
