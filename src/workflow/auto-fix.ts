/**
 * Auto-fix module for automatically fixing build and TypeScript errors
 * Uses Claude to analyze errors and apply fixes
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executePrompt } from '../adapters/claude.js';
import { isWorkspace, type OutputLanguage } from '../types/project.js';

/** Standard workspace subdirectories to search when a file isn't at the root */
const WORKSPACE_SUBDIRS = ['apps/frontend', 'apps/backend', 'apps/website', 'packages/frontend', 'packages/backend'];

/**
 * Resolve a (possibly relative) error file path to an absolute path that exists on disk.
 * For workspace projects, if the file doesn't exist at the project root, searches
 * workspace subdirectories (apps/frontend, apps/backend, etc.).
 */
export async function resolveErrorFilePath(
  filePath: string,
  projectDir: string,
  language: string,
): Promise<string> {
  // If already absolute and exists, use it directly
  if (path.isAbsolute(filePath)) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Absolute path doesn't exist — for workspace projects, try searching subdirs
      if (!isWorkspace(language as OutputLanguage)) return filePath;
      const basename = path.basename(filePath);
      for (const subdir of WORKSPACE_SUBDIRS) {
        const candidate = path.join(projectDir, subdir, basename);
        try {
          await fs.access(candidate);
          return candidate;
        } catch { /* continue */ }
      }
      return filePath;
    }
  }

  // Relative path: try at project root first
  const rootPath = path.join(projectDir, filePath);
  try {
    await fs.access(rootPath);
    return rootPath;
  } catch {
    // Not at root — for workspace projects, search subdirs
    if (!isWorkspace(language as OutputLanguage)) return rootPath;
    for (const subdir of WORKSPACE_SUBDIRS) {
      const candidate = path.join(projectDir, subdir, filePath);
      try {
        await fs.access(candidate);
        return candidate;
      } catch { /* continue */ }
    }
    return rootPath;
  }
}

/**
 * Build error details
 */
export interface BuildError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
}

/**
 * Auto-fix result
 */
export interface AutoFixResult {
  success: boolean;
  fixedErrors: number;
  remainingErrors: number;
  attempts: number;
  fixes: Array<{
    file: string;
    description: string;
  }>;
  error?: string;
  /** Number of error files that were not found on disk (ENOENT) */
  missingFileCount: number;
  /** Total number of unique files with errors */
  totalErrorFiles: number;
  /** True if the majority of error files don't exist - indicates missing files, not code bugs */
  isStructuralIssue: boolean;
  /** Paths of missing files (capped at 30) */
  missingFiles: string[];
}

/**
 * Parse TypeScript compiler errors from output.
 * Supports two formats:
 *   1. tsc direct: path(line,col): error TSxxxx: message
 *   2. Bundler (Vite, webpack, Next.js): path:line:col - error TSxxxx: message
 * Strips ANSI color codes and de-duplicates by file:line:col:code.
 */
export function parseTypeScriptErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  // Strip ANSI color/escape codes before parsing
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');

  // Format 1: tsc direct output - path(line,col): error TSxxxx: message
  const tscPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;

  // Format 2: bundler output (Vite, webpack, etc.) - path:line:col - error TSxxxx: message
  const bundlerPattern = /^(.+?):(\d+):(\d+)\s*-\s*error (TS\d+): (.+)$/gm;

  // De-duplicate by file:line:col:code to avoid counting the same error twice
  const seen = new Set<string>();

  for (const pattern of [tscPattern, bundlerPattern]) {
    let match;
    while ((match = pattern.exec(clean)) !== null) {
      const key = `${match[1].trim()}:${match[2]}:${match[3]}:${match[4]}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[4],
          message: match[5],
        });
      }
    }
  }

  return errors;
}

/**
 * Group errors by file for efficient fixing
 */
function groupErrorsByFile(errors: BuildError[]): Map<string, BuildError[]> {
  const grouped = new Map<string, BuildError[]>();

  for (const error of errors) {
    const existing = grouped.get(error.file) || [];
    existing.push(error);
    grouped.set(error.file, existing);
  }

  return grouped;
}

/**
 * Generate fix prompt for a file with errors
 */
function generateFixPrompt(filePath: string, fileContent: string, errors: BuildError[]): string {
  const errorList = errors
    .map(e => `- Line ${e.line}: ${e.code} - ${e.message}`)
    .join('\n');

  return `
Fix the following TypeScript errors in this file. Return ONLY the complete fixed file content, no explanations.

## File: ${filePath}

## Errors to fix:
${errorList}

## Current file content:
\`\`\`typescript
${fileContent}
\`\`\`

## Instructions:
1. Fix ALL the errors listed above
2. Do not change any working code
3. Preserve all imports, exports, and functionality
4. For type-only exports (interfaces, types), use \`export type { ... }\` syntax
5. For unused variables, either use them or prefix with underscore
6. For missing properties, add them with appropriate default values
7. Return ONLY the fixed TypeScript code, no markdown formatting

Fixed code:
`.trim();
}

/**
 * Extract code from Claude's response
 */
function extractCodeFromResponse(response: string): string {
  // Try to extract from code block first
  const codeBlockMatch = response.match(/```(?:typescript|ts)?\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // If no code block, assume the entire response is code
  // But strip any leading/trailing explanation text
  const lines = response.split('\n');

  // Find first line that looks like code (import, export, const, etc.)
  const codeStartPatterns = [
    /^import\s/,
    /^export\s/,
    /^const\s/,
    /^let\s/,
    /^var\s/,
    /^function\s/,
    /^class\s/,
    /^interface\s/,
    /^type\s/,
    /^\/\//,
    /^\/\*/,
    /^['"`]/,
  ];

  let startIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (codeStartPatterns.some(p => p.test(line))) {
      startIndex = i;
      break;
    }
  }

  return lines.slice(startIndex).join('\n').trim();
}

