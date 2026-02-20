/**
 * Role Execution Adapter — bridges pipeline role planning
 * with the existing runExecutionMode().
 *
 * Builds role-specific execution contexts by combining skill prompts
 * with role plan constraints, then injects them as systemPrompt
 * into ClaudeExecuteOptions for prompt-based enforcement.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  PipelineRole,
  PipelineState,
  ArtifactEntry,
} from './types.js';
import type { SkillLoader, SkillDefinition } from './skill-loader.js';

// ─── Types ───────────────────────────────────────────────

export interface RoleExecutionContext {
  role: PipelineRole;
  systemPrompt: string;
  allowedPaths: string[];
  forbiddenPatterns: string[];
  taskScope: string;
}

export interface ClaudeExecuteOptions {
  projectDir: string;
  systemPrompt?: string;
  [key: string]: unknown;
}

// ─── Context Builder ─────────────────────────────────────

/**
 * Build a role-specific execution context from a skill definition and role plan artifact.
 *
 * Args:
 *   role: The pipeline role to build context for.
 *   skill: The skill definition loaded by SkillLoader.
 *   rolePlan: The approved role plan artifact entry.
 *   projectDir: Root project directory.
 *
 * Returns:
 *   RoleExecutionContext with system prompt, allowed paths, and task scope.
 */
export function buildRoleExecutionContext(
  role: PipelineRole,
  skill: SkillDefinition,
  rolePlan: ArtifactEntry,
  projectDir: string,
): RoleExecutionContext {
  // Read role plan content
  const planPath = join(projectDir, rolePlan.path);
  let planContent = '';
  if (existsSync(planPath)) {
    planContent = readFileSync(planPath, 'utf-8');
  }

  // Extract task scope from role plan
  const taskScope = extractTaskScope(planContent);
  const allowedPaths = extractAllowedPaths(planContent, role);
  const forbiddenPatterns = extractForbiddenPatterns(role);

  // Build system prompt combining skill + role constraints
  const systemPrompt = buildRoleSystemPrompt(role, skill, planContent, forbiddenPatterns);

  return {
    role,
    systemPrompt,
    allowedPaths,
    forbiddenPatterns,
    taskScope,
  };
}

/**
 * Inject role context into ClaudeExecuteOptions by setting the systemPrompt field.
 *
 * Args:
 *   context: The role execution context.
 *   options: The execution options to augment.
 *
 * Returns:
 *   Modified options with systemPrompt injected.
 */
export function executeWithRoleContext(
  context: RoleExecutionContext,
  options: ClaudeExecuteOptions,
): ClaudeExecuteOptions {
  return {
    ...options,
    systemPrompt: context.systemPrompt,
  };
}

// ─── Role-to-Plan Mapping ────────────────────────────────

/**
 * Find role plan artifacts for each active role in the pipeline.
 *
 * Args:
 *   pipeline: Current pipeline state.
 *   skillLoader: Skill loader instance.
 *   projectDir: Root project directory.
 *
 * Returns:
 *   Map of role to RoleExecutionContext.
 */
export function buildAllRoleContexts(
  pipeline: PipelineState,
  skillLoader: SkillLoader,
  projectDir: string,
): Map<PipelineRole, RoleExecutionContext> {
  const contexts = new Map<PipelineRole, RoleExecutionContext>();

  // Find all role_plan artifacts
  const rolePlanArtifacts = pipeline.artifacts.filter((a) => a.type === 'role_plan');

  for (const rolePlan of rolePlanArtifacts) {
    // Determine which role this plan belongs to by checking plan content
    const planPath = join(projectDir, rolePlan.path);
    if (!existsSync(planPath)) continue;

    const content = readFileSync(planPath, 'utf-8');
    const role = detectRoleFromPlan(content, pipeline.activeRoles);
    if (!role) continue;

    const skill = skillLoader.loadSkill(role);
    contexts.set(role, buildRoleExecutionContext(role, skill, rolePlan, projectDir));
  }

  return contexts;
}

