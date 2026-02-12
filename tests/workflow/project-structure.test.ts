/**
 * Tests for project structure scanner
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getProjectStructureSummary } from '../../src/workflow/project-structure.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-structure-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('getProjectStructureSummary', () => {
  it('should scan a directory with nested files and return correct tree, fileCounts, and totalSourceFiles', async () => {
    // Create directory structure
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src', 'components'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export {}');
    await fs.writeFile(path.join(tempDir, 'src', 'app.tsx'), 'export {}');
    await fs.writeFile(path.join(tempDir, 'src', 'components', 'Button.tsx'), 'export {}');
    await fs.writeFile(path.join(tempDir, 'package.json'), '{}');

    const result = await getProjectStructureSummary(tempDir, 'typescript');

    expect(result.totalSourceFiles).toBe(3);
    expect(result.fileCounts['.ts']).toBe(1);
    expect(result.fileCounts['.tsx']).toBe(2);
    expect(result.tree).toContain('src/');
    expect(result.tree).toContain('index.ts');
    expect(result.formatted).toContain('Source files: 3 total');
  });

  it('should return zero counts for an empty directory', async () => {
    const result = await getProjectStructureSummary(tempDir, 'typescript');

    expect(result.totalSourceFiles).toBe(0);
    expect(Object.keys(result.fileCounts).length).toBe(0);
    expect(result.formatted).toContain('Source files: 0 total');
  });

  it('should detect workspace apps for fullstack projects', async () => {
    // Create workspace structure
    await fs.mkdir(path.join(tempDir, 'apps', 'frontend', 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'apps', 'backend', 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'apps', 'frontend', 'src', 'App.tsx'), 'export {}');
    await fs.writeFile(path.join(tempDir, 'apps', 'backend', 'src', 'main.py'), 'pass');

    const result = await getProjectStructureSummary(tempDir, 'fullstack');

    expect(result.workspaceApps).toHaveLength(2);
    expect(result.workspaceApps.find(a => a.name === 'frontend')?.exists).toBe(true);
    expect(result.workspaceApps.find(a => a.name === 'backend')?.exists).toBe(true);
    expect(result.appFileCounts).toBeDefined();
    expect(result.appFileCounts?.frontend?.['.tsx']).toBe(1);
    expect(result.appFileCounts?.backend?.['.py']).toBe(1);
    expect(result.formatted).toContain('Workspace apps:');
  });

  it('should detect missing workspace apps', async () => {
    // Only create frontend, not backend
    await fs.mkdir(path.join(tempDir, 'apps', 'frontend'), { recursive: true });

    const result = await getProjectStructureSummary(tempDir, 'fullstack');

    const frontend = result.workspaceApps.find(a => a.name === 'frontend');
    const backend = result.workspaceApps.find(a => a.name === 'backend');
    expect(frontend?.exists).toBe(true);
    expect(backend?.exists).toBe(false);
    expect(result.formatted).toContain('MISSING');
  });

  it('should truncate tree with more than 30 entries', async () => {
    // Create many files to exceed the 30-entry limit
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    for (let i = 0; i < 35; i++) {
      await fs.writeFile(path.join(tempDir, 'src', `file${i}.ts`), 'export {}');
    }

    const result = await getProjectStructureSummary(tempDir, 'typescript');

    expect(result.tree).toContain('(+');
    expect(result.tree).toContain('more)');
  });

  it('should detect and summarize tsconfig.json', async () => {
    const tsconfig = {
      compilerOptions: {
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] },
      },
      references: [{ path: './apps/frontend' }, { path: './apps/backend' }],
      include: ['apps/*/src'],
    };
    await fs.writeFile(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2)
    );

    const result = await getProjectStructureSummary(tempDir, 'typescript');

    expect(result.tsconfigInfo).toBeDefined();
    expect(result.tsconfigInfo).toContain('tsconfig: exists');
    expect(result.tsconfigInfo).toContain('references=2');
    expect(result.tsconfigInfo).toContain('paths=true');
    expect(result.tsconfigInfo).toContain('baseUrl="."');
  });

  it('should skip node_modules and other excluded directories', async () => {
    await fs.mkdir(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'node_modules', 'pkg', 'index.ts'), 'export {}');
    await fs.mkdir(path.join(tempDir, 'dist'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'dist', 'bundle.js'), '');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'export {}');

    const result = await getProjectStructureSummary(tempDir, 'typescript');

    // Only src/app.ts should be counted, not node_modules or dist
    expect(result.totalSourceFiles).toBe(1);
    expect(result.tree).not.toContain('node_modules');
    expect(result.tree).not.toContain('dist');
  });
});
