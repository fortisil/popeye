/**
 * STUCK phase — safety valve when max recovery iterations exceeded.
 * Produces stuck report with last RCA, suspected paths, required human input.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';

export async function runStuck(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager } = context;
  const artifacts = [];

  try {
    // Find last RCA
    const lastRca = pipeline.artifacts
      .filter((a) => a.type === 'rca_report')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

    const stuckReport = [
      '# Stuck Report',
      '',
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Recovery Iterations:** ${pipeline.recoveryCount} / ${pipeline.maxRecoveryIterations}`,
      `**Failed Phase:** ${pipeline.failedPhase ?? 'unknown'}`,
      '',
      '## Last RCA',
      lastRca ? `See: ${lastRca.path}` : 'No RCA available',
      '',
      '## Suspected Resolution Paths',
      '1. Review the last RCA report for root cause details',
      '2. Check the failing gate conditions and resolve blockers manually',
      '3. Consider reverting to a known good state and re-running',
      '',
      '## Required Human Input',
      '- Review failing gate conditions',
      '- Determine if scope changes are needed',
      '- Decide whether to restart pipeline from a specific phase',
      '',
      '## Artifacts That May Need Update',
      ...pipeline.artifacts
        .filter((a) => a.phase === pipeline.failedPhase)
        .map((a) => `- ${a.type}: ${a.path}`),
    ].join('\n');

    const stuckEntry = artifactManager.createAndStoreText(
      'stuck_report',
      stuckReport,
      'STUCK',
    );
    artifacts.push(stuckEntry);

    pipeline.artifacts.push(...artifacts);

    // Update INDEX
    artifactManager.updateIndex(pipeline.artifacts);

    return successResult('STUCK', artifacts, 'Pipeline STUCK. Human intervention required.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('STUCK', 'Stuck report generation failed', message);
  }
}
