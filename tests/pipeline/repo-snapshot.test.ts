/**
 * Repo Snapshot tests — config detection, tree summary, diff.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateRepoSnapshot, diffSnapshots } from '../../src/pipeline/repo-snapshot.js';

const TEST_DIR = join(process.cwd(), '.test-repo-snapshot');

describe('RepoSnapshot', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('generateRepoSnapshot', () => {
    it('should generate snapshot with basic fields', async () => {
      writeFileSync(join(TEST_DIR, 'index.ts'), 'console.log("hello");\n');
      const snapshot = await generateRepoSnapshot(TEST_DIR);

      expect(snapshot.snapshot_id).toBeDefined();
      expect(snapshot.snapshot_id.length).toBe(16);
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.tree_summary).toBeDefined();
      expect(Array.isArray(snapshot.config_files)).toBe(true);
      expect(Array.isArray(snapshot.languages_detected)).toBe(true);
      expect(typeof snapshot.total_files).toBe('number');
      expect(typeof snapshot.total_lines).toBe('number');
    });

    it('should detect package.json config', async () => {
      const pkg = { name: 'test', version: '1.0.0', scripts: { test: 'vitest' } };
      writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify(pkg, null, 2));

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      const pkgConfig = snapshot.config_files.find((c) => c.type === 'package.json');

      expect(pkgConfig).toBeDefined();
      expect(pkgConfig!.content_hash).toBeDefined();
      expect(pkgConfig!.key_fields).toHaveProperty('name', 'test');
      expect(pkgConfig!.key_fields).toHaveProperty('scripts');
    });

    it('should detect languages from file extensions', async () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(join(TEST_DIR, 'src', 'app.ts'), 'export const x = 1;\n');
      writeFileSync(join(TEST_DIR, 'src', 'util.py'), 'x = 1\n');

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.languages_detected).toContain('typescript');
      expect(snapshot.languages_detected).toContain('python');
    });

    it('should detect package manager from lock files', async () => {
      writeFileSync(join(TEST_DIR, 'package.json'), '{}');
      writeFileSync(join(TEST_DIR, 'pnpm-lock.yaml'), '');

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.package_manager).toBe('pnpm');
    });

    it('should detect test framework from scripts', async () => {
      const pkg = { name: 'test', scripts: { test: 'vitest run' } };
      writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify(pkg));

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.test_framework).toBe('vitest');
    });

    it('should detect build tool from scripts', async () => {
      const pkg = { name: 'test', scripts: { build: 'tsc -b' } };
      writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify(pkg));

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.build_tool).toBe('tsc');
    });

    it('should detect env files', async () => {
      writeFileSync(join(TEST_DIR, '.env'), 'KEY=val');
      writeFileSync(join(TEST_DIR, '.env.example'), 'KEY=');

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.env_files).toContain('.env');
      expect(snapshot.env_files).toContain('.env.example');
    });

    it('should detect migrations presence', async () => {
      mkdirSync(join(TEST_DIR, 'migrations'), { recursive: true });

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.migrations_present).toBe(true);
    });

    it('should count files and lines', async () => {
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(join(TEST_DIR, 'src', 'a.ts'), 'line1\nline2\nline3\n');
      writeFileSync(join(TEST_DIR, 'src', 'b.ts'), 'one\ntwo\n');

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.total_files).toBe(2);
      expect(snapshot.total_lines).toBeGreaterThan(0);
    });

    it('should exclude node_modules from scan', async () => {
      mkdirSync(join(TEST_DIR, 'node_modules', 'dep'), { recursive: true });
      writeFileSync(join(TEST_DIR, 'node_modules', 'dep', 'index.js'), 'x');
      mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
      writeFileSync(join(TEST_DIR, 'src', 'app.ts'), 'const x = 1;\n');

      const snapshot = await generateRepoSnapshot(TEST_DIR);
      expect(snapshot.total_files).toBe(1); // Only src/app.ts
    });
  });

  describe('diffSnapshots', () => {
    it('should detect no changes for identical snapshots', async () => {
      writeFileSync(join(TEST_DIR, 'index.ts'), 'x');
      const snapshot = await generateRepoSnapshot(TEST_DIR);
      const diff = diffSnapshots(snapshot, snapshot);

      expect(diff.has_changes).toBe(false);
      expect(diff.files_delta).toBe(0);
      expect(diff.lines_delta).toBe(0);
      expect(diff.added_configs).toHaveLength(0);
      expect(diff.removed_configs).toHaveLength(0);
      expect(diff.changed_configs).toHaveLength(0);
    });

    it('should detect added config files', () => {
      const before = {
        snapshot_id: 'a', timestamp: '', tree_summary: '',
        config_files: [], languages_detected: [],
        scripts: {}, env_files: [],
        migrations_present: false, ports_entrypoints: [],
        total_files: 10, total_lines: 100,
      };
      const after = {
        ...before,
        snapshot_id: 'b',
        config_files: [{ path: 'package.json', type: 'package.json', content_hash: 'abc', key_fields: {} }],
      };

      const diff = diffSnapshots(before, after);
      expect(diff.added_configs).toContain('package.json');
      expect(diff.has_changes).toBe(true);
    });

    it('should detect changed config files', () => {
      const before = {
        snapshot_id: 'a', timestamp: '', tree_summary: '',
        config_files: [{ path: 'package.json', type: 'package.json', content_hash: 'old', key_fields: {} }],
        languages_detected: [], scripts: {},
        env_files: [], migrations_present: false,
        ports_entrypoints: [], total_files: 10, total_lines: 100,
      };
      const after = {
        ...before,
        snapshot_id: 'b',
        config_files: [{ path: 'package.json', type: 'package.json', content_hash: 'new', key_fields: {} }],
      };

      const diff = diffSnapshots(before, after);
      expect(diff.changed_configs).toContain('package.json');
      expect(diff.has_changes).toBe(true);
    });

    it('should detect file count delta', () => {
      const before = {
        snapshot_id: 'a', timestamp: '', tree_summary: '',
        config_files: [], languages_detected: [],
        scripts: {}, env_files: [],
        migrations_present: false, ports_entrypoints: [],
        total_files: 10, total_lines: 100,
      };
      const after = { ...before, snapshot_id: 'b', total_files: 15, total_lines: 200 };

      const diff = diffSnapshots(before, after);
      expect(diff.files_delta).toBe(5);
      expect(diff.lines_delta).toBe(100);
      expect(diff.has_changes).toBe(true);
    });
  });
});
