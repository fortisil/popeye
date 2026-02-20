/**
 * Role Execution Adapter tests — context building, prompt injection, role detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRoleExecutionContext,
  executeWithRoleContext,
  buildAllRoleContexts,
} from '../../src/pipeline/role-execution-adapter.js';
import type { RoleExecutionContext, ClaudeExecuteOptions } from '../../src/pipeline/role-execution-adapter.js';
import type { ArtifactEntry, PipelineRole } from '../../src/pipeline/types.js';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';

const TEST_DIR = join(process.cwd(), 'tmp-role-adapter-test');

function makeMockSkill(role: string) {
  return {
    role,
    systemPrompt: `You are ${role}. Follow best practices.`,
    constraints: ['Stay in scope', 'Do not modify tests'],
    tools: [],
  };
}

function makeRolePlanArtifact(role: string): ArtifactEntry {
  return {
    id: `plan-${role}`,
    type: 'role_plan',
    phase: 'ROLE_PLANNING',
    version: 1,
    path: `docs/role-plans/${role}.md`,
    sha256: 'abc123',
    timestamp: new Date().toISOString(),
    immutable: true,
    content_type: 'markdown',
    group_id: `group-${role}`,
  };
}

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'docs', 'role-plans'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('buildRoleExecutionContext', () => {
  it('should build context with role, system prompt, and task scope', () => {
    const planContent = [
      '# FRONTEND_PROGRAMMER Role Plan',
      '## Tasks',
      '- Build login page in src/app/login/',
      '- Implement dashboard components',
      '## Dependencies',
      'Requires API contracts from BACKEND_PROGRAMMER.',
    ].join('\n');
    const artifact = makeRolePlanArtifact('FRONTEND_PROGRAMMER');
    writeFileSync(join(TEST_DIR, artifact.path), planContent);

    const ctx = buildRoleExecutionContext(
      'FRONTEND_PROGRAMMER',
      makeMockSkill('FRONTEND_PROGRAMMER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.role).toBe('FRONTEND_PROGRAMMER');
    expect(ctx.systemPrompt).toContain('FRONTEND_PROGRAMMER');
    expect(ctx.systemPrompt).toContain('You are FRONTEND_PROGRAMMER');
    expect(ctx.taskScope).toContain('Build login page');
    expect(ctx.allowedPaths.length).toBeGreaterThan(0);
  });

  it('should include forbidden patterns for frontend role', () => {
    const artifact = makeRolePlanArtifact('FRONTEND_PROGRAMMER');
    writeFileSync(join(TEST_DIR, artifact.path), '# FRONTEND_PROGRAMMER Plan\n## Tasks\n- UI work');

    const ctx = buildRoleExecutionContext(
      'FRONTEND_PROGRAMMER',
      makeMockSkill('FRONTEND_PROGRAMMER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.forbiddenPatterns).toContain('server/');
    expect(ctx.forbiddenPatterns).toContain('prisma/');
  });

  it('should include forbidden patterns in system prompt', () => {
    const artifact = makeRolePlanArtifact('FRONTEND_PROGRAMMER');
    writeFileSync(join(TEST_DIR, artifact.path), '# FRONTEND_PROGRAMMER Plan\n## Tasks\n- UI');

    const ctx = buildRoleExecutionContext(
      'FRONTEND_PROGRAMMER',
      makeMockSkill('FRONTEND_PROGRAMMER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.systemPrompt).toContain('Forbidden Paths');
    expect(ctx.systemPrompt).toContain('server/');
  });

  it('should have no forbidden patterns for QA_TESTER', () => {
    const artifact = makeRolePlanArtifact('QA_TESTER');
    writeFileSync(join(TEST_DIR, artifact.path), '# QA_TESTER Plan\n## Tasks\n- Test all');

    const ctx = buildRoleExecutionContext(
      'QA_TESTER',
      makeMockSkill('QA_TESTER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.forbiddenPatterns).toEqual([]);
    expect(ctx.systemPrompt).not.toContain('Forbidden Paths');
  });

  it('should include skill constraints in system prompt', () => {
    const artifact = makeRolePlanArtifact('BACKEND_PROGRAMMER');
    writeFileSync(join(TEST_DIR, artifact.path), '# BACKEND_PROGRAMMER Plan\n## Tasks\n- API');

    const ctx = buildRoleExecutionContext(
      'BACKEND_PROGRAMMER',
      makeMockSkill('BACKEND_PROGRAMMER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.systemPrompt).toContain('Stay in scope');
    expect(ctx.systemPrompt).toContain('Do not modify tests');
  });

  it('should extract file paths from plan content as allowed paths', () => {
    const planContent = [
      '# BACKEND_PROGRAMMER Plan',
      '## Tasks',
      '- Implement API routes in src/api/routes.ts',
      '- Update server/middleware.ts',
    ].join('\n');
    const artifact = makeRolePlanArtifact('BACKEND_PROGRAMMER');
    writeFileSync(join(TEST_DIR, artifact.path), planContent);

    const ctx = buildRoleExecutionContext(
      'BACKEND_PROGRAMMER',
      makeMockSkill('BACKEND_PROGRAMMER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.allowedPaths).toContain('src/api/routes.ts');
    expect(ctx.allowedPaths).toContain('server/middleware.ts');
  });

  it('should handle missing plan file gracefully', () => {
    const artifact = makeRolePlanArtifact('BACKEND_PROGRAMMER');
    // Don't write the file

    const ctx = buildRoleExecutionContext(
      'BACKEND_PROGRAMMER',
      makeMockSkill('BACKEND_PROGRAMMER'),
      artifact,
      TEST_DIR,
    );

    expect(ctx.role).toBe('BACKEND_PROGRAMMER');
    expect(ctx.taskScope).toBe('');
    expect(ctx.systemPrompt).toContain('BACKEND_PROGRAMMER');
  });
});

describe('executeWithRoleContext', () => {
  it('should inject systemPrompt into options', () => {
    const ctx: RoleExecutionContext = {
      role: 'FRONTEND_PROGRAMMER',
      systemPrompt: 'You are FRONTEND_PROGRAMMER. Build the UI.',
      allowedPaths: ['src/'],
      forbiddenPatterns: ['server/'],
      taskScope: 'Build login page',
    };

    const options: ClaudeExecuteOptions = {
      projectDir: '/test/project',
    };

    const result = executeWithRoleContext(ctx, options);
    expect(result.systemPrompt).toBe('You are FRONTEND_PROGRAMMER. Build the UI.');
    expect(result.projectDir).toBe('/test/project');
  });

  it('should override existing systemPrompt', () => {
    const ctx: RoleExecutionContext = {
      role: 'BACKEND_PROGRAMMER',
      systemPrompt: 'Role-specific prompt',
      allowedPaths: [],
      forbiddenPatterns: [],
      taskScope: '',
    };

    const options: ClaudeExecuteOptions = {
      projectDir: '/test',
      systemPrompt: 'Old prompt',
    };

    const result = executeWithRoleContext(ctx, options);
    expect(result.systemPrompt).toBe('Role-specific prompt');
  });

  it('should preserve other options', () => {
    const ctx: RoleExecutionContext = {
      role: 'QA_TESTER',
      systemPrompt: 'Test prompt',
      allowedPaths: [],
      forbiddenPatterns: [],
      taskScope: '',
    };

    const options: ClaudeExecuteOptions = {
      projectDir: '/test',
      customField: 'preserved',
    };

    const result = executeWithRoleContext(ctx, options);
    expect(result.customField).toBe('preserved');
  });
});

describe('buildAllRoleContexts', () => {
  it('should build contexts for all detected roles', () => {
    const pipeline = createDefaultPipelineState();
    pipeline.activeRoles = ['FRONTEND_PROGRAMMER', 'BACKEND_PROGRAMMER'];

    // Create plan files
    const fePlan = makeRolePlanArtifact('FRONTEND_PROGRAMMER');
    const bePlan = makeRolePlanArtifact('BACKEND_PROGRAMMER');
    pipeline.artifacts.push(fePlan, bePlan);

    writeFileSync(
      join(TEST_DIR, fePlan.path),
      '# FRONTEND_PROGRAMMER Role Plan\n## Tasks\n- Build UI',
    );
    writeFileSync(
      join(TEST_DIR, bePlan.path),
      '# BACKEND_PROGRAMMER Role Plan\n## Tasks\n- Build API',
    );

    const mockSkillLoader = {
      loadSkill: (role: string) => makeMockSkill(role),
      listSkills: () => [],
    };

    const contexts = buildAllRoleContexts(pipeline, mockSkillLoader as any, TEST_DIR);
    expect(contexts.size).toBe(2);
    expect(contexts.has('FRONTEND_PROGRAMMER')).toBe(true);
    expect(contexts.has('BACKEND_PROGRAMMER')).toBe(true);
  });

  it('should skip roles with missing plan files', () => {
    const pipeline = createDefaultPipelineState();
    pipeline.activeRoles = ['FRONTEND_PROGRAMMER', 'BACKEND_PROGRAMMER'];

    const fePlan = makeRolePlanArtifact('FRONTEND_PROGRAMMER');
    pipeline.artifacts.push(fePlan);

    // Only write FE plan, not BE
    writeFileSync(
      join(TEST_DIR, fePlan.path),
      '# FRONTEND_PROGRAMMER Role Plan\n## Tasks\n- Build UI',
    );

    const mockSkillLoader = {
      loadSkill: (role: string) => makeMockSkill(role),
      listSkills: () => [],
    };

    const contexts = buildAllRoleContexts(pipeline, mockSkillLoader as any, TEST_DIR);
    expect(contexts.size).toBe(1);
    expect(contexts.has('FRONTEND_PROGRAMMER')).toBe(true);
  });

  it('should return empty map when no role plans exist', () => {
    const pipeline = createDefaultPipelineState();
    pipeline.activeRoles = ['FRONTEND_PROGRAMMER'];

    const mockSkillLoader = {
      loadSkill: (role: string) => makeMockSkill(role),
      listSkills: () => [],
    };

    const contexts = buildAllRoleContexts(pipeline, mockSkillLoader as any, TEST_DIR);
    expect(contexts.size).toBe(0);
  });
});
