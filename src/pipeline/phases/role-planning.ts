/**
 * ROLE_PLANNING phase — produce deterministic implementation plans by role.
 * Runs per-role: DB, BE, FE, Website, QA. Creates role_plan artifacts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PipelineRole } from '../types.js';
import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';

/** Roles that produce implementation plans */
const PLANNING_ROLES: PipelineRole[] = [
  'DB_EXPERT',
  'BACKEND_PROGRAMMER',
  'FRONTEND_PROGRAMMER',
  'WEBSITE_PROGRAMMER',
  'QA_TESTER',
];

export async function runRolePlanning(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader, projectDir } = context;
  const artifacts = [];

  try {
    // Read architecture doc for context
    const archArtifact = pipeline.artifacts.find((a) => a.type === 'architecture');
    let architectureContent = '';
    if (archArtifact) {
      const fullPath = join(projectDir, archArtifact.path);
      if (existsSync(fullPath)) {
        architectureContent = readFileSync(fullPath, 'utf-8');
      }
    }

    // Read master plan for context
    const masterPlanArtifact = pipeline.artifacts.find((a) => a.type === 'master_plan');
    let masterPlanContent = '';
    if (masterPlanArtifact) {
      const fullPath = join(projectDir, masterPlanArtifact.path);
      if (existsSync(fullPath)) {
        masterPlanContent = readFileSync(fullPath, 'utf-8');
      }
    }

    const { executePrompt } = await import('../../adapters/claude.js');

    // Generate plan for each role
    for (const role of PLANNING_ROLES) {
      // Skip website if not in active roles
      if (role === 'WEBSITE_PROGRAMMER' && !pipeline.activeRoles.includes('WEBSITE_PROGRAMMER')) {
        continue;
      }

      const skill = skillLoader.loadSkill(role);

      const planPrompt = [
        skill.systemPrompt,
        '',
        '## Master Plan',
        masterPlanContent.slice(0, 5000),
        '',
        '## Architecture',
        architectureContent.slice(0, 5000),
        '',
        '## Instructions',
        `Create your ${role} implementation plan. Include:`,
        '- Deterministic file-level outputs',
        '- Specific tasks with acceptance criteria',
        '- Dependencies on other roles',
        '- Test requirements',
      ].join('\n');

      const planResult = await executePrompt(planPrompt);
      const plan = planResult.response;

      const entry = artifactManager.createAndStoreText(
        'role_plan',
        `# ${role} Plan\n\n${plan}`,
        'ROLE_PLANNING',
      );
      artifacts.push(entry);
    }

    pipeline.artifacts.push(...artifacts);
    return successResult('ROLE_PLANNING', artifacts, `Created ${artifacts.length} role plans`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('ROLE_PLANNING', 'Role planning failed', message);
  }
}
