/**
 * Repo Snapshot Generator — deterministic project state capture.
 * Generated before every consensus gate for anti-hallucination.
 * Supports caching via mtime for performance (P2-H).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import type {
  RepoSnapshot,
  ConfigFileEntry,
  PortEntry,
} from './types.js';
import type { ArtifactEntry } from './types.js';
import { ArtifactManager } from './artifact-manager.js';
import type { PipelinePhase } from './types.js';

// ─── Constants ───────────────────────────────────────────

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', '__pycache__', '.next',
  '.nuxt', 'build', 'coverage', '.turbo', '.cache',
  '.venv', 'venv', 'env',
]);

const CONFIG_FILES = new Set([
  'package.json', 'pyproject.toml', 'docker-compose.yml',
  'docker-compose.yaml', 'Dockerfile', 'tsconfig.json',
  'vite.config.ts', 'vite.config.js', 'next.config.js',
  'next.config.mjs', 'next.config.ts', 'webpack.config.js',
  'tailwind.config.ts', 'tailwind.config.js',
  'jest.config.ts', 'jest.config.js', 'vitest.config.ts',
  'vitest.config.js', '.eslintrc.js', '.eslintrc.json',
  'eslint.config.js', 'eslint.config.mjs',
  'prisma/schema.prisma', 'alembic.ini',
  'requirements.txt', 'setup.py', 'setup.cfg',
  'Makefile', 'Procfile',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
  '.java', '.rb', '.php', '.vue', '.svelte', '.astro',
  '.css', '.scss', '.html', '.sql', '.prisma',
]);

// ─── Line Count Cache ────────────────────────────────────

interface LineCacheEntry {
  mtime: number;
  lines: number;
}

const lineCache = new Map<string, LineCacheEntry>();

function countLinesWithCache(filePath: string): number {
  try {
    const stat = statSync(filePath);
    const cached = lineCache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.lines;
    }
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    lineCache.set(filePath, { mtime: stat.mtimeMs, lines });
    return lines;
  } catch {
    return 0;
  }
}

// ─── Snapshot Generation ─────────────────────────────────

/** Generate a deterministic snapshot of the project */
export async function generateRepoSnapshot(projectDir: string): Promise<RepoSnapshot> {
  const snapshotId = createHash('sha256')
    .update(`${projectDir}-${Date.now()}`)
    .digest('hex')
    .slice(0, 16);

  const treeSummary = buildTreeSummary(projectDir, '', 3);
  const configFiles = scanConfigFiles(projectDir);
  const languagesDetected = detectLanguages(projectDir);
  const envFiles = findEnvFiles(projectDir);
  const migrationsPresent = detectMigrations(projectDir);
  const portsEntrypoints = detectPorts(configFiles);
  const { totalFiles, totalLines } = countFilesAndLines(projectDir);

  // Extract key info from config files
  const packageManager = detectPackageManager(projectDir, configFiles);
  const scripts = extractScripts(configFiles);
  const testFramework = detectTestFramework(configFiles, scripts);
  const buildTool = detectBuildTool(configFiles, scripts);

  return {
    snapshot_id: snapshotId,
    timestamp: new Date().toISOString(),
    tree_summary: treeSummary,
    config_files: configFiles,
    languages_detected: languagesDetected,
    package_manager: packageManager,
    scripts,
    test_framework: testFramework,
    build_tool: buildTool,
    env_files: envFiles,
    migrations_present: migrationsPresent,
    ports_entrypoints: portsEntrypoints,
    total_files: totalFiles,
    total_lines: totalLines,
  };
}

/** Store snapshot as an artifact */
export function createSnapshotArtifact(
  snapshot: RepoSnapshot,
  artifactManager: ArtifactManager,
  phase: PipelinePhase,
): ArtifactEntry {
  return artifactManager.createAndStoreJson('repo_snapshot', snapshot, phase);
}

