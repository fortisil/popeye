/**
 * Database generator orchestration module
 * Creates complete database layers for fullstack and TS backend projects
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BackendOrm } from '../types/database.js';
import {
  generateDbConnection,
  generateDbModels,
  generateDbInit,
  generateDbSettings,
  generateAlembicIni,
  generateAlembicEnvPy,
  generateAlembicScriptMako,
  generateInitialMigration,
  generateDbVectorHelpers,
  generateDbStartupHook,
  generateDbHealthRoute,
  generateDbConftest,
} from './templates/database-python.js';
import {
  generatePrismaSchema,
  generatePrismaClient,
  generatePrismaSeed,
  generatePrismaDbHealth,
  generatePrismaVectorHelpers,
  generatePrismaDbInit,
} from './templates/database-typescript.js';

/** Python database dependencies */
export const DB_PYTHON_DEPS = [
  'sqlalchemy[asyncio]>=2.0.0',
  'asyncpg>=0.29.0',
  'alembic>=1.13.0',
  'pgvector>=0.2.5',
];

/**
 * Options for database layer generation
 */
interface DatabaseLayerOptions {
  includeVector?: boolean;
}

/**
 * Create a directory if it doesn't exist
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Write a file with content
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Generate the complete Python database layer for a backend project
 *
 * Creates database/, migrations/, and supporting files under apps/backend/
 *
 * @param projectDir - Root project directory (contains apps/)
 * @param projectName - Project name (used for naming)
 * @param packageName - Python package name (snake_case)
 * @param options - Generation options
 * @returns List of absolute file paths created
 */
export async function generatePythonDatabaseLayer(
  projectDir: string,
  _projectName: string,
  packageName: string,
  options: DatabaseLayerOptions = {}
): Promise<string[]> {
  const includeVector = options.includeVector !== false;
  const backendDir = path.join(projectDir, 'apps', 'backend');
  const srcPkgDir = path.join(backendDir, 'src', packageName);
  const filesCreated: string[] = [];

  // Ensure directories exist
  await ensureDir(path.join(srcPkgDir, 'database'));
  await ensureDir(path.join(srcPkgDir, 'routes'));
  await ensureDir(path.join(backendDir, 'migrations', 'versions'));
  await ensureDir(path.join(backendDir, 'tests'));

  // Define all files to generate
  const files: Array<{ path: string; content: string }> = [
    // Database package
    {
      path: path.join(srcPkgDir, 'database', '__init__.py'),
      content: generateDbInit(packageName),
    },
    {
      path: path.join(srcPkgDir, 'database', 'connection.py'),
      content: generateDbConnection(packageName),
    },
    {
      path: path.join(srcPkgDir, 'database', 'models.py'),
      content: generateDbModels(packageName),
    },
    {
      path: path.join(srcPkgDir, 'database', 'settings.py'),
      content: generateDbSettings(packageName),
    },
    // Alembic migrations
    {
      path: path.join(backendDir, 'alembic.ini'),
      content: generateAlembicIni(packageName),
    },
    {
      path: path.join(backendDir, 'migrations', 'env.py'),
      content: generateAlembicEnvPy(packageName),
    },
    {
      path: path.join(backendDir, 'migrations', 'script.py.mako'),
      content: generateAlembicScriptMako(),
    },
    {
      path: path.join(backendDir, 'migrations', 'versions', '001_initial.py'),
      content: generateInitialMigration(packageName),
    },
    // Startup hook
    {
      path: path.join(srcPkgDir, 'startup.py'),
      content: generateDbStartupHook(packageName),
    },
    // Health route
    {
      path: path.join(srcPkgDir, 'routes', 'health_db.py'),
      content: generateDbHealthRoute(packageName),
    },
    // Test fixtures
    {
      path: path.join(backendDir, 'tests', 'conftest_db.py'),
      content: generateDbConftest(packageName),
    },
  ];

  // Add vector helpers if requested
  if (includeVector) {
    files.push({
      path: path.join(srcPkgDir, 'database', 'vector.py'),
      content: generateDbVectorHelpers(packageName),
    });
  }

  // Write all files
  for (const file of files) {
    await writeFile(file.path, file.content);
    filesCreated.push(file.path);
  }

  // Augment requirements.txt with DB deps
  const reqPath = path.join(backendDir, 'requirements.txt');
  try {
    const existingReqs = await fs.readFile(reqPath, 'utf-8');
    const augmented = augmentRequirements(existingReqs, DB_PYTHON_DEPS);
    await writeFile(reqPath, augmented);
  } catch {
    // requirements.txt doesn't exist yet - will be created by the main generator
  }

  return filesCreated;
}

