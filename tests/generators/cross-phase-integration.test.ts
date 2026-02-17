/**
 * Cross-phase integration tests
 * Verifies that Phase 1 (DB types/templates), Phase 2 (state machine/runner),
 * and Phase 3 (admin wizard) work together correctly with no disconnections.
 */

import { describe, it, expect } from 'vitest';

// Phase 1: types + templates
import { DbStatusSchema, DbSetupStepSchema } from '../../src/types/database.js';
import { SetupResultSchema } from '../../src/types/database-runtime.js';
import { getDatabaseFiles } from '../../src/generators/database.js';
import { generateDbEnvExample } from '../../src/generators/templates/database-docker.js';

// Phase 2: state machine
import {
  canTransition,
  getAvailableTransitions,
} from '../../src/workflow/db-state-machine.js';

// Phase 3: admin wizard
import { getAdminWizardFiles } from '../../src/generators/admin-wizard.js';
import {
  generateFastAPIMainWithAdmin,
  generateAdminDbRoutes,
} from '../../src/generators/templates/admin-wizard-python.js';
import {
  generateAppTsxWithAdmin,
  generateDbStatusBanner,
} from '../../src/generators/templates/admin-wizard-react.js';

// Composite: fullstack + all file lists
import { getFullstackProjectFiles } from '../../src/generators/fullstack.js';
import { getAllProjectFiles } from '../../src/generators/all.js';

const TEST_PACKAGE = 'my_project';
const TEST_PROJECT = 'my-project';

// ============================================================
// Phase 1 ↔ Phase 3: Generated backend wiring
// ============================================================

describe('Phase 1 ↔ Phase 3: Backend router wiring', () => {
  const mainPy = generateFastAPIMainWithAdmin(TEST_PROJECT, TEST_PACKAGE);

  it('should include Phase 1 health_db_router in main.py', () => {
    expect(mainPy).toContain('health_db_router');
    expect(mainPy).toContain(
      `from ${TEST_PACKAGE}.routes.health_db import router as health_db_router`
    );
  });

  it('should include Phase 3 admin_db_router in main.py', () => {
    expect(mainPy).toContain('admin_db_router');
    expect(mainPy).toContain(
      `from ${TEST_PACKAGE}.routes.admin_db import router as admin_db_router`
    );
  });

  it('should wire both routers via app.include_router()', () => {
    expect(mainPy).toContain('app.include_router(health_db_router)');
    expect(mainPy).toContain('app.include_router(admin_db_router)');
  });

  it('should preserve base endpoints alongside both routers', () => {
    expect(mainPy).toContain('@app.get("/")');
    expect(mainPy).toContain('@app.get("/health")');
  });
});

describe('Phase 1 ↔ Phase 3: Admin routes reference Phase 1 concepts', () => {
  const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);

  it('should reference alembic for migrations', () => {
    expect(adminRoutes).toContain('alembic upgrade head');
  });

  it('should reference asyncpg for DB connectivity', () => {
    expect(adminRoutes).toContain('asyncpg.connect');
  });

  it('should check alembic_version table for migration status', () => {
    expect(adminRoutes).toContain('alembic_version');
  });
});

// ============================================================
// Phase 1 ↔ Phase 3: Environment variable alignment
// ============================================================

describe('Phase 1 ↔ Phase 3: Environment variable alignment', () => {
  const envExample = generateDbEnvExample(TEST_PROJECT);

  it('should include Phase 1 DATABASE_URL', () => {
    expect(envExample).toContain('DATABASE_URL=postgresql+asyncpg://');
  });

  it('should include Phase 1 POSTGRES vars', () => {
    expect(envExample).toContain('POSTGRES_USER=postgres');
    expect(envExample).toContain('POSTGRES_PASSWORD=postgres');
    expect(envExample).toContain('POSTGRES_DB=');
  });

  it('should include Phase 1 vector support flag', () => {
    expect(envExample).toContain('DB_VECTOR_REQUIRED=true');
  });

  it('should include Phase 3 ADMIN_SETUP_TOKEN', () => {
    expect(envExample).toContain('ADMIN_SETUP_TOKEN=change-me-to-a-random-string');
  });

  it('should have both Database and Admin sections', () => {
    expect(envExample).toContain('# Database');
    expect(envExample).toContain('# Admin Wizard');
  });
});

// ============================================================
// Phase 2 ↔ Phase 3: Status value alignment
// ============================================================

