/**
 * Project-specific skill generation.
 * Uses a single AI call to generate tailored system prompts for active roles,
 * then writes them as .md files with YAML frontmatter to the project's skills/ dir.
 * Falls back to defaults with project-specific constraints on AI failure.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import type { PipelineRole } from '../types.js';
import type { ArtifactManager } from '../artifact-manager.js';
import { DEFAULT_SKILLS } from './defaults.js';
import { inferTechStack, getTemplateConstraints } from './role-map.js';
import type { SkillGenerationContext, SkillsGenerationMarker, TechStack } from './types.js';

// ─── Constants ──────────────────────────────────────────

const PIPELINE_VERSION = '1.0';
const MARKER_FILENAME = '.popeye-skills-generated.json';

/** Zod schema for validating AI-generated skill prompts */
const SkillPromptsResponseSchema = z.record(z.string(), z.string());

// ─── Public API ─────────────────────────────────────────

/**
 * Generate project-specific skill .md files for all active roles.
 * Skips roles that already have a .md file in the skills directory.
 * Stores the raw AI response as a skill_generation_log artifact.
 *
 * @param context - Skill generation context with project details
 * @param artifactManager - Optional artifact manager for logging
 */
export async function generateProjectSkills(
  context: SkillGenerationContext,
  artifactManager?: ArtifactManager,
): Promise<void> {
  const { activeRoles, skillsDir } = context;

  // Ensure skills directory exists
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  // Determine which roles need generation
  const rolesToGenerate = activeRoles.filter((role) => shouldGenerateSkill(skillsDir, role));

  if (rolesToGenerate.length === 0) {
    return;
  }

  // Infer tech stack
  const techStack = inferTechStack(context.language, context.snapshot, context.expandedSpec);

  // Attempt AI generation
  let aiPrompts: Record<string, string> = {};
  let aiGenerated = false;

  try {
    const prompt = buildSkillGenPrompt(context, rolesToGenerate, techStack);
    const { createClient } = await import('../../adapters/openai.js');
    const client = await createClient();

    const completion = await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 4096,
    });

    const rawResponse = completion.choices[0]?.message?.content ?? '';

    // Store raw AI response as artifact
    if (artifactManager) {
      artifactManager.createAndStoreText(
        'skill_generation_log',
        rawResponse,
        'INTAKE',
      );
    }

    aiPrompts = parseSkillPrompts(rawResponse, rolesToGenerate);
    aiGenerated = Object.keys(aiPrompts).length > 0;
  } catch {
    // AI failure is non-fatal — fall through to defaults with project constraints
    aiGenerated = false;
  }

  // Write skill files
  for (const role of rolesToGenerate) {
    const defaultSkill = DEFAULT_SKILLS[role];
    const systemPrompt = aiPrompts[role] ?? defaultSkill?.systemPrompt ?? '';
    const constraints = getTemplateConstraints(role, techStack);
    const allConstraints = [
      ...(defaultSkill?.constraints ?? []),
      ...constraints,
    ];
    // Deduplicate constraints
    const uniqueConstraints = [...new Set(allConstraints)];
    const dependsOn = defaultSkill?.depends_on ?? [];
    const requiredOutputs = defaultSkill?.required_outputs ?? [];

    const markdown = renderSkillMarkdown(
      role,
      systemPrompt,
      uniqueConstraints,
      requiredOutputs,
      dependsOn,
    );

    const filePath = join(skillsDir, `${role}.md`);
    writeFileSync(filePath, markdown, 'utf-8');
  }

  // Write generation marker
  const marker: SkillsGenerationMarker = {
    timestamp: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    activeRoles: activeRoles.map(String),
    techStack,
    aiGenerated,
  };
  writeGenerationMarker(skillsDir, marker);
}

// ─── Skip Logic ─────────────────────────────────────────

/**
 * Check if a skill file should be generated for a role.
 * Returns false if the role already has a .md file (hand-written or prior run).
 *
 * @param skillsDir - Path to the skills directory
 * @param role - Pipeline role to check
 * @returns true if the role needs a generated skill file
 */
