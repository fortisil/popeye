/**
 * Tests for upgrade context builder
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildUpgradeContext } from '../../src/upgrade/context.js';
import { getTransitionDetails } from '../../src/upgrade/transitions.js';
import type { UpgradeTransition } from '../../src/upgrade/transitions.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-context-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Create a minimal monorepo structure for testing
 */
async function createMonorepoStructure(
  baseDir: string,
  apps: string[],
  options?: { withPackageJson?: boolean; withPlan?: boolean },
) {
  const appsDir = path.join(baseDir, 'apps');
  await fs.mkdir(appsDir, { recursive: true });

  for (const app of apps) {
    const appDir = path.join(appsDir, app);
    await fs.mkdir(path.join(appDir, 'src'), { recursive: true });

    if (options?.withPackageJson) {
      await fs.writeFile(
        path.join(appDir, 'package.json'),
        JSON.stringify({
          name: `@test/${app}`,
          scripts: { dev: 'vite', build: 'tsc', test: 'vitest' },
          dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        }, null, 2),
      );
    }

    // Add a source file so the scanner sees code
    await fs.writeFile(
      path.join(appDir, 'src', 'index.ts'),
      `export const app = '${app}';`,
    );
  }

  if (options?.withPlan) {
    await fs.mkdir(path.join(baseDir, 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(baseDir, 'docs', 'PLAN.md'),
      '# Development Plan\n\n## Milestone 1: Setup\n\nThis is the original plan.',
    );
  }
}

describe('buildUpgradeContext', () => {
  it('should build context for fullstack -> all upgrade', async () => {
    const transition = getTransitionDetails('fullstack', 'all')!;
    await createMonorepoStructure(tmpDir, ['frontend', 'backend', 'website'], {
      withPackageJson: true,
      withPlan: true,
    });

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Build a task management app',
      'fullstack',
    );

    expect(context.existingApps).toEqual(['frontend', 'backend']);
    expect(context.newApps).toEqual(['website']);
    expect(context.fromLanguage).toBe('fullstack');
    expect(context.toLanguage).toBe('all');
    expect(context.originalIdea).toBe('Build a task management app');

    // Summary should contain key sections
    expect(context.summary).toContain('PROJECT EXPANSION: fullstack -> all');
    expect(context.summary).toContain('EXISTING APPS');
    expect(context.summary).toContain('NEW APPS TO PLAN');
    expect(context.summary).toContain('PLANNING INSTRUCTIONS');
    expect(context.summary).toContain('DO NOT rebuild');
    expect(context.summary).toContain('[WEB]');
    expect(context.summary).toContain('[INT]');
  });

  it('should build context for python -> fullstack upgrade', async () => {
    const transition = getTransitionDetails('python', 'fullstack')!;
    await createMonorepoStructure(tmpDir, ['frontend', 'backend']);

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Build a REST API',
      'python',
    );

    expect(context.existingApps).toEqual(['backend']);
    expect(context.newApps).toEqual(['frontend']);
    expect(context.fromLanguage).toBe('python');
    expect(context.toLanguage).toBe('fullstack');

    // Should include frontend-backend integration guidance
    expect(context.summary).toContain('API contracts');
    expect(context.summary).toContain('[FE]');
  });

  it('should build context for website -> all upgrade', async () => {
    const transition = getTransitionDetails('website', 'all')!;
    await createMonorepoStructure(tmpDir, ['frontend', 'backend', 'website']);

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Build a marketing website',
      'website',
    );

    expect(context.existingApps).toEqual(['website']);
    expect(context.newApps).toContain('frontend');
    expect(context.newApps).toContain('backend');
    expect(context.toLanguage).toBe('all');

    // Should include guidance for both new apps
    expect(context.summary).toContain('[FE]');
    expect(context.summary).toContain('[BE]');
  });

  it('should include package.json info when available', async () => {
    const transition = getTransitionDetails('fullstack', 'all')!;
    await createMonorepoStructure(tmpDir, ['frontend', 'backend', 'website'], {
      withPackageJson: true,
    });

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Test idea',
      'fullstack',
    );

    // Should include dependency info from package.json
    expect(context.summary).toContain('react');
    expect(context.summary).toContain('Scripts:');
  });

  it('should include previous plan when available', async () => {
    const transition = getTransitionDetails('fullstack', 'all')!;
    await createMonorepoStructure(tmpDir, ['frontend', 'backend', 'website'], {
      withPlan: true,
    });

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Test idea',
      'fullstack',
    );

    expect(context.summary).toContain('PREVIOUS PLAN');
    expect(context.summary).toContain('original plan');
  });

  it('should handle missing apps directory gracefully', async () => {
    const transition = getTransitionDetails('fullstack', 'all')!;
    // Don't create any structure

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Test idea',
      'fullstack',
    );

    // Should still produce valid context without crashing
    expect(context.summary).toContain('PROJECT EXPANSION');
    expect(context.newApps).toEqual(['website']);
  });

  it('should scan shared packages when present', async () => {
    const transition = getTransitionDetails('fullstack', 'all')!;
    await createMonorepoStructure(tmpDir, ['frontend', 'backend']);

    // Add shared packages
    const tokensDir = path.join(tmpDir, 'packages', 'design-tokens');
    await fs.mkdir(tokensDir, { recursive: true });
    await fs.writeFile(
      path.join(tokensDir, 'package.json'),
      JSON.stringify({ name: '@test/design-tokens', description: 'Shared design tokens' }),
    );

    const context = await buildUpgradeContext(
      tmpDir,
      transition,
      'Test idea',
      'fullstack',
    );

    expect(context.summary).toContain('SHARED PACKAGES');
    expect(context.summary).toContain('design-tokens');
  });
});