// ─── Internal Helpers ────────────────────────────────────

/** Extract task scope description from role plan content */
function extractTaskScope(planContent: string): string {
  // Look for "## Tasks" or "## Responsibilities" section
  const taskMatch = planContent.match(
    /#+\s*(?:Tasks?|Responsibilities?|Work\s+Items?)\s*\n([\s\S]*?)(?=\n#+\s|\n---|\s*$)/i,
  );
  if (taskMatch) {
    return taskMatch[1].trim().slice(0, 2000);
  }
  // Fallback: first 500 chars
  return planContent.slice(0, 500).trim();
}

/** Extract allowed file paths from role plan */
function extractAllowedPaths(planContent: string, role: PipelineRole): string[] {
  // Default paths based on role
  const roleDefaults: Partial<Record<PipelineRole, string[]>> = {
    FRONTEND_PROGRAMMER: ['src/', 'app/', 'pages/', 'components/', 'styles/', 'public/'],
    BACKEND_PROGRAMMER: ['src/', 'server/', 'api/', 'lib/', 'db/', 'prisma/'],
    WEBSITE_PROGRAMMER: ['apps/website/', 'src/', 'app/', 'pages/', 'public/'],
    DB_EXPERT: ['prisma/', 'migrations/', 'db/', 'alembic/', 'models/'],
    QA_TESTER: ['tests/', '__tests__/', 'test/', 'spec/'],
    UI_UX_SPECIALIST: ['src/', 'app/', 'styles/', 'components/'],
  };

  // Extract explicit file references from plan
  const fileRefs = planContent.match(/(?:src|app|pages|lib|server|api|tests?)\/[\w\-./]+/g) ?? [];
  const defaults = roleDefaults[role] ?? [];

  return [...new Set([...defaults, ...fileRefs])];
}

/** Get forbidden patterns based on role boundaries */
function extractForbiddenPatterns(role: PipelineRole): string[] {
  const roleForbidden: Partial<Record<PipelineRole, string[]>> = {
    FRONTEND_PROGRAMMER: ['server/', 'api/', 'prisma/', 'migrations/', 'alembic/'],
    BACKEND_PROGRAMMER: ['components/', 'styles/', 'public/assets/'],
    WEBSITE_PROGRAMMER: ['server/', 'api/', 'prisma/', 'migrations/'],
    DB_EXPERT: ['components/', 'styles/', 'public/', 'pages/'],
    QA_TESTER: [], // QA can touch anything
  };

  return roleForbidden[role] ?? [];
}

/** Build the full system prompt for a role */
function buildRoleSystemPrompt(
  role: PipelineRole,
  skill: SkillDefinition,
  planContent: string,
  forbiddenPatterns: string[],
): string {
  const lines = [
    `# Role: ${role}`,
    '',
    '## Skill System Prompt',
    skill.systemPrompt,
    '',
    '## Your Approved Role Plan',
    planContent.slice(0, 4000),
    '',
    '## Constraints',
    ...skill.constraints.map((c) => `- ${c}`),
  ];

  if (forbiddenPatterns.length > 0) {
    lines.push(
      '',
      '## Forbidden Paths (Do NOT modify these)',
      ...forbiddenPatterns.map((p) => `- ${p}`),
    );
  }

  lines.push(
    '',
    '## Rules',
    '- Stay within your role boundaries',
    '- Only modify files in your allowed paths',
    '- If you need changes outside your scope, flag them as dependencies',
    '- Follow the approved plan — do not add unplanned features',
  );

  return lines.join('\n');
}

/** Detect which role a plan belongs to by matching role names in content */
function detectRoleFromPlan(
  content: string,
  activeRoles: PipelineRole[],
): PipelineRole | undefined {
  const uppercaseContent = content.toUpperCase();
  for (const role of activeRoles) {
    if (uppercaseContent.includes(role)) {
      return role;
    }
  }
  return undefined;
}
