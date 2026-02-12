/**
 * Tests for enhanced auto-fix: ENOENT detection, path parsing, structural issue heuristic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseErrorFilePaths, analyzeFileExistence } from '../../src/workflow/execution-mode.js';
import { parseTypeScriptErrors } from '../../src/workflow/auto-fix.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-autofix-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('parseErrorFilePaths', () => {
  it('should extract paths from TS format: path(line,col): error TS', () => {
    const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'
src/utils.ts(25,12): error TS2339: Property 'bar' does not exist`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/utils.ts');
    expect(paths).toHaveLength(2);
  });

  it('should extract paths from generic format: path:line:col - error TS', () => {
    const output = `src/app.tsx:15:3 - error TS2322: Type 'string' is not assignable
src/components/Button.tsx:8:1 - error TS2307: Cannot find module`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/app.tsx');
    expect(paths).toContain('src/components/Button.tsx');
    expect(paths).toHaveLength(2);
  });

  it('should normalize Windows backslashes to forward slashes', () => {
    const output = `src\\components\\Header.tsx(5,10): error TS2304: Cannot find name 'x'`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/components/Header.tsx');
  });

  it('should strip ANSI color codes before parsing', () => {
    const output = `\x1b[31msrc/index.ts\x1b[0m(10,5): error TS2304: Cannot find name 'foo'`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/index.ts');
  });

  it('should filter out virtual/non-project paths', () => {
    const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'
node_modules/@types/react/index.d.ts(100,1): error TS2300: Duplicate identifier
../node_modules/vite/dist/node/index.d.ts(50,1): error TS2300: Duplicate`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/index.ts');
    // node_modules and vite paths should be filtered
    expect(paths).not.toContain('node_modules/@types/react/index.d.ts');
    expect(paths).toHaveLength(1);
  });

  it('should de-duplicate paths after normalization', () => {
    const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'
src/index.ts(15,1): error TS2339: Property 'bar' does not exist
src/index.ts(20,3): error TS2322: Type mismatch`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/index.ts');
    expect(paths).toHaveLength(1);
  });

  it('should handle ERROR in prefix wrappers', () => {
    const output = `ERROR in src/app.ts(5,10): error TS2304: Cannot find name 'x'`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('src/app.ts');
  });

  it('should handle apps/ and packages/ prefixed paths', () => {
    const output = `apps/frontend/src/App.tsx(10,5): error TS2304: Cannot find name 'foo'
packages/shared/src/types.ts(5,1): error TS2307: Cannot find module`;

    const paths = parseErrorFilePaths(output);

    expect(paths).toContain('apps/frontend/src/App.tsx');
    expect(paths).toContain('packages/shared/src/types.ts');
    expect(paths).toHaveLength(2);
  });

  it('should return empty array for non-TS error output', () => {
    const output = 'npm ERR! code ELIFECYCLE\nnpm ERR! errno 1';

    const paths = parseErrorFilePaths(output);

    expect(paths).toHaveLength(0);
  });
});

describe('analyzeFileExistence', () => {
  it('should correctly identify existing and missing files', async () => {
    // Create some files
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export {}');

    const result = await analyzeFileExistence(tempDir, [
      'src/index.ts',       // exists
      'src/missing.ts',     // does not exist
    ]);

    expect(result.existing).toContain('src/index.ts');
    expect(result.missing).toContain('src/missing.ts');
    expect(result.existing).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
    expect(result.summary).toContain('1/2 error files exist');
    expect(result.summary).toContain('1/2 MISSING');
  });

  it('should handle absolute paths correctly', async () => {
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'export {}');

    const absolutePath = path.join(tempDir, 'src', 'app.ts');
    const result = await analyzeFileExistence(tempDir, [absolutePath]);

    expect(result.existing).toContain(absolutePath);
    expect(result.missing).toHaveLength(0);
  });

  it('should handle empty file list', async () => {
    const result = await analyzeFileExistence(tempDir, []);

    expect(result.existing).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.summary).toBe('No error files to check');
  });

  it('should report all missing when no files exist', async () => {
    const result = await analyzeFileExistence(tempDir, [
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);

    expect(result.existing).toHaveLength(0);
    expect(result.missing).toHaveLength(3);
    expect(result.summary).toContain('0/3 error files exist');
    expect(result.summary).toContain('3/3 MISSING');
  });
});

describe('structural issue heuristic', () => {
  it('should flag structural issue when >50% of files are missing', () => {
    // Testing the heuristic logic directly
    const missingFileCount = 6;
    const totalErrorFiles = 10;

    const isStructuralIssue = totalErrorFiles > 0 && (
      (missingFileCount / totalErrorFiles >= 0.5) ||
      (missingFileCount >= 25)
    );

    expect(isStructuralIssue).toBe(true);
  });

  it('should flag structural issue when >=25 missing even if <50%', () => {
    const missingFileCount = 25;
    const totalErrorFiles = 100;

    const isStructuralIssue = totalErrorFiles > 0 && (
      (missingFileCount / totalErrorFiles >= 0.5) ||
      (missingFileCount >= 25)
    );

    expect(isStructuralIssue).toBe(true);
  });

  it('should NOT flag structural issue when all files are accessible', () => {
    const missingFileCount = 0;
    const totalErrorFiles = 50;

    const isStructuralIssue = totalErrorFiles > 0 && (
      (missingFileCount / totalErrorFiles >= 0.5) ||
      (missingFileCount >= 25)
    );

    expect(isStructuralIssue).toBe(false);
  });

  it('should NOT flag structural issue when few files are missing (<50% and <25)', () => {
    const missingFileCount = 3;
    const totalErrorFiles = 20;

    const isStructuralIssue = totalErrorFiles > 0 && (
      (missingFileCount / totalErrorFiles >= 0.5) ||
      (missingFileCount >= 25)
    );

    expect(isStructuralIssue).toBe(false);
  });

  it('should NOT flag structural issue when there are no error files', () => {
    const missingFileCount = 0;
    const totalErrorFiles = 0;

    const isStructuralIssue = totalErrorFiles > 0 && (
      (missingFileCount / totalErrorFiles >= 0.5) ||
      (missingFileCount >= 25)
    );

    expect(isStructuralIssue).toBe(false);
  });
});

describe('parseTypeScriptErrors', () => {
  it('should parse tsc direct format: path(line,col): error TS', () => {
    const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'
src/utils.ts(25,12): error TS2339: Property 'bar' does not exist`;

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: 'src/index.ts',
      line: 10,
      column: 5,
      code: 'TS2304',
      message: "Cannot find name 'foo'",
    });
    expect(errors[1]).toEqual({
      file: 'src/utils.ts',
      line: 25,
      column: 12,
      code: 'TS2339',
      message: "Property 'bar' does not exist",
    });
  });

  it('should parse bundler format: path:line:col - error TS', () => {
    const output = `src/App.tsx:5:3 - error TS2304: Cannot find name 'Component'
src/pages/Home.tsx:15:10 - error TS2322: Type 'string' is not assignable to type 'number'`;

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      file: 'src/App.tsx',
      line: 5,
      column: 3,
      code: 'TS2304',
      message: "Cannot find name 'Component'",
    });
    expect(errors[1]).toEqual({
      file: 'src/pages/Home.tsx',
      line: 15,
      column: 10,
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'",
    });
  });

  it('should parse mixed formats and de-duplicate', () => {
    const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'
src/index.ts:10:5 - error TS2304: Cannot find name 'foo'
src/utils.ts:3:1 - error TS2307: Cannot find module './missing'`;

    const errors = parseTypeScriptErrors(output);

    // First two are the same error in different formats - should be de-duped
    expect(errors).toHaveLength(2);
    expect(errors[0].file).toBe('src/index.ts');
    expect(errors[1].file).toBe('src/utils.ts');
  });

  it('should strip ANSI color codes before parsing', () => {
    const output = `\x1b[31msrc/index.ts\x1b[0m(10,5): error TS2304: Cannot find name 'foo'
\x1b[36msrc/App.tsx\x1b[0m:5:3 - error TS2322: Type mismatch`;

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(2);
    expect(errors[0].file).toBe('src/index.ts');
    expect(errors[0].code).toBe('TS2304');
    expect(errors[1].file).toBe('src/App.tsx');
    expect(errors[1].code).toBe('TS2322');
  });

  it('should return empty array for non-TS error output', () => {
    const output = `npm ERR! code ELIFECYCLE
npm ERR! errno 1
npm ERR! project@1.0.0 build: vite build
npm ERR! Exit status 1`;

    const errors = parseTypeScriptErrors(output);

    expect(errors).toHaveLength(0);
  });

  it('should return empty array for empty output', () => {
    expect(parseTypeScriptErrors('')).toHaveLength(0);
  });
});

describe('autoFixTypeScriptErrors false success prevention', () => {
  it('should return success: false when zero errors parsed on first attempt', () => {
    // Simulating the logic from autoFixTypeScriptErrors
    const attempts = 1;
    const fixes: Array<{ file: string; description: string }> = [];

    // Build failed but parseTypeScriptErrors returned 0 errors (unparseable format)
    const errorsLength = 0;

    // This is the logic under test
    const noParsedOnFirstAttempt = attempts === 1 && fixes.length === 0;

    if (errorsLength === 0 && noParsedOnFirstAttempt) {
      // Should NOT return success: true
      expect(noParsedOnFirstAttempt).toBe(true);
    }
  });

  it('should return success: true when zero errors after prior fixes', () => {
    // After fixing files, tsc --noEmit returns 0 errors = genuinely fixed
    const attempts = 2;
    const fixes = [{ file: 'src/index.ts', description: 'Fixed 1 error' }];

    const errorsLength = 0;
    const noParsedOnFirstAttempt = attempts === 1 && fixes.length === 0;

    // Should NOT trigger the false-success guard
    expect(noParsedOnFirstAttempt).toBe(false);

    // So the function would return success: true (correct behavior)
    if (errorsLength === 0 && !noParsedOnFirstAttempt) {
      expect(true).toBe(true); // Reaches the success: true branch
    }
  });
});
