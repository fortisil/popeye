/**
 * Install check tests — install resolution, skip-heuristic, phase ordering, marker invalidation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCommands } from '../../src/pipeline/command-resolver.js';
import {
  shouldSkipInstall,
  writeInstallMarker,
  invalidateInstallMarker,
} from '../../src/pipeline/check-runner.js';
import type { RepoSnapshot, ConfigFileEntry } from '../../src/pipeline/types.js';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

function makeSnapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    snapshot_id: 'test-snap',
    timestamp: new Date().toISOString(),
    tree_summary: '',
    config_files: [],
    languages_detected: [],
    package_manager: undefined,
    scripts: {},
    test_framework: undefined,
    build_tool: undefined,
    env_files: [],
    migrations_present: false,
    ports_entrypoints: [],
    total_files: 0,
    total_lines: 0,
    ...overrides,
  };
}

function makeConfig(type: string, overrides: Partial<ConfigFileEntry> = {}): ConfigFileEntry {
  return { path: type, type, content_hash: 'abc123', key_fields: {}, ...overrides };
}

// ─── Install Resolution Tests ─────────────────────────────

describe('Install Resolution', () => {
  it('should resolve install for npm project', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package.json')],
      package_manager: 'npm',
      scripts: { build: 'tsc' },
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBe('npm install');
  });

  it('should resolve install for yarn project', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package.json')],
      package_manager: 'yarn',
      scripts: { build: 'tsc' },
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBe('yarn install');
  });

  it('should resolve install for pnpm project', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package.json')],
      package_manager: 'pnpm',
      scripts: { build: 'tsc' },
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBe('pnpm install');
  });

  it('should resolve install for python project with requirements.txt', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('requirements.txt')],
      languages_detected: ['python'],
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBe('pip install -r requirements.txt');
  });

  it('should resolve install for python project with poetry.lock', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('pyproject.toml'), makeConfig('poetry.lock')],
      languages_detected: ['python'],
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBe('poetry install');
  });

  it('should return NO install for pyproject.toml-only python project', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('pyproject.toml')],
      languages_detected: ['python'],
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBeUndefined();
  });

  it('should return chained install for mixed project', () => {
    const snap = makeSnapshot({
      config_files: [
        makeConfig('package.json'),
        makeConfig('requirements.txt'),
      ],
      package_manager: 'npm',
      scripts: {},
      languages_detected: ['typescript', 'python'],
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install).toBe('npm install && pip install -r requirements.txt');
  });

  it('should set install_cwd for workspace project with workspaces field', () => {
    const snap = makeSnapshot({
      config_files: [
        makeConfig('package.json', { key_fields: { workspaces: ['apps/*', 'packages/*'] } }),
      ],
      package_manager: 'npm',
      scripts: {},
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install_cwd).toBe('.');
  });

  it('should set install_cwd for pnpm workspace project', () => {
    const snap = makeSnapshot({
      config_files: [
        makeConfig('package.json'),
        makeConfig('pnpm-workspace.yaml'),
      ],
      package_manager: 'pnpm',
      scripts: {},
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install_cwd).toBe('.');
  });

  it('should NOT set install_cwd for non-workspace project', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package.json')],
      package_manager: 'npm',
      scripts: {},
    });

    const cmds = resolveCommands(snap);
    expect(cmds.install_cwd).toBeUndefined();
  });
});

// ─── Skip-Heuristic Tests ─────────────────────────────────

describe('Install Skip Heuristic', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(tmpdir(), 'install-skip-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return false when no marker exists', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package-lock.json', { content_hash: 'hash1' })],
      package_manager: 'npm',
    });

    expect(shouldSkipInstall(testDir, snap)).toBe(false);
  });

  it('should return true when marker matches lockfile hash and node_modules exists', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package-lock.json', { content_hash: 'hash1' })],
      package_manager: 'npm',
    });

    // Create node_modules directory
    fs.mkdirSync(path.join(testDir, 'node_modules'));

    // Write marker
    writeInstallMarker(testDir, snap);

    expect(shouldSkipInstall(testDir, snap)).toBe(true);
  });

  it('should return false when lockfile hash differs', () => {
    const snap1 = makeSnapshot({
      config_files: [makeConfig('package-lock.json', { content_hash: 'hash1' })],
      package_manager: 'npm',
    });
    const snap2 = makeSnapshot({
      config_files: [makeConfig('package-lock.json', { content_hash: 'hash2' })],
      package_manager: 'npm',
    });

    // Create node_modules directory
    fs.mkdirSync(path.join(testDir, 'node_modules'));

    // Write marker with old hash
    writeInstallMarker(testDir, snap1);

    // Check with new hash
    expect(shouldSkipInstall(testDir, snap2)).toBe(false);
  });

  it('should return false when node_modules is missing even if marker matches', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package-lock.json', { content_hash: 'hash1' })],
      package_manager: 'npm',
    });

    // Write marker but do NOT create node_modules
    writeInstallMarker(testDir, snap);

    expect(shouldSkipInstall(testDir, snap)).toBe(false);
  });

  it('should invalidate marker when called', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('package-lock.json', { content_hash: 'hash1' })],
      package_manager: 'npm',
    });

    // Create node_modules and write marker
    fs.mkdirSync(path.join(testDir, 'node_modules'));
    writeInstallMarker(testDir, snap);
    expect(shouldSkipInstall(testDir, snap)).toBe(true);

    // Invalidate
    invalidateInstallMarker(testDir);
    expect(shouldSkipInstall(testDir, snap)).toBe(false);
  });

  it('should work with python .venv directory for poetry projects', () => {
    const snap = makeSnapshot({
      config_files: [makeConfig('poetry.lock', { content_hash: 'pyhash1' })],
      package_manager: 'poetry',
    });

    // Create .venv directory
    fs.mkdirSync(path.join(testDir, '.venv'));

    // Write marker
    writeInstallMarker(testDir, snap);

    expect(shouldSkipInstall(testDir, snap)).toBe(true);
  });
});
