/**
 * Tests for admin wizard template functions (backend + frontend)
 */

import { describe, it, expect } from 'vitest';

// Python backend template imports
import {
  generateAdminAuthMiddleware,
  generateMiddlewareInit,
  generateAdminDbRoutes,
  generateFastAPIMainWithAdmin,
} from '../../src/generators/templates/admin-wizard-python.js';

// React frontend template imports
import {
  generateUseAdminApiHook,
  generateDbStatusBanner,
  generateConnectionForm,
  generateMigrationProgress,
  generateDbSetupStepper,
  generateAdminIndex,
  generateAppTsxWithAdmin,
} from '../../src/generators/templates/admin-wizard-react.js';

const TEST_PACKAGE = 'my_project';
const TEST_PROJECT = 'my-project';

// ============================================================
// Python backend template tests
// ============================================================

describe('generateAdminAuthMiddleware', () => {
  it('should include X-Admin-Token header validation', () => {
    const result = generateAdminAuthMiddleware();
    expect(result).toContain('X-Admin-Token');
    expect(result).toContain('ADMIN_SETUP_TOKEN');
  });

  it('should return 403 on invalid token', () => {
    const result = generateAdminAuthMiddleware();
    expect(result).toContain('403');
    expect(result).toContain('HTTPException');
  });

  it('should raise when token is not configured', () => {
    const result = generateAdminAuthMiddleware();
    expect(result).toContain('not configured');
  });

  it('should include proper docstring', () => {
    const result = generateAdminAuthMiddleware();
    expect(result).toContain('require_admin_token');
    expect(result).toContain('FastAPI dependency');
  });
});

describe('generateMiddlewareInit', () => {
  it('should re-export require_admin_token', () => {
    const result = generateMiddlewareInit();
    expect(result).toContain('from .admin_auth import require_admin_token');
    expect(result).toContain('__all__');
  });
});

describe('generateAdminDbRoutes', () => {
  const result = generateAdminDbRoutes(TEST_PACKAGE);

  it('should use APIRouter with correct prefix', () => {
    expect(result).toContain('APIRouter');
    expect(result).toContain('prefix="/api/admin/db"');
    expect(result).toContain('tags=["admin"]');
  });

  it('should use Depends(require_admin_token) for auth', () => {
    expect(result).toContain('Depends(require_admin_token)');
    expect(result).toContain(`from ${TEST_PACKAGE}.middleware.admin_auth import require_admin_token`);
  });

  it('should include GET /status endpoint', () => {
    expect(result).toContain('@router.get("/status")');
    expect(result).toContain('async def db_status');
    expect(result).toContain('migrationsApplied');
    expect(result).toContain('dbUrlConfigured');
  });

  it('should include POST /test endpoint with asyncpg', () => {
    expect(result).toContain('@router.post("/test")');
    expect(result).toContain('async def test_connection');
    expect(result).toContain('asyncpg.connect');
    expect(result).toContain('SELECT 1');
  });

  it('should include POST /apply endpoint with alembic', () => {
    expect(result).toContain('@router.post("/apply")');
    expect(result).toContain('async def apply_setup');
    expect(result).toContain('alembic upgrade head');
    expect(result).toContain('DATABASE_URL');
  });

  it('should include POST /retry endpoint', () => {
    expect(result).toContain('@router.post("/retry")');
    expect(result).toContain('async def retry_setup');
  });

  it('should use correct package name in imports', () => {
    const custom = generateAdminDbRoutes('acme_app');
    expect(custom).toContain('from acme_app.middleware.admin_auth import require_admin_token');
  });
});

describe('generateFastAPIMainWithAdmin', () => {
  const result = generateFastAPIMainWithAdmin(TEST_PROJECT, TEST_PACKAGE);

  it('should include admin_db_router', () => {
    expect(result).toContain('admin_db_router');
    expect(result).toContain('app.include_router(admin_db_router)');
  });

  it('should include health_db_router', () => {
    expect(result).toContain('health_db_router');
    expect(result).toContain('app.include_router(health_db_router)');
  });

  it('should preserve /health endpoint', () => {
    expect(result).toContain('@app.get("/health")');
    expect(result).toContain('async def health_check');
    expect(result).toContain('"healthy"');
  });

  it('should preserve / root endpoint', () => {
    expect(result).toContain('@app.get("/")');
    expect(result).toContain('async def root');
    expect(result).toContain('/docs');
  });

  it('should include project name in title and message', () => {
    expect(result).toContain(`title="${TEST_PROJECT} API"`);
    expect(result).toContain(`Welcome to ${TEST_PROJECT} API`);
  });

  it('should import from correct package', () => {
    expect(result).toContain(`from ${TEST_PACKAGE}.routes.admin_db import router as admin_db_router`);
    expect(result).toContain(`from ${TEST_PACKAGE}.routes.health_db import router as health_db_router`);
  });

  it('should include CORS middleware', () => {
    expect(result).toContain('CORSMiddleware');
    expect(result).toContain('allow_origins');
  });
});

// ============================================================
// React frontend template tests
// ============================================================

describe('generateUseAdminApiHook', () => {
  const result = generateUseAdminApiHook();

  it('should set X-Admin-Token header', () => {
    expect(result).toContain("'X-Admin-Token'");
    expect(result).toContain('adminToken');
  });

  it('should read VITE_API_URL from env', () => {
    expect(result).toContain('VITE_API_URL');
    expect(result).toContain('import.meta.env');
  });

  it('should read VITE_ADMIN_TOKEN from env', () => {
    expect(result).toContain('VITE_ADMIN_TOKEN');
  });

  it('should export useAdminApi function', () => {
    expect(result).toContain('export function useAdminApi');
    expect(result).toContain('callApi');
  });
});

