/**
 * Review Bridge — connects /review (rich audit-mode scanner) to the pipeline
 * artifact + CR system when a project is pipeline-managed.
 *
 * When pipeline state exists, /review produces pipeline-native audit_report
 * artifacts and Change Requests instead of injecting recovery milestones
 * into state.json. This keeps the pipeline as the single source of truth.
 */

import { randomUUID } from 'node:crypto';
import type { ProjectState } from '../../types/workflow.js';
import type {
  PipelineState,
  PipelinePhase,
  ArtifactEntry,
  ArtifactRef,
} from '../types.js';
import type { AuditFinding as WorkflowAuditFinding, AuditCategory as WorkflowCategory, AuditSeverity as WorkflowSeverity } from '../../types/audit.js';
import type { AuditFinding as PipelineAuditFinding, AuditSeverity as PipelineSeverity } from '../type-defs/audit.js';
import type { ChangeRequest } from '../types.js';
import { createArtifactManager } from '../artifact-manager.js';
import { buildChangeRequest, formatChangeRequest, routeChangeRequest } from '../change-request.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';
import { scanProject } from '../../workflow/audit-scanner.js';
import { analyzeProject, calculateAuditScores } from '../../workflow/audit-analyzer.js';
import { buildSummaryReport, buildAuditReport } from '../../workflow/audit-reporter.js';
import { loadProject, updateState } from '../../state/index.js';

// ─── Types ───────────────────────────────────────────────

export interface ReviewBridgeOptions {
  projectDir: string;
  depth?: number;
  strict?: boolean;
  onProgress?: (stage: string, message: string) => void;
}

export interface ReviewBridgeResult {
  success: boolean;
  findingsCount: number;
  changeRequestCount: number;
  overallScore: number;
  recommendation: string;
  artifactsCreated: number;
  error?: string;
}

// ─── Pipeline Detection ──────────────────────────────────

/**
 * Check if a project is pipeline-managed.
 * A project is pipeline-managed if its state has a pipeline object
 * with a pipelinePhase field.
 *
 * @param state - The project state to check
 * @returns True if pipeline-managed
 */
export function isPipelineManaged(state: ProjectState): boolean {
  const pipeline = (state as unknown as { pipeline?: PipelineState }).pipeline;
  return !!pipeline?.pipelinePhase;
}

/**
 * Extract pipeline state from project state.
 *
 * @param state - The project state
 * @returns Pipeline state or undefined
 */
export function extractPipelineState(state: ProjectState): PipelineState | undefined {
  return (state as unknown as { pipeline?: PipelineState }).pipeline;
}

// ─── Severity Mapping ────────────────────────────────────

/** Map workflow audit severity to pipeline severity */
const SEVERITY_MAP: Record<WorkflowSeverity, PipelineSeverity> = {
  critical: 'P0',
  major: 'P1',
  minor: 'P2',
  info: 'P3',
};

export function mapSeverity(severity: WorkflowSeverity): PipelineSeverity {
  return SEVERITY_MAP[severity];
}

// ─── Category Mapping ────────────────────────────────────

/** Map workflow audit categories to pipeline audit categories */
type PipelineCategory = 'integration' | 'config' | 'tests' | 'schema' | 'security' | 'deployment';

const CATEGORY_MAP: Record<WorkflowCategory, PipelineCategory> = {
  'feature-completeness': 'integration',
  'integration-wiring': 'integration',
  'test-coverage': 'tests',
  'config-deployment': 'config',
  'dependency-sanity': 'deployment',
  'consistency': 'schema',
  'security': 'security',
  'documentation': 'deployment',
};

export function mapCategory(category: WorkflowCategory): PipelineCategory {
  return CATEGORY_MAP[category];
}

// ─── CR Routing ──────────────────────────────────────────

/** Determine CR change_type from pipeline audit category */
const CATEGORY_TO_CHANGE_TYPE: Record<PipelineCategory, ChangeRequest['change_type']> = {
  integration: 'architecture',
  schema: 'architecture',
  security: 'requirement',
  tests: 'config',
  config: 'config',
  deployment: 'config',
};

export function categoryToChangeType(category: PipelineCategory): ChangeRequest['change_type'] {
  return CATEGORY_TO_CHANGE_TYPE[category];
}

