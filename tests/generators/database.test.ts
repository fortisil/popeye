/**
 * Tests for database templates and generator orchestration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Python template imports
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
} from '../../src/generators/templates/database-python.js';

// Docker template imports
import {
  generatePostgresServiceYaml,
  generateDockerComposeWithDb,
  generateAllDockerComposeWithDb,
  generateDbEnvExample,
} from '../../src/generators/templates/database-docker.js';

// TypeScript template imports
import {
  generatePrismaSchema,
} from '../../src/generators/templates/database-typescript.js';

// Generator orchestration imports
import {
  augmentRequirements,
  getDatabaseFiles,
  DB_PYTHON_DEPS,
} from '../../src/generators/database.js';

const TEST_PACKAGE = 'my_project';
const TEST_PROJECT = 'my-project';

// ============================================================
// Python template tests
// ============================================================

describe('generateDbConnection', () => {
  it('should include AsyncEngine and get_session', () => {
    const result = generateDbConnection(TEST_PACKAGE);
    expect(result).toContain('create_async_engine');
    expect(result).toContain('async_sessionmaker');
    expect(result).toContain('async def get_session');
    expect(result).toContain('AsyncSession');
  });

  it('should include check_db_connection health helper', () => {
    const result = generateDbConnection(TEST_PACKAGE);
    expect(result).toContain('async def check_db_connection');
  });
});

describe('generateDbModels', () => {
  it('should include Base declarative base', () => {
    const result = generateDbModels(TEST_PACKAGE);
    expect(result).toContain('class Base(DeclarativeBase)');
  });

  it('should include TimestampMixin', () => {
    const result = generateDbModels(TEST_PACKAGE);
    expect(result).toContain('class TimestampMixin');
    expect(result).toContain('created_at');
    expect(result).toContain('updated_at');
  });

  it('should include AppSettings model', () => {
    const result = generateDbModels(TEST_PACKAGE);
    expect(result).toContain('class AppSettings');
    expect(result).toContain('app_settings');
  });
});

describe('generateDbInit', () => {
  it('should re-export core components', () => {
    const result = generateDbInit(TEST_PACKAGE);
    expect(result).toContain('from .connection import');
    expect(result).toContain('from .models import');
    expect(result).toContain('Base');
    expect(result).toContain('get_session');
    expect(result).toContain('engine');
  });
});

describe('generateDbSettings', () => {
  it('should include DatabaseSettings with BaseSettings', () => {
    const result = generateDbSettings(TEST_PACKAGE);
    expect(result).toContain('class DatabaseSettings(BaseSettings)');
    expect(result).toContain('database_url');
    expect(result).toContain('is_configured');
  });
});

describe('generateAlembicIni', () => {
  it('should point to migrations directory', () => {
    const result = generateAlembicIni(TEST_PACKAGE);
    expect(result).toContain('script_location = migrations');
  });

  it('should include standard logging config', () => {
    const result = generateAlembicIni(TEST_PACKAGE);
    expect(result).toContain('[loggers]');
    expect(result).toContain('[logger_alembic]');
  });
});

describe('generateAlembicEnvPy', () => {
  it('should include async_engine_from_config', () => {
    const result = generateAlembicEnvPy(TEST_PACKAGE);
    expect(result).toContain('async_engine_from_config');
  });

  it('should include target_metadata', () => {
    const result = generateAlembicEnvPy(TEST_PACKAGE);
    expect(result).toContain('target_metadata = Base.metadata');
  });

  it('should include run_migrations_online', () => {
    const result = generateAlembicEnvPy(TEST_PACKAGE);
    expect(result).toContain('async def run_migrations_online');
  });

  it('should use the package name in model import', () => {
    const result = generateAlembicEnvPy(TEST_PACKAGE);
    expect(result).toContain(`from src.${TEST_PACKAGE}.database.models import Base`);
  });

  it('should support autogenerate via Base.metadata', () => {
    const result = generateAlembicEnvPy(TEST_PACKAGE);
    expect(result).toContain('target_metadata');
    expect(result).toContain('Base.metadata');
  });
});

describe('generateAlembicScriptMako', () => {
  it('should be a valid mako template', () => {
    const result = generateAlembicScriptMako();
    expect(result).toContain('${message}');
    expect(result).toContain('${up_revision}');
    expect(result).toContain('def upgrade');
    expect(result).toContain('def downgrade');
  });
});

describe('generateInitialMigration', () => {
  it('should include CREATE EXTENSION IF NOT EXISTS vector', () => {
    const result = generateInitialMigration(TEST_PACKAGE);
    expect(result).toContain('CREATE EXTENSION IF NOT EXISTS vector');
  });

  it('should create app_settings table', () => {
    const result = generateInitialMigration(TEST_PACKAGE);
    expect(result).toContain('app_settings');
    expect(result).toContain('op.create_table');
  });

  it('should include popeye:requires_extension=vector comment', () => {
    const result = generateInitialMigration(TEST_PACKAGE);
    expect(result).toContain('# popeye:requires_extension=vector');
  });

  it('should include downgrade that drops extension and table', () => {
    const result = generateInitialMigration(TEST_PACKAGE);
    expect(result).toContain('op.drop_table');
    expect(result).toContain('DROP EXTENSION IF EXISTS vector');
  });
});

describe('generateDbVectorHelpers', () => {
  it('should include Vector import from pgvector', () => {
    const result = generateDbVectorHelpers(TEST_PACKAGE);
    expect(result).toContain('from pgvector.sqlalchemy import Vector');
  });

  it('should include cosine similarity helper', () => {
    const result = generateDbVectorHelpers(TEST_PACKAGE);
    expect(result).toContain('async def cosine_similarity_search');
  });

  it('should include vector sanity check', () => {
    const result = generateDbVectorHelpers(TEST_PACKAGE);
    expect(result).toContain('async def check_vector_extension');
  });
});

describe('generateDbStartupHook', () => {
  it('should gracefully skip when DATABASE_URL is not set', () => {
    const result = generateDbStartupHook(TEST_PACKAGE);
    expect(result).toContain('DATABASE_URL is not set');
    expect(result).toContain('limited mode');
  });

  it('should check database connection when URL is configured', () => {
    const result = generateDbStartupHook(TEST_PACKAGE);
    expect(result).toContain('check_db_connection');
    expect(result).toContain('DATABASE_URL detected');
  });
});

describe('generateDbHealthRoute', () => {
  it('should return 503 DB_NOT_READY when DATABASE_URL is not set', () => {
    const result = generateDbHealthRoute(TEST_PACKAGE);
    expect(result).toContain('503');
    expect(result).toContain('DB_NOT_READY');
    expect(result).toContain('DATABASE_URL not configured');
  });

  it('should check alembic_version table for migration status', () => {
    const result = generateDbHealthRoute(TEST_PACKAGE);
    expect(result).toContain('alembic_version');
    expect(result).toContain('version_num');
  });

  it('should use GET /health/db route', () => {
    const result = generateDbHealthRoute(TEST_PACKAGE);
    expect(result).toContain('@router.get("/health/db")');
  });
});

describe('generateDbConftest', () => {
  it('should include test database URL override', () => {
    const result = generateDbConftest(TEST_PACKAGE);
    expect(result).toContain('TEST_DATABASE_URL');
  });

  it('should include async session fixture', () => {
    const result = generateDbConftest(TEST_PACKAGE);
    expect(result).toContain('async def db_session');
    expect(result).toContain('AsyncSession');
  });

  it('should reference the package models', () => {
    const result = generateDbConftest(TEST_PACKAGE);
    expect(result).toContain(`from src.${TEST_PACKAGE}.database.models import Base`);
  });
});

// ============================================================
// Docker template tests
// ============================================================

describe('generatePostgresServiceYaml', () => {
  it('should include postgres image and healthcheck', () => {
    const result = generatePostgresServiceYaml(TEST_PROJECT);
    expect(result).toContain('postgres:16-alpine');
    expect(result).toContain('pg_isready');
    expect(result).toContain(TEST_PROJECT);
  });

  it('should include environment variables', () => {
    const result = generatePostgresServiceYaml(TEST_PROJECT);
    expect(result).toContain('POSTGRES_USER');
    expect(result).toContain('POSTGRES_PASSWORD');
    expect(result).toContain('POSTGRES_DB');
  });
});

describe('generateDockerComposeWithDb', () => {
  it('should include postgres service', () => {
    const result = generateDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('postgres:');
    expect(result).toContain('postgres:16-alpine');
    expect(result).toContain('pg_isready');
  });

  it('should have backend depends_on postgres with service_healthy condition', () => {
    const result = generateDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('condition: service_healthy');
  });

  it('should preserve all 4 existing services (frontend, backend, frontend-dev, backend-dev)', () => {
    const result = generateDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('frontend:');
    expect(result).toContain('backend:');
    expect(result).toContain('frontend-dev:');
    expect(result).toContain('backend-dev:');
  });

  it('should include postgres-data volume', () => {
    const result = generateDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('postgres-data:');
  });

  it('should include DATABASE_URL for backend services', () => {
    const result = generateDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('DATABASE_URL=postgresql+asyncpg://');
  });
});

describe('generateAllDockerComposeWithDb', () => {
  it('should include postgres, frontend, backend, and website services', () => {
    const result = generateAllDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('postgres:');
    expect(result).toContain('frontend:');
    expect(result).toContain('backend:');
    expect(result).toContain('website:');
  });

  it('should have backend depends_on postgres with healthy condition', () => {
    const result = generateAllDockerComposeWithDb(TEST_PROJECT);
    expect(result).toContain('condition: service_healthy');
  });
});

describe('generateDbEnvExample', () => {
  it('should include DATABASE_URL with postgresql', () => {
    const result = generateDbEnvExample(TEST_PROJECT);
    expect(result).toContain('DATABASE_URL=postgresql');
    expect(result).not.toContain('sqlite');
  });

  it('should include POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB', () => {
    const result = generateDbEnvExample(TEST_PROJECT);
    expect(result).toContain('POSTGRES_USER=');
    expect(result).toContain('POSTGRES_PASSWORD=');
    expect(result).toContain('POSTGRES_DB=');
  });

  it('should include DB_VECTOR_REQUIRED', () => {
    const result = generateDbEnvExample(TEST_PROJECT);
    expect(result).toContain('DB_VECTOR_REQUIRED=true');
  });
});

// ============================================================
// TypeScript/Prisma template tests (lighter - not wired in Phase 1)
// ============================================================

describe('generatePrismaSchema', () => {
  it('should include postgresql datasource', () => {
    const result = generatePrismaSchema(TEST_PROJECT);
    expect(result).toContain('provider   = "postgresql"');
    expect(result).toContain('datasource db');
  });

  it('should include pgvector extension', () => {
    const result = generatePrismaSchema(TEST_PROJECT);
    expect(result).toContain('pgvector');
    expect(result).toContain('postgresqlExtensions');
  });

  it('should include AppSettings model', () => {
    const result = generatePrismaSchema(TEST_PROJECT);
    expect(result).toContain('model AppSettings');
  });
});

// ============================================================
// Generator orchestration tests
// ============================================================

describe('augmentRequirements', () => {
  const testDeps = ['sqlalchemy[asyncio]>=2.0.0', 'asyncpg>=0.29.0'];

  it('should preserve existing deps and append DB section', () => {
    const base = `fastapi>=0.109.0\nuvicorn>=0.27.0\n`;
    const result = augmentRequirements(base, testDeps);
    expect(result).toContain('fastapi>=0.109.0');
    expect(result).toContain('uvicorn>=0.27.0');
    expect(result).toContain('# Database');
    expect(result).toContain('sqlalchemy[asyncio]>=2.0.0');
    expect(result).toContain('asyncpg>=0.29.0');
  });

  it('should not duplicate when Database section already exists', () => {
    const base = `fastapi>=0.109.0\n\n# Database\nsqlalchemy>=2.0.0\n`;
    const result = augmentRequirements(base, testDeps);
    // Should be unchanged
    expect(result).toBe(base);
  });

  it('should handle empty input', () => {
    const result = augmentRequirements('', testDeps);
    expect(result).toContain('# Database');
    expect(result).toContain('sqlalchemy[asyncio]>=2.0.0');
  });

  it('should handle input with trailing whitespace', () => {
    const base = `fastapi>=0.109.0\n\n  \n`;
    const result = augmentRequirements(base, testDeps);
    expect(result).toContain('# Database');
    // Should not have excessive blank lines
    expect(result).not.toContain('\n\n\n\n');
  });
});

describe('getDatabaseFiles', () => {
  it('should list correct paths for sqlalchemy ORM', () => {
    const files = getDatabaseFiles(TEST_PACKAGE, 'sqlalchemy');
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/database/__init__.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/database/connection.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/database/models.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/database/settings.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/database/vector.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/routes/health_db.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/startup.py`);
    expect(files).toContain('apps/backend/alembic.ini');
    expect(files).toContain('apps/backend/migrations/env.py');
    expect(files).toContain('apps/backend/migrations/script.py.mako');
    expect(files).toContain('apps/backend/migrations/versions/001_initial.py');
    expect(files).toContain('apps/backend/tests/conftest_db.py');
    expect(files).toHaveLength(12);
  });

  it('should list correct paths for prisma ORM', () => {
    const files = getDatabaseFiles(TEST_PROJECT, 'prisma');
    expect(files).toContain('prisma/schema.prisma');
    expect(files).toContain('prisma/seed.ts');
    expect(files).toContain('src/db/client.ts');
    expect(files).toContain('src/db/health.ts');
    expect(files).toContain('src/db/vector.ts');
    expect(files).toContain('src/db/index.ts');
    expect(files).toHaveLength(6);
  });

  it('should return empty array for drizzle (not yet implemented)', () => {
    const files = getDatabaseFiles(TEST_PACKAGE, 'drizzle');
    expect(files).toHaveLength(0);
  });
});

describe('DB_PYTHON_DEPS', () => {
  it('should include all required database packages', () => {
    expect(DB_PYTHON_DEPS).toContain('sqlalchemy[asyncio]>=2.0.0');
    expect(DB_PYTHON_DEPS).toContain('asyncpg>=0.29.0');
    expect(DB_PYTHON_DEPS).toContain('alembic>=1.13.0');
    expect(DB_PYTHON_DEPS).toContain('pgvector>=0.2.5');
  });
});

// ============================================================
// Generated README content test
// ============================================================

describe('generateRootReadme (with DB section)', () => {
  it('should include Database section in generated README', async () => {
    const { generateRootReadme } = await import('../../src/generators/templates/fullstack.js');
    const readme = generateRootReadme('test-project', 'A test project');
    expect(readme).toContain('## Database');
    expect(readme).toContain('UNCONFIGURED');
    expect(readme).toContain('/health/db');
    expect(readme).toContain('alembic upgrade head');
    expect(readme).toContain('DATABASE_URL');
  });
});