/**
 * Auto-fix TypeScript errors in a project
 */
export async function autoFixTypeScriptErrors(
  projectDir: string,
  buildOutput: string,
  maxAttempts: number = 3,
  onProgress?: (message: string) => void,
  language: string = 'typescript',
): Promise<AutoFixResult> {
  const fixes: Array<{ file: string; description: string }> = [];
  let attempts = 0;
  let currentOutput = buildOutput;
  const missingFilesSet = new Set<string>();
  const accessibleFilesSet = new Set<string>();

  while (attempts < maxAttempts) {
    attempts++;
    onProgress?.(`Auto-fix attempt ${attempts}/${maxAttempts}...`);

    const errors = parseTypeScriptErrors(currentOutput);

    if (errors.length === 0) {
      // First attempt with zero parsed errors and no prior fixes: the build failed
      // but we can't parse the error format. This is NOT success.
      const noParsedOnFirstAttempt = attempts === 1 && fixes.length === 0;
      if (noParsedOnFirstAttempt) {
        onProgress?.('No parseable TypeScript errors in build output (may be bundler/non-TS errors)');
        return {
          success: false,
          fixedErrors: 0,
          remainingErrors: 0,
          attempts,
          fixes,
          missingFileCount: missingFilesSet.size,
          totalErrorFiles: 0,
          isStructuralIssue: false,
          missingFiles: [],
          error: 'Build failed but no parseable TypeScript errors found in output',
        };
      }

      // Subsequent attempt after fixes: tsc --noEmit found no errors, genuinely fixed
      onProgress?.('No TypeScript errors found');
      return {
        success: true,
        fixedErrors: fixes.length,
        remainingErrors: 0,
        attempts,
        fixes,
        missingFileCount: missingFilesSet.size,
        totalErrorFiles: missingFilesSet.size + accessibleFilesSet.size,
        isStructuralIssue: false,
        missingFiles: [],
      };
    }

    onProgress?.(`Found ${errors.length} TypeScript error(s) to fix`);

    // Group errors by file
    const errorsByFile = groupErrorsByFile(errors);
    let fixedInThisAttempt = 0;

    // Fix each file
    for (const [filePath, fileErrors] of errorsByFile) {
      const absolutePath = await resolveErrorFilePath(filePath, projectDir, language);

      try {
        // Read current file content
        const fileContent = await fs.readFile(absolutePath, 'utf-8');
        accessibleFilesSet.add(absolutePath);

        onProgress?.(`Fixing ${fileErrors.length} error(s) in ${path.basename(filePath)}...`);

        // Generate fix prompt
        const prompt = generateFixPrompt(filePath, fileContent, fileErrors);

        // Ask Claude to fix
        const result = await executePrompt(prompt, {
          allowedTools: [],
          permissionMode: 'default',
        });

        if (result.success && result.response) {
          const fixedCode = extractCodeFromResponse(result.response);

          // Validate the fix is not empty and looks like code
          if (fixedCode.length > 100 && (fixedCode.includes('import') || fixedCode.includes('export'))) {
            // Write fixed content
            await fs.writeFile(absolutePath, fixedCode, 'utf-8');

            fixes.push({
              file: filePath,
              description: `Fixed ${fileErrors.length} error(s): ${fileErrors.map(e => e.code).join(', ')}`,
            });

            fixedInThisAttempt += fileErrors.length;
            onProgress?.(`Fixed ${path.basename(filePath)}`);
          } else {
            onProgress?.(`Skipped ${path.basename(filePath)} - fix doesn't look valid`);
          }
        } else {
          onProgress?.(`Failed to get fix for ${path.basename(filePath)}: ${result.error}`);
        }
      } catch (err) {
        // Track ENOENT separately - these indicate missing files, not code bugs
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          missingFilesSet.add(absolutePath);
        }
        onProgress?.(`Error fixing ${filePath}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (fixedInThisAttempt === 0) {
      if (missingFilesSet.size > 0) {
        onProgress?.(`No fixes applied: ${missingFilesSet.size}/${errorsByFile.size} error files not found on disk (ENOENT)`);
      } else {
        onProgress?.('No fixes were applied in this attempt');
      }
      break;
    }

    // Re-run TypeScript check to get remaining errors
    onProgress?.('Re-checking for remaining errors...');
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      await execAsync('npx tsc --noEmit', { cwd: projectDir });
      currentOutput = '';
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'stdout' in err) {
        currentOutput = (err as { stdout: string; stderr: string }).stdout + (err as { stdout: string; stderr: string }).stderr;
      } else {
        currentOutput = '';
      }
    }
  }

  // Final error count
  const remainingErrors = parseTypeScriptErrors(currentOutput);
  const missingFileCount = missingFilesSet.size;
  const totalErrorFiles = missingFilesSet.size + accessibleFilesSet.size;
  const missingFiles = Array.from(missingFilesSet).slice(0, 30);

  // Structural issue heuristic: most error files don't exist on disk
  const isStructuralIssue = totalErrorFiles > 0 && (
    (missingFileCount / totalErrorFiles >= 0.5) ||
    (missingFileCount >= 25)
  );

  return {
    success: remainingErrors.length === 0,
    fixedErrors: fixes.length,
    remainingErrors: remainingErrors.length,
    attempts,
    fixes,
    error: remainingErrors.length > 0
      ? `${remainingErrors.length} error(s) remain after ${attempts} fix attempt(s)`
      : undefined,
    missingFileCount,
    totalErrorFiles,
    isStructuralIssue,
    missingFiles,
  };
}

/**
 * Run build with auto-fix
 */
export async function buildWithAutoFix(
  projectDir: string,
  language: string,
  maxAttempts: number = 3,
  onProgress?: (message: string) => void
): Promise<{
  success: boolean;
  output: string;
  autoFixed: boolean;
  structuralIssue?: boolean;
  missingFileCount?: number;
  totalErrorFiles?: number;
  missingFiles?: string[];
}> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  // Determine build command and whether TypeScript auto-fix applies
  // Fullstack, website, and 'all' projects also use TypeScript
  const isTypeScriptBased = ['typescript', 'javascript', 'fullstack', 'website', 'all'].includes(language);
  let buildCommand: string;
  if (language === 'typescript' || language === 'javascript') {
    // Check for package.json build script
    try {
      const pkgJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8'));
      if (pkgJson.scripts?.build) {
        buildCommand = 'npm run build';
      } else {
        buildCommand = 'npx tsc --noEmit';
      }
    } catch {
      buildCommand = 'npx tsc --noEmit';
    }
  } else if (language === 'python') {
    buildCommand = 'python -m py_compile $(find . -name "*.py" -not -path "./venv/*")';
  } else {
    buildCommand = 'npm run build';
  }

  // Initial build attempt
  onProgress?.(`Running build: ${buildCommand}`);

  try {
    const { stdout, stderr } = await execAsync(buildCommand, {
      cwd: projectDir,
      timeout: 120000,
    });
    return { success: true, output: stdout + stderr, autoFixed: false };
  } catch (err: unknown) {
    const output = err && typeof err === 'object' && 'stdout' in err
      ? (err as { stdout: string; stderr: string }).stdout + (err as { stdout: string; stderr: string }).stderr
      : String(err);

    onProgress?.('Build failed, attempting auto-fix...');

    // Try auto-fix for TypeScript-based projects (includes fullstack, website, all)
    if (isTypeScriptBased) {
      const fixResult = await autoFixTypeScriptErrors(projectDir, output, maxAttempts, onProgress, language);

      // Log structural issue if detected
      if (fixResult.isStructuralIssue) {
        onProgress?.(`STRUCTURAL ISSUE: ${fixResult.missingFileCount}/${fixResult.totalErrorFiles} error files not found on disk. Likely missing files, not code bugs.`);
      }

      if (fixResult.success) {
        // Retry build after fixes
        onProgress?.('Auto-fix successful, retrying build...');
        try {
          const { stdout: retryStdout, stderr: retryStderr } = await execAsync(buildCommand, {
            cwd: projectDir,
            timeout: 120000,
          });
          return { success: true, output: retryStdout + retryStderr, autoFixed: true };
        } catch (retryErr: unknown) {
          const retryOutput = retryErr && typeof retryErr === 'object' && 'stdout' in retryErr
            ? (retryErr as { stdout: string; stderr: string }).stdout + (retryErr as { stdout: string; stderr: string }).stderr
            : String(retryErr);
          return {
            success: false, output: retryOutput, autoFixed: true,
            structuralIssue: fixResult.isStructuralIssue,
            missingFileCount: fixResult.missingFileCount,
            totalErrorFiles: fixResult.totalErrorFiles,
            missingFiles: fixResult.missingFiles,
          };
        }
      }

      return {
        success: false, output, autoFixed: false,
        structuralIssue: fixResult.isStructuralIssue,
        missingFileCount: fixResult.missingFileCount,
        totalErrorFiles: fixResult.totalErrorFiles,
        missingFiles: fixResult.missingFiles,
      };
    }

    return { success: false, output, autoFixed: false };
  }
}