// ─── Finding Conversion ──────────────────────────────────

/**
 * Convert a workflow AuditFinding to a pipeline AuditFinding.
 *
 * @param finding - Workflow finding
 * @param snapshotRef - Pipeline artifact ref for the repo snapshot
 * @returns Pipeline-native audit finding
 */
export function convertFinding(
  finding: WorkflowAuditFinding,
  snapshotRef: ArtifactRef,
): PipelineAuditFinding {
  const severity = mapSeverity(finding.severity);
  return {
    id: finding.id,
    severity,
    category: mapCategory(finding.category),
    description: `${finding.title}: ${finding.description}`,
    evidence: [snapshotRef],
    file_path: finding.evidence[0]?.file,
    line_number: finding.evidence[0]?.line,
    suggested_owner: 'AUDITOR',
    blocking: severity === 'P0' || severity === 'P1',
  };
}

// ─── Bridge Orchestrator ─────────────────────────────────

/**
 * Run /review through the pipeline bridge.
 * Uses the rich audit-mode scanner but writes results as pipeline artifacts
 * and creates Change Requests for blocking findings.
 *
 * Does NOT inject recovery milestones — the pipeline RECOVERY_LOOP handles fixes.
 *
 * @param options - Bridge options
 * @returns Bridge result with counts and score
 */
export async function runReviewBridge(options: ReviewBridgeOptions): Promise<ReviewBridgeResult> {
  const { projectDir, onProgress } = options;
  const depth = options.depth ?? 2;
  const strict = options.strict ?? false;

  try {
    // 1. Load state and extract pipeline
    const state = await loadProject(projectDir);
    const pipeline = extractPipelineState(state);
    if (!pipeline) {
      return { success: false, findingsCount: 0, changeRequestCount: 0, overallScore: 0, recommendation: 'error', artifactsCreated: 0, error: 'No pipeline state found' };
    }

    const artifactManager = createArtifactManager(projectDir);
    artifactManager.ensureDocsStructure();
    const artifacts: ArtifactEntry[] = [];

    // 2. Generate fresh repo snapshot (pipeline anchor)
    onProgress?.('bridge', 'Generating repo snapshot...');
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'AUDIT');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);
    const snapshotRef = artifactManager.toArtifactRef(snapshotEntry);

    // 3. Run rich audit-mode scanner (Stage 1: Scan)
    onProgress?.('bridge', 'Running project scan...');
    const scan = await scanProject(
      projectDir,
      state.language,
      (msg) => onProgress?.('bridge-scan', msg),
    );
    const summary = buildSummaryReport(scan, state);

    onProgress?.(
      'bridge',
      `Scan complete: ${scan.totalSourceFiles} source files, ${scan.totalLinesOfCode} LOC`,
    );

    // 4. Run AI analysis (Stage 2: Analyze)
    onProgress?.('bridge', 'Running AI analysis...');
    const { findings: workflowFindings, searchMetadata } = await analyzeProject(scan, state, {
      depth,
      strict,
      projectDir,
    });
    const scores = calculateAuditScores(workflowFindings, scan);
    const auditReport = buildAuditReport(summary, workflowFindings, scores, searchMetadata, { strict }, randomUUID());

    onProgress?.(
      'bridge',
      `Analysis complete: score ${scores.overallScore}%, ${workflowFindings.length} findings`,
    );

    // 5. Convert findings to pipeline format
    const pipelineFindings = workflowFindings.map((f) => convertFinding(f, snapshotRef));

    // 6. Build pipeline audit report and store as artifact
    const pipelineAuditReport = {
      audit_id: `audit-${randomUUID().split('-')[0]}`,
      timestamp: new Date().toISOString(),
      repo_snapshot: snapshotRef,
      overall_status: (auditReport.recommendation === 'pass' ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
      findings: pipelineFindings,
      system_risk_score: 100 - scores.overallScore,
      recovery_required: auditReport.recommendation === 'major-rework',
    };

    const auditJsonEntry = artifactManager.createAndStoreJson(
      'audit_report',
      pipelineAuditReport,
      'AUDIT',
    );
    artifacts.push(auditJsonEntry);

    // Store raw text report too
    const textReport = formatAuditSummary(pipelineFindings, scores.overallScore, auditReport.recommendation);
    const auditTextEntry = artifactManager.createAndStoreText(
      'audit_report',
      textReport,
      'AUDIT',
    );
    artifacts.push(auditTextEntry);

    // 7. Create Change Requests for blocking findings
    const changeRequests: ChangeRequest[] = [];
    const blockingFindings = pipelineFindings.filter((f) => f.blocking);

    if (blockingFindings.length > 0) {
      // Group by category for targeted CRs
      const byCategory = new Map<string, typeof pipelineFindings>();
      for (const f of blockingFindings) {
        const group = byCategory.get(f.category) ?? [];
        group.push(f);
        byCategory.set(f.category, group);
      }

      for (const [category, findings] of byCategory) {
        const changeType = categoryToChangeType(category as PipelineCategory);
        const cr = buildChangeRequest({
          originPhase: 'AUDIT',
          requestedBy: 'AUDITOR',
          changeType,
          description: `${findings.length} blocking ${category} finding(s): ${findings.map((f) => f.description.slice(0, 80)).join('; ')}`,
          justification: 'Blocking audit findings from /review require pipeline resolution',
          affectedArtifacts: [snapshotRef],
          affectedPhases: getAffectedPhases(category as PipelineCategory),
          riskLevel: findings.some((f) => f.severity === 'P0') ? 'high' : 'medium',
        });
        changeRequests.push(cr);

        // Store CR as artifact
        const crEntry = artifactManager.createAndStoreText(
          'change_request',
          formatChangeRequest(cr),
          'AUDIT',
        );
        artifacts.push(crEntry);

        // Register in pipeline state for orchestrator routing
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
    }

    // 8. Persist pipeline state
    pipeline.artifacts.push(...artifacts);

    // Update INDEX.md
    artifactManager.updateIndex(pipeline.artifacts);

    // Save updated state (pipeline object is a reference on state)
    await updateState(projectDir, {
      auditReportPath: auditJsonEntry.path,
      auditLastRunAt: new Date().toISOString(),
      auditRunId: pipelineAuditReport.audit_id,
    } as Partial<ProjectState>);

    onProgress?.(
      'bridge',
      `Bridge complete: ${artifacts.length} artifacts, ${changeRequests.length} CRs created`,
    );

    return {
      success: true,
      findingsCount: pipelineFindings.length,
      changeRequestCount: changeRequests.length,
      overallScore: scores.overallScore,
      recommendation: auditReport.recommendation,
      artifactsCreated: artifacts.length,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, findingsCount: 0, changeRequestCount: 0, overallScore: 0, recommendation: 'error', artifactsCreated: 0, error };
  }
}

