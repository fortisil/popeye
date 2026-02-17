/**
 * Audit mode orchestrator.
 *
 * Coordinates the three audit stages:
 *   Stage 1: Scan + Summary
 *   Stage 2: Analyze + Report
 *   Stage 3: Recovery (evidence-based trigger)
 *
 * Pattern follows plan-mode.ts orchestration style.
 */

import { randomUUID } from 'node:crypto';
import { loadProject, updateState } from '../state/index.js';
import type { ConsensusConfig } from '../types/consensus.js';
import type { ProjectState } from '../types/workflow.js';
import type {
  AuditModeOptions,
  AuditModeResult,
  RecoveryPlan,
} from '../types/audit.js';
import { scanProject } from './audit-scanner.js';
import { analyzeProject, calculateAuditScores } from './audit-analyzer.js';
import {
  buildSummaryReport,
  buildAuditReport,
  writeAuditMarkdown,
  writeAuditJson,
  writeRecoveryMarkdown,
  writeRecoveryJson,
} from './audit-reporter.js';
import {
  shouldTriggerRecovery,
  generateRecoveryPlan,
  recoveryToMilestones,
  injectRecoveryIntoState,
} from './audit-recovery.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AuditModeRunOptions extends AuditModeOptions {
  consensusConfig?: Partial<ConsensusConfig>;
  onProgress?: (stage: string, message: string) => void;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run a full audit of the project.
 *
 * Stage 1: Scan the filesystem deterministically
 * Stage 2: Analyze with AI (Serena-first + fallback)
 * Stage 3: Generate recovery plan if evidence warrants it
 *
 * @param options - Audit configuration options.
 * @returns The complete audit result.
 */
export async function runAuditMode(options: AuditModeRunOptions): Promise<AuditModeResult> {
  const { projectDir, onProgress } = options;
  const depth = options.depth ?? 2;
  const strict = options.strict ?? false;
  const format = options.format ?? 'both';
  const autoRecover = options.autoRecover ?? true;
  const auditRunId = randomUUID();

  let state: ProjectState;
  try {
    state = await loadProject(projectDir);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to load project';
    return makeErrorResult(errorMsg);
  }

  // -----------------------------------------------------------------------
  // Stage 1: Scan + Summary
  // -----------------------------------------------------------------------
  onProgress?.('stage-1', 'Starting project scan...');

  const scan = await scanProject(
    projectDir,
    state.language,
    (msg) => onProgress?.('stage-1', msg)
  );

  const summary = buildSummaryReport(scan, state);

  onProgress?.(
    'stage-1',
    `Scan complete: ${scan.totalSourceFiles} source files, ${scan.totalLinesOfCode} LOC, ${scan.components.length} component(s)`
  );

  // -----------------------------------------------------------------------
  // Stage 2: Analyze + Report
  // -----------------------------------------------------------------------
  onProgress?.('stage-2', 'Starting AI analysis...');

  const { findings, searchMetadata } = await analyzeProject(scan, state, {
    depth,
    strict,
    projectDir,
  });

  const scores = calculateAuditScores(findings, scan);

  const auditReport = buildAuditReport(
    summary,
    findings,
    scores,
    searchMetadata,
    { strict },
    auditRunId
  );

  // Write report artifacts
  const reportPaths: AuditModeResult['reportPaths'] = {};

  if (format === 'md' || format === 'both') {
    reportPaths.auditMd = await writeAuditMarkdown(projectDir, auditReport);
  }
  if (format === 'json' || format === 'both') {
    reportPaths.auditJson = await writeAuditJson(projectDir, auditReport);
  }

  // Update state with audit report path
  await updateState(projectDir, {
    auditReportPath: reportPaths.auditJson ?? reportPaths.auditMd,
    auditLastRunAt: new Date().toISOString(),
    auditRunId,
  } as Partial<ProjectState>);

  onProgress?.(
    'stage-2',
    `Analysis complete: score ${scores.overallScore}%, ${findings.length} findings (serena: ${searchMetadata.serenaUsed ? 'used' : 'fallback'})`
  );

  // -----------------------------------------------------------------------
  // Stage 3: Recovery (evidence-based trigger)
  // -----------------------------------------------------------------------
  let recovery: RecoveryPlan | undefined;

  if (shouldTriggerRecovery(auditReport, strict)) {
    onProgress?.('stage-3', 'Generating recovery plan...');

    recovery = generateRecoveryPlan(auditReport);

    // Write recovery artifacts
    if (format === 'md' || format === 'both') {
      reportPaths.recoveryMd = await writeRecoveryMarkdown(projectDir, recovery);
    }
    if (format === 'json' || format === 'both') {
      reportPaths.recoveryJson = await writeRecoveryJson(projectDir, recovery);
    }

    // Auto-recover: inject milestones and switch to execution
    if (autoRecover && recovery.milestones.length > 0) {
      onProgress?.('stage-3', 'Injecting recovery milestones...');
      const milestones = recoveryToMilestones(recovery, state.language);
      await injectRecoveryIntoState(projectDir, milestones, auditRunId);
      onProgress?.('stage-3', `Injected ${milestones.length} recovery milestone(s) — ready for execution`);
    }

    onProgress?.(
      'stage-3',
      `Recovery plan: ${recovery.milestones.length} milestone(s), estimated ${recovery.estimatedEffort}`
    );
  } else {
    onProgress?.('stage-3', 'No recovery needed based on findings.');
  }

  return {
    success: true,
    summary,
    audit: auditReport,
    recovery,
    reportPaths,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create an error result with minimal valid structure.
 *
 * @param error - Error message.
 * @returns An AuditModeResult indicating failure.
 */
function makeErrorResult(error: string): AuditModeResult {
  const emptySummary = {
    projectName: 'unknown',
    language: 'unknown',
    totalSourceFiles: 0,
    totalTestFiles: 0,
    totalLinesOfCode: 0,
    totalLinesOfTests: 0,
    componentCount: 0,
    detectedComposition: [],
    entryPointCount: 0,
    routeCount: 0,
    dependencyCount: 0,
    hasDocker: false,
    hasEnvExample: false,
    hasCiConfig: false,
  };

  return {
    success: false,
    summary: emptySummary,
    audit: {
      projectName: 'unknown',
      language: 'unknown',
      auditedAt: new Date().toISOString(),
      auditRunId: 'error',
      summary: emptySummary,
      findings: [],
      overallScore: 0,
      categoryScores: {} as any,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      infoCount: 0,
      passedChecks: [],
      searchMetadata: {
        serenaUsed: false,
        serenaRetries: 0,
        serenaErrors: [],
        fallbackUsed: false,
        fallbackTool: '',
        searchQueries: [],
      },
      recommendation: 'major-rework',
    },
    reportPaths: {},
    error,
  };
}
