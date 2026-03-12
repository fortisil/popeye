/**
 * RECOVERY_LOOP phase — self-heal using RCA, not guesswork.
 * Routes via requires_phase_rewind_to (P1-3). Max 5 iterations.
 * v2.1: Extracts reviewer feedback from consensus failures and
 *       builds structured revision directive for sessionGuidance.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import type { PipelinePhase, ConsensusPacket, GateCheckResult } from '../types.js';
import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult, triggerJournalist } from './phase-context.js';
import { buildRCAPacket } from '../packets/rca-packet-builder.js';

export async function runRecoveryLoop(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader, skillUsageRegistry } = context;
  const artifacts = [];

  try {
    // 1. Load debugger skill with metadata
    const { definition: debuggerSkill, meta: debuggerMeta } = skillLoader.loadSkillWithMeta('DEBUGGER');

    // 2. Gather failure evidence
    const failedPhase = pipeline.failedPhase;
    const failedGateResult = failedPhase ? pipeline.gateResults[failedPhase] : undefined;
    const failedChecks = failedPhase ? pipeline.gateChecks[failedPhase] ?? [] : [];

    // 2a. Detect missing module errors in stderr — invalidate install marker
    const combinedStderr = failedChecks
      .filter((c) => c.status === 'fail')
      .map((c) => c.stderr_summary ?? '')
      .join('\n');
    const missingModule = /Cannot find module|ModuleNotFoundError|Failed to resolve import/
      .test(combinedStderr);
    if (missingModule) {
      try {
        const markerPath = join(context.projectDir, '.popeye', 'install-marker.json');
        if (existsSync(markerPath)) unlinkSync(markerPath);
      } catch { /* non-fatal */ }
    }

    const failureEvidence = [
      `Failed phase: ${failedPhase ?? 'unknown'}`,
      failedGateResult
        ? `Gate blockers: ${failedGateResult.blockers.join(', ')}`
        : 'No gate result available',
      failedChecks.length > 0
        ? `Failed checks: ${failedChecks.filter((c) => c.status === 'fail').map((c) => `${c.check_type}: ${c.stderr_summary?.slice(0, 200) ?? 'no details'}`).join('; ')}`
        : 'No check failures',
    ].join('\n');

    // 2b. For consensus failures, build revision directive from reviewer feedback
    if (failedPhase?.startsWith('CONSENSUS_')) {
      const directive = buildRevisionDirective(pipeline, failedPhase);
      if (directive) {
        const existing = pipeline.sessionGuidance ?? '';
        const marker = '--- REVISION DIRECTIVE ---';
        const base = existing.includes(marker)
          ? existing.slice(0, existing.indexOf(marker)).trim()
          : existing;
        pipeline.sessionGuidance = [base, '', marker, directive.slice(0, 3000)].join('\n').trim();
      }
    }

    // 2c. For QA/build failures, build a targeted fix directive from test stderr
    // so the implementation phase knows exactly what to fix on rewind.
    if (failedPhase === 'QA_VALIDATION' || failedPhase === 'PRODUCTION_GATE'
        || failedPhase === 'IMPLEMENTATION') {
      const failedCheckDetails = failedChecks
        .filter((c) => c.status === 'fail')
        .map((c) => [
          `**${c.check_type}** (exit code ${c.exit_code}):`,
          `Command: \`${c.command}\``,
          c.stderr_summary ? c.stderr_summary.slice(0, 500) : 'No stderr captured',
        ].join('\n'))
        .join('\n\n');

      if (failedCheckDetails) {
        const existing = pipeline.sessionGuidance ?? '';
        const marker = '--- QA FIX DIRECTIVE ---';
        const base = existing.includes(marker)
          ? existing.slice(0, existing.indexOf(marker)).trim()
          : existing;
        const directive = [
          `Fix the following failures (recovery iteration ${pipeline.recoveryCount}):`,
          '',
          failedCheckDetails,
          '',
          'Apply targeted fixes only. Do not rewrite code that already works.',
        ].join('\n');
        pipeline.sessionGuidance = [base, '', marker, directive.slice(0, 3000)]
          .join('\n').trim();
      }
    }

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

    // Record skill usage — debugger skill injected into RCA prompt
    skillUsageRegistry.record('DEBUGGER', 'RECOVERY_LOOP', 'system_prompt', debuggerMeta.source, debuggerMeta.version);

    // 3b. Build recovery micro-plan from RCA + stderr
    const microPlan = buildRecoveryMicroPlan(rcaResponse, failedChecks, pipeline.recoveryCount);

    // 3c. Store micro-plan as artifact for traceability
    const microPlanEntry = artifactManager.createAndStoreText(
      'recovery_fix_plan',
      microPlan.plan,
      'RECOVERY_LOOP',
    );
    artifacts.push(microPlanEntry);

    // 3d. Inject micro-plan into sessionGuidance (replaces any prior fix directive)
    {
      const existing = pipeline.sessionGuidance ?? '';
      const markers = ['--- QA FIX DIRECTIVE ---', '--- RECOVERY FIX PLAN ---'];
      let base = existing;
      for (const m of markers) {
        if (base.includes(m)) base = base.slice(0, base.indexOf(m)).trim();
      }
      pipeline.sessionGuidance = [
        base, '', '--- RECOVERY FIX PLAN ---', microPlan.plan.slice(0, 3000),
      ].join('\n').trim();
    }

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
  if (failedPhase === 'PRODUCTION_GATE' || failedPhase === 'AUDIT') {
    return 'IMPLEMENTATION';
  }
  if (failedPhase === 'QA_VALIDATION') {
    return 'IMPLEMENTATION';
  }
  if (failedPhase === 'CONSENSUS_MASTER_PLAN') return 'INTAKE';
  if (failedPhase === 'CONSENSUS_ARCHITECTURE') return 'ARCHITECTURE';
  if (failedPhase === 'CONSENSUS_ROLE_PLANS') return 'ROLE_PLANNING';

  return undefined;
}

