/**
 * Debug context helpers
 * Deterministic functions for error analysis and smart file selection.
 * Pure functions, easily testable.
 */

import path from 'node:path';

/**
 * Entry in the lightweight file index (paths + metadata, no content).
 */
export interface FileIndexEntry {
  relativePath: string;
  size: number;
  mtime: number;
  isConfig: boolean;
}

/** Config file patterns that are always considered relevant */
const CONFIG_PATTERNS = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config',
  'pyproject.toml', 'requirements.txt', 'Pipfile',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  '.env.example', '.env.local', 'alembic.ini',
  'next.config', 'tailwind.config', 'postcss.config',
  'jest.config', 'vitest.config', 'pytest.ini', 'setup.cfg',
];

/**
 * Check if a file path matches a config pattern.
 *
 * @param filePath - Relative path to check.
 * @returns True if the file is a known config file.
 */
export function isConfigFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  return CONFIG_PATTERNS.some((p) => basename.startsWith(p));
}

/**
 * Extract file paths mentioned in stack traces.
 * Supports Python tracebacks, TypeScript/JS errors, and generic path patterns.
 *
 * @param text - Error text or stack trace.
 * @returns Deduplicated array of file paths found in the text.
 */
export function extractPathsFromError(text: string): string[] {
  const paths = new Set<string>();

  // Python traceback: File "/app/src/module/file.py", line 42
  const pyPattern = /File "([^"]+\.py[cw]?)", line \d+/g;
  for (const match of text.matchAll(pyPattern)) {
    paths.add(normalizePath(match[1]));
  }

  // TS/JS errors: src/components/App.tsx(15,3) or src/components/App.tsx:15:3
  const tsPattern = /([a-zA-Z0-9_./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs))[\s:(]/g;
  for (const match of text.matchAll(tsPattern)) {
    paths.add(normalizePath(match[1]));
  }

  // Docker / generic paths: /app/src/..., ./src/...
  const genericPattern = /(?:\/app\/|\.\/)((?:src|app|lib|tests?|config)\/[a-zA-Z0-9_./-]+\.\w+)/g;
  for (const match of text.matchAll(genericPattern)) {
    paths.add(normalizePath(match[1]));
  }

  // Module not found patterns: Cannot find module './foo/bar'
  const modulePattern = /Cannot find module ['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(modulePattern)) {
    const mod = match[1];
    if (mod.startsWith('.') || mod.startsWith('/')) {
      paths.add(normalizePath(mod));
    }
  }

  // ModuleNotFoundError: No module named 'src.foo.bar'
  const pyModulePattern = /No module named ['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(pyModulePattern)) {
    const dotPath = match[1].replace(/\./g, '/');
    paths.add(dotPath);
  }

  return Array.from(paths);
}

/** Tech keyword map: keyword -> tags */
const TECH_KEYWORDS: Record<string, string[]> = {
  'alembic': ['alembic', 'database', 'migration'],
  'sqlalchemy': ['sqlalchemy', 'database', 'orm'],
  'prisma': ['prisma', 'database', 'orm'],
  'docker': ['docker', 'container'],
  'docker-compose': ['docker', 'container', 'compose'],
  'vite': ['vite', 'bundler', 'frontend'],
  'webpack': ['webpack', 'bundler', 'frontend'],
  'next': ['nextjs', 'react', 'frontend'],
  'fastapi': ['fastapi', 'backend', 'python'],
  'flask': ['flask', 'backend', 'python'],
  'express': ['express', 'backend', 'node'],
  'postgres': ['postgres', 'database'],
  'redis': ['redis', 'cache'],
  'tailwind': ['tailwind', 'css', 'frontend'],
  'pytest': ['pytest', 'testing', 'python'],
  'jest': ['jest', 'testing', 'node'],
  'vitest': ['vitest', 'testing', 'node'],
  'nginx': ['nginx', 'proxy'],
  'cors': ['cors', 'api'],
  'migration': ['migration', 'database'],
  'celery': ['celery', 'queue', 'python'],
};

/**
 * Detect framework/tech keywords from error text.
 *
 * @param text - Error text or stack trace.
 * @returns Object with deduplicated tags array.
 */
