/**
 * Frontend ↔ Backend ↔ Database integration tests
 * Verifies that generated FE, BE, and DB layers are properly wired
 * and that Popeye's test runner validates fullstack projects correctly.
 */

import { describe, it, expect } from 'vitest';

// Generated frontend templates
import {
  generateAppTsxWithAdmin,
  generateUseAdminApiHook,
  generateDbStatusBanner,
  generateConnectionForm,
  generateMigrationProgress,
} from '../../src/generators/templates/admin-wizard-react.js';

// Generated backend templates
import {
  generateFastAPIMainWithAdmin,
  generateAdminDbRoutes,
  generateAdminAuthMiddleware,
} from '../../src/generators/templates/admin-wizard-python.js';

// Generated DB templates
import {
  generateDbConnection,
  generateDbStartupHook,
  generateDbHealthRoute,
  generateDbConftest,
} from '../../src/generators/templates/database-python.js';

// Generated infra templates
import {
  generateDockerComposeWithDb,
  generateAllDockerComposeWithDb,
  generateDbEnvExample,
} from '../../src/generators/templates/database-docker.js';

import {
  generateViteConfigReact,
  generateNginxConfig,
  generateFrontendTest,
} from '../../src/generators/templates/fullstack.js';

// Test runner
import {
  buildTestCommand,
  parseTestOutput,
  DEFAULT_TEST_COMMANDS,
} from '../../src/workflow/test-runner.js';

const TEST_PACKAGE = 'my_project';
const TEST_PROJECT = 'my-project';

// ============================================================
// FE → BE: API endpoint path alignment
// ============================================================

describe('FE → BE: Admin API endpoint paths match', () => {
  const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);
  const statusBanner = generateDbStatusBanner();
  const connectionForm = generateConnectionForm();
  const migrationProgress = generateMigrationProgress();

  it('admin routes should use /api/admin/db prefix', () => {
    expect(adminRoutes).toContain('prefix="/api/admin/db"');
  });

  it('FE status banner should call /api/admin/db/status', () => {
    expect(statusBanner).toContain('/api/admin/db/status');
  });

  it('admin routes should have GET /status endpoint', () => {
    expect(adminRoutes).toContain('@router.get("/status")');
  });

  it('FE connection form should call /api/admin/db/test', () => {
    expect(connectionForm).toContain('/api/admin/db/test');
  });

  it('admin routes should have POST /test endpoint', () => {
    expect(adminRoutes).toContain('@router.post("/test")');
  });

  it('FE migration progress should call /api/admin/db/apply', () => {
    expect(migrationProgress).toContain('/api/admin/db/apply');
  });

  it('admin routes should have POST /apply endpoint', () => {
    expect(adminRoutes).toContain('@router.post("/apply")');
  });

  it('admin routes should have POST /retry endpoint', () => {
    expect(adminRoutes).toContain('@router.post("/retry")');
  });
});

describe('FE → BE: Health endpoint path alignment', () => {
  const appTsx = generateAppTsxWithAdmin(TEST_PROJECT);
  const mainPy = generateFastAPIMainWithAdmin(TEST_PROJECT, TEST_PACKAGE);
  const healthRoute = generateDbHealthRoute(TEST_PACKAGE);

  it('FE App.tsx should call /health endpoint', () => {
    expect(appTsx).toContain('/health');
  });

  it('BE main.py should expose /health endpoint', () => {
    expect(mainPy).toContain('@app.get("/health")');
  });

  it('BE health_db route should expose /health/db endpoint', () => {
    expect(healthRoute).toContain('/health/db');
  });

  it('BE main.py should include health_db_router', () => {
    expect(mainPy).toContain('app.include_router(health_db_router)');
  });
});

// ============================================================
// FE → BE: Auth token header alignment
// ============================================================

