/**
 * INTAKE phase — normalize user prompt into structured Master Plan v1.
 * Reuses expandIdea() and createPlan() from workflow.
 * v1.1: Creates constitution artifact and stores hash.
 * v1.2: Generates project-specific skills and constitution.
 */

import { join } from 'node:path';

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';
import { createConstitutionArtifact, computeConstitutionHash } from '../constitution.js';
import { getActiveRoles, inferTechStack } from '../skills/role-map.js';
import { generateProjectSkills } from '../skills/generator.js';
import { generateConstitution } from '../skills/constitution-generator.js';
import type { OutputLanguage } from '../../types/project.js';

export async function runIntake(context: PhaseContext): Promise<PhaseResult> {
  const { projectDir, pipeline, artifactManager } = context;
  const artifacts = [];

  try {
    // 1. Generate repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'INTAKE');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Store additional_context artifact if session guidance provided
    const guidance = pipeline.sessionGuidance ?? '';
    if (guidance) {
      const ctxEntry = artifactManager.createAndStoreText(
        'additional_context',
        guidance,
        'INTAKE',
      );
      artifacts.push(ctxEntry);
    }

    // 3. Push pre-AI artifacts to pipeline state now (survives if AI calls fail below)
    pipeline.artifacts.push(...artifacts);

    // 4. Expand idea using existing workflow
    const { expandIdea, createPlan } = await import('../../workflow/plan-mode.js');
    const expandedIdea = await expandIdea(
      context.state.specification ?? context.state.idea ?? '',
      context.state.language,
    );

    // 5. Determine active roles
    const language = context.state.language as OutputLanguage;
    pipeline.activeRoles = getActiveRoles(language);

    // 6-8. Generate project-specific skills and constitution (non-fatal)
    const skillsDir = join(projectDir, 'skills');
    try {
      const projectName = context.state.name ?? 'Project';

      await generateProjectSkills(
        {
          language,
          expandedSpec: expandedIdea,
          snapshot,
          sessionGuidance: guidance || undefined,
          activeRoles: pipeline.activeRoles,
          skillsDir,
          projectName,
        },
        artifactManager,
      );

      const techStack = inferTechStack(language, snapshot, expandedIdea);
      generateConstitution({
        language,
        projectName,
        techStack,
        expandedSpec: expandedIdea,
        sessionGuidance: guidance || undefined,
        skillsDir,
      });

      // Clear skill loader cache so it picks up new .md files
      context.skillLoader.clearCache();
    } catch {
      // Skill/constitution generation is non-fatal — pipeline continues with defaults
    }

    // 9. Create constitution artifact and store hash (AFTER generation)
    const constitutionEntry = createConstitutionArtifact(projectDir, artifactManager);
    if (constitutionEntry) {
      artifacts.push(constitutionEntry);
      pipeline.artifacts.push(constitutionEntry);
    }
    pipeline.constitutionHash = computeConstitutionHash(projectDir);

    // 10. Create master plan — prepend guidance so planner sees constraints first
    // Detect revision directive and instruct plan to include "Addressed Reviewer Feedback" section
    const isRevision = guidance.includes('--- REVISION DIRECTIVE ---');
    const planInput = isRevision
      ? `${guidance}\n\nIMPORTANT: Include a "## Addressed Reviewer Feedback" section mapping each Required Change to the concrete revision made.\n\n${expandedIdea}`
      : guidance
        ? `${guidance}\n\n---\n\n${expandedIdea}`
        : expandedIdea;
    const plan = await createPlan(planInput, '', context.state.language);

    // 11. Store master plan as artifact
    const planEntry = artifactManager.createAndStoreText(
      'master_plan',
      plan,
      'INTAKE',
    );
    artifacts.push(planEntry);
    pipeline.artifacts.push(planEntry);

    return successResult('INTAKE', artifacts, 'Master Plan v1 created');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during intake';
    return failureResult('INTAKE', 'Failed to create master plan', message);
  }
}
