/**
 * INTAKE phase — normalize user prompt into structured Master Plan v1.
 * Reuses expandIdea() and createPlan() from workflow.
 * v1.1: Creates constitution artifact and stores hash.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';
import { createConstitutionArtifact, computeConstitutionHash } from '../constitution.js';

export async function runIntake(context: PhaseContext): Promise<PhaseResult> {
  const { projectDir, pipeline, artifactManager } = context;
  const artifacts = [];

  try {
    // 1. Generate repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'INTAKE');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Create constitution artifact and store hash
    const constitutionEntry = createConstitutionArtifact(projectDir, artifactManager);
    if (constitutionEntry) {
      artifacts.push(constitutionEntry);
    }
    pipeline.constitutionHash = computeConstitutionHash(projectDir);

    // 3. Store additional_context artifact if session guidance provided
    const guidance = pipeline.sessionGuidance ?? '';
    if (guidance) {
      const ctxEntry = artifactManager.createAndStoreText(
        'additional_context',
        guidance,
        'INTAKE',
      );
      artifacts.push(ctxEntry);
    }

    // 4. Expand idea using existing workflow
    const { expandIdea, createPlan } = await import('../../workflow/plan-mode.js');
    const expandedIdea = await expandIdea(
      context.state.specification ?? context.state.idea ?? '',
      context.state.language,
    );

    // 5. Create master plan — prepend guidance so planner sees constraints first
    const planInput = guidance
      ? `${guidance}\n\n---\n\n${expandedIdea}`
      : expandedIdea;
    const plan = await createPlan(planInput, '', context.state.language);

    // 6. Store master plan as artifact
    const planEntry = artifactManager.createAndStoreText(
      'master_plan',
      plan,
      'INTAKE',
    );
    artifacts.push(planEntry);
    pipeline.artifacts.push(...artifacts);

    return successResult('INTAKE', artifacts, 'Master Plan v1 created');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during intake';
    return failureResult('INTAKE', 'Failed to create master plan', message);
  }
}