export function shouldGenerateSkill(skillsDir: string, role: PipelineRole): boolean {
  const mdPath = join(skillsDir, `${role}.md`);
  return !existsSync(mdPath);
}

// ─── Prompt Building ────────────────────────────────────

/**
 * Build the AI prompt that requests system prompts for all roles at once.
 *
 * @param context - Generation context
 * @param roles - Roles needing prompts
 * @param techStack - Inferred tech stack
 * @returns Formatted prompt string
 */
export function buildSkillGenPrompt(
  context: SkillGenerationContext,
  roles: PipelineRole[],
  techStack: TechStack,
): string {
  const techDesc = Object.entries(techStack)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const roleDescriptions = roles.map((role) => {
    const defaultSkill = DEFAULT_SKILLS[role];
    return `- ${role}: ${defaultSkill?.systemPrompt.slice(0, 100) ?? 'Pipeline role'}...`;
  }).join('\n');

  return `You are generating project-specific skill definitions for an AI pipeline.

## Project: ${context.projectName}
## Tech Stack:
${techDesc}

## Expanded Specification (summary):
${context.expandedSpec.slice(0, 3000)}

${context.sessionGuidance ? `## Session Guidance:\n${context.sessionGuidance.slice(0, 1000)}\n` : ''}
## Roles needing prompts:
${roleDescriptions}

## Instructions:
Generate a tailored system prompt for each role listed above. Each prompt should:
1. Reference the specific tech stack (e.g., "FastAPI async endpoints" not "API endpoints")
2. Reference the project name
3. Be 3-6 sentences
4. Focus on the role's responsibilities in this specific project context

Respond with ONLY a JSON object mapping role names to their system prompts. Example:
{"BACKEND_PROGRAMMER": "You are the Backend Programmer for ProjectName. You implement..."}

JSON response:`;
}

// ─── Response Parsing ───────────────────────────────────

/**
 * Parse and validate the AI response as a JSON record of role prompts.
 * Falls back per-role: missing or invalid entries are excluded.
 *
 * @param response - Raw AI response text
 * @param expectedRoles - Roles we requested prompts for
 * @returns Validated record of role -> system prompt
 */
export function parseSkillPrompts(
  response: string,
  expectedRoles: PipelineRole[],
): Record<string, string> {
  try {
    // Extract JSON from response (may be wrapped in markdown code fences)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = SkillPromptsResponseSchema.parse(parsed);

    // Filter to only expected roles with non-empty prompts
    const result: Record<string, string> = {};
    for (const role of expectedRoles) {
      if (validated[role] && validated[role].trim().length > 10) {
        result[role] = validated[role].trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ─── Markdown Rendering ─────────────────────────────────

/**
 * Render a skill definition as a Markdown file with YAML frontmatter.
 * Format matches what the SkillLoader's parseSkillMarkdown() expects.
 *
 * @param role - Pipeline role
 * @param systemPrompt - The system prompt body
 * @param constraints - Combined constraint identifiers
 * @param requiredOutputs - Required output types
 * @param dependsOn - Upstream role dependencies
 * @returns Complete markdown string
 */
export function renderSkillMarkdown(
  role: PipelineRole,
  systemPrompt: string,
  constraints: string[],
  requiredOutputs: string[],
  dependsOn: PipelineRole[],
): string {
  const lines: string[] = [
    '---',
    `role: ${role}`,
    'version: 1.0-project',
    'required_outputs:',
    ...requiredOutputs.map((o) => `  - ${o}`),
    'constraints:',
    ...constraints.map((c) => `  - ${c}`),
  ];

  if (dependsOn.length > 0) {
    lines.push('depends_on:');
    for (const dep of dependsOn) {
      lines.push(`  - ${dep}`);
    }
  }

  lines.push('---');
  lines.push(systemPrompt);
  lines.push('');

  return lines.join('\n');
}

// ─── Marker File ────────────────────────────────────────

/**
 * Write the generation marker file to track what was generated.
 *
 * @param skillsDir - Path to the skills directory
 * @param marker - Marker data to persist
 */
export function writeGenerationMarker(
  skillsDir: string,
  marker: SkillsGenerationMarker,
): void {
  const markerPath = join(skillsDir, MARKER_FILENAME);
  writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
}
