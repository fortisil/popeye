/**
 * Tests for admin wizard orchestrator (file list and dependencies)
 */

import { describe, it, expect } from 'vitest';

import {
  getAdminWizardFiles,
  ADMIN_WIZARD_PYTHON_DEPS,
} from '../../src/generators/admin-wizard.js';

const TEST_PACKAGE = 'my_project';

describe('getAdminWizardFiles', () => {
  const files = getAdminWizardFiles(TEST_PACKAGE);

  it('should return backend middleware files', () => {
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/middleware/__init__.py`);
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/middleware/admin_auth.py`);
  });

  it('should return backend admin route file', () => {
    expect(files).toContain(`apps/backend/src/${TEST_PACKAGE}/routes/admin_db.py`);
  });

  it('should return frontend admin component files', () => {
    expect(files).toContain('apps/frontend/src/admin/useAdminApi.ts');
    expect(files).toContain('apps/frontend/src/admin/DbStatusBanner.tsx');
    expect(files).toContain('apps/frontend/src/admin/ConnectionForm.tsx');
    expect(files).toContain('apps/frontend/src/admin/MigrationProgress.tsx');
    expect(files).toContain('apps/frontend/src/admin/DbSetupStepper.tsx');
    expect(files).toContain('apps/frontend/src/admin/index.ts');
  });

  it('should have correct number of files', () => {
    expect(files).toHaveLength(9);
  });

  it('should use correct package name prefix for backend files', () => {
    const customFiles = getAdminWizardFiles('acme_app');
    const backendFiles = customFiles.filter((f) => f.startsWith('apps/backend/'));
    for (const f of backendFiles) {
      expect(f).toContain('acme_app');
    }
  });

  it('should use apps/frontend prefix for frontend files', () => {
    const frontendFiles = files.filter((f) => f.startsWith('apps/frontend/'));
    expect(frontendFiles).toHaveLength(6);
    for (const f of frontendFiles) {
      expect(f).toContain('src/admin/');
    }
  });
});

describe('ADMIN_WIZARD_PYTHON_DEPS', () => {
  it('should include python-multipart', () => {
    expect(ADMIN_WIZARD_PYTHON_DEPS).toContain('python-multipart>=0.0.7');
  });

  it('should be a non-empty array', () => {
    expect(ADMIN_WIZARD_PYTHON_DEPS.length).toBeGreaterThan(0);
  });
});