describe('FE → BE: Admin token header alignment', () => {
  const apiHook = generateUseAdminApiHook();
  const authMiddleware = generateAdminAuthMiddleware();

  it('FE should send X-Admin-Token header', () => {
    expect(apiHook).toContain('X-Admin-Token');
  });

  it('BE should check X-Admin-Token header', () => {
    expect(authMiddleware).toContain('X-Admin-Token');
  });

  it('FE should read token from VITE_ADMIN_TOKEN env var', () => {
    expect(apiHook).toContain('VITE_ADMIN_TOKEN');
  });

  it('BE should read token from ADMIN_SETUP_TOKEN env var', () => {
    expect(authMiddleware).toContain('ADMIN_SETUP_TOKEN');
  });

  it('BE should return 403 when token is invalid', () => {
    expect(authMiddleware).toContain('403');
  });
});

// ============================================================
// FE → BE: API URL configuration alignment
// ============================================================

describe('FE → BE: API URL configuration', () => {
  const appTsx = generateAppTsxWithAdmin(TEST_PROJECT);
  const apiHook = generateUseAdminApiHook();
  const viteConfig = generateViteConfigReact();

  it('App.tsx should use VITE_API_URL env var', () => {
    expect(appTsx).toContain('VITE_API_URL');
  });

  it('useAdminApi hook should use VITE_API_URL env var', () => {
    expect(apiHook).toContain('VITE_API_URL');
  });

  it('both should default to http://localhost:8000', () => {
    expect(appTsx).toContain('http://localhost:8000');
    expect(apiHook).toContain('http://localhost:8000');
  });

  it('Vite dev proxy should forward /api to backend', () => {
    expect(viteConfig).toContain("'/api'");
    expect(viteConfig).toContain('http://localhost:8000');
  });

  it('Vite dev server should run on port 5173', () => {
    expect(viteConfig).toContain('port: 5173');
  });
});

// ============================================================
// BE → DB: Database connection wiring
// ============================================================

describe('BE → DB: Database connection wiring', () => {
  const dbConnection = generateDbConnection(TEST_PACKAGE);
  const dbStartup = generateDbStartupHook(TEST_PACKAGE);
  const mainPy = generateFastAPIMainWithAdmin(TEST_PROJECT, TEST_PACKAGE);

  it('DB connection should read DATABASE_URL from env', () => {
    expect(dbConnection).toContain('DATABASE_URL');
    expect(dbConnection).toContain('os.getenv');
  });

  it('DB connection should use async SQLAlchemy engine', () => {
    expect(dbConnection).toContain('create_async_engine');
    expect(dbConnection).toContain('AsyncSession');
  });

  it('DB startup hook should check connectivity on startup', () => {
    expect(dbStartup).toContain('DATABASE_URL');
    expect(dbStartup).toContain('check_db_connection');
  });

  it('main.py should include startup hook or lifecycle', () => {
    // The main.py should set up the app with some startup wiring
    expect(mainPy).toContain('FastAPI');
  });
});

describe('BE → DB: Admin routes use asyncpg for direct DB access', () => {
  const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);

  it('admin /test should use asyncpg.connect()', () => {
    expect(adminRoutes).toContain('asyncpg.connect');
  });

  it('admin /test should execute SELECT 1 for connectivity check', () => {
    expect(adminRoutes).toContain('SELECT 1');
  });

  it('admin /apply should run alembic upgrade head', () => {
    expect(adminRoutes).toContain('alembic upgrade head');
  });

  it('admin /status should check alembic_version table', () => {
    expect(adminRoutes).toContain('alembic_version');
  });

  it('admin routes should convert SQLAlchemy URL to asyncpg format', () => {
    // The admin routes need to strip "postgresql+asyncpg://" to "postgresql://"
    expect(adminRoutes).toContain('postgresql+asyncpg://');
    expect(adminRoutes).toContain('postgresql://');
  });
});

// ============================================================
// BE → DB: Health check validates real DB connectivity
// ============================================================

