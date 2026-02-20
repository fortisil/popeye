/**
 * IMPLEMENTATION phase — build the system according to approved plans.
 * Reuses runExecutionMode() from existing workflow.
 * v1.1: Injects role-specific execution contexts via role-execution-adapter.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';
import { buildAllRoleContexts } from '../role-execution-adapter.js';

export async function runImplementation(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, projectDir, skillLoader } = context;
  const artifacts = [];

  try {
    // v1.1: Build role contexts for execution
    const roleContexts = buildAllRoleContexts(pipeline, skillLoader, projectDir);

    // Build combined role context for system prompt injection
    let combinedRolePrompt = '';
    if (roleContexts.size > 0) {
      const contextEntries = Array.from(roleContexts.entries());
      combinedRolePrompt = contextEntries
        .map(([role, ctx]) => `## ${role}\nScope: ${ctx.taskScope.slice(0, 500)}`)
        .join('\n\n');
    }

    // Merge session guidance with role prompt so execution sees user intent
    const guidance = pipeline.sessionGuidance;
    const systemPrompt = [combinedRolePrompt, guidance].filter(Boolean).join('\n\n') || undefined;

    // Run existing execution mode with optional role context + guidance
    const { runExecutionMode } = await import('../../workflow/execution-mode.js');
    await runExecutionMode({
      projectDir,
      ...(systemPrompt ? { systemPrompt } : {}),
    });

    // Generate post-implementation repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'IMPLEMENTATION');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    pipeline.artifacts.push(...artifacts);
    return successResult('IMPLEMENTATION', artifacts, `Implementation complete. ${roleContexts.size} roles active.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('IMPLEMENTATION', 'Implementation failed', message);
  }
}
