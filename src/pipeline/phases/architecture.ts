/**
 * ARCHITECTURE phase — create system architecture + explicit contracts.
 * Uses ARCHITECT skill via executePrompt().
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';

export async function runArchitecture(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Load architect skill
    const architectSkill = skillLoader.loadSkill('ARCHITECT');

    // 2. Read approved master plan
    const masterPlanArtifact = pipeline.artifacts.find((a) => a.type === 'master_plan');
    let masterPlanContent = '';
    if (masterPlanArtifact) {
      const fullPath = join(projectDir, masterPlanArtifact.path);
      if (existsSync(fullPath)) {
        masterPlanContent = readFileSync(fullPath, 'utf-8');
      }
    }

    // 3. Generate architecture via Claude
    const { executePrompt } = await import('../../adapters/claude.js');
    const architecturePrompt = [
      architectSkill.systemPrompt,
      '',
      '## Master Plan',
      masterPlanContent,
      '',
      '## Instructions',
      'Create the system architecture document covering:',
      '- System topology & boundaries',
      '- API contracts (endpoints, methods, request/response)',
      '- Auth model and security assumptions',
      '- Data ownership boundaries',
      '- Env var list',
      '- Repo layout blueprint',
      '- Error handling strategy',
    ].join('\n');

    const result = await executePrompt(architecturePrompt);
    const architectureDoc = result.response;

    // 4. Store architecture artifact
    const archEntry = artifactManager.createAndStoreText(
      'architecture',
      architectureDoc,
      'ARCHITECTURE',
    );
    artifacts.push(archEntry);

    // 5. Generate fresh repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'ARCHITECTURE');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    pipeline.artifacts.push(...artifacts);
    return successResult('ARCHITECTURE', artifacts, 'Architecture document created');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('ARCHITECTURE', 'Architecture creation failed', message);
  }
}
