/**
 * Post-generation content scanner
 * Scans generated website files for known placeholder fingerprints
 * and reports quality issues as warnings
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * A single scan issue found in a generated file
 */
export interface ScanIssue {
  /** Relative file path within the website directory */
  file: string;
  /** Human-readable description of the issue */
  message: string;
  /** Severity: error = likely broken, warning = looks generic */
  severity: 'error' | 'warning';
  /** Line number where the issue was found (approximate) */
  line?: number;
}

/**
 * Result of scanning generated website content
 */
export interface ScanResult {
  /** All issues found across scanned files */
  issues: ScanIssue[];
  /** Number of files scanned */
  filesScanned: number;
  /** Content quality score 0-100 based on issues found */
  score: number;
}

/**
 * Known placeholder patterns to detect in generated files
 */
const PLACEHOLDER_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
}> = [
  {
    pattern: /\/\*\s*TODO[^*]*\*\//,
    message: 'Contains TODO block comment',
    severity: 'error',
  },
  {
    pattern: /\{\/\*\s*TODO[^*]*\*\/\}/,
    message: 'Contains JSX TODO comment',
    severity: 'error',
  },
  {
    pattern: /\/\/\s*TODO\b/,
    message: 'Contains TODO line comment',
    severity: 'error',
  },
  {
    pattern: /Build something amazing/,
    message: 'Default tagline "Build something amazing"',
    severity: 'warning',
  },
  {
    pattern: /Your modern web application/,
    message: 'Generic description "Your modern web application"',
    severity: 'warning',
  },
  {
    pattern: /Lorem ipsum/i,
    message: 'Contains lorem ipsum placeholder text',
    severity: 'error',
  },
  {
    pattern: /\$29(?:\/mo)?/,
    message: 'Default pricing amount ($29/mo)',
    severity: 'warning',
  },
  {
    pattern: /coming soon/i,
    message: 'Contains "coming soon" placeholder text',
    severity: 'error',
  },
  {
    pattern: /placeholder/i,
    message: 'Contains "placeholder" text',
    severity: 'error',
  },
];

/**
 * Multi-line patterns checked against the full file content
 * These detect combinations that indicate default/template content
 */
const COMPOSITE_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
}> = [
  {
    pattern: /name:\s*['"]Starter['"][\s\S]{0,500}name:\s*['"]Pro['"][\s\S]{0,500}name:\s*['"]Enterprise['"]/,
    message: 'Default pricing tiers (Starter/Pro/Enterprise)',
    severity: 'warning',
  },
  {
    pattern: /title:\s*['"]Sign Up['"][\s\S]{0,500}title:\s*['"]Configure['"][\s\S]{0,500}title:\s*['"]Deploy['"]/,
    message: 'Default "How It Works" steps (Sign Up/Configure/Deploy)',
    severity: 'warning',
  },
];

/**
 * File extensions to scan within the website directory
 */
const SCANNABLE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.css']);

/**
 * Directories to skip during scanning
 */
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage']);

/**
 * Recursively collect scannable files from a directory
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative path calculation
 * @returns Array of absolute file paths
 */
async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const subFiles = await collectFiles(path.join(dir, entry.name), baseDir);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SCANNABLE_EXTENSIONS.has(ext)) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  } catch {
    // Directory not accessible, skip
  }

  return results;
}

/**
 * Find the approximate line number for a regex match in content
 *
 * @param content - File content
 * @param pattern - Pattern to search for
 * @returns Line number (1-based) or undefined
 */
function findLineNumber(content: string, pattern: RegExp): number | undefined {
  const match = content.match(pattern);
  if (!match || match.index === undefined) return undefined;
  const beforeMatch = content.slice(0, match.index);
  return beforeMatch.split('\n').length;
}

/**
 * Collect all page routes from the src/app directory structure.
 * A route exists if there is a page.tsx (or page.jsx/page.ts/page.js) in a directory.
 *
 * @param appDir - The src/app directory path
 * @returns Set of route paths (e.g., '/', '/pricing', '/blog')
 */
async function collectPageRoutes(appDir: string): Promise<Set<string>> {
  const routes = new Set<string>();

  async function walk(dir: string, routePrefix: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Check if this directory has a page file
      const hasPage = entries.some(
        (e) => e.isFile() && /^page\.(tsx|jsx|ts|js)$/.test(e.name)
      );
      if (hasPage) {
        routes.add(routePrefix || '/');
      }

      // Recurse into subdirectories (skip special dirs)
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('_') || entry.name === 'api' || SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), `${routePrefix}/${entry.name}`);
      }
    } catch {
      // Directory not accessible
    }
  }

  await walk(appDir, '');
  return routes;
}

/**
 * Scan for internal links that point to pages that do not exist.
 *
 * @param websiteDir - The website project directory
 * @param files - Already-collected source file paths
 * @returns Array of scan issues for broken internal links
 */
async function scanInternalLinks(
  websiteDir: string,
  files: string[]
): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];
  const appDir = path.join(websiteDir, 'src', 'app');

  // Collect existing page routes
  const routes = await collectPageRoutes(appDir);

  // Regex to find href="/..." values in source files
  const hrefPattern = /href=["'](\/([\w-/]*)?)["']/g;

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(websiteDir, filePath);

      let match;
      while ((match = hrefPattern.exec(content)) !== null) {
        const href = match[1];

        // Skip anchor links (/#section), API routes, and external/protocol links
        if (href.startsWith('/#') || href.startsWith('/api/') || href.startsWith('/api')) continue;

        // Normalize: strip trailing slash for comparison
        const normalizedHref = href === '/' ? '/' : href.replace(/\/$/, '');

        if (!routes.has(normalizedHref)) {
          const lineNum = content.slice(0, match.index).split('\n').length;
          issues.push({
            file: relativePath,
            message: `Internal link "${href}" points to a page that does not exist`,
            severity: 'error',
            line: lineNum,
          });
        }
      }

      // Reset regex lastIndex for next file
      hrefPattern.lastIndex = 0;
    } catch {
      // Skip unreadable files
    }
  }

  return issues;
}

/**
 * Scan generated website files for placeholder fingerprints and broken internal links
 *
 * @param websiteDir - The website project directory to scan
 * @returns Scan result with issues and quality score
 */
export async function scanGeneratedContent(websiteDir: string): Promise<ScanResult> {
  const issues: ScanIssue[] = [];
  const files = await collectFiles(path.join(websiteDir, 'src'), websiteDir);
  let score = 100;

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(websiteDir, filePath);

      // Check per-line patterns
      for (const { pattern, message, severity } of PLACEHOLDER_PATTERNS) {
        if (pattern.test(content)) {
          issues.push({
            file: relativePath,
            message,
            severity,
            line: findLineNumber(content, pattern),
          });
          score -= severity === 'error' ? 15 : 5;
        }
      }

      // Check composite (multi-line) patterns
      for (const { pattern, message, severity } of COMPOSITE_PATTERNS) {
        if (pattern.test(content)) {
          issues.push({
            file: relativePath,
            message,
            severity,
          });
          score -= severity === 'error' ? 15 : 5;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Scan for broken internal links
  try {
    const linkIssues = await scanInternalLinks(websiteDir, files);
    issues.push(...linkIssues);
    score -= linkIssues.length * 15;
  } catch {
    // Non-blocking: link scan failures should not stop the overall scan
  }

  return {
    issues,
    filesScanned: files.length,
    score: Math.max(0, Math.min(100, score)),
  };
}
