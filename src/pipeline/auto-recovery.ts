/**
 * Auto-recovery via arbitrator strategic guidance (v2.6.0).
 *
 * When the pipeline exhausts its recovery budget, this module consults
 * the arbitrator for a strategic perspective before entering STUCK.
 * The arbitrator sees the full failure history and identifies patterns,
 * not individual failures.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import logging from 'node:console';

import type { PipelineState, ArtifactEntry } from './types.js';
import type { ArtifactManager } from './artifact-manager.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { queryProvider } from './consensus/arbitrator-query.js';
import { getModelForProvider } from './consensus/consensus-runner.js';

const logger = logging;

// ─── Types ───────────────────────────────────────────────

interface FailureContext {
  failedPhase: string;
  recoveryCount: number;
  maxIterations: number;
  blockers: string[];
  checkFailures: string[];
  transitionSequence: string[];
  rcaSummaries: string[];
  recoveryPlanSummaries: string[];
  sessionGuidance: string;
}

export interface AutoRecoveryResult {
  success: boolean;
  guidance: string | null;
  artifact: ArtifactEntry | null;
}

interface AutoRecoveryOptions {
  pipeline: PipelineState;
  projectDir: string;
  artifactManager: ArtifactManager;
  consensusConfig?: Partial<ConsensusConfig>;
}

// ─── AUTO-RECOVERY GUIDANCE marker ───────────────────────

const AUTO_RECOVERY_MARKER = '--- AUTO-RECOVERY GUIDANCE ---';

// ─── Failure Context Builder ─────────────────────────────

/**
 * Extract structured failure evidence from pipeline state.
 * All file reads are wrapped in try/catch with placeholder text.
 */
export function buildFailureContext(
  pipeline: PipelineState,
  projectDir: string,
): FailureContext {
  const failedPhase = pipeline.failedPhase ?? 'unknown';
  const recoveryCount = pipeline.recoveryCount;
  const maxIterations = pipeline.maxRecoveryIterations;

  // Gate blockers
  const gateResult = pipeline.failedPhase
    ? pipeline.gateResults[pipeline.failedPhase]
    : undefined;
  const blockers = gateResult?.blockers ?? [];

  // Check failures (command + stderr excerpt)
  const checkResults = pipeline.failedPhase
    ? pipeline.gateChecks[pipeline.failedPhase] ?? []
    : [];
  const checkFailures = checkResults
    .filter((c) => c.status === 'fail')
    .map((c) => `${c.check_type}: cmd="${c.command}" stderr="${(c.stderr_summary ?? '').slice(0, 200)}"`)
    .slice(0, 5);

  // Phase transition sequence — last 10 entries from gateResults
  const transitionSequence = Object.entries(pipeline.gateResults)
    .map(([phase, result]) => {
      const topBlocker = result.blockers?.[0] ?? 'none';
      return `${phase}: ${result.pass ? 'PASS' : 'FAIL'} (${topBlocker})`;
    })
    .slice(-10);

  // Last 3 RCA report summaries (read text artifacts from disk)
  const rcaArtifacts = pipeline.artifacts
    .filter((a) => a.type === 'rca_report' && a.content_type === 'markdown')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 3);
  const rcaSummaries = rcaArtifacts.map((a) => readArtifactSummary(projectDir, a.path, 500));

  // Last 2 recovery fix plan summaries
  const fixPlanArtifacts = pipeline.artifacts
    .filter((a) => a.type === 'recovery_fix_plan')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 2);
  const recoveryPlanSummaries = fixPlanArtifacts.map((a) => readArtifactSummary(projectDir, a.path, 500));

  const sessionGuidance = pipeline.sessionGuidance ?? '';

  return {
    failedPhase,
    recoveryCount,
    maxIterations,
    blockers,
    checkFailures,
    transitionSequence,
    rcaSummaries,
    recoveryPlanSummaries,
    sessionGuidance,
  };
}

// ─── Prompt Builder ──────────────────────────────────────

/**
 * Build the strategic recovery prompt for the arbitrator.
 * Focuses on pattern analysis, not individual fixes.
 */
