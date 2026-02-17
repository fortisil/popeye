/**
 * Tests for workspace root detection
 * Verifies .popeye/ detection, workspaces in package.json, and fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveWorkspaceRoot, getScanDirectories } from '../../src/generators/workspace-root.js';

describe('resolveWorkspaceRoot', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-ws-root-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects .popeye/ directory as workspace root', async () => {
    // Create nested structure: tmpDir/project/.popeye/ with cwd = tmpDir/project/sub
    const projectDir = path.join(tmpDir, 'project');
    const subDir = path.join(projectDir, 'sub');
    await fs.mkdir(path.join(projectDir, '.popeye'), { recursive: true });
    await fs.mkdir(subDir, { recursive: true });

    const root = await resolveWorkspaceRoot(subDir);

    expect(root).toBe(projectDir);
  });

  it('detects package.json with workspaces field', async () => {
    const projectDir = path.join(tmpDir, 'monorepo');
    const subDir = path.join(projectDir, 'apps', 'website');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*', 'packages/*'] })
    );

    const root = await resolveWorkspaceRoot(subDir);

    expect(root).toBe(projectDir);
  });

  it('falls back to cwd when no workspace indicators found', async () => {
    const cwd = path.join(tmpDir, 'standalone');
    await fs.mkdir(cwd, { recursive: true });

    const root = await resolveWorkspaceRoot(cwd);

    expect(root).toBe(cwd);
  });

  it('detects turbo.json or pnpm-workspace.yaml', async () => {
    const projectDir = path.join(tmpDir, 'turborepo');
    const subDir = path.join(projectDir, 'apps', 'web');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'turbo.json'), '{}');

    const root = await resolveWorkspaceRoot(subDir);

    expect(root).toBe(projectDir);
  });
});

describe('getScanDirectories', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-scan-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('includes workspace root, parent, and subdirectories', async () => {
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(path.join(projectDir, '.popeye'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'docs'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'brand'), { recursive: true });

    const dirs = await getScanDirectories(projectDir);

    expect(dirs).toContain(projectDir);
    expect(dirs).toContain(tmpDir); // parent
    expect(dirs).toContain(path.join(projectDir, 'docs'));
    expect(dirs).toContain(path.join(projectDir, 'brand'));
  });

  it('deduplicates directories', async () => {
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });

    const dirs = await getScanDirectories(projectDir);

    // No duplicates
    const unique = new Set(dirs);
    expect(unique.size).toBe(dirs.length);
  });
});
