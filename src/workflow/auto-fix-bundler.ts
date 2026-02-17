/**
 * Bundler error parser and fixer for non-TypeScript build errors.
 * Handles CSS/PostCSS/Tailwind, webpack module resolution, and generic bundler errors.
 * Used as a fallback when parseTypeScriptErrors() returns empty but the build failed.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executePrompt } from '../adapters/claude.js';
import type { AutoFixResult, BuildError } from './auto-fix.js';

/** Bundler-specific error with type classification */
export interface BundlerError extends BuildError {
  type: 'css' | 'module-not-found' | 'syntax' | 'generic';
}

/** Config files that often need modification to fix CSS/bundler errors */
const RELATED_CONFIG_FILES = [
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'postcss.config.mjs',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.ts',
  'vite.config.js',
  'tsconfig.json',
  'package.json',
];

/**
 * Parse non-TypeScript build errors from bundler output.
 * Catches CSS/PostCSS/Tailwind errors, module-not-found, and generic syntax errors.
 */
export function parseBundlerErrors(output: string): BundlerError[] {
  const errors: BundlerError[] = [];
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const seen = new Set<string>();

  // Pattern 1: CSS/PostCSS/Tailwind class not found
  // "Syntax error: /abs/path/file.css The `className` class does not exist..."
  const cssClassPattern = /Syntax error:\s*(\S+\.css)\s+(The [`'][\w-]+['`] class does not exist[^]*?)(?=\n\n|\n>|\nat\s|$)/gm;
  let match;
  while ((match = cssClassPattern.exec(clean)) !== null) {
    const key = `css:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push({
        file: match[1],
        message: match[2].trim().split('\n')[0],
        type: 'css',
      });
    }
  }

  // Pattern 2: File reference with line:col (bundler-style, non-TS)
  // "./src/app/globals.css:1:1" followed by "Syntax error:" on next lines
  const fileLinePattern = /^\.\/([\w/.@-]+\.(?:css|scss|less|json|mjs|cjs)):(\d+):(\d+)\s*$/gm;
  while ((match = fileLinePattern.exec(clean)) !== null) {
    const filePath = `./${match[1]}`;
    const line = parseInt(match[2], 10);
    const col = parseInt(match[3], 10);
    // Grab up to 500 chars after match for context
    const afterMatch = clean.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const errorLine = afterMatch.split('\n').find(l => l.trim().length > 10);
    const key = `ref:${filePath}:${line}:${col}`;
    if (!seen.has(key) && errorLine) {
      seen.add(key);
      errors.push({
        file: filePath,
        line,
        column: col,
        message: errorLine.trim(),
        type: 'syntax',
      });
    }
  }

  // Pattern 3: Module not found
  // "Module not found: Can't resolve 'package' in '/path'"
  const modulePattern = /Module not found:\s*(?:Error:\s*)?Can't resolve '([^']+)'\s+in\s+'([^']+)'/gm;
  while ((match = modulePattern.exec(clean)) !== null) {
    const key = `module:${match[1]}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push({
        file: match[2],
        message: `Cannot resolve module '${match[1]}'`,
        type: 'module-not-found',
      });
    }
  }

  // Pattern 4: Generic "Build failed because of webpack errors" — extract file references
  if (errors.length === 0 && /Build failed because of webpack errors/i.test(clean)) {
    // Try to find Import trace lines: "./src/path/file.ext"
    const importTracePattern = /^\.\/([\w/.@-]+\.\w+)\s*$/gm;
    while ((match = importTracePattern.exec(clean)) !== null) {
      const filePath = `./${match[1]}`;
      const key = `trace:${filePath}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push({
          file: filePath,
          message: 'Referenced in build error import trace',
          type: 'generic',
        });
      }
    }
  }

  return errors;
}

/**
 * Resolve the app directory from an error file path.
 * E.g., "apps/website/src/foo.css" -> "<projectDir>/apps/website"
 */
function resolveAppDir(projectDir: string, errorFile: string): string {
  const appsMatch = errorFile.match(/apps\/([^/]+)\//);
  if (appsMatch) {
    return path.join(projectDir, 'apps', appsMatch[1]);
  }
  return projectDir;
}

/**
 * Find config files related to the error (tailwind.config, postcss.config, etc.)
 * Searches both the app directory and project root.
 */
export async function findRelatedConfigs(
  projectDir: string,
  errorFile: string,
): Promise<Array<{ path: string; content: string }>> {
  const configs: Array<{ path: string; content: string }> = [];
  const appDir = resolveAppDir(projectDir, errorFile);

  // Search in both app dir and project root (deduped)
  const searchDirs = [...new Set([appDir, projectDir])];

  for (const dir of searchDirs) {
    for (const configFile of RELATED_CONFIG_FILES) {
      const configPath = path.join(dir, configFile);
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        // Cap config file size to avoid token bloat
        configs.push({ path: configPath, content: content.slice(0, 4000) });
      } catch { /* not found */ }
    }
  }

  return configs;
}

/**
 * Resolve the absolute path of a bundler error file.
 * Tries multiple locations: absolute, relative to app dir, relative to project root.
 */
async function resolveErrorFile(
  projectDir: string,
  errorFile: string,
): Promise<{ resolvedPath: string; content: string } | null> {
  const appDir = resolveAppDir(projectDir, errorFile);
  const candidates = [
    path.isAbsolute(errorFile) ? errorFile : null,
    path.join(appDir, errorFile.replace(/^\.\//, '')),
    path.join(projectDir, errorFile.replace(/^\.\//, '')),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      const content = await fs.readFile(p, 'utf-8');
      return { resolvedPath: p, content };
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Generate a fix prompt for bundler/CSS errors.
 * Includes the error file, related config files, and instructions for multi-file fixes.
 */
function generateBundlerFixPrompt(
  errorFile: string,
  fileContent: string,
  errors: BundlerError[],
  configs: Array<{ path: string; content: string }>,
  rawOutput: string,
): string {
  const errorList = errors.map(e => `- ${e.type}: ${e.message}`).join('\n');

  const configSection = configs.length > 0
    ? '\n\n## Related Configuration Files:\n' +
      configs.map(c => `### ${c.path}\n\`\`\`\n${c.content}\n\`\`\``).join('\n\n')
    : '';

  // Include raw output snippet for full context (last 1500 chars)
  const outputSnippet = rawOutput.slice(-1500);

  return `Fix the following build error. This is a CSS/bundler/config error, NOT a TypeScript error.

## Error File: ${errorFile}

## Errors:
${errorList}

## Raw Build Output (last 1500 chars):
\`\`\`
${outputSnippet}
\`\`\`

## Error file content:
\`\`\`
${fileContent}
\`\`\`${configSection}

## Instructions:
1. Analyze the error carefully — it may be a CSS, Tailwind, PostCSS, or webpack bundler error
2. The fix might be in the error file OR in a configuration file (e.g., tailwind.config.ts)
3. For Tailwind "class does not exist" errors: the fix is usually adding the class definition to tailwind.config.ts theme.extend.colors (e.g., background: 'hsl(var(--background))')
4. For module-not-found: the fix is usually a missing dependency or wrong import path
5. Return your response using this exact format for EACH file that needs changes:

FILE: <absolute path to file>
\`\`\`
<complete fixed file content>
\`\`\`

If multiple files need changes, repeat the FILE: pattern for each.
Return ONLY the files that need changes.`.trim();
}

/**
 * Parse Claude's multi-file response format.
 * Extracts "FILE: <path>\n```\n<content>\n```" blocks.
 */
export function parseMultiFileResponse(
  response: string,
): Array<{ targetPath: string; content: string }> {
  const results: Array<{ targetPath: string; content: string }> = [];
  const filePattern = /FILE:\s*(.+)\n```(?:\w*)\n([\s\S]*?)\n```/g;
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    const content = match[2].trim();
    if (content.length > 20) {
      results.push({ targetPath: match[1].trim(), content });
    }
  }
  return results;
}