describe('Phase 2 ↔ Phase 3: Admin wizard status values match DbStatusSchema', () => {
  const validStatuses = DbStatusSchema.options;
  const adminRoutes = generateAdminDbRoutes(TEST_PACKAGE);

  it('DbStatusSchema should have all 5 lifecycle states', () => {
    expect(validStatuses).toContain('unconfigured');
    expect(validStatuses).toContain('configured');
    expect(validStatuses).toContain('applying');
    expect(validStatuses).toContain('ready');
    expect(validStatuses).toContain('error');
  });

  it('admin GET /status should only use valid DbStatus values', () => {
    // Extract all status = "..." assignments from the generated Python code
    const statusAssignments = adminRoutes.match(/status\s*=\s*"([^"]+)"/g) || [];
    const assignedValues = statusAssignments.map((s) =>
      s.match(/"([^"]+)"/)?.[1]
    ).filter(Boolean);

    for (const value of assignedValues) {
      expect(
        validStatuses.includes(value as typeof validStatuses[number]),
        `Admin route status "${value}" is not in DbStatusSchema: [${validStatuses.join(', ')}]`
      ).toBe(true);
    }
  });

  it('admin POST /apply should return valid final status values', () => {
    // /apply endpoint returns "ready" or "error" as final_status
    expect(adminRoutes).toContain('final_status = "ready" if');
    expect(adminRoutes).toContain('else "error"');
    expect(validStatuses).toContain('ready');
    expect(validStatuses).toContain('error');
  });

  it('admin GET /status default should be "unconfigured"', () => {
    expect(adminRoutes).toContain('status = "unconfigured"');
    expect(validStatuses).toContain('unconfigured');
  });

  it('should NOT contain any non-schema status values', () => {
    // Ensure we never use invented statuses like "pending_migration"
    expect(adminRoutes).not.toContain('"pending_migration"');
    expect(adminRoutes).not.toContain('"pending"');
    expect(adminRoutes).not.toContain('"migrating"');
  });
});

describe('Phase 2 ↔ Phase 3: State transitions match admin wizard flow', () => {
  it('configured -> applying should be valid (admin /apply triggers this)', () => {
    expect(canTransition('configured', 'applying')).toBe(true);
  });

  it('applying -> ready should be valid (successful /apply result)', () => {
    expect(canTransition('applying', 'ready')).toBe(true);
  });

  it('applying -> error should be valid (failed /apply result)', () => {
    expect(canTransition('applying', 'error')).toBe(true);
  });

  it('error -> configured should be valid (admin /retry resets to configured)', () => {
    expect(canTransition('error', 'configured')).toBe(true);
  });

  it('unconfigured -> configured should be valid (initial setup)', () => {
    expect(canTransition('unconfigured', 'configured')).toBe(true);
  });

  it('ready -> configured should be valid (reconfiguration)', () => {
    expect(canTransition('ready', 'configured')).toBe(true);
  });

  it('applying should only go to ready or error', () => {
    const targets = getAvailableTransitions('applying');
    expect(targets).toEqual(['ready', 'error']);
  });
});

describe('Phase 2 ↔ Phase 3: React banner uses valid statuses', () => {
  const banner = generateDbStatusBanner();

  it('should check for "ready" status to hide banner', () => {
    expect(banner).toContain("status === 'ready'");
  });

  it('should check for "error" status to show error message', () => {
    expect(banner).toContain("status === 'error'");
  });
});

// ============================================================
// Phase 1 ↔ Phase 2: Schema consistency
// ============================================================

describe('Phase 1 ↔ Phase 2: Schema types used in runtime', () => {
  it('SetupResultSchema.finalStatus should use DbStatusSchema', () => {
    // Verify SetupResult validates with a valid DbStatus
    const result = SetupResultSchema.safeParse({
      success: true,
      steps: [],
      totalDurationMs: 100,
      finalStatus: 'ready',
    });
    expect(result.success).toBe(true);
  });

  it('SetupResultSchema should reject invalid finalStatus', () => {
    const result = SetupResultSchema.safeParse({
      success: true,
      steps: [],
      totalDurationMs: 100,
      finalStatus: 'pending_migration',
    });
    expect(result.success).toBe(false);
  });

  it('DbSetupStepSchema should have all 6 pipeline steps', () => {
    const steps = DbSetupStepSchema.options;
    expect(steps).toHaveLength(6);
    expect(steps).toContain('check_connection');
    expect(steps).toContain('ensure_extensions');
    expect(steps).toContain('apply_migrations');
    expect(steps).toContain('seed_minimal');
    expect(steps).toContain('readiness_tests');
    expect(steps).toContain('mark_ready');
  });
});

// ============================================================
// All phases combined: File list completeness
// ============================================================

