/**
 * Separation guard for website independence
 * Ensures website app does not import from apps/frontend
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Separation violation
 */
export interface SeparationViolation {
  file: string;
  line: number;
  import: string;
  reason: string;
}

/**
 * Separation validation result
 */
export interface SeparationValidationResult {
  valid: boolean;
  violations: SeparationViolation[];
}

/**
 * Forbidden import patterns for website
 */
const FORBIDDEN_PATTERNS = [
  // Direct imports from apps/frontend
  /from\s+['"][^'"]*\/apps\/frontend/,
  /from\s+['"]@[^/]+\/frontend/,
  /require\s*\(\s*['"][^'"]*\/apps\/frontend/,
  // Direct imports from apps/backend
  /from\s+['"][^'"]*\/apps\/backend/,
  /from\s+['"]@[^/]+\/backend/,
  /require\s*\(\s*['"][^'"]*\/apps\/backend/,
];

/**
 * Allowed import patterns (packages are OK)
 */
const ALLOWED_PATTERNS = [
  /from\s+['"]@[^/]+\/ui/,
  /from\s+['"]@[^/]+\/design-tokens/,
  /from\s+['"]@[^/]+\/contracts/,
];

/**
 * Check if a file contains forbidden imports
 *
 * @param filePath - Path to the file
 * @param content - File content
 * @returns Array of violations
 */
function checkFileForViolations(
  filePath: string,
  content: string
): SeparationViolation[] {
  const violations: SeparationViolation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip allowed patterns
    const isAllowed = ALLOWED_PATTERNS.some((pattern) => pattern.test(line));
    if (isAllowed) {
      continue;
    }

    // Check forbidden patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        // Extract the import path
        const importMatch = line.match(/['"]([^'"]+)['"]/);
        const importPath = importMatch ? importMatch[1] : 'unknown';

        violations.push({
          file: filePath,
          line: i + 1,
          import: importPath,
          reason: `Website must not import from ${importPath}. Use packages/ui or packages/design-tokens instead.`,
        });
      }
    }
  }

  return violations;
}

/**
 * Recursively find all TypeScript/TSX files
 *
 * @param dir - Directory to search
 * @returns Array of file paths
 */
async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and .next
        if (entry.name === 'node_modules' || entry.name === '.next') {
          continue;
        }
        const subFiles = await findTsFiles(fullPath);
        files.push(...subFiles);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
      ) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }

  return files;
}

/**
 * Validate website independence - website must not import from apps/frontend or apps/backend
 *
 * @param projectDir - Project root directory
 * @returns Validation result
 */
export async function validateWebsiteIndependence(
  projectDir: string
): Promise<SeparationValidationResult> {
  const websiteDir = path.join(projectDir, 'apps', 'website');
  const violations: SeparationViolation[] = [];

  try {
    // Check if website directory exists
    await fs.access(websiteDir);
  } catch {
    // No website directory - nothing to validate
    return {
      valid: true,
      violations: [],
    };
  }

  // Find all TypeScript files in website
  const tsFiles = await findTsFiles(websiteDir);

  // Check each file
  for (const filePath of tsFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(websiteDir, filePath);
      const fileViolations = checkFileForViolations(relativePath, content);
      violations.push(...fileViolations);
    } catch {
      // Skip files that can't be read
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Format separation violations for display
 *
 * @param violations - Array of violations
 * @returns Formatted string
 */
export function formatViolations(violations: SeparationViolation[]): string {
  if (violations.length === 0) {
    return 'No separation violations found.';
  }

  const lines = ['Website Separation Violations:', ''];

  for (const v of violations) {
    lines.push(`  ${v.file}:${v.line}`);
    lines.push(`    Import: ${v.import}`);
    lines.push(`    ${v.reason}`);
    lines.push('');
  }

  lines.push(`Total: ${violations.length} violation(s)`);
  lines.push('');
  lines.push(
    'Fix: Website should import shared code from packages/ui or packages/design-tokens, not from apps/frontend or apps/backend.'
  );

  return lines.join('\n');
}