export function detectTechFromError(text: string): { tags: string[] } {
  const tags = new Set<string>();
  const lower = text.toLowerCase();

  for (const [keyword, keywordTags] of Object.entries(TECH_KEYWORDS)) {
    if (lower.includes(keyword)) {
      for (const tag of keywordTags) {
        tags.add(tag);
      }
    }
  }

  return { tags: Array.from(tags) };
}

/**
 * Select relevant files from the project index based on error paths and tech tags.
 * Returns file paths sorted by relevance (direct matches first, then config, then nearby).
 *
 * @param fileIndex - Lightweight file index.
 * @param errorPaths - Paths extracted from the error.
 * @param tags - Tech tags detected from the error.
 * @returns Array of relative paths to load.
 */
export function selectRelevantFiles(
  fileIndex: FileIndexEntry[],
  errorPaths: string[],
  tags: string[]
): string[] {
  if (fileIndex.length === 0) return [];

  const selected = new Set<string>();
  const MAX_FILES = 15;

  // 1. Direct matches: files mentioned in the error
  for (const errorPath of errorPaths) {
    for (const entry of fileIndex) {
      if (
        entry.relativePath.endsWith(errorPath) ||
        entry.relativePath === errorPath ||
        entry.relativePath.includes(errorPath)
      ) {
        selected.add(entry.relativePath);
      }
    }
  }

  // 2. Sibling files: files in the same directory as matches
  const matchedDirs = new Set<string>();
  for (const sel of selected) {
    matchedDirs.add(path.dirname(sel));
  }
  for (const dir of matchedDirs) {
    for (const entry of fileIndex) {
      if (path.dirname(entry.relativePath) === dir && selected.size < MAX_FILES) {
        selected.add(entry.relativePath);
      }
    }
  }

  // 3. Tag-based: config files related to detected tech
  if (tags.includes('database') || tags.includes('migration')) {
    for (const entry of fileIndex) {
      if (
        entry.relativePath.includes('alembic') ||
        entry.relativePath.includes('migration') ||
        entry.relativePath.includes('prisma') ||
        entry.relativePath.includes('schema.sql')
      ) {
        if (selected.size < MAX_FILES) selected.add(entry.relativePath);
      }
    }
  }
  if (tags.includes('docker') || tags.includes('compose')) {
    for (const entry of fileIndex) {
      if (
        entry.relativePath.includes('docker') ||
        entry.relativePath.includes('Dockerfile')
      ) {
        if (selected.size < MAX_FILES) selected.add(entry.relativePath);
      }
    }
  }

  // 4. Fallback: always include config files if we have few matches
  if (selected.size < 5) {
    for (const entry of fileIndex) {
      if (entry.isConfig && selected.size < MAX_FILES) {
        selected.add(entry.relativePath);
      }
    }
  }

  return Array.from(selected).slice(0, MAX_FILES);
}

/** Image file extensions that Claude can read via the Read tool */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

/**
 * Extract image/screenshot file paths from user input text.
 * Detects both quoted and unquoted absolute/relative paths ending in image extensions.
 *
 * @param text - User input text.
 * @returns Array of image file paths found in the text.
 */
export function extractImagePaths(text: string): string[] {
  const paths = new Set<string>();

  // Quoted paths: '/path/to/image.png' or "/path/to/image.png"
  const quotedPattern = /['"]([^'"]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))['"]/gi;
  for (const match of text.matchAll(quotedPattern)) {
    paths.add(match[1]);
  }

  // Unquoted absolute paths: /path/to/image.png (no spaces allowed in unquoted)
  const absolutePattern = /(\/[^\s'"]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/gi;
  for (const match of text.matchAll(absolutePattern)) {
    paths.add(match[1]);
  }

  return Array.from(paths);
}

/**
 * Check if a file path points to an image file.
 *
 * @param filePath - File path to check.
 * @returns True if the file has an image extension.
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Normalize a file path by stripping common prefixes (/app/, ./, etc.).
 *
 * @param p - Raw file path from error text.
 * @returns Normalized relative path.
 */
function normalizePath(p: string): string {
  let normalized = p.replace(/\\/g, '/');
  // Strip common container prefixes
  normalized = normalized.replace(/^\/app\//, '');
  normalized = normalized.replace(/^\.\//, '');
  return normalized;
}