describe('generateDbStatusBanner', () => {
  const result = generateDbStatusBanner();

  it('should poll /api/admin/db/status on mount', () => {
    expect(result).toContain('/api/admin/db/status');
    expect(result).toContain('useEffect');
  });

  it('should accept onSetupClick prop', () => {
    expect(result).toContain('onSetupClick');
    expect(result).toContain('DbStatusBannerProps');
  });

  it('should hide when status is ready', () => {
    expect(result).toContain("status === 'ready'");
    expect(result).toContain('return null');
  });

  it('should use amber Tailwind classes', () => {
    expect(result).toContain('bg-amber-50');
    expect(result).toContain('border-amber-200');
    expect(result).toContain('bg-amber-500');
  });

  it('should show "Set up database" button', () => {
    expect(result).toContain('Set up database');
  });
});

describe('generateConnectionForm', () => {
  const result = generateConnectionForm();

  it('should include DATABASE_URL input', () => {
    expect(result).toContain('DATABASE_URL');
    expect(result).toContain('db-url');
    expect(result).toContain('<input');
  });

  it('should call POST /api/admin/db/test', () => {
    expect(result).toContain('/api/admin/db/test');
    expect(result).toContain("method: 'POST'");
  });

  it('should accept onTestSuccess callback', () => {
    expect(result).toContain('onTestSuccess');
    expect(result).toContain('ConnectionFormProps');
  });

  it('should accept onBack callback', () => {
    expect(result).toContain('onBack');
  });

  it('should show Test Connection button', () => {
    expect(result).toContain('Test Connection');
  });

  it('should show success/error feedback', () => {
    expect(result).toContain('bg-green-50');
    expect(result).toContain('bg-red-50');
  });
});

describe('generateMigrationProgress', () => {
  const result = generateMigrationProgress();

  it('should call POST /api/admin/db/apply', () => {
    expect(result).toContain('/api/admin/db/apply');
  });

  it('should poll status during applying phase', () => {
    expect(result).toContain('/api/admin/db/status');
    expect(result).toContain('setInterval');
    expect(result).toContain('2000');
  });

  it('should accept databaseUrl prop', () => {
    expect(result).toContain('databaseUrl');
    expect(result).toContain('MigrationProgressProps');
  });

  it('should accept onComplete and onError callbacks', () => {
    expect(result).toContain('onComplete');
    expect(result).toContain('onError');
  });

  it('should show step progress items', () => {
    expect(result).toContain('steps.map');
    expect(result).toContain('StepResult');
  });
});

describe('generateDbSetupStepper', () => {
  const result = generateDbSetupStepper();

  it('should include all wizard steps', () => {
    expect(result).toContain("'choose'");
    expect(result).toContain("'credentials'");
    expect(result).toContain("'apply'");
    expect(result).toContain("'ready'");
  });

  it('should render as overlay with backdrop', () => {
    expect(result).toContain('fixed inset-0');
    expect(result).toContain('z-50');
    expect(result).toContain('bg-black/50');
  });

  it('should accept onClose prop', () => {
    expect(result).toContain('onClose');
    expect(result).toContain('DbSetupStepperProps');
  });

  it('should have a close button', () => {
    expect(result).toContain('aria-label="Close"');
  });

  it('should show step indicator bar', () => {
    expect(result).toContain('STEP_ORDER');
    expect(result).toContain('STEP_LABELS');
    expect(result).toContain('bg-blue-500');
  });

  it('should render ConnectionForm and MigrationProgress', () => {
    expect(result).toContain('<ConnectionForm');
    expect(result).toContain('<MigrationProgress');
  });

  it('should show completion state with checkmark', () => {
    expect(result).toContain('Database is ready');
    expect(result).toContain('bg-green-100');
  });
});

describe('generateAdminIndex', () => {
  const result = generateAdminIndex();

  it('should export DbStatusBanner', () => {
    expect(result).toContain("export { DbStatusBanner }");
    expect(result).toContain("'./DbStatusBanner'");
  });

  it('should export DbSetupStepper', () => {
    expect(result).toContain("export { DbSetupStepper }");
    expect(result).toContain("'./DbSetupStepper'");
  });
});

describe('generateAppTsxWithAdmin', () => {
  const result = generateAppTsxWithAdmin(TEST_PROJECT);

  it('should import DbStatusBanner and DbSetupStepper', () => {
    expect(result).toContain("import { DbStatusBanner } from './admin'");
    expect(result).toContain("import { DbSetupStepper } from './admin'");
  });

  it('should include showWizard state', () => {
    expect(result).toContain('showWizard');
    expect(result).toContain('setShowWizard');
    expect(result).toContain('useState(false)');
  });

  it('should render DbStatusBanner with onSetupClick', () => {
    expect(result).toContain('<DbStatusBanner');
    expect(result).toContain('onSetupClick');
    expect(result).toContain('setShowWizard(true)');
  });

  it('should render DbSetupStepper conditionally', () => {
    expect(result).toContain('{showWizard && (');
    expect(result).toContain('<DbSetupStepper');
    expect(result).toContain('setShowWizard(false)');
  });

  it('should include project name', () => {
    expect(result).toContain(TEST_PROJECT);
  });

  it('should preserve health check logic', () => {
    expect(result).toContain('HealthStatus');
    expect(result).toContain('/health');
    expect(result).toContain('Backend Status');
  });

  it('should export default App', () => {
    expect(result).toContain('export default App');
  });
});
