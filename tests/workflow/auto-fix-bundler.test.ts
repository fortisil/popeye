/**
 * Tests for auto-fix-bundler: CSS/PostCSS/Tailwind/webpack error parsing and config discovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseBundlerErrors,
  findRelatedConfigs,
  parseMultiFileResponse,
} from '../../src/workflow/auto-fix-bundler.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-bundler-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('parseBundlerErrors', () => {
  it('should parse Tailwind CSS "class does not exist" errors', () => {
    const output = `./src/app/globals.css:1:1
Syntax error: /Users/test/project/apps/website/src/app/globals.css The \`bg-background\` class does not exist. If \`bg-background\` is a custom class, make sure it is defined within a \`@layer\` directive.

> 1 | @tailwind base;
    | ^
  2 | @tailwind components;
  3 | @tailwind utilities;`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    // Should find either the css pattern or the file:line:col pattern
    const cssError = errors.find(e => e.type === 'css' || e.type === 'syntax');
    expect(cssError).toBeDefined();
    expect(cssError!.message).toContain('bg-background');
  });

  it('should parse CSS syntax error with absolute path', () => {
    const output = `Syntax error: /Users/test/apps/website/src/globals.css The \`text-foreground\` class does not exist. If \`text-foreground\` is a custom class, make sure it is defined within a \`@layer\` directive.

Some other lines here.`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe('css');
    expect(errors[0].file).toContain('globals.css');
    expect(errors[0].message).toContain('text-foreground');
  });

  it('should parse module not found errors', () => {
    const output = `Module not found: Can't resolve '@acme/design-tokens/tailwind' in '/Users/test/apps/website'

https://nextjs.org/docs/messages/module-not-found

Import trace for requested module:
./src/app/globals.css`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    const moduleError = errors.find(e => e.type === 'module-not-found');
    expect(moduleError).toBeDefined();
    expect(moduleError!.message).toContain('@acme/design-tokens/tailwind');
  });

  it('should parse file:line:col reference for non-TS files', () => {
    const output = `./src/app/globals.css:1:1
Syntax error: Something went wrong with the CSS processing.

> 1 | @tailwind base;
    | ^`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    const refError = errors.find(e => e.type === 'syntax');
    expect(refError).toBeDefined();
    expect(refError!.file).toContain('globals.css');
    expect(refError!.line).toBe(1);
    expect(refError!.column).toBe(1);
  });

  it('should parse webpack build failure with import traces', () => {
    const output = `Build failed because of webpack errors

Import trace for requested module:
./src/app/globals.css
./src/components/Layout.tsx`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some(e => e.file.includes('globals.css'))).toBe(true);
  });

  it('should strip ANSI color codes before parsing', () => {
    const output = `\x1b[31mSyntax error: /path/to/file.css The \`bg-primary\` class does not exist.\x1b[0m`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('bg-primary');
  });

  it('should de-duplicate errors from the same file', () => {
    const output = `Syntax error: /path/to/globals.css The \`bg-background\` class does not exist.

Syntax error: /path/to/globals.css The \`bg-background\` class does not exist.`;

    const errors = parseBundlerErrors(output);

    // Should de-duplicate by file
    expect(errors.length).toBe(1);
  });

  it('should return empty array for TypeScript-only errors', () => {
    const output = `src/index.ts(10,5): error TS2304: Cannot find name 'foo'
src/utils.ts(25,12): error TS2339: Property 'bar' does not exist`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBe(0);
  });

  it('should return empty array for generic npm errors', () => {
    const output = `npm ERR! code ELIFECYCLE
npm ERR! errno 1
npm ERR! Exit status 1`;

    const errors = parseBundlerErrors(output);

    expect(errors.length).toBe(0);
  });

  it('should return empty array for empty output', () => {
    expect(parseBundlerErrors('')).toEqual([]);
  });
});

describe('findRelatedConfigs', () => {
  it('should find tailwind and postcss configs in app directory', async () => {
    const appDir = path.join(tempDir, 'apps', 'website');
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(path.join(appDir, 'tailwind.config.ts'), 'export default {}');
    await fs.writeFile(path.join(appDir, 'postcss.config.js'), 'module.exports = {}');

    const configs = await findRelatedConfigs(tempDir, 'apps/website/src/globals.css');

    expect(configs.length).toBeGreaterThanOrEqual(2);
    expect(configs.some(c => c.path.includes('tailwind.config.ts'))).toBe(true);
    expect(configs.some(c => c.path.includes('postcss.config.js'))).toBe(true);
  });

  it('should search project root as well', async () => {
    await fs.writeFile(path.join(tempDir, 'package.json'), '{"name": "test"}');

    const configs = await findRelatedConfigs(tempDir, 'src/globals.css');

    expect(configs.some(c => c.path.includes('package.json'))).toBe(true);
  });

  it('should return empty array when no configs exist', async () => {
    const configs = await findRelatedConfigs(tempDir, 'src/globals.css');

    expect(configs).toEqual([]);
  });

  it('should cap config file content at 4000 chars', async () => {
    const largeContent = 'x'.repeat(10000);
    await fs.writeFile(path.join(tempDir, 'package.json'), largeContent);

    const configs = await findRelatedConfigs(tempDir, 'src/globals.css');

    const pkg = configs.find(c => c.path.includes('package.json'));
    expect(pkg).toBeDefined();
    expect(pkg!.content.length).toBeLessThanOrEqual(4000);
  });
});

describe('parseMultiFileResponse', () => {
  it('should parse single file response', () => {
    const response = `FILE: /path/to/tailwind.config.ts
\`\`\`typescript
import type { Config } from 'tailwindcss';
export default { content: [] } satisfies Config;
\`\`\``;

    const results = parseMultiFileResponse(response);

    expect(results.length).toBe(1);
    expect(results[0].targetPath).toBe('/path/to/tailwind.config.ts');
    expect(results[0].content).toContain('tailwindcss');
  });

  it('should parse multiple file responses', () => {
    const response = `I'll fix both files:

FILE: /path/to/tailwind.config.ts
\`\`\`
export default { colors: { background: 'hsl(var(--background))' } };
\`\`\`

FILE: /path/to/globals.css
\`\`\`
@tailwind base;
@tailwind components;
@tailwind utilities;
\`\`\``;

    const results = parseMultiFileResponse(response);

    expect(results.length).toBe(2);
    expect(results[0].targetPath).toContain('tailwind.config.ts');
    expect(results[1].targetPath).toContain('globals.css');
  });

  it('should skip files with very short content', () => {
    const response = `FILE: /path/to/file.ts
\`\`\`
tiny
\`\`\``;

    const results = parseMultiFileResponse(response);

    expect(results.length).toBe(0);
  });

  it('should return empty array for unparseable response', () => {
    const response = `I'm not sure how to fix this error.`;

    const results = parseMultiFileResponse(response);

    expect(results.length).toBe(0);
  });
});
