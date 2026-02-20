/**
 * DONE phase — finalize documentation + release packaging.
 * RELEASE_MANAGER creates release/deployment/rollback artifacts.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';

export async function runDone(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader } = context;
  const artifacts = [];

  try {
    // 1. Load release manager skill
    const rmSkill = skillLoader.loadSkill('RELEASE_MANAGER');

    // 2. Generate release notes
    const { executePrompt } = await import('../../adapters/claude.js');

    const releasePrompt = [
      rmSkill.systemPrompt,
      '',
      '## Instructions',
      'Generate release notes, deployment instructions, and rollback plan.',
      'Base this on the artifacts produced during the pipeline.',
      '',
      '## Artifacts Summary',
      ...pipeline.artifacts.map((a) => `- [${a.type}] v${a.version}: ${a.path}`),
    ].join('\n');

    const releaseResult = await executePrompt(releasePrompt);
    const releaseResponse = releaseResult.response;

    // 3. Create release notes artifact
    const releaseEntry = artifactManager.createAndStoreText(
      'release_notes',
      releaseResponse,
      'DONE',
    );
    artifacts.push(releaseEntry);

    // 4. Create deployment instructions artifact
    const deployEntry = artifactManager.createAndStoreText(
      'deployment',
      `# Deployment Instructions\n\n${releaseResponse.includes('deployment') ? 'See release notes.' : 'Standard deployment procedure.'}`,
      'DONE',
    );
    artifacts.push(deployEntry);

    // 5. Create rollback plan artifact
    const rollbackEntry = artifactManager.createAndStoreText(
      'rollback',
      `# Rollback Plan\n\nRevert to previous version if issues detected post-deploy.`,
      'DONE',
    );
    artifacts.push(rollbackEntry);

    pipeline.artifacts.push(...artifacts);

    // 6. Final INDEX.md update
    artifactManager.updateIndex(pipeline.artifacts);

    return successResult('DONE', artifacts, 'Pipeline complete. Release artifacts created.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('DONE', 'Release packaging failed', message);
  }
}