export function buildAutoRecoveryPrompt(ctx: FailureContext): string {
  const lines: string[] = [
    '# Strategic Recovery Analysis',
    '',
    `The pipeline failed at ${ctx.failedPhase} after ${ctx.recoveryCount}/${ctx.maxIterations} recovery attempts.`,
    'All tactical fixes have been tried. You need to identify the PATTERN, not the individual failure.',
    '',
    '## Failure Timeline',
    ...ctx.transitionSequence.map((s) => `- ${s}`),
    '',
    '## Current Blockers',
    ...ctx.blockers.map((b) => `- ${b}`),
    ...(ctx.checkFailures.length > 0
      ? ['', '## Check Failures', ...ctx.checkFailures.map((f) => `- ${f}`)]
      : []),
    '',
    '## What Was Already Tried',
  ];

  if (ctx.rcaSummaries.length > 0) {
    lines.push('### RCA Reports');
    ctx.rcaSummaries.forEach((s, i) => {
      lines.push(`#### RCA ${i + 1}`, s, '');
    });
  }

  if (ctx.recoveryPlanSummaries.length > 0) {
    lines.push('### Recovery Fix Plans');
    ctx.recoveryPlanSummaries.forEach((s, i) => {
      lines.push(`#### Fix Plan ${i + 1}`, s, '');
    });
  }

  if (ctx.sessionGuidance) {
    lines.push('## Current Guidance', ctx.sessionGuidance.slice(0, 1500), '');
  }

  lines.push(
    '## Your Task',
    '',
    `1. **Root Pattern**: What recurring pattern caused all ${ctx.recoveryCount} attempts to fail?`,
    '   Pick the SINGLE most likely root pattern.',
    '',
    '2. **Primary Strategy**: One concrete strategic change that breaks the pattern.',
    '   (e.g., "reduce scope to X", "replace Y approach with Z", "remove module W entirely")',
    '',
    '3. **Fallback Strategy**: One alternative if the primary doesn\'t work.',
    '',
    '4. **Stop Doing** (list 3 things): Based on the history, what should the pipeline',
    '   STOP trying? These are approaches that have been attempted and failed.',
    '',
    '5. **Concrete Next Steps**: 3-5 high-level steps (not code-level fixes).',
    '',
    'Be decisive. Pick one direction. Do NOT produce another tactical dump.',
  );

  return lines.join('\n');
}

// ─── Main Entry Point ────────────────────────────────────

/**
 * Attempt auto-recovery by consulting the arbitrator for strategic guidance.
 *
 * @returns Result with success flag, guidance text, and stored artifact
 */
export async function attemptAutoRecovery(
  opts: AutoRecoveryOptions,
): Promise<AutoRecoveryResult> {
  const { pipeline, projectDir, artifactManager, consensusConfig } = opts;

  // Build failure context and strategic prompt
  const ctx = buildFailureContext(pipeline, projectDir);
  const prompt = buildAutoRecoveryPrompt(ctx);

  // Resolve arbitrator provider config
  const arbitratorName = consensusConfig?.arbitrator ?? 'gemini';
  const model = getModelForProvider(consensusConfig, arbitratorName);
  const providerConfig = {
    provider: arbitratorName,
    model,
    temperature: 0.3,
  };

  logger.log(
    `[auto-recovery] Querying ${providerConfig.provider}/${providerConfig.model} for strategic guidance`,
  );

  // Query with 90s timeout
  const raw = await queryProvider(prompt, providerConfig, 90_000);

  if (!raw) {
    logger.warn('[auto-recovery] Provider returned no response (timeout or error)');
    return { success: false, guidance: null, artifact: null };
  }

  // Validate minimum response length
  if (raw.trim().length < 50) {
    logger.warn(`[auto-recovery] Response too short (${raw.trim().length} chars), discarding`);
    return { success: false, guidance: null, artifact: null };
  }

  // Store as artifact
  const artifact = artifactManager.createAndStoreText(
    'auto_recovery_guidance',
    `# Auto-Recovery Strategic Guidance\n\n${raw}`,
    'RECOVERY_LOOP',
  );

  // Inject into sessionGuidance (idempotent — replaces prior auto-recovery block)
  injectAutoRecoveryGuidance(pipeline, raw);

  logger.log(`[auto-recovery] Guidance received and injected (${raw.length} chars)`);

  return { success: true, guidance: raw, artifact };
}

// ─── Guidance Injection ──────────────────────────────────

/**
 * Inject auto-recovery guidance into pipeline.sessionGuidance.
 * Replaces any prior auto-recovery block while preserving base guidance.
 */
export function injectAutoRecoveryGuidance(
  pipeline: PipelineState,
  guidance: string,
): void {
  const existing = pipeline.sessionGuidance ?? '';

  // Strip prior auto-recovery block if present
  const base = existing.includes(AUTO_RECOVERY_MARKER)
    ? existing.slice(0, existing.indexOf(AUTO_RECOVERY_MARKER)).trim()
    : existing;

  pipeline.sessionGuidance = [
    base,
    '',
    AUTO_RECOVERY_MARKER,
    guidance.slice(0, 3000),
  ].join('\n').trim();
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Read artifact content from disk, returning first N chars or placeholder.
 */
function readArtifactSummary(projectDir: string, artifactPath: string, maxChars: number): string {
  try {
    const fullPath = join(projectDir, artifactPath);
    if (!existsSync(fullPath)) {
      return `[Could not read: ${artifactPath} — file not found]`;
    }
    const content = readFileSync(fullPath, 'utf-8');
    return content.slice(0, maxChars);
  } catch {
    return `[Could not read: ${artifactPath}]`;
  }
}
