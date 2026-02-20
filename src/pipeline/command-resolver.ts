/**
 * Command Resolver — detects project-type-specific build/test/lint/typecheck
 * commands from a RepoSnapshot. Used by CheckRunner and ProductionGate.
 */

import type { RepoSnapshot, ResolvedCommands } from './types.js';

// ─── Project Type Detection ──────────────────────────────

export type ProjectType = 'node' | 'python' | 'mixed' | 'unknown';

export function detectProjectType(snapshot: RepoSnapshot): ProjectType {
  const hasNode = snapshot.config_files.some((c) => c.type === 'package.json');
  const hasPython = snapshot.config_files.some(
    (c) => c.type === 'pyproject.toml' || c.type === 'requirements.txt' || c.type === 'setup.py',
  );

  if (hasNode && hasPython) return 'mixed';
  if (hasNode) return 'node';
  if (hasPython) return 'python';
  return 'unknown';
}

// ─── Command Resolution ──────────────────────────────────

export function resolveCommands(
  snapshot: RepoSnapshot,
  overrides?: Partial<ResolvedCommands>,
): ResolvedCommands {
  const projectType = detectProjectType(snapshot);
  const pm = snapshot.package_manager ?? 'npm';
  const scripts = snapshot.scripts;

  let resolved: ResolvedCommands;

  switch (projectType) {
    case 'node':
      resolved = resolveNodeCommands(pm, scripts, snapshot);
      break;
    case 'python':
      resolved = resolvePythonCommands(snapshot);
      break;
    case 'mixed':
      // Prefer Node commands, augment with Python where Node is missing
      resolved = resolveNodeCommands(pm, scripts, snapshot);
      if (!resolved.test) {
        const pyResolved = resolvePythonCommands(snapshot);
        resolved.test = pyResolved.test;
      }
      break;
    default:
      resolved = { resolved_from: 'none' };
  }

  // Apply overrides
  if (overrides) {
    if (overrides.build) resolved.build = overrides.build;
    if (overrides.test) resolved.test = overrides.test;
    if (overrides.lint) resolved.lint = overrides.lint;
    if (overrides.typecheck) resolved.typecheck = overrides.typecheck;
    if (overrides.migrations) resolved.migrations = overrides.migrations;
    if (overrides.start) resolved.start = overrides.start;
  }

  return resolved;
}

// ─── Node Resolution ─────────────────────────────────────

function resolveNodeCommands(
  pm: string,
  scripts: Record<string, string>,
  snapshot: RepoSnapshot,
): ResolvedCommands {
  const run = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : `${pm} run`;
  const npx = pm === 'pnpm' ? 'pnpm exec' : pm === 'yarn' ? 'yarn' : 'npx';

  const resolved: ResolvedCommands = {
    resolved_from: 'package.json',
  };

  // Build
  if (scripts.build) {
    resolved.build = `${run} build`;
  }

  // Test
  if (scripts.test) {
    resolved.test = `${run} test`;
  } else if (snapshot.test_framework === 'vitest') {
    resolved.test = `${npx} vitest run`;
  } else if (snapshot.test_framework === 'jest') {
    resolved.test = `${npx} jest`;
  }

  // Lint
  if (scripts.lint) {
    resolved.lint = `${run} lint`;
  }

  // Typecheck
  if (scripts.typecheck) {
    resolved.typecheck = `${run} typecheck`;
  } else if (snapshot.languages_detected.includes('typescript')) {
    resolved.typecheck = `${npx} tsc --noEmit`;
  }

  // Migrations
  const hasPrisma = snapshot.config_files.some(
    (c) => c.type === 'prisma/schema.prisma',
  );
  if (hasPrisma) {
    resolved.migrations = `${npx} prisma migrate deploy`;
  }

  // Start
  if (scripts.start) {
    resolved.start = `${run} start`;
  } else if (scripts.dev) {
    resolved.start = `${run} dev`;
  }

  return resolved;
}

// ─── Python Resolution ───────────────────────────────────

function resolvePythonCommands(snapshot: RepoSnapshot): ResolvedCommands {
  const resolved: ResolvedCommands = {
    resolved_from: snapshot.config_files
      .find((c) => c.type === 'pyproject.toml' || c.type === 'requirements.txt')
      ?.path ?? 'python-defaults',
  };

  // Test
  if (snapshot.test_framework === 'pytest') {
    resolved.test = 'pytest tests/';
  } else {
    resolved.test = 'pytest tests/';  // default for Python
  }

  // Lint
  const hasPyproject = snapshot.config_files.some((c) => c.type === 'pyproject.toml');
  if (hasPyproject) {
    resolved.lint = 'ruff check .';
  } else {
    resolved.lint = 'flake8 src/';
  }

  // Typecheck
  if (snapshot.languages_detected.includes('python')) {
    resolved.typecheck = 'mypy src/';
  }

  // Build
  resolved.build = 'python -m build';

  // Migrations
  const hasAlembic = snapshot.config_files.some((c) => c.type === 'alembic.ini');
  if (hasAlembic) {
    resolved.migrations = 'alembic upgrade head';
  }

  // Start
  resolved.start = 'uvicorn main:app --host 0.0.0.0 --port 8000';

  return resolved;
}
