/**
 * Tests for the audit scanner module.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  detectWorkspaceComposition,
  scanComponent,
  readPriorityDocs,
  buildWiringMatrix,
  scanProject,
  countLines,
} from '../../src/workflow/audit-scanner.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-scan-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Helper to create a file in the tmp directory, including intermediate dirs.
 */
async function createFile(relativePath: string, content = ''): Promise<void> {
  const abs = path.join(tmpDir, relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

// ---------------------------------------------------------------------------
// detectWorkspaceComposition
// ---------------------------------------------------------------------------

describe('detectWorkspaceComposition', () => {
  it('should detect a fullstack workspace (frontend + backend)', async () => {
    await createFile('apps/frontend/package.json', '{}');
    await createFile('apps/backend/requirements.txt', 'fastapi\n');

    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toContain('frontend');
    expect(kinds).toContain('backend');
  });

  it('should detect a single python project', async () => {
    await createFile('requirements.txt', 'flask\n');

    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toContain('backend');
    expect(kinds).not.toContain('frontend');
  });

  it('should detect a single typescript project', async () => {
    await createFile('package.json', '{}');

    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toContain('frontend');
    expect(kinds).not.toContain('backend');
  });

  it('should detect website component', async () => {
    await createFile('apps/frontend/package.json', '{}');
    await createFile('apps/backend/requirements.txt', 'fastapi\n');
    await createFile('apps/website/package.json', '{}');

    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toContain('website');
  });

  it('should detect infra from docker-compose.yml', async () => {
    await createFile('package.json', '{}');
    await createFile('docker-compose.yml', 'version: "3"\n');

    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toContain('infra');
  });

  it('should detect shared from packages/ directory', async () => {
    await createFile('package.json', '{}');
    await createFile('packages/shared/index.ts', '');

    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toContain('shared');
  });

  it('should return empty array for empty directory', async () => {
    const kinds = await detectWorkspaceComposition(tmpDir);
    expect(kinds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scanComponent
// ---------------------------------------------------------------------------

describe('scanComponent', () => {
  it('should scan a typescript component and find source/test files', async () => {
    await createFile('src/main.tsx', 'export default function App() {}');
    await createFile('src/utils.ts', 'export const x = 1;');
    await createFile('tests/main.test.tsx', 'test("works", () => {})');
    await createFile('package.json', JSON.stringify({
      dependencies: { react: '^18.0.0' },
    }));

    const result = await scanComponent(tmpDir, 'frontend', 'typescript');
    expect(result.kind).toBe('frontend');
    expect(result.framework).toBe('react');
    expect(result.sourceFiles.length).toBeGreaterThanOrEqual(2);
    expect(result.testFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.entryPoints).toContain('src/main.tsx');
  });

  it('should scan a python backend component', async () => {
    await createFile('app.py', 'from fastapi import FastAPI\napp = FastAPI()\n');
    await createFile('routes.py', 'pass');
    await createFile('requirements.txt', 'fastapi==0.100.0\n');

    const result = await scanComponent(tmpDir, 'backend', 'python');
    expect(result.kind).toBe('backend');
    expect(result.framework).toBe('fastapi');
    expect(result.entryPoints).toContain('app.py');
    expect(result.routeFiles).toContain('routes.py');
  });

  it('should handle empty directory', async () => {
    const result = await scanComponent(tmpDir, 'frontend', 'typescript');
    expect(result.sourceFiles).toEqual([]);
    expect(result.testFiles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readPriorityDocs
// ---------------------------------------------------------------------------

describe('readPriorityDocs', () => {
  it('should read CLAUDE.md first, then README, then other docs', async () => {
    await createFile('CLAUDE.md', '# Claude Instructions');
    await createFile('README.md', '# My Project');
    await createFile('CONTRIBUTING.md', '# Contributing');
    await createFile('docs/architecture.md', '# Architecture');

    const result = await readPriorityDocs(tmpDir);
    expect(result.claudeMd).toContain('Claude Instructions');
    expect(result.readme).toContain('My Project');
    expect(result.docsIndex[0]).toBe('CLAUDE.md');
    expect(result.docsIndex[1]).toBe('README.md');
    expect(result.docsIndex).toContain('CONTRIBUTING.md');
    expect(result.docsIndex).toContain(path.join('docs', 'architecture.md'));
  });

  it('should handle missing docs gracefully', async () => {
    const result = await readPriorityDocs(tmpDir);
    expect(result.claudeMd).toBeUndefined();
    expect(result.readme).toBeUndefined();
    expect(result.docsIndex).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildWiringMatrix
// ---------------------------------------------------------------------------

describe('buildWiringMatrix', () => {
  it('should detect CORS mismatch', async () => {
    await createFile('.env.example', 'VITE_API_URL=http://localhost:8000\nDATABASE_URL=postgres://x\n');
    await createFile('apps/backend/main.py', `
cors_origins = ["http://localhost:5173"]
app.add_middleware(CORSMiddleware, allow_origins=cors_origins)
`);

    const components = [
      {
        kind: 'frontend' as const,
        rootDir: 'apps/frontend',
        language: 'typescript' as const,
        entryPoints: [],
        routeFiles: [],
        testFiles: [],
        sourceFiles: [],
        dependencyManifests: [],
      },
      {
        kind: 'backend' as const,
        rootDir: 'apps/backend',
        language: 'python' as const,
        entryPoints: [],
        routeFiles: [],
        testFiles: [],
        sourceFiles: [],
        dependencyManifests: [],
      },
    ];

    const wiring = await buildWiringMatrix(tmpDir, components);
    expect(wiring.frontendApiBaseEnvKeys).toContain('VITE_API_URL');
    expect(wiring.frontendApiBaseResolved).toBe('http://localhost:8000');
    expect(wiring.backendCorsOrigins).toContain('http://localhost:5173');
    // The FE expects :8000 but CORS only has :5173 — mismatch detected
    expect(wiring.potentialMismatches.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty matrix when no env keys found', async () => {
    const wiring = await buildWiringMatrix(tmpDir, []);
    expect(wiring.frontendApiBaseEnvKeys).toEqual([]);
    expect(wiring.potentialMismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// countLines
// ---------------------------------------------------------------------------

describe('countLines', () => {
  it('should count lines in source and test files', async () => {
    await createFile('src/index.ts', 'line1\nline2\nline3\n');
    await createFile('tests/index.test.ts', 'test1\ntest2\n');

    const source = [{ path: 'src/index.ts', extension: '.ts' }];
    const tests = [{ path: 'tests/index.test.ts', extension: '.ts' }];
    const result = await countLines(source, tests, tmpDir);
    expect(result.code).toBe(4); // 3 lines + trailing newline = 4
    expect(result.tests).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// scanProject (integration)
// ---------------------------------------------------------------------------

describe('scanProject', () => {
  it('should produce a complete scan result for a typescript project', async () => {
    await createFile('package.json', JSON.stringify({
      name: 'test-project',
      dependencies: { react: '^18.0.0' },
    }));
    await createFile('src/main.tsx', 'export default function App() { return <div/>; }');
    await createFile('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');
    await createFile('tests/utils.test.ts', 'test("add", () => {})');
    await createFile('README.md', '# Test Project');

    const result = await scanProject(tmpDir, 'typescript');
    expect(result.stateLanguage).toBe('typescript');
    expect(result.totalSourceFiles).toBeGreaterThanOrEqual(2);
    expect(result.totalTestFiles).toBeGreaterThanOrEqual(1);
    expect(result.readmeContent).toContain('Test Project');
    expect(result.components.length).toBeGreaterThanOrEqual(1);
    expect(result.tree).toBeTruthy();
  });

  it('should detect composition mismatch', async () => {
    // State says fullstack but only a frontend package.json exists
    await createFile('package.json', '{}');
    const result = await scanProject(tmpDir, 'fullstack');
    expect(result.compositionMismatch).toBe(true);
  });

  it('should call progress callback', async () => {
    await createFile('package.json', '{}');
    const messages: string[] = [];
    await scanProject(tmpDir, 'typescript', (msg) => messages.push(msg));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.includes('Scan complete'))).toBe(true);
  });
});
