/**
 * Artifact Validators tests — completeness checks for each artifact type.
 */

import { describe, it, expect } from 'vitest';
import {
  validateArtifactCompleteness,
  getValidatableArtifactTypes,
} from '../../src/pipeline/artifact-validators.js';

describe('validateArtifactCompleteness', () => {
  describe('master_plan', () => {
    it('should pass for complete master plan', () => {
      const content = [
        '# Master Plan',
        '## Goals',
        'Build a comprehensive todo application with real-time sync capabilities.',
        'The application should support multiple users and collaborative editing features.',
        '## Milestones',
        'Milestone 1: Setup project structure, install dependencies, configure CI/CD pipeline',
        'Milestone 2: Core features including task CRUD, real-time updates, and user auth',
        '## Success Criteria',
        'All tests pass with 80% coverage, app deploys successfully to production environment.',
      ].join('\n');

      const result = validateArtifactCompleteness('master_plan', content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for empty content', () => {
      const result = validateArtifactCompleteness('master_plan', '');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty content');
    });

    it('should fail for too-short content', () => {
      const result = validateArtifactCompleteness('master_plan', '# Plan\nGoals: TBD');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('too short'))).toBe(true);
    });

    it('should fail when missing Goals section', () => {
      const content = [
        '# Master Plan',
        'Some text that is long enough to pass the minimum length check.',
        '## Milestones',
        'Milestone 1: Setup project structure and dependencies.',
        '## Success Criteria',
        'All tests pass and the application deploys.',
      ].join('\n');

      const result = validateArtifactCompleteness('master_plan', content);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Goals'))).toBe(true);
    });

    it('should fail when missing Milestones section', () => {
      const content = [
        '# Master Plan',
        '## Goals',
        'Build a comprehensive todo application with real-time sync.',
        'The application should support multiple users.',
        '## Success Criteria',
        'All tests pass and the application deploys successfully.',
      ].join('\n');

      const result = validateArtifactCompleteness('master_plan', content);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Milestones'))).toBe(true);
    });
  });

  describe('architecture', () => {
    it('should pass for complete architecture', () => {
      const content = [
        '# Architecture',
        '## Components',
        'Frontend: React SPA in src/app/ with component-based architecture using TypeScript.',
        'Backend: FastAPI in src/server/ with layered architecture (routes, services, models).',
        '## Data Flow',
        'REST API contracts between FE and BE, with JSON payloads and OpenAPI specification.',
        '## Tech Stack',
        'React 18, TypeScript 5.x, FastAPI 0.100+, PostgreSQL 15, Redis for caching.',
      ].join('\n');

      const result = validateArtifactCompleteness('architecture', content);
      expect(result.valid).toBe(true);
    });

    it('should fail when missing components section', () => {
      const content = [
        '# Architecture',
        'Some long enough content for the min length check.',
        '## Data Flow',
        'REST API between FE and BE using src/api/ routes.',
        '## Tech Stack',
        'React, TypeScript, FastAPI',
      ].join('\n');

      const result = validateArtifactCompleteness('architecture', content);
      expect(result.valid).toBe(false);
    });

    it('should warn when no file paths referenced', () => {
      const content = [
        '# Architecture',
        '## Components',
        'Frontend and Backend modules communicating via REST protocol for data exchange.',
        'The component architecture follows a modular design pattern with clear separation.',
        '## Contracts',
        'JSON-based API contracts define the interface between all system components clearly.',
        '## Tech Stack',
        'React for the frontend, TypeScript for type safety, and a backend runtime environment.',
      ].join('\n');

      const result = validateArtifactCompleteness('architecture', content);
      expect(result.warnings.some((w) => w.includes('file path'))).toBe(true);
    });
  });

  describe('role_plan', () => {
    it('should pass for complete role plan', () => {
      const content = [
        '# FRONTEND_PROGRAMMER Role Plan',
        '## Tasks',
        '- Build login page',
        '- Implement dashboard',
        '## Dependencies',
        'Requires API contracts from BACKEND_PROGRAMMER.',
        '## Acceptance Criteria',
        'All pages render, tests pass.',
      ].join('\n');

      const result = validateArtifactCompleteness('role_plan', content);
      expect(result.valid).toBe(true);
    });

    it('should fail for too-short role plan', () => {
      const result = validateArtifactCompleteness('role_plan', '# Plan');
      expect(result.valid).toBe(false);
    });
  });

  describe('qa_validation', () => {
    it('should pass with test results and coverage', () => {
      const content = [
        '# QA Validation',
        '## Test Results',
        '45 tests passing, 0 failing',
        '## Coverage',
        'Overall coverage: 87%',
      ].join('\n');

      const result = validateArtifactCompleteness('qa_validation', content);
      expect(result.valid).toBe(true);
    });

    it('should fail without test results section', () => {
      const content = '# QA\n## Coverage\n80% coverage';
      const result = validateArtifactCompleteness('qa_validation', content);
      expect(result.valid).toBe(false);
    });
  });

  describe('audit_report (JSON)', () => {
    it('should pass for valid JSON audit report', () => {
      const content = JSON.stringify({
        findings: [{ id: '1', severity: 'P2' }],
        overall_status: 'PASS',
        system_risk_score: 25,
      });

      const result = validateArtifactCompleteness('audit_report', content);
      expect(result.valid).toBe(true);
    });

    it('should fail when missing findings array', () => {
      const content = JSON.stringify({
        overall_status: 'PASS',
        system_risk_score: 25,
      });

      const result = validateArtifactCompleteness('audit_report', content);
      expect(result.valid).toBe(false);
    });
  });

  describe('unknown artifact types', () => {
    it('should pass for artifact types without validators', () => {
      const result = validateArtifactCompleteness('release_notes', 'Any content');
      expect(result.valid).toBe(true);
    });
  });

  describe('getValidatableArtifactTypes', () => {
    it('should return artifact types with registered validators', () => {
      const types = getValidatableArtifactTypes();
      expect(types).toContain('master_plan');
      expect(types).toContain('architecture');
      expect(types).toContain('role_plan');
      expect(types).toContain('qa_validation');
      expect(types).toContain('audit_report');
      expect(types.length).toBe(5);
    });
  });
});
