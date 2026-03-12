/**
 * Role map tests — role selection, tech stack inference, template constraints.
 */

import { describe, it, expect } from 'vitest';
import {
  getActiveRoles,
  inferTechStack,
  getTemplateConstraints,
  SUPPORT_ROLES,
  IMPLEMENTATION_ROLES,
} from '../../../src/pipeline/skills/role-map.js';
import type { RepoSnapshot } from '../../../src/pipeline/types.js';
import type { OutputLanguage } from '../../../src/types/project.js';

function makeSnapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    snapshot_id: 'test-snap',
    timestamp: new Date().toISOString(),
    tree_summary: '',
    config_files: [],
    languages_detected: [],
    scripts: {},
    env_files: [],
    migrations_present: false,
    ports_entrypoints: [],
    total_files: 0,
    total_lines: 0,
    ...overrides,
  };
}

describe('role-map', () => {
  describe('getActiveRoles', () => {
    it('should include support roles for all languages', () => {
      const languages: OutputLanguage[] = ['python', 'typescript', 'fullstack', 'website', 'all'];
      for (const lang of languages) {
        const roles = getActiveRoles(lang);
        for (const support of SUPPORT_ROLES) {
          expect(roles).toContain(support);
        }
      }
    });

    it('should include DB_EXPERT for python', () => {
      const roles = getActiveRoles('python');
      expect(roles).toContain('DB_EXPERT');
      expect(roles).toContain('BACKEND_PROGRAMMER');
      expect(roles).not.toContain('FRONTEND_PROGRAMMER');
    });

    it('should include FRONTEND_PROGRAMMER for typescript (not BACKEND_PROGRAMMER)', () => {
      const roles = getActiveRoles('typescript');
      expect(roles).toContain('FRONTEND_PROGRAMMER');
      expect(roles).toContain('UI_UX_SPECIALIST');
      expect(roles).not.toContain('BACKEND_PROGRAMMER');
      expect(roles).not.toContain('DB_EXPERT');
    });

    it('should include both FE and BE for fullstack', () => {
      const roles = getActiveRoles('fullstack');
      expect(roles).toContain('DB_EXPERT');
      expect(roles).toContain('BACKEND_PROGRAMMER');
      expect(roles).toContain('FRONTEND_PROGRAMMER');
      expect(roles).toContain('UI_UX_SPECIALIST');
      expect(roles).not.toContain('WEBSITE_PROGRAMMER');
    });

    it('should include website and marketing roles for website', () => {
      const roles = getActiveRoles('website');
      expect(roles).toContain('WEBSITE_PROGRAMMER');
      expect(roles).toContain('UI_UX_SPECIALIST');
      expect(roles).toContain('MARKETING_EXPERT');
      expect(roles).toContain('SOCIAL_EXPERT');
      expect(roles).not.toContain('BACKEND_PROGRAMMER');
    });

    it('should include all implementation roles for all', () => {
      const roles = getActiveRoles('all');
      for (const impl of IMPLEMENTATION_ROLES) {
        expect(roles).toContain(impl);
      }
    });
  });

  describe('inferTechStack', () => {
    it('should return language defaults when no signals', () => {
      const ts = inferTechStack('python');
      expect(ts.backend).toBe('FastAPI');
      expect(ts.database).toBe('PostgreSQL');
      expect(ts.orm).toBe('SQLAlchemy');
      expect(ts.testing).toBe('Pytest');
      expect(ts.language).toBe('Python 3.11+');
    });

    it('should detect FastAPI from snapshot key_fields', () => {
      const snapshot = makeSnapshot({
        config_files: [{
          path: 'pyproject.toml',
          type: 'toml',
          content_hash: 'abc',
          key_fields: { dependencies: ['fastapi', 'uvicorn'] },
        }],
      });
      const ts = inferTechStack('python', snapshot);
      expect(ts.backend).toBe('FastAPI');
    });

    it('should detect Django from snapshot key_fields', () => {
      const snapshot = makeSnapshot({
        config_files: [{
          path: 'requirements.txt',
          type: 'txt',
          content_hash: 'abc',
          key_fields: { packages: ['django', 'django-rest-framework'] },
        }],
      });
      const ts = inferTechStack('python', snapshot);
      expect(ts.backend).toBe('Django');
    });

    it('should detect framework from expanded spec when snapshot has no deps', () => {
      const ts = inferTechStack('python', makeSnapshot(), 'Build a Django REST API');
      expect(ts.backend).toBe('Django');
    });

    it('should prioritize snapshot over spec mentions', () => {
      const snapshot = makeSnapshot({
        config_files: [{
          path: 'pyproject.toml',
          type: 'toml',
          content_hash: 'abc',
          key_fields: { dependencies: ['fastapi'] },
        }],
      });
      const ts = inferTechStack('python', snapshot, 'Build a Django API');
      // Snapshot has fastapi, spec mentions Django — snapshot wins
      expect(ts.backend).toBe('FastAPI');
    });

    it('should return typescript defaults', () => {
      const ts = inferTechStack('typescript');
      expect(ts.frontend).toBe('React + Vite');
      expect(ts.testing).toBe('Vitest');
      expect(ts.language).toBe('TypeScript 5.x');
    });

    it('should detect Next.js from snapshot', () => {
      const snapshot = makeSnapshot({
        config_files: [{
          path: 'package.json',
          type: 'json',
          content_hash: 'abc',
          key_fields: { dependencies: { next: '^14.0.0', react: '^18.0.0' } },
        }],
      });
      const ts = inferTechStack('typescript', snapshot);
      expect(ts.frontend).toBe('Next.js');
    });
  });

  describe('getTemplateConstraints', () => {
    it('should always include governance constraints', () => {
      const constraints = getTemplateConstraints('BACKEND_PROGRAMMER', {});
      expect(constraints).toContain('must_follow_master_plan');
      expect(constraints).toContain('must_follow_architecture');
      expect(constraints).toContain('conflicts_require_change_request');
    });

    it('should add FastAPI constraints for backend with FastAPI', () => {
      const constraints = getTemplateConstraints('BACKEND_PROGRAMMER', {
        backend: 'FastAPI',
        testing: 'Pytest',
      });
      expect(constraints).toContain('fastapi_async_required');
      expect(constraints).toContain('pydantic_validation');
      expect(constraints).toContain('pytest_testing');
    });

    it('should add React constraints for frontend', () => {
      const constraints = getTemplateConstraints('FRONTEND_PROGRAMMER', {
        frontend: 'React + Vite',
        testing: 'Vitest',
      });
      expect(constraints).toContain('react_component_pattern');
      expect(constraints).toContain('component_testing');
    });

    it('should return only governance constraints for roles without tech constraints', () => {
      const constraints = getTemplateConstraints('DISPATCHER', {});
      expect(constraints).toEqual([
        'must_follow_master_plan',
        'must_follow_architecture',
        'conflicts_require_change_request',
      ]);
    });
  });
});