/** Compare two snapshots to detect drift */
export function diffSnapshots(
  before: RepoSnapshot,
  after: RepoSnapshot,
): SnapshotDiff {
  const addedConfigs = after.config_files
    .filter((c) => !before.config_files.some((b) => b.path === c.path));
  const removedConfigs = before.config_files
    .filter((c) => !after.config_files.some((a) => a.path === c.path));
  const changedConfigs = after.config_files.filter((ac) => {
    const bc = before.config_files.find((b) => b.path === ac.path);
    return bc && bc.content_hash !== ac.content_hash;
  });

  const filesChanged = after.total_files !== before.total_files;
  const linesChanged = after.total_lines !== before.total_lines;

  return {
    added_configs: addedConfigs.map((c) => c.path),
    removed_configs: removedConfigs.map((c) => c.path),
    changed_configs: changedConfigs.map((c) => c.path),
    files_delta: after.total_files - before.total_files,
    lines_delta: after.total_lines - before.total_lines,
    has_changes: filesChanged || linesChanged || changedConfigs.length > 0
      || addedConfigs.length > 0 || removedConfigs.length > 0,
  };
}

export interface SnapshotDiff {
  added_configs: string[];
  removed_configs: string[];
  changed_configs: string[];
  files_delta: number;
  lines_delta: number;
  has_changes: boolean;
}

// ─── Internal Helpers ────────────────────────────────────

function buildTreeSummary(dir: string, prefix: string, maxDepth: number): string {
  if (maxDepth <= 0) return '';

  const lines: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => !EXCLUDE_DIRS.has(e.name) && !e.name.startsWith('.'));

    for (const entry of entries.slice(0, 50)) {
      const marker = entry.isDirectory() ? '/' : '';
      lines.push(`${prefix}${entry.name}${marker}`);

      if (entry.isDirectory() && maxDepth > 1) {
        const sub = buildTreeSummary(join(dir, entry.name), prefix + '  ', maxDepth - 1);
        if (sub) lines.push(sub);
      }
    }

    if (entries.length > 50) {
      lines.push(`${prefix}... (+${entries.length - 50} more)`);
    }
  } catch {
    // Directory unreadable
  }

  return lines.join('\n');
}

function scanConfigFiles(projectDir: string): ConfigFileEntry[] {
  const configs: ConfigFileEntry[] = [];

  for (const configName of CONFIG_FILES) {
    const fullPath = join(projectDir, configName);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      const keyFields = extractKeyFields(configName, content);

      configs.push({
        path: configName,
        type: configName,
        content_hash: contentHash,
        key_fields: keyFields,
      });
    } catch {
      // Skip unreadable config files
    }
  }

  return configs;
}

function extractKeyFields(configName: string, content: string): Record<string, unknown> {
  try {
    if (configName === 'package.json') {
      const pkg = JSON.parse(content);
      return {
        name: pkg.name,
        version: pkg.version,
        scripts: pkg.scripts,
        dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
        devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
      };
    }

    if (configName === 'tsconfig.json') {
      const ts = JSON.parse(content);
      return {
        target: ts.compilerOptions?.target,
        module: ts.compilerOptions?.module,
        outDir: ts.compilerOptions?.outDir,
      };
    }
  } catch {
    // Not JSON parseable, return empty
  }

  return {};
}

function detectLanguages(projectDir: string): string[] {
  const languages = new Set<string>();
  const extensionMap: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.rb': 'ruby', '.php': 'php',
  };

  function scan(dir: string, depth: number): void {
    if (depth > 3) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        if (entry.isDirectory()) {
          scan(join(dir, entry.name), depth + 1);
        } else {
          const ext = extname(entry.name);
          if (extensionMap[ext]) languages.add(extensionMap[ext]);
        }
      }
    } catch {
      // Skip unreadable
    }
  }

  scan(projectDir, 0);
  return Array.from(languages).sort();
}