/**
 * Generate the complete TypeScript database layer for a project
 *
 * Creates prisma/ and src/db/ directories with Prisma-based DB files
 * NOTE: Not wired into any generator in Phase 1
 *
 * @param projectDir - Project directory (where prisma/ and src/ live)
 * @param projectName - Project name
 * @param options - Generation options
 * @returns List of absolute file paths created
 */
export async function generateTypeScriptDatabaseLayer(
  projectDir: string,
  projectName: string,
  _options: DatabaseLayerOptions = {}
): Promise<string[]> {
  const filesCreated: string[] = [];

  // Ensure directories
  await ensureDir(path.join(projectDir, 'prisma'));
  await ensureDir(path.join(projectDir, 'src', 'db'));

  const files: Array<{ path: string; content: string }> = [
    {
      path: path.join(projectDir, 'prisma', 'schema.prisma'),
      content: generatePrismaSchema(projectName),
    },
    {
      path: path.join(projectDir, 'prisma', 'seed.ts'),
      content: generatePrismaSeed(),
    },
    {
      path: path.join(projectDir, 'src', 'db', 'client.ts'),
      content: generatePrismaClient(projectName),
    },
    {
      path: path.join(projectDir, 'src', 'db', 'health.ts'),
      content: generatePrismaDbHealth(),
    },
    {
      path: path.join(projectDir, 'src', 'db', 'vector.ts'),
      content: generatePrismaVectorHelpers(),
    },
    {
      path: path.join(projectDir, 'src', 'db', 'index.ts'),
      content: generatePrismaDbInit(),
    },
  ];

  for (const file of files) {
    await writeFile(file.path, file.content);
    filesCreated.push(file.path);
  }

  return filesCreated;
}

/**
 * Append database dependencies to an existing requirements.txt
 *
 * Idempotent: checks for existing "# Database" section to avoid duplicates.
 * Handles empty input gracefully.
 *
 * @param baseContent - Existing requirements.txt content
 * @param dbDeps - Database dependency strings to add
 * @returns Augmented requirements.txt content
 */
export function augmentRequirements(baseContent: string, dbDeps: string[]): string {
  // Check for existing Database section
  if (baseContent.includes('# Database')) {
    return baseContent;
  }

  // Ensure trailing newline before adding section
  const base = baseContent.trimEnd();
  const depsBlock = dbDeps.join('\n');

  return `${base}\n\n# Database\n${depsBlock}\n`;
}

/**
 * Get the list of relative file paths generated for a database layer
 *
 * @param packageName - Python package name (for sqlalchemy) or project name (for prisma)
 * @param orm - ORM type
 * @returns List of relative file paths
 */
export function getDatabaseFiles(packageName: string, orm: BackendOrm): string[] {
  if (orm === 'sqlalchemy') {
    return [
      `apps/backend/src/${packageName}/database/__init__.py`,
      `apps/backend/src/${packageName}/database/connection.py`,
      `apps/backend/src/${packageName}/database/models.py`,
      `apps/backend/src/${packageName}/database/settings.py`,
      `apps/backend/src/${packageName}/database/vector.py`,
      `apps/backend/src/${packageName}/routes/health_db.py`,
      `apps/backend/src/${packageName}/startup.py`,
      'apps/backend/alembic.ini',
      'apps/backend/migrations/env.py',
      'apps/backend/migrations/script.py.mako',
      'apps/backend/migrations/versions/001_initial.py',
      'apps/backend/tests/conftest_db.py',
    ];
  }

  if (orm === 'prisma') {
    return [
      'prisma/schema.prisma',
      'prisma/seed.ts',
      'src/db/client.ts',
      'src/db/health.ts',
      'src/db/vector.ts',
      'src/db/index.ts',
    ];
  }

  return [];
}
