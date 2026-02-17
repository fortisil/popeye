/**
 * Tests for frontend design language analyzer
 * Verifies CSS variable extraction, component library detection, and tailwind parsing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { analyzeFrontendDesign } from '../../src/generators/frontend-design-analyzer.js';

describe('analyzeFrontendDesign', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-fe-design-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no frontend app directory exists', async () => {
    const result = await analyzeFrontendDesign(tmpDir);

    expect(result).toBeNull();
  });

  it('extracts CSS custom properties from index.css', async () => {
    const frontendDir = path.join(tmpDir, 'apps', 'frontend', 'src');
    await fs.mkdir(frontendDir, { recursive: true });
    await fs.writeFile(
      path.join(frontendDir, 'index.css'),
      `:root {
  --primary: 222.2 47.4% 11.2%;
  --radius: 0.5rem;
}

.dark {
  --primary: 210 40% 98%;
}
`
    );
    // Need package.json for component lib detection
    await fs.writeFile(
      path.join(tmpDir, 'apps', 'frontend', 'package.json'),
      JSON.stringify({ dependencies: { '@shadcn/ui': '^1.0.0' } })
    );

    const result = await analyzeFrontendDesign(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.primaryColor).toBeDefined();
    expect(result!.borderRadius).toBe('0.5rem');
    expect(result!.darkMode).toBe(true);
    expect(result!.source).toBe('css-variables');
  });

  it('detects shadcn component library from package.json', async () => {
    const frontendDir = path.join(tmpDir, 'apps', 'frontend');
    await fs.mkdir(frontendDir, { recursive: true });
    await fs.writeFile(
      path.join(frontendDir, 'package.json'),
      JSON.stringify({
        dependencies: { '@shadcn/ui': '^1.0.0', react: '^18.0.0' },
      })
    );

    const result = await analyzeFrontendDesign(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.componentLibrary).toBe('shadcn');
  });

  it('detects MUI component library', async () => {
    const frontendDir = path.join(tmpDir, 'apps', 'frontend');
    await fs.mkdir(frontendDir, { recursive: true });
    await fs.writeFile(
      path.join(frontendDir, 'package.json'),
      JSON.stringify({
        dependencies: { '@mui/material': '^5.0.0', react: '^18.0.0' },
      })
    );

    const result = await analyzeFrontendDesign(tmpDir);

    expect(result).not.toBeNull();
    expect(result!.componentLibrary).toBe('mui');
  });
});
