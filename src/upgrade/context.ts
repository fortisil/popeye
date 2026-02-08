/**
 * Upgrade context builder
 * Builds rich context about existing project structure so the planner
 * knows what it's building on top of after an upgrade
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { OutputLanguage } from '../types/project.js';
import { languageToApps } from '../types/project.js';
import type { UpgradeTransition } from './transitions.js';

/**
 * Upgrade context passed to planning mode
 */
export interface UpgradeContext {
  /** Summary text for the planner */
  summary: string;
  /** Apps that already exist (from the old project type) */
  existingApps: string[];
  /** Apps that were just added by the upgrade */
  newApps: string[];
  /** The original project idea */
  originalIdea: string;
  /** The original language before upgrade */
  fromLanguage: OutputLanguage;
  /** The new language after upgrade */
  toLanguage: OutputLanguage;
}

/**
 * Scan an app directory for key structural information
 *
 * @param appDir - Path to the app directory
 * @param appName - Name of the app (frontend, backend, website)
 * @returns Summary of the app structure
 */
async function scanAppStructure(appDir: string, appName: string): Promise<string> {
  const lines: string[] = [];

  try {
    await fs.access(appDir);
  } catch {
    return `  ${appName}: (not found)`;
  }

  lines.push(`  ${appName}/`);

  // Check for package.json to understand dependencies and scripts
  const pkgPath = path.join(appDir, 'package.json');
  try {
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    if (pkg.dependencies) {
      const deps = Object.keys(pkg.dependencies).slice(0, 10);
      lines.push(`    Dependencies: ${deps.join(', ')}${Object.keys(pkg.dependencies).length > 10 ? '...' : ''}`);
    }
    if (pkg.scripts) {
      const scripts = Object.keys(pkg.scripts).slice(0, 8);
      lines.push(`    Scripts: ${scripts.join(', ')}`);
    }
  } catch {
    // No package.json
  }

  // Check for requirements.txt (Python)
  const reqPath = path.join(appDir, 'requirements.txt');
  try {
    const reqContent = await fs.readFile(reqPath, 'utf-8');
    const deps = reqContent.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 10);
    lines.push(`    Python dependencies: ${deps.join(', ')}${deps.length >= 10 ? '...' : ''}`);
  } catch {
    // No requirements.txt
  }

  // Check for pyproject.toml (Python)
  const pyprojectPath = path.join(appDir, 'pyproject.toml');
  try {
    await fs.access(pyprojectPath);
    lines.push(`    Has pyproject.toml`);
  } catch {
    // No pyproject.toml
  }

  // Scan for key directories and files
  try {
    const entries = await fs.readdir(appDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__');
    const files = entries.filter(e => e.isFile() && !e.name.startsWith('.'));

    if (dirs.length > 0) {
      lines.push(`    Directories: ${dirs.map(d => d.name).join(', ')}`);
    }
    if (files.length > 0) {
      const keyFiles = files.map(f => f.name).slice(0, 12);
      lines.push(`    Key files: ${keyFiles.join(', ')}${files.length > 12 ? '...' : ''}`);
    }
  } catch {
    // Can't read directory
  }

  // Check for API routes or endpoints
  const apiDirs = ['src/routes', 'src/api', 'routes', 'api', 'src/app/api'];
  for (const apiDir of apiDirs) {
    const fullPath = path.join(appDir, apiDir);
    try {
      const entries = await fs.readdir(fullPath);
      const routeFiles = entries.filter(f => !f.startsWith('.'));
      if (routeFiles.length > 0) {
        lines.push(`    API routes (${apiDir}/): ${routeFiles.slice(0, 8).join(', ')}${routeFiles.length > 8 ? '...' : ''}`);
      }
    } catch {
      // No API directory
    }
  }

  return lines.join('\n');
}

/**
 * Scan for shared packages (contracts, design-tokens, ui)
 *
 * @param projectDir - Project root directory
 * @returns Summary of shared packages
 */