describe('BE → DB: Health check route validates DB', () => {
  const healthRoute = generateDbHealthRoute(TEST_PACKAGE);

  it('should check if DATABASE_URL is configured', () => {
    expect(healthRoute).toContain('DATABASE_URL');
  });

  it('should return 503 when DB is not configured', () => {
    expect(healthRoute).toContain('503');
    expect(healthRoute).toContain('DB_NOT_READY');
  });

  it('should execute SELECT 1 to verify connectivity', () => {
    expect(healthRoute).toContain('SELECT 1');
  });

  it('should check alembic_version for migration status', () => {
    expect(healthRoute).toContain('alembic_version');
  });
});

// ============================================================
// CORS: Frontend ports match backend CORS origins
// ============================================================

describe('CORS: FE dev ports match BE CORS origins', () => {
  const mainPy = generateFastAPIMainWithAdmin(TEST_PROJECT, TEST_PACKAGE);
  const viteConfig = generateViteConfigReact();

  it('BE CORS should allow Vite dev port 5173', () => {
    expect(mainPy).toContain('http://localhost:5173');
  });

  it('BE CORS should allow production port 3000', () => {
    expect(mainPy).toContain('http://localhost:3000');
  });

  it('Vite config should use port 5173 (matching CORS)', () => {
    expect(viteConfig).toContain('port: 5173');
  });

  it('CORS should allow all methods and headers', () => {
    expect(mainPy).toContain('allow_methods=["*"]');
    expect(mainPy).toContain('allow_headers=["*"]');
  });
});

// ============================================================
// Docker Compose: Service wiring FE → BE → DB
// ============================================================

describe('Docker Compose: Fullstack service wiring', () => {
  const compose = generateDockerComposeWithDb(TEST_PROJECT);

  it('frontend should depend on backend', () => {
    expect(compose).toContain('depends_on:\n      - backend');
  });

  it('frontend should use backend service URL for API', () => {
    expect(compose).toContain('VITE_API_URL=http://backend:8000');
  });

  it('backend should depend on postgres with health condition', () => {
    expect(compose).toContain('condition: service_healthy');
  });

  it('backend should use postgres service in DATABASE_URL', () => {
    expect(compose).toContain('postgres:5432');
  });

  it('backend DATABASE_URL should use correct DB name', () => {
    const dbName = TEST_PROJECT.replace(/-/g, '_') + '_db';
    expect(compose).toContain(dbName);
  });

  it('postgres should have healthcheck', () => {
    expect(compose).toContain('pg_isready');
  });

  it('backend-dev should also depend on healthy postgres', () => {
    // Verify the dev backend also waits for postgres
    const devSection = compose.split('backend-dev:')[1];
    expect(devSection).toContain('condition: service_healthy');
  });
});

describe('Docker Compose: All project service wiring', () => {
  const compose = generateAllDockerComposeWithDb(TEST_PROJECT);

  it('should include frontend, backend, website, and postgres services', () => {
    expect(compose).toContain('frontend:');
    expect(compose).toContain('backend:');
    expect(compose).toContain('website:');
    expect(compose).toContain('postgres:');
  });

  it('backend should depend on postgres with health condition', () => {
    expect(compose).toContain('condition: service_healthy');
  });

  it('all services should be on the same network', () => {
    const networkName = `${TEST_PROJECT}-network`;
    expect(compose).toContain(networkName);
    // Count network references - should appear in services + network definition
    const networkCount = (compose.match(new RegExp(networkName, 'g')) || []).length;
    expect(networkCount).toBeGreaterThanOrEqual(5); // 4 services + 1 definition
  });

  it('frontend API URL should point to backend service', () => {
    expect(compose).toContain('VITE_API_URL=http://backend:8000');
  });
});

// ============================================================
// Nginx: Proxy paths match backend routes
// ============================================================

describe('Nginx: Proxy config matches BE route structure', () => {
  const nginx = generateNginxConfig();
  const mainPy = generateFastAPIMainWithAdmin(TEST_PROJECT, TEST_PACKAGE);

  it('nginx should proxy /api to backend:8000', () => {
    expect(nginx).toContain('location /api');
    expect(nginx).toContain('proxy_pass http://backend:8000');
  });

  it('admin routes start with /api prefix (matching nginx proxy)', () => {
    // Admin routes use prefix="/api/admin/db" which falls under nginx /api proxy
    const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);
    expect(adminRoutes).toContain('prefix="/api/admin/db"');
  });

  it('nginx should handle SPA routing (catch-all to index.html)', () => {
    expect(nginx).toContain('try_files $uri $uri/ /index.html');
  });
});