function findEnvFiles(projectDir: string): string[] {
  try {
    return readdirSync(projectDir)
      .filter((f) => f.startsWith('.env'))
      .sort();
  } catch {
    return [];
  }
}

function detectMigrations(projectDir: string): boolean {
  const migrationDirs = ['migrations', 'prisma/migrations', 'alembic/versions', 'db/migrate'];
  return migrationDirs.some((d) => existsSync(join(projectDir, d)));
}

function detectPorts(configFiles: ConfigFileEntry[]): PortEntry[] {
  const ports: PortEntry[] = [];

  for (const config of configFiles) {
    if (config.type === 'docker-compose.yml' || config.type === 'docker-compose.yaml') {
      // Basic port detection from docker-compose key_fields
      // Full parsing would need YAML, keeping it simple
      ports.push({ port: 3000, service: 'app', source: config.path });
    }
  }

  // Check package.json scripts for port hints
  const pkg = configFiles.find((c) => c.type === 'package.json');
  if (pkg) {
    const scripts = (pkg.key_fields as Record<string, unknown>).scripts;
    if (scripts && typeof scripts === 'object') {
      const startScript = (scripts as Record<string, string>).start ?? '';
      const portMatch = startScript.match(/(?:PORT|port)[=: ]?(\d+)/);
      if (portMatch) {
        ports.push({ port: parseInt(portMatch[1], 10), service: 'start', source: 'package.json' });
      }
    }
  }

  return ports;
}

function detectPackageManager(
  projectDir: string,
  _configFiles: ConfigFileEntry[],
): string | undefined {
  if (existsSync(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectDir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectDir, 'bun.lockb'))) return 'bun';
  if (existsSync(join(projectDir, 'package-lock.json'))) return 'npm';
  if (existsSync(join(projectDir, 'requirements.txt'))) return 'pip';
  if (existsSync(join(projectDir, 'pyproject.toml'))) return 'poetry';
  return undefined;
}

function extractScripts(configFiles: ConfigFileEntry[]): Record<string, string> {
  const pkg = configFiles.find((c) => c.type === 'package.json');
  if (!pkg) return {};
  const scripts = (pkg.key_fields as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== 'object') return {};
  return scripts as Record<string, string>;
}

function detectTestFramework(
  configFiles: ConfigFileEntry[],
  scripts: Record<string, string>,
): string | undefined {
  const testScript = scripts.test ?? '';
  if (testScript.includes('vitest')) return 'vitest';
  if (testScript.includes('jest')) return 'jest';
  if (testScript.includes('pytest')) return 'pytest';
  if (testScript.includes('mocha')) return 'mocha';

  if (configFiles.some((c) => c.type.startsWith('vitest.config'))) return 'vitest';
  if (configFiles.some((c) => c.type.startsWith('jest.config'))) return 'jest';
  return undefined;
}

function detectBuildTool(
  configFiles: ConfigFileEntry[],
  scripts: Record<string, string>,
): string | undefined {
  const buildScript = scripts.build ?? '';
  if (buildScript.includes('tsc')) return 'tsc';
  if (buildScript.includes('vite')) return 'vite';
  if (buildScript.includes('webpack')) return 'webpack';
  if (buildScript.includes('next')) return 'next';
  if (buildScript.includes('turbo')) return 'turbo';

  if (configFiles.some((c) => c.type.startsWith('vite.config'))) return 'vite';
  if (configFiles.some((c) => c.type.startsWith('next.config'))) return 'next';
  return undefined;
}

function countFilesAndLines(projectDir: string): { totalFiles: number; totalLines: number } {
  let totalFiles = 0;
  let totalLines = 0;

  function walk(dir: string, depth: number): void {
    if (depth > 8) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (CODE_EXTENSIONS.has(extname(entry.name))) {
          totalFiles++;
          totalLines += countLinesWithCache(fullPath);
        }
      }
    } catch {
      // Skip unreadable
    }
  }

  walk(projectDir, 0);
  return { totalFiles, totalLines };
}