// ─── Helpers ─────────────────────────────────────────────

/** Get affected phases for a finding category */
function getAffectedPhases(category: PipelineCategory): PipelinePhase[] {
  switch (category) {
    case 'integration':
    case 'schema':
      return ['CONSENSUS_ARCHITECTURE', 'IMPLEMENTATION'];
    case 'security':
      return ['CONSENSUS_MASTER_PLAN', 'IMPLEMENTATION'];
    case 'tests':
      return ['QA_VALIDATION'];
    case 'config':
    case 'deployment':
      return ['IMPLEMENTATION', 'PRODUCTION_GATE'];
  }
}

/** Format a text summary of pipeline audit findings */
function formatAuditSummary(
  findings: PipelineAuditFinding[],
  score: number,
  recommendation: string,
): string {
  const lines = [
    '# Pipeline Audit Report (via /review bridge)',
    '',
    `**Score:** ${score}%`,
    `**Recommendation:** ${recommendation}`,
    `**Findings:** ${findings.length}`,
    `**Blocking:** ${findings.filter((f) => f.blocking).length}`,
    '',
    '## Findings',
    '',
  ];

  for (const f of findings) {
    lines.push(`### [${f.severity}] ${f.description.slice(0, 120)}`);
    lines.push(`- Category: ${f.category}`);
    lines.push(`- Blocking: ${f.blocking ? 'Yes' : 'No'}`);
    if (f.file_path) lines.push(`- File: ${f.file_path}${f.line_number ? `:${f.line_number}` : ''}`);
    lines.push('');
  }

  return lines.join('\n');
}
