/**
 * REVIEW phase — verify implementation matches approved plans.
 * Detects drift via snapshot diff (P1-E).
 * v1.1: Creates Change Requests when drift is detected.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { generateRepoSnapshot, createSnapshotArtifact, diffSnapshots } from '../repo-snapshot.js';
import type { RepoSnapshot, ChangeRequest } from '../types.js';
import { buildChangeRequest, formatChangeRequest, routeChangeRequest } from '../change-request.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function runReview(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, projectDir } = context;
  const artifacts = [];
  const changeRequests: ChangeRequest[] = [];

  try {
    // 1. Generate fresh snapshot
    const currentSnapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(currentSnapshot, artifactManager, 'REVIEW');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Find role-plan-approval snapshot for drift detection
    const rolePlanSnapshots = pipeline.artifacts.filter(
      (a) => a.type === 'repo_snapshot' && a.phase === 'CONSENSUS_ROLE_PLANS',
    );
    const baselineSnapshot = rolePlanSnapshots[rolePlanSnapshots.length - 1];

    let driftReport = 'No baseline snapshot found for drift detection.';
    let hasDrift = false;

    if (baselineSnapshot) {
      const baselinePath = join(projectDir, baselineSnapshot.path);
      if (existsSync(baselinePath)) {
        try {
          const baselineData = JSON.parse(readFileSync(baselinePath, 'utf-8')) as RepoSnapshot;
          const diff = diffSnapshots(baselineData, currentSnapshot);

          if (diff.has_changes) {
            hasDrift = true;
            driftReport = [
              '## Implementation Drift Detected',
              '',
              `Files delta: ${diff.files_delta > 0 ? '+' : ''}${diff.files_delta}`,
              `Lines delta: ${diff.lines_delta > 0 ? '+' : ''}${diff.lines_delta}`,
              diff.added_configs.length > 0 ? `Added configs: ${diff.added_configs.join(', ')}` : '',
              diff.removed_configs.length > 0 ? `Removed configs: ${diff.removed_configs.join(', ')}` : '',
              diff.changed_configs.length > 0 ? `Changed configs: ${diff.changed_configs.join(', ')}` : '',
            ].filter(Boolean).join('\n');

            // v1.1: Create change requests for detected drift
            if (diff.changed_configs.length > 0) {
              const cr = buildChangeRequest({
                originPhase: 'REVIEW',
                requestedBy: 'REVIEWER',
                changeType: 'config',
                description: `Config files changed during implementation: ${diff.changed_configs.join(', ')}`,
                justification: 'Detected by snapshot diff during review phase',
                affectedArtifacts: [artifactManager.toArtifactRef(snapshotEntry)],
                affectedPhases: ['IMPLEMENTATION', 'QA_VALIDATION'],
                riskLevel: diff.changed_configs.length > 3 ? 'high' : 'medium',
              });
              changeRequests.push(cr);
            }

            if (Math.abs(diff.lines_delta) > 1000) {
              const cr = buildChangeRequest({
                originPhase: 'REVIEW',
                requestedBy: 'REVIEWER',
                changeType: 'scope',
                description: `Significant scope drift detected: ${diff.lines_delta > 0 ? '+' : ''}${diff.lines_delta} lines`,
                justification: 'Large line delta suggests scope changes beyond approved plans',
                affectedArtifacts: [artifactManager.toArtifactRef(snapshotEntry)],
                affectedPhases: ['CONSENSUS_MASTER_PLAN', 'IMPLEMENTATION'],
                riskLevel: 'high',
              });
              changeRequests.push(cr);
            }
          } else {
            driftReport = 'No drift detected between approved plans and implementation.';
          }
        } catch {
          driftReport = 'Failed to parse baseline snapshot for drift detection.';
        }
      }
    }

    // 3. Store change requests as artifacts and register in pipeline state
    for (const cr of changeRequests) {
      const crEntry = artifactManager.createAndStoreText(
        'change_request',
        formatChangeRequest(cr),
        'REVIEW',
      );
      artifacts.push(crEntry);

      // Register CR in pipeline state for orchestrator routing
      if (!pipeline.pendingChangeRequests) {
        pipeline.pendingChangeRequests = [];
      }
      pipeline.pendingChangeRequests.push({
        cr_id: cr.cr_id,
        change_type: cr.change_type,
        target_phase: routeChangeRequest(cr),
        status: 'proposed',
      });
    }

    // 4. Create review decision artifact
    const reviewDoc = [
      '# Review Decision',
      '',
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Phase:** REVIEW`,
      `**Drift Detected:** ${hasDrift ? 'Yes' : 'No'}`,
      `**Change Requests:** ${changeRequests.length}`,
      '',
      '## Drift Analysis',
      driftReport,
      '',
      changeRequests.length > 0 ? '## Change Requests\n' + changeRequests.map((cr) => `- ${cr.cr_id}: ${cr.description}`).join('\n') : '',
      '',
      '## Plan Alignment',
      'Implementation reviewed against approved role plans.',
      '',
      '## Decision',
      hasDrift && changeRequests.length > 0
        ? 'Review flagged drift — change requests created for consensus review.'
        : 'Review completed. See drift analysis above.',
    ].join('\n');

    const reviewEntry = artifactManager.createAndStoreText(
      'review_decision',
      reviewDoc,
      'REVIEW',
    );
    artifacts.push(reviewEntry);

    pipeline.artifacts.push(...artifacts);
    return successResult('REVIEW', artifacts, `Review complete. ${changeRequests.length} change requests.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('REVIEW', 'Review failed', message);
  }
}
