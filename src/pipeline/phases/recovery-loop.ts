/**
 * RECOVERY_LOOP phase — self-heal using RCA, not guesswork.
 * Routes via requires_phase_rewind_to (P1-3). Max 5 iterations.
 */

import type { PipelinePhase } from '../types.js';
import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult, triggerJournalist } from './phase-context.js';
import { buildRCAPacket } from '../packets/rca-packet-builder.js';

export async function runRecoveryLoop(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader } = context;
  const artifacts = [];

  try {
    // 1. Load debugger skill
    const debuggerSkill = skillLoader.loadSkill('DEBUGGER');

    // 2. Gather failure evidence
    const failedPhase = pipeline.failedPhase;
    const failedGateResult = failedPhase ? pipeline.gateResults[failedPhase] : undefined;
    const failedChecks = failedPhase ? pipeline.gateChecks[failedPhase] ?? [] : [];

    const failureEvidence = [
      `Failed phase: ${failedPhase ?? 'unknown'}`,
      failedGateResult
        ? `Gate blockers: ${failedGateResult.blockers.join(', ')}`
        : 'No gate result available',
      failedChecks.length > 0
        ? `Failed checks: ${failedChecks.filter((c) => c.status === 'fail').map((c) => `${c.check_type}: ${c.stderr_summary?.slice(0, 200) ?? 'no details'}`).join('; ')}`
        : 'No check failures',
    ].join('\n');

    // 3. Generate RCA via Claude with Debugger skill
    const { executePrompt } = await import('../../adapters/claude.js');
    const guidance = pipeline.sessionGuidance;
    const rcaPrompt = [
      debuggerSkill.systemPrompt,
      '',
      ...(guidance ? ['## User Guidance', guidance, ''] : []),
      '## Failure Evidence',
      failureEvidence,
      '',
      '## Instructions',
      'Produce a Root Cause Analysis:',
      '1. Precise root cause',
      '2. Origin phase',
      '3. Responsible role',
      '4. Corrective actions',
      '5. Whether phase rewind is needed (and to which phase)',
      '6. Prevention recommendation',
    ].join('\n');

    const rcaResult = await executePrompt(rcaPrompt);
    const rcaResponse = rcaResult.response;

    // 4. Build RCA packet
    const rcaPacket = buildRCAPacket({
      incidentSummary: `Gate failure at ${failedPhase ?? 'unknown'} (recovery iteration ${pipeline.recoveryCount})`,
      symptoms: failedGateResult?.blockers ?? ['Gate failed'],
      rootCause: rcaResponse.slice(0, 500),
      responsibleLayer: failedPhase ?? 'IMPLEMENTATION',
      originPhase: failedPhase ?? 'IMPLEMENTATION',
      governanceGap: 'Detected during gate evaluation',
      correctiveActions: ['See RCA report for details'],
      prevention: 'See RCA report for details',
      rewindTo: determineRewindTarget(rcaResponse, failedPhase),
    });

    // 5. Store RCA as artifacts
    const rcaJsonEntry = artifactManager.createAndStoreJson(
      'rca_report',
      rcaPacket,
      'RECOVERY_LOOP',
    );
    artifacts.push(rcaJsonEntry);

    const rcaTextEntry = artifactManager.createAndStoreText(
      'rca_report',
      `# RCA Report\n\n${rcaResponse}`,
      'RECOVERY_LOOP',
    );
    artifacts.push(rcaTextEntry);

    pipeline.artifacts.push(...artifacts);

    // 6. Journalist trigger
    await triggerJournalist('RECOVERY_LOOP', artifacts, context);

    return successResult(
      'RECOVERY_LOOP',
      artifacts,
      `RCA complete: recovery iteration ${pipeline.recoveryCount}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('RECOVERY_LOOP', 'Recovery loop failed', message);
  }
}

/** Determine rewind target from RCA response */
function determineRewindTarget(
  _rcaResponse: string,
  failedPhase: PipelinePhase | undefined,
): PipelinePhase | undefined {
  // If the failure was in production gate or audit, rewind to implementation
  if (failedPhase === 'PRODUCTION_GATE' || failedPhase === 'AUDIT') {
    return 'IMPLEMENTATION';
  }
  // If in QA, rewind to implementation
  if (failedPhase === 'QA_VALIDATION') {
    return 'IMPLEMENTATION';
  }
  // For consensus failures, rewind to the phase being validated
  if (failedPhase === 'CONSENSUS_MASTER_PLAN') return 'INTAKE';
  if (failedPhase === 'CONSENSUS_ARCHITECTURE') return 'ARCHITECTURE';
  if (failedPhase === 'CONSENSUS_ROLE_PLANS') return 'ROLE_PLANNING';

  return undefined;
}