/**
 * Extract reviewer feedback from the latest consensus artifact and
 * build a structured revision directive for the planner.
 *
 * Uses Set<string> for dedup. Output is capped at 3000 chars by caller.
 */
function buildRevisionDirective(
  pipeline: { artifacts: Array<{ type: string; content?: unknown }> },
  failedPhase: string,
): string | null {
  // Find the latest consensus artifact for this phase
  const consensusArtifacts = pipeline.artifacts.filter(
    (a) => a.type === 'consensus' && a.content,
  );
  if (consensusArtifacts.length === 0) return null;

  const latest = consensusArtifacts[consensusArtifacts.length - 1];
  const packet = latest.content as ConsensusPacket | undefined;
  if (!packet?.reviewer_votes) return null;

  const blockers = new Set<string>();
  const required = new Set<string>();
  const suggestions = new Set<string>();

  for (const vote of packet.reviewer_votes) {
    for (const issue of vote.blocking_issues) {
      const trimmed = issue.trim();
      if (trimmed) blockers.add(trimmed);
    }
    for (const change of (vote.required_changes ?? [])) {
      const trimmed = change.trim();
      if (trimmed) required.add(trimmed);
    }
    for (const suggestion of vote.suggestions) {
      const trimmed = suggestion.trim();
      if (trimmed) suggestions.add(trimmed);
    }
  }

  if (blockers.size === 0 && required.size === 0 && suggestions.size === 0) return null;

  const lines: string[] = [
    `Revise the plan to address reviewer feedback from ${failedPhase}:`,
    '',
  ];

  if (blockers.size > 0) {
    lines.push('BLOCKING (must fix):');
    for (const b of blockers) lines.push(`- ${b}`);
    lines.push('');
  }

  if (required.size > 0) {
    lines.push('REQUIRED CHANGES:');
    for (const r of required) lines.push(`- ${r}`);
    lines.push('');
  }

  if (suggestions.size > 0) {
    lines.push('SUGGESTIONS:');
    for (const s of suggestions) lines.push(`- ${s}`);
    lines.push('');
  }

  lines.push('Keep existing plan structure. Apply targeted revisions only.');

  return lines.join('\n');
}

/**
 * Build a structured micro-fix plan from RCA + test failures.
 * Returns the plan text and a risk assessment for consensus gating.
 *
 * Heuristics:
 *   - Low risk (skip consensus): <=3 files, no schema/dep/config changes
 *   - Medium risk (consensus): schema, dependency, or build config changes
 *   - High risk (consensus): API changes, >5 files
 */
function buildRecoveryMicroPlan(
  rcaResponse: string,
  failedChecks: GateCheckResult[],
  recoveryCount: number,
): { plan: string; needsConsensus: boolean; riskLevel: 'low' | 'medium' | 'high' } {
  const stderrLines = failedChecks
    .filter((c) => c.status === 'fail')
    .map((c) => c.stderr_summary ?? '')
    .join('\n');

  // Combine RCA + stderr for signal extraction
  const combined = rcaResponse + '\n' + stderrLines;
  const combinedLower = combined.toLowerCase();

  const touchesSchema = /schema|migration|prisma|drizzle|typeorm|knex/.test(combinedLower);
  const touchesDeps = /package\.json|requirements\.txt|dependency|npm install|pip install/
    .test(combinedLower);
  const touchesConfig =
    /tsconfig\.json|vite\.config|jest\.config|vitest\.config|docker-compose|\.github\/workflows/
    .test(combinedLower);
  const touchesApi = /api route|endpoint|public api|breaking change/.test(combinedLower);

  // Extract file paths from BOTH RCA and stderr
  const mentionedFiles = combined.match(/[\w/.-]+\.(ts|tsx|js|jsx|py|sql|prisma)/gi) ?? [];
  const uniqueFiles = [...new Set(mentionedFiles)];

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (touchesApi || uniqueFiles.length > 5) riskLevel = 'high';
  else if (touchesSchema || touchesDeps || touchesConfig) riskLevel = 'medium';

  // Only require consensus for medium+ risk on second+ attempt
  const needsConsensus = riskLevel !== 'low' && recoveryCount >= 2;

  const plan = [
    `# Recovery Fix Plan (iteration ${recoveryCount})`,
    '',
    `**Risk level:** ${riskLevel}`,
    `**Files likely affected:** ${uniqueFiles.length > 0 ? uniqueFiles.join(', ') : 'unknown'}`,
    `**Consensus required:** ${needsConsensus ? 'yes' : 'no'}`,
    '',
    '## Root Cause Summary',
    rcaResponse.slice(0, 800),
    '',
    '## Test Failures',
    stderrLines.slice(0, 1000) || 'No stderr captured',
    '',
    '## Fix Checklist',
    '- [ ] Address root cause identified above',
    '- [ ] Fix failing test assertions',
    '- [ ] Verify no regressions in passing tests',
    touchesSchema ? '- [ ] Review schema/migration changes for correctness' : '',
    touchesDeps ? '- [ ] Verify dependency changes are necessary and compatible' : '',
  ].filter(Boolean).join('\n');

  return { plan, needsConsensus, riskLevel };
}
