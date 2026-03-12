/**
 * SmokeStack E2E Scaffold Test
 *
 * Verifies that generateAllProject() produces a correct "all" (monorepo) project.
 * Uses TEST.md requirements as acceptance criteria.
 * Scaffold generation is 100% template-based (no API keys needed).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateAllProject, validateAllProject } from '../../src/generators/all.js';
import type { GenerationResult } from '../../src/generators/python.js';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

let tmpDir: string;
let result: GenerationResult;
let projectDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-smokestack-'));
  const spec = {
    idea: 'Build an "all" monorepo called Popeye SmokeStack with 4 parts: backend (FastAPI), frontend (React+Vite+Tailwind), website (static marketing), and database with migrations. DB: create a messages table with id, text, created_at.',
    name: 'popeye-smokestack',
    language: 'all' as const,
    openaiModel: 'gpt-4.1',
  };
  result = await generateAllProject(spec, tmpDir);
  projectDir = result.projectDir;
}, 30_000);

afterAll(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- Helper ---

async function exists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath: string): Promise<string> {
  return fs.readFile(path.join(projectDir, relativePath), 'utf-8');
}

async function parseJson(relativePath: string): Promise<unknown> {
  const text = await readText(relativePath);
  return JSON.parse(text);
}

async function listDir(relativePath: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(projectDir, relativePath));
  return entries;
}

async function findFiles(dir: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  }
  await walk(path.join(projectDir, dir));
  return results;
}

// =====================================================================
// 1. Generation succeeds
// =====================================================================
describe('1. Generation succeeds', () => {
  it('result.success is true', () => {
    expect(result.success).toBe(true);
  });

  it('created more than 50 files', () => {
    expect(result.filesCreated.length).toBeGreaterThan(50);
  });

  it('projectDir contains "popeye-smokestack"', () => {
    expect(result.projectDir).toContain('popeye-smokestack');
  });
});

// =====================================================================
// 2. Required structure exists (from TEST.md)
// =====================================================================
describe('2. Required structure exists', () => {
  it('apps/backend/ directory exists', async () => {
    expect(await exists('apps/backend')).toBe(true);
  });

  it('apps/frontend/ directory exists', async () => {
    expect(await exists('apps/frontend')).toBe(true);
  });

  it('apps/website/ directory exists', async () => {
    expect(await exists('apps/website')).toBe(true);
  });

  it('docker-compose.yml exists', async () => {
    expect(await exists('docker-compose.yml')).toBe(true);
  });

  it('README.md exists', async () => {
    expect(await exists('README.md')).toBe(true);
  });

  it('.env.example or env template exists', async () => {
    const backendEnv = await exists('apps/backend/.env.example');
    const frontendEnv = await exists('apps/frontend/.env.example');
    expect(backendEnv || frontendEnv).toBe(true);
  });

  it('packages/ directory exists', async () => {
    expect(await exists('packages')).toBe(true);
  });

  it('.popeye/workspace.json exists', async () => {
    expect(await exists('.popeye/workspace.json')).toBe(true);
  });

  it('Backend: pyproject.toml exists', async () => {
    expect(await exists('apps/backend/pyproject.toml')).toBe(true);
  });

  it('Frontend: package.json exists', async () => {
    expect(await exists('apps/frontend/package.json')).toBe(true);
  });

  it('Website: package.json exists', async () => {
    expect(await exists('apps/website/package.json')).toBe(true);
  });

  it('DB: migration files exist', async () => {
    const alembicDir = await exists('apps/backend/alembic.ini');
    const migrationsDir = await exists('apps/backend/migrations');
    expect(alembicDir || migrationsDir).toBe(true);
  });

  it('DB: models.py exists', async () => {
    // models.py under apps/backend/src/popeye_smokestack/database/
    const pyFiles = await findFiles('apps/backend', '.py');
    const hasModels = pyFiles.some((f) => f.includes('models.py'));
    expect(hasModels).toBe(true);
  });
});

// =====================================================================
// 3. No unplanned app directories
// =====================================================================
describe('3. No unplanned app directories', () => {
  it('apps/ contains ONLY backend, frontend, website', async () => {
    const entries = await listDir('apps');
    const allowed = new Set(['backend', 'frontend', 'website']);
    const extra = entries.filter((e) => !allowed.has(e));
    expect(extra).toEqual([]);
  });
});

// =====================================================================
// 4. Content alignment with TEST.md
// =====================================================================
describe('4. Content alignment', () => {
  it('Root package.json contains project name', async () => {
    const pkg = (await parseJson('package.json')) as Record<string, unknown>;
    expect(JSON.stringify(pkg)).toContain('popeye-smokestack');
  });

  it('Backend main.py imports FastAPI', async () => {
    const pyFiles = await findFiles('apps/backend', '.py');
    const mainFile = pyFiles.find((f) => f.endsWith('main.py'));
    expect(mainFile).toBeDefined();
    const content = await fs.readFile(mainFile!, 'utf-8');
    expect(content).toContain('FastAPI');
  });

  it('Backend has CORS setup', async () => {
    const pyFiles = await findFiles('apps/backend', '.py');
    const mainFile = pyFiles.find((f) => f.endsWith('main.py'));
    expect(mainFile).toBeDefined();
    const content = await fs.readFile(mainFile!, 'utf-8');
    expect(content.toLowerCase()).toMatch(/cors/i);
  });

  it('Backend has health endpoint pattern', async () => {
    const pyFiles = await findFiles('apps/backend', '.py');
    let foundHealth = false;
    for (const f of pyFiles) {
      const content = await fs.readFile(f, 'utf-8');
      if (content.includes('health') || content.includes('/health')) {
        foundHealth = true;
        break;
      }
    }
    expect(foundHealth).toBe(true);
  });

  it('Frontend package.json has react dependency', async () => {
    const pkg = (await parseJson('apps/frontend/package.json')) as Record<string, unknown>;
    const allDeps = JSON.stringify(pkg);
    expect(allDeps).toContain('react');
  });

  it('Frontend has vite dependency or vite.config', async () => {
    const pkg = (await parseJson('apps/frontend/package.json')) as Record<string, unknown>;
    const hasViteDep = JSON.stringify(pkg).includes('vite');
    const hasViteConfig = await exists('apps/frontend/vite.config.ts');
    expect(hasViteDep || hasViteConfig).toBe(true);
  });

  it('Frontend has tailwindcss dependency or tailwind.config', async () => {
    const pkg = (await parseJson('apps/frontend/package.json')) as Record<string, unknown>;
    const hasTailwindDep = JSON.stringify(pkg).includes('tailwindcss');
    const hasTailwindConfig =
      (await exists('apps/frontend/tailwind.config.ts')) ||
      (await exists('apps/frontend/tailwind.config.js'));
    expect(hasTailwindDep || hasTailwindConfig).toBe(true);
  });

  it('Website package.json has next dependency', async () => {
    const pkg = (await parseJson('apps/website/package.json')) as Record<string, unknown>;
    const allDeps = JSON.stringify(pkg);
    expect(allDeps).toContain('next');
  });

  it('Docker compose has postgres service', async () => {
    const content = await readText('docker-compose.yml');
    expect(content.toLowerCase()).toContain('postgres');
  });

  it('Env template has DATABASE_URL', async () => {
    const content = await readText('apps/backend/.env.example');
    expect(content).toContain('DATABASE_URL');
  });
});

// =====================================================================
// 5. Syntax validation (fast, no install)
// =====================================================================
describe('5. Syntax validation', () => {
  it('All package.json files are valid JSON', async () => {
    const pkgFiles = [
      'package.json',
      'apps/frontend/package.json',
      'apps/website/package.json',
      'packages/design-tokens/package.json',
      'packages/ui/package.json',
    ];
    for (const f of pkgFiles) {
      const text = await readText(f);
      expect(() => JSON.parse(text), `Invalid JSON in ${f}`).not.toThrow();
    }
  });

  it('All tsconfig.json files are valid JSON', async () => {
    const tsconfigPaths = [
      'apps/frontend/tsconfig.json',
      'apps/website/tsconfig.json',
    ];
    for (const f of tsconfigPaths) {
      if (await exists(f)) {
        const text = await readText(f);
        expect(() => JSON.parse(text), `Invalid JSON in ${f}`).not.toThrow();
      }
    }
  });

  it('docker-compose.yml has valid basic YAML structure', async () => {
    const content = await readText('docker-compose.yml');
    // Basic YAML structure check: must have services key
    expect(content).toMatch(/^services:/m);
  });

  it('.popeye/workspace.json is valid JSON', async () => {
    const text = await readText('.popeye/workspace.json');
    expect(() => JSON.parse(text)).not.toThrow();
  });
});

// =====================================================================
// 6. Build / Compilation verification
// =====================================================================
describe('6. Build verification', () => {
  describe('Backend (Python syntax)', () => {
    it('All .py files compile syntactically', async () => {
      const pyFiles = await findFiles('apps/backend', '.py');
      expect(pyFiles.length).toBeGreaterThan(0);

      const failures: string[] = [];
      for (const f of pyFiles) {
        try {
          execSync(
            `python3 -c "compile(open('${f}').read(), '${f}', 'exec')"`,
            { timeout: 10_000, stdio: 'pipe' }
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`${path.relative(projectDir, f)}: ${msg.split('\n')[0]}`);
        }
      }
      expect(failures, `Python syntax errors:\n${failures.join('\n')}`).toEqual([]);
    });
  });

  // Workspace install: run npm install from root so all workspace packages resolve together
  describe('Workspace npm install', () => {
    it('npm install from root succeeds', async () => {
      execSync('npm install --ignore-scripts', {
        cwd: projectDir,
        timeout: 180_000,
        stdio: 'pipe',
      });
      const feModules = await exists('apps/frontend/node_modules');
      const wsModules = await exists('apps/website/node_modules');
      // npm workspaces hoists to root; app dirs may or may not have node_modules
      const rootModules = await exists('node_modules');
      expect(rootModules || feModules || wsModules).toBe(true);
    }, 200_000);
  });

  describe('Frontend (React+Vite+Tailwind)', () => {
    it('TypeScript compiles (tsc --noEmit)', async () => {
      const frontendDir = path.join(projectDir, 'apps', 'frontend');
      try {
        execSync('npx tsc --noEmit', {
          cwd: frontendDir,
          timeout: 60_000,
          stdio: 'pipe',
        });
      } catch (e: unknown) {
        const stderr =
          e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr: unknown }).stderr) : '';
        const stdout =
          e && typeof e === 'object' && 'stdout' in e ? String((e as { stdout: unknown }).stdout) : '';
        throw new Error(`Frontend tsc failed:\n${stdout}\n${stderr}`);
      }
    }, 70_000);
  });

  describe('Website (Next.js)', () => {
    it('TypeScript compiles (tsc --noEmit)', async () => {
      const websiteDir = path.join(projectDir, 'apps', 'website');
      try {
        execSync('npx tsc --noEmit', {
          cwd: websiteDir,
          timeout: 60_000,
          stdio: 'pipe',
        });
      } catch (e: unknown) {
        const stderr =
          e && typeof e === 'object' && 'stderr' in e ? String((e as { stderr: unknown }).stderr) : '';
        const stdout =
          e && typeof e === 'object' && 'stdout' in e ? String((e as { stdout: unknown }).stdout) : '';
        throw new Error(`Website tsc failed:\n${stdout}\n${stderr}`);
      }
    }, 70_000);
  });
});

// =====================================================================
// 7. Existing validateAllProject() (defense-in-depth)
// =====================================================================
describe('7. validateAllProject()', () => {
  it('validation passes', async () => {
    const validation = await validateAllProject(projectDir);
    expect(validation.valid).toBe(true);
  });

  it('missingFiles is empty', async () => {
    const validation = await validateAllProject(projectDir);
    expect(validation.missingFiles).toEqual([]);
  });
});