/**
 * Resolve a target path from Claude's response to an actual writable file.
 */
async function resolveTargetPath(
  targetPath: string,
  projectDir: string,
  appDir: string,
  configs: Array<{ path: string; content: string }>,
): Promise<string | null> {
  const candidates = [
    path.isAbsolute(targetPath) ? targetPath : null,
    path.join(appDir, targetPath.replace(/^\.\//, '')),
    path.join(projectDir, targetPath.replace(/^\.\//, '')),
    // Match against known config paths by basename
    ...configs.map(c => c.path).filter(p => p.endsWith(path.basename(targetPath))),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Fix bundler errors by sending them to Claude with full context.
 * Handles CSS/Tailwind/PostCSS/webpack errors that parseTypeScriptErrors() can't parse.
 */
export async function fixBundlerErrors(
  projectDir: string,
  buildOutput: string,
  errors: BundlerError[],
  _language: string,
  onProgress?: (message: string) => void,
): Promise<AutoFixResult> {
  const fixes: Array<{ file: string; description: string }> = [];

  // Group errors by file
  const errorsByFile = new Map<string, BundlerError[]>();
  for (const error of errors) {
    const existing = errorsByFile.get(error.file) || [];
    existing.push(error);
    errorsByFile.set(error.file, existing);
  }

  for (const [errorFile, fileErrors] of errorsByFile) {
    onProgress?.(`Fixing ${fileErrors.length} bundler error(s) in ${path.basename(errorFile)}...`);

    // Read the error file
    const resolved = await resolveErrorFile(projectDir, errorFile);
    if (!resolved) {
      onProgress?.(`Cannot find ${errorFile}, skipping`);
      continue;
    }

    // Find related config files
    const configs = await findRelatedConfigs(projectDir, errorFile);

    // Generate fix prompt
    const prompt = generateBundlerFixPrompt(
      errorFile, resolved.content, fileErrors, configs, buildOutput,
    );

    // Ask Claude to fix
    const result = await executePrompt(prompt, {
      allowedTools: [],
      permissionMode: 'default',
    });

    if (!result.success || !result.response) {
      onProgress?.(`Failed to get fix for ${path.basename(errorFile)}: ${result.error}`);
      continue;
    }

    // Parse multi-file response
    const fileChanges = parseMultiFileResponse(result.response);
    const appDir = resolveAppDir(projectDir, errorFile);

    for (const change of fileChanges) {
      const resolvedTarget = await resolveTargetPath(
        change.targetPath, projectDir, appDir, configs,
      );

      if (!resolvedTarget) {
        onProgress?.(`Cannot resolve target path: ${change.targetPath}`);
        continue;
      }

      await fs.writeFile(resolvedTarget, change.content, 'utf-8');
      fixes.push({
        file: resolvedTarget,
        description: `Fixed bundler error: ${fileErrors[0].message.slice(0, 80)}`,
      });
      onProgress?.(`Fixed ${path.basename(resolvedTarget)}`);
    }

    // Fallback: if no FILE: pattern found, try single code-block extraction
    if (fileChanges.length === 0) {
      const singleBlock = result.response.match(/```(?:\w*)\n([\s\S]*?)\n```/);
      if (singleBlock && singleBlock[1].length > 20) {
        const content = singleBlock[1];
        // Determine if this is a config fix or a direct file fix
        let targetFile = resolved.resolvedPath;
        if (
          (content.includes('export default') || content.includes('module.exports')) &&
          !resolved.resolvedPath.endsWith('.css')
        ) {
          const configMatch = configs.find(c =>
            (content.includes('tailwind') && c.path.includes('tailwind')) ||
            (content.includes('postcss') && c.path.includes('postcss')) ||
            (content.includes('next') && c.path.includes('next.config')),
          );
          if (configMatch) targetFile = configMatch.path;
        }

        await fs.writeFile(targetFile, content, 'utf-8');
        fixes.push({
          file: targetFile,
          description: `Fixed bundler error: ${fileErrors[0].message.slice(0, 80)}`,
        });
        onProgress?.(`Fixed ${path.basename(targetFile)}`);
      }
    }
  }

  return {
    success: fixes.length > 0,
    fixedErrors: fixes.length,
    remainingErrors: 0,
    attempts: 1,
    fixes,
    missingFileCount: 0,
    totalErrorFiles: errorsByFile.size,
    isStructuralIssue: false,
    missingFiles: [],
  };
}
