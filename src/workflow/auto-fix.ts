/**
 * Auto-fix module for automatically fixing build and TypeScript errors
 * Uses Claude to analyze errors and apply fixes
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executePrompt } from '../adapters/claude.js';

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
}

/**
 * Parse TypeScript compiler errors from output
 */
export function parseTypeScriptErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const errorPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;

  let match;
  while ((match = errorPattern.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[4],
      message: match[5],
    });
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
  onProgress?: (message: string) => void
): Promise<AutoFixResult> {
  const fixes: Array<{ file: string; description: string }> = [];
  let attempts = 0;
  let currentOutput = buildOutput;

  while (attempts < maxAttempts) {
    attempts++;
    onProgress?.(`Auto-fix attempt ${attempts}/${maxAttempts}...`);

    const errors = parseTypeScriptErrors(currentOutput);

    if (errors.length === 0) {
      onProgress?.('No TypeScript errors found');
      return {
        success: true,
        fixedErrors: fixes.length,
        remainingErrors: 0,
        attempts,
        fixes,
      };
    }

    onProgress?.(`Found ${errors.length} TypeScript error(s) to fix`);

    // Group errors by file
    const errorsByFile = groupErrorsByFile(errors);
    let fixedInThisAttempt = 0;

    // Fix each file
    for (const [filePath, fileErrors] of errorsByFile) {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath);

      try {
        // Read current file content
        const fileContent = await fs.readFile(absolutePath, 'utf-8');

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
        onProgress?.(`Error fixing ${filePath}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (fixedInThisAttempt === 0) {
      onProgress?.('No fixes were applied in this attempt');
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

  return {
    success: remainingErrors.length === 0,
    fixedErrors: fixes.length,
    remainingErrors: remainingErrors.length,
    attempts,
    fixes,
    error: remainingErrors.length > 0
      ? `${remainingErrors.length} error(s) remain after ${attempts} fix attempt(s)`
      : undefined,
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
): Promise<{ success: boolean; output: string; autoFixed: boolean }> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  // Determine build command based on language
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

    // Try auto-fix for TypeScript errors
    if (language === 'typescript' || language === 'javascript') {
      const fixResult = await autoFixTypeScriptErrors(projectDir, output, maxAttempts, onProgress);

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
          return { success: false, output: retryOutput, autoFixed: true };
        }
      }
    }

    return { success: false, output, autoFixed: false };
  }
}