describe('All phases: getFullstackProjectFiles includes all layers', () => {
  const files = getFullstackProjectFiles(TEST_PROJECT);
  const dbFiles = getDatabaseFiles(TEST_PACKAGE, 'sqlalchemy');
  const adminFiles = getAdminWizardFiles(TEST_PACKAGE);

  it('should include all Phase 1 database files', () => {
    for (const f of dbFiles) {
      expect(files, `Missing Phase 1 file: ${f}`).toContain(f);
    }
  });

  it('should include all Phase 3 admin wizard files', () => {
    for (const f of adminFiles) {
      expect(files, `Missing Phase 3 file: ${f}`).toContain(f);
    }
  });

  it('should include Phase 1 health route', () => {
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/routes/health_db.py`);
  });

  it('should include Phase 3 admin route', () => {
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/routes/admin_db.py`);
  });

  it('should include Phase 1 alembic config', () => {
    expect(files).toContain('apps/backend/alembic.ini');
  });

  it('should include Phase 3 admin middleware', () => {
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/middleware/admin_auth.py`);
  });
});

describe('All phases: getAllProjectFiles includes all layers', () => {
  const files = getAllProjectFiles(TEST_PROJECT);
  const dbFiles = getDatabaseFiles(TEST_PACKAGE, 'sqlalchemy');
  const adminFiles = getAdminWizardFiles(TEST_PACKAGE);

  it('should include all Phase 1 database files', () => {
    for (const f of dbFiles) {
      expect(files, `Missing Phase 1 file in all: ${f}`).toContain(f);
    }
  });

  it('should include all Phase 3 admin wizard files', () => {
    for (const f of adminFiles) {
      expect(files, `Missing Phase 3 file in all: ${f}`).toContain(f);
    }
  });

  it('should include website files (unique to all projects)', () => {
    expect(files).toContain('apps/website/package.json');
    expect(files).toContain('apps/website/src/app/page.tsx');
  });

  it('should include shared packages (unique to all projects)', () => {
    expect(files).toContain('packages/design-tokens/package.json');
    expect(files).toContain('packages/ui/package.json');
  });
});

// ============================================================
// All phases: Frontend wiring
// ============================================================

describe('All phases: Generated App.tsx integrates admin wizard', () => {
  const appTsx = generateAppTsxWithAdmin(TEST_PROJECT);

  it('should import DbStatusBanner (Phase 3)', () => {
    expect(appTsx).toContain('DbStatusBanner');
  });

  it('should import DbSetupStepper (Phase 3)', () => {
    expect(appTsx).toContain('DbSetupStepper');
  });

  it('should manage showWizard state for overlay', () => {
    expect(appTsx).toContain('showWizard');
    expect(appTsx).toContain('setShowWizard');
  });

  it('should render the banner and stepper', () => {
    expect(appTsx).toContain('<DbStatusBanner');
    expect(appTsx).toContain('<DbSetupStepper');
  });

  it('should still include the project name', () => {
    expect(appTsx).toContain(TEST_PROJECT);
  });
});

// ============================================================
// Cross-phase: No duplicate/conflicting file paths
// ============================================================

describe('Cross-phase: No file path conflicts between layers', () => {
  const dbFiles = getDatabaseFiles(TEST_PACKAGE, 'sqlalchemy');
  const adminFiles = getAdminWizardFiles(TEST_PACKAGE);

  it('should have no overlapping files between Phase 1 and Phase 3', () => {
    const overlap = dbFiles.filter((f) => adminFiles.includes(f));
    expect(overlap, `Overlapping files: ${overlap.join(', ')}`).toHaveLength(0);
  });

  it('Phase 1 files should be in database/ and migrations/', () => {
    const dbBackendFiles = dbFiles.filter((f) => f.startsWith('apps/backend/'));
    for (const f of dbBackendFiles) {
      const hasExpectedPath =
        f.includes('/database/') ||
        f.includes('/routes/health_db') ||
        f.includes('/startup.py') ||
        f.includes('alembic') ||
        f.includes('migrations/') ||
        f.includes('conftest_db');
      expect(hasExpectedPath, `Unexpected Phase 1 path: ${f}`).toBe(true);
    }
  });

  it('Phase 3 files should be in middleware/ and admin/', () => {
    for (const f of adminFiles) {
      const hasExpectedPath =
        f.includes('/middleware/') ||
        f.includes('/routes/admin_db') ||
        f.includes('/admin/');
      expect(hasExpectedPath, `Unexpected Phase 3 path: ${f}`).toBe(true);
    }
  });
});