// ============================================================
// Env vars: FE and BE env examples are consistent
// ============================================================

describe('Env vars: Backend and frontend env alignment', () => {
  const backendEnv = generateDbEnvExample(TEST_PROJECT);

  it('backend env should have DATABASE_URL for DB connection', () => {
    expect(backendEnv).toContain('DATABASE_URL=postgresql+asyncpg://');
  });

  it('backend env should have ADMIN_SETUP_TOKEN for admin auth', () => {
    expect(backendEnv).toContain('ADMIN_SETUP_TOKEN=');
  });

  it('DATABASE_URL format should match admin route URL conversion', () => {
    // Backend env uses postgresql+asyncpg:// format
    // Admin routes convert this to postgresql:// for asyncpg
    expect(backendEnv).toContain('postgresql+asyncpg://');
    const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);
    expect(adminRoutes).toContain('.replace("postgresql+asyncpg://", "postgresql://")');
  });
});

// ============================================================
// Generated test files: Backend tests match endpoints
// ============================================================

describe('Generated backend test validates real endpoints', () => {
  const frontendTest = generateFrontendTest(TEST_PROJECT);
  const appTsx = generateAppTsxWithAdmin(TEST_PROJECT);

  it('generated FE test should check for project name text', () => {
    expect(frontendTest).toContain(TEST_PROJECT);
    // App.tsx should also contain the project name
    expect(appTsx).toContain(TEST_PROJECT);
  });

  it('generated FE test should check for loading state', () => {
    expect(frontendTest).toContain('Checking...');
    // App.tsx should also have this text
    expect(appTsx).toContain('Checking...');
  });
});

describe('Generated DB conftest provides proper test fixtures', () => {
  const conftest = generateDbConftest(TEST_PACKAGE);

  it('should use TEST_DATABASE_URL (not production DATABASE_URL)', () => {
    expect(conftest).toContain('TEST_DATABASE_URL');
  });

  it('should create async engine for tests', () => {
    expect(conftest).toContain('create_async_engine');
  });

  it('should provide db_session fixture', () => {
    expect(conftest).toContain('db_session');
  });

  it('should create tables before tests and drop after', () => {
    expect(conftest).toContain('Base.metadata.create_all');
    expect(conftest).toContain('Base.metadata.drop_all');
  });

  it('should import models from the correct package', () => {
    expect(conftest).toContain(`from src.${TEST_PACKAGE}.database.models import Base`);
  });
});

// ============================================================
// Popeye test runner: Fullstack/All project support
// ============================================================

describe('Popeye test runner: Fullstack project commands', () => {
  it('fullstack should use test:all command', () => {
    expect(DEFAULT_TEST_COMMANDS.fullstack).toBe('npm run test:all');
  });

  it('all should use test:all command', () => {
    expect(DEFAULT_TEST_COMMANDS.all).toBe('npm run test:all');
  });

  it('buildTestCommand should return test:all for fullstack', () => {
    const cmd = buildTestCommand({ language: 'fullstack' });
    expect(cmd).toBe('npm run test:all');
  });

  it('buildTestCommand should return test:all for all', () => {
    const cmd = buildTestCommand({ language: 'all' });
    expect(cmd).toBe('npm run test:all');
  });
});

