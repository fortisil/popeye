/**
 * Tests for project verification path resolution and verification functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { resolveProjectPaths } from '../../src/workflow/project-verification.js';

/**
 * Create a temporary directory with the given subdirectory structure.
 *
 * @param subdirs - Array of relative directory paths to create
 * @returns The root temporary directory path
 */
async function createTempProject(subdirs: string[]): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pv-test-'));
  for (const sub of subdirs) {
    await fs.mkdir(path.join(tmpDir, sub), { recursive: true });
  }
  return tmpDir;
}

describe('resolveProjectPaths', () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    // Clean up temp directories
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs = [];
  });

  it('should resolve apps/frontend and apps/backend for fullstack projects', async () => {
    const projectDir = await createTempProject(['apps/frontend', 'apps/backend']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'fullstack');

    expect(paths.frontendDir).toBe(path.join(projectDir, 'apps', 'frontend'));
    expect(paths.backendDir).toBe(path.join(projectDir, 'apps', 'backend'));
  });

  it('should fall back to packages/frontend when apps/ does not exist', async () => {
    const projectDir = await createTempProject(['packages/frontend', 'packages/backend']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'fullstack');

    expect(paths.frontendDir).toBe(path.join(projectDir, 'packages', 'frontend'));
    expect(paths.backendDir).toBe(path.join(projectDir, 'packages', 'backend'));
  });

  it('should return null when neither apps/ nor packages/ exist for fullstack', async () => {
    const projectDir = await createTempProject(['src']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'fullstack');

    expect(paths.frontendDir).toBeNull();
    expect(paths.backendDir).toBeNull();
  });

  it('should resolve apps/ paths for "all" language', async () => {
    const projectDir = await createTempProject(['apps/frontend', 'apps/backend']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'all');

    expect(paths.frontendDir).toBe(path.join(projectDir, 'apps', 'frontend'));
    expect(paths.backendDir).toBe(path.join(projectDir, 'apps', 'backend'));
  });

  it('should return root as frontendDir for typescript projects', async () => {
    const projectDir = await createTempProject(['src']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'typescript');

    expect(paths.frontendDir).toBe(projectDir);
    expect(paths.backendDir).toBeNull();
  });

  it('should return root as frontendDir for website projects', async () => {
    const projectDir = await createTempProject(['src']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'website');

    expect(paths.frontendDir).toBe(projectDir);
    expect(paths.backendDir).toBeNull();
  });

  it('should return root as backendDir and null frontendDir for python projects', async () => {
    const projectDir = await createTempProject(['src']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'python');

    expect(paths.frontendDir).toBeNull();
    expect(paths.backendDir).toBe(projectDir);
  });

  it('should return nulls for unknown language', async () => {
    const projectDir = await createTempProject(['src']);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'rust');

    expect(paths.frontendDir).toBeNull();
    expect(paths.backendDir).toBeNull();
  });

  it('should prefer apps/ over packages/ when both exist for fullstack', async () => {
    const projectDir = await createTempProject([
      'apps/frontend',
      'apps/backend',
      'packages/frontend',
      'packages/backend',
    ]);
    tmpDirs.push(projectDir);

    const paths = await resolveProjectPaths(projectDir, 'fullstack');

    expect(paths.frontendDir).toBe(path.join(projectDir, 'apps', 'frontend'));
    expect(paths.backendDir).toBe(path.join(projectDir, 'apps', 'backend'));
  });
});