async function scanSharedPackages(projectDir: string): Promise<string> {
  const packagesDir = path.join(projectDir, 'packages');
  const lines: string[] = [];

  try {
    const entries = await fs.readdir(packagesDir, { withFileTypes: true });
    const packages = entries.filter(e => e.isDirectory());

    if (packages.length === 0) return '';

    lines.push('Shared packages:');
    for (const pkg of packages) {
      const pkgJsonPath = path.join(packagesDir, pkg.name, 'package.json');
      try {
        const content = await fs.readFile(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(content);
        lines.push(`  ${pkg.name}: ${pkgJson.description || '(no description)'}`);
      } catch {
        lines.push(`  ${pkg.name}/`);
      }
    }
  } catch {
    // No packages directory
  }

  return lines.join('\n');
}

/**
 * Check for contracts between apps (API schemas, shared types)
 *
 * @param projectDir - Project root directory
 * @returns Summary of contracts/shared types
 */
async function scanContracts(projectDir: string): Promise<string> {
  const contractPaths = [
    path.join(projectDir, 'packages', 'contracts'),
    path.join(projectDir, 'packages', 'shared'),
    path.join(projectDir, 'packages', 'types'),
  ];

  for (const contractDir of contractPaths) {
    try {
      const entries = await fs.readdir(contractDir);
      const files = entries.filter(f => !f.startsWith('.') && f !== 'node_modules');
      if (files.length > 0) {
        return `Shared contracts: ${files.join(', ')}`;
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return '';
}

/**
 * Read the existing plan if available
 *
 * @param projectDir - Project root directory
 * @returns Plan summary or empty string
 */
async function getExistingPlanSummary(projectDir: string): Promise<string> {
  const planPaths = [
    path.join(projectDir, 'docs', 'PLAN.md'),
    path.join(projectDir, 'docs', 'PLAN-DRAFT.md'),
  ];

  for (const planPath of planPaths) {
    try {
      const content = await fs.readFile(planPath, 'utf-8');
      // Return first 2000 chars as summary
      const summary = content.slice(0, 2000);
      return `Previous plan summary:\n${summary}${content.length > 2000 ? '\n... (truncated)' : ''}`;
    } catch {
      // File doesn't exist
    }
  }

  return '';
}

/**
 * Build rich context about the project after an upgrade
 * This context is passed to the planner so it knows what already exists
 * and can focus the plan on the new apps + integration
 *
 * @param projectDir - Project root directory
 * @param transition - The upgrade transition details
 * @param originalIdea - The original project idea
 * @param fromLanguage - The language before upgrade
 * @returns Upgrade context with summary for the planner
 */
export async function buildUpgradeContext(
  projectDir: string,
  transition: UpgradeTransition,
  originalIdea: string,
  fromLanguage: OutputLanguage,
): Promise<UpgradeContext> {
  const existingApps = languageToApps(fromLanguage);
  const newApps = transition.newApps;

  const sections: string[] = [];

  // Header
  sections.push(`=== PROJECT EXPANSION: ${fromLanguage} -> ${transition.to} ===`);
  sections.push('');
  sections.push(`This is an EXPANSION of an existing project, NOT a new project.`);
  sections.push(`Original idea: ${originalIdea}`);
  sections.push('');

  // What already exists
  sections.push('== EXISTING APPS (already built - DO NOT rebuild) ==');
  const appsDir = path.join(projectDir, 'apps');
  for (const app of existingApps) {
    const appDir = path.join(appsDir, app);
    const structure = await scanAppStructure(appDir, app);
    sections.push(structure);
  }
  // Also scan root if code was not yet in apps/ (single-app pre-restructure state is gone after upgrade,
  // but the code is now in apps/)
  sections.push('');

  // What's new
  sections.push('== NEW APPS TO PLAN (focus your plan here) ==');
  for (const app of newApps) {
    sections.push(`  ${app}: Scaffolded but needs full implementation planning`);
    const appDir = path.join(appsDir, app);
    const structure = await scanAppStructure(appDir, app);
    sections.push(structure);
  }
  sections.push('');

  // Shared packages
  const sharedPkgs = await scanSharedPackages(projectDir);
  if (sharedPkgs) {
    sections.push('== SHARED PACKAGES ==');
    sections.push(sharedPkgs);
    sections.push('');
  }

  // Contracts
  const contracts = await scanContracts(projectDir);
  if (contracts) {
    sections.push('== CONTRACTS ==');
    sections.push(contracts);
    sections.push('');
  }

  // Previous plan context
  const planSummary = await getExistingPlanSummary(projectDir);
  if (planSummary) {
    sections.push('== PREVIOUS PLAN (for reference only - existing apps are already implemented) ==');
    sections.push(planSummary);
    sections.push('');
  }

  // Integration instructions
  sections.push('== PLANNING INSTRUCTIONS ==');
  sections.push('');
  sections.push('Your plan MUST:');
  sections.push(`1. Focus ONLY on the new ${newApps.join(', ')} app(s) - do NOT replan existing ${existingApps.join(', ')} app(s)`);
  sections.push('2. Include integration tasks between new and existing apps:');

  // Generate specific integration guidance based on what's being added
  if (newApps.includes('website') && existingApps.includes('frontend')) {
    sections.push('   - Shared design tokens and UI components between frontend and website');
    sections.push('   - Consistent navigation and branding across frontend app and marketing website');
  }
  if (newApps.includes('website') && existingApps.includes('backend')) {
    sections.push('   - Website API calls to backend (e.g., contact forms, newsletter signup)');
    sections.push('   - Shared authentication if needed (SSO between website and app)');
  }
  if (newApps.includes('frontend') && existingApps.includes('backend')) {
    sections.push('   - API contracts: frontend must consume existing backend API endpoints');
    sections.push('   - Shared types/interfaces between frontend and backend');
    sections.push('   - Authentication flow: frontend login using backend auth endpoints');
  }
  if (newApps.includes('backend') && existingApps.includes('frontend')) {
    sections.push('   - API endpoints that the existing frontend needs');
    sections.push('   - Data models and database schema');
    sections.push('   - Authentication and authorization backend');
  }
  if (newApps.includes('frontend') && newApps.includes('backend')) {
    sections.push('   - Full API contract design between new frontend and backend');
    sections.push('   - Shared types/interfaces');
    sections.push('   - Authentication flow end-to-end');
  }

  const appTagMap: Record<string, string> = { frontend: '[FE]', backend: '[BE]', website: '[WEB]' };
  const appTags = newApps.map(a => appTagMap[a] || `[${String(a).toUpperCase()}]`);
  sections.push(`3. Tag tasks with app targets: ${appTags.join(', ')} and [INT] for integration tasks`);
  sections.push('4. Include Docker Compose updates for new services');
  sections.push('5. Include tests for new apps and integration tests');
  sections.push('');

  const summary = sections.join('\n');

  return {
    summary,
    existingApps,
    newApps,
    originalIdea,
    fromLanguage,
    toLanguage: transition.to,
  };
}