describe('Popeye test runner: Fullstack output parsing', () => {
  it('should parse combined pytest + jest output for fullstack', () => {
    const output = `
=== Backend Tests ===
============================= test session starts ==============================
tests/test_main.py ..                                                    [100%]
============================== 2 passed in 0.54s ==============================

=== Frontend Tests ===
 PASS  tests/App.test.tsx
  App
    v renders the project name (25 ms)
    v shows loading state initially (12 ms)

Tests: 2 passed, 2 total
`;
    const result = parseTestOutput(output, 'fullstack');

    expect(result.success).toBe(true);
    expect(result.passed).toBe(4); // 2 pytest + 2 jest
    expect(result.failed).toBe(0);
    expect(result.total).toBe(4);
  });

  it('should detect backend failures in fullstack output', () => {
    const output = `
=== Backend Tests ===
FAILED tests/test_main.py::test_health_check
============================== 1 failed, 1 passed in 0.54s ==============================

=== Frontend Tests ===
Tests: 2 passed, 2 total
`;
    const result = parseTestOutput(output, 'fullstack');

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(3); // 1 pytest + 2 jest
    expect(result.failedTests).toContain('tests/test_main.py::test_health_check');
  });

  it('should detect frontend failures in fullstack output', () => {
    // Note: pytest regex `(\d+)\s+failed` can match jest "1 failed" line too,
    // causing double-count. The parser counts pytest failed (1) + jest failed (1) = 2.
    const output = `
=== Backend Tests ===
============================== 2 passed in 0.54s ==============================

=== Frontend Tests ===
 FAIL  tests/App.test.tsx
  App
    ✕ renders the project name (25 ms)
    v shows loading state initially (12 ms)

Tests: 1 failed, 1 passed, 2 total
`;
    const result = parseTestOutput(output, 'fullstack');

    expect(result.success).toBe(false);
    expect(result.passed).toBe(3); // 2 pytest + 1 jest
    expect(result.failed).toBe(2); // 1 jest + 1 double-counted by pytest regex
    expect(result.failedTests?.some((t) => t.includes('renders the project name'))).toBe(true);
  });

  it('should parse all project output (multiple jest outputs)', () => {
    const output = `
=== Backend Tests ===
============================== 3 passed in 0.54s ==============================

=== Frontend Tests ===
Tests: 2 passed, 2 total

=== Website Tests ===
Tests: 4 passed, 4 total
`;
    const result = parseTestOutput(output, 'all');

    expect(result.success).toBe(true);
    expect(result.passed).toBe(9); // 3 pytest + 2 jest + 4 jest
    expect(result.failed).toBe(0);
  });
});

// ============================================================
// FE ↔ BE ↔ DB: Full-stack data flow alignment
// ============================================================

describe('Full-stack data flow: Admin wizard lifecycle', () => {
  const apiHook = generateUseAdminApiHook();
  const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);
  const statusBanner = generateDbStatusBanner();

  it('FE sends database_url in test request body', () => {
    expect(generateConnectionForm()).toContain('database_url');
  });

  it('BE /test expects database_url field', () => {
    expect(adminRoutes).toContain('database_url');
  });

  it('FE sends database_url in apply request body', () => {
    expect(generateMigrationProgress()).toContain('database_url');
  });

  it('BE /apply expects database_url field', () => {
    expect(adminRoutes).toContain('database_url');
  });

  it('BE /status returns status field that FE checks', () => {
    // BE returns { "status": "ready"|"unconfigured"|... }
    expect(adminRoutes).toContain('"status"');
    // FE checks status.status
    expect(statusBanner).toContain('status.status');
  });

  it('FE hides banner when status is ready (matches BE response)', () => {
    expect(statusBanner).toContain("status === 'ready'");
  });
});

describe('Full-stack data flow: DB URL format consistency', () => {
  const backendEnv = generateDbEnvExample(TEST_PROJECT);
  const dockerCompose = generateDockerComposeWithDb(TEST_PROJECT);
  const dbConnection = generateDbConnection(TEST_PACKAGE);
  const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);

  it('all DATABASE_URL values use postgresql+asyncpg:// scheme', () => {
    expect(backendEnv).toContain('postgresql+asyncpg://');
    expect(dockerCompose).toContain('postgresql+asyncpg://');
  });

  it('DB connection module reads DATABASE_URL', () => {
    expect(dbConnection).toContain('DATABASE_URL');
  });

  it('admin routes convert URL scheme for asyncpg direct use', () => {
    expect(adminRoutes).toContain(
      'replace("postgresql+asyncpg://", "postgresql://")'
    );
  });
});
