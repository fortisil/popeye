/**
 * Command Resolver tests — Node/Python/mixed project detection and resolution.
 */

import { describe, it, expect } from 'vitest';
import { resolveCommands, detectProjectType } from '../../src/pipeline/command-resolver.js';
import type { RepoSnapshot, ConfigFileEntry } from '../../src/pipeline/types.js';

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

function makeConfig(type: string): ConfigFileEntry {
  return { path: type, type, content_hash: 'abc', key_fields: {} };
}

describe('CommandResolver', () => {
  describe('detectProjectType', () => {
    it('should detect node project', () => {
      const snap = makeSnapshot({ config_files: [makeConfig('package.json')] });
      expect(detectProjectType(snap)).toBe('node');
    });

    it('should detect python project', () => {
      const snap = makeSnapshot({ config_files: [makeConfig('pyproject.toml')] });
      expect(detectProjectType(snap)).toBe('python');
    });

    it('should detect mixed project', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json'), makeConfig('pyproject.toml')],
      });
      expect(detectProjectType(snap)).toBe('mixed');
    });

    it('should return unknown for empty project', () => {
      const snap = makeSnapshot();
      expect(detectProjectType(snap)).toBe('unknown');
    });

    it('should detect python from requirements.txt', () => {
      const snap = makeSnapshot({ config_files: [makeConfig('requirements.txt')] });
      expect(detectProjectType(snap)).toBe('python');
    });
  });

  describe('resolveCommands', () => {
    it('should resolve node commands from package.json scripts', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json')],
        package_manager: 'npm',
        scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
        languages_detected: ['typescript'],
      });

      const cmds = resolveCommands(snap);
      expect(cmds.build).toBe('npm run build');
      expect(cmds.test).toBe('npm run test');
      expect(cmds.lint).toBe('npm run lint');
      expect(cmds.resolved_from).toBe('package.json');
    });

    it('should use pnpm when detected', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json')],
        package_manager: 'pnpm',
        scripts: { build: 'tsc', test: 'vitest' },
      });

      const cmds = resolveCommands(snap);
      expect(cmds.build).toBe('pnpm build');
      expect(cmds.test).toBe('pnpm test');
    });

    it('should resolve typecheck for typescript projects', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json')],
        package_manager: 'npm',
        scripts: {},
        languages_detected: ['typescript'],
      });

      const cmds = resolveCommands(snap);
      expect(cmds.typecheck).toBe('npx tsc --noEmit');
    });

    it('should resolve python commands', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('pyproject.toml')],
        languages_detected: ['python'],
        test_framework: 'pytest',
      });

      const cmds = resolveCommands(snap);
      expect(cmds.test).toBe('pytest tests/');
      expect(cmds.lint).toBe('ruff check .');
      expect(cmds.typecheck).toBe('mypy src/');
      expect(cmds.build).toBe('python -m build');
    });

    it('should detect vitest framework fallback', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json')],
        package_manager: 'npm',
        scripts: {},
        test_framework: 'vitest',
      });

      const cmds = resolveCommands(snap);
      expect(cmds.test).toBe('npx vitest run');
    });

    it('should detect prisma migrations', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json'), makeConfig('prisma/schema.prisma')],
        package_manager: 'npm',
        scripts: {},
      });

      const cmds = resolveCommands(snap);
      expect(cmds.migrations).toBe('npx prisma migrate deploy');
    });

    it('should apply overrides', () => {
      const snap = makeSnapshot({
        config_files: [makeConfig('package.json')],
        package_manager: 'npm',
        scripts: { test: 'jest' },
      });

      const cmds = resolveCommands(snap, { test: 'custom-test-cmd' });
      expect(cmds.test).toBe('custom-test-cmd');
    });

    it('should return minimal commands for unknown project', () => {
      const snap = makeSnapshot();
      const cmds = resolveCommands(snap);
      expect(cmds.resolved_from).toBe('none');
      expect(cmds.build).toBeUndefined();
      expect(cmds.test).toBeUndefined();
    });
  });
});
