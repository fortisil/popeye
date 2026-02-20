/**
 * AUDIT phase — holistic system verification before Production Gate.
 * Creates structured AuditReport with AuditFindings (P2-1).
 * v1.1: Creates Change Requests for architectural findings.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult, triggerJournalist } from './phase-context.js';
import { buildAuditReport } from '../packets/audit-report-builder.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';
import { buildChangeRequest, formatChangeRequest, routeChangeRequest } from '../change-request.js';
import type { AuditFinding, ArtifactEntry, ChangeRequest } from '../types.js';
import type { ArtifactManager } from '../artifact-manager.js';

export async function runAudit(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Fresh repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'AUDIT');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Load auditor skill
    const auditorSkill = skillLoader.loadSkill('AUDITOR');

    // 3. Run audit checks via Claude
    const { executePrompt } = await import('../../adapters/claude.js');
    const auditPrompt = [
      auditorSkill.systemPrompt,
      '',
      '## Audit Instructions',
      'Perform a holistic system audit covering:',
      '1. Integration audit (FE<->BE, BE<->DB)',
      '2. Config/env audit',
      '3. Tests/coverage audit',
      '4. Migration audit',
      '5. Basic security audit',
      '6. Deployment readiness audit',
      '',
      'For each finding, classify severity as P0/P1/P2/P3.',
      'Mark blocking findings that must be resolved before production.',
      '',
      `## Repo Snapshot`,
      `Total files: ${snapshot.total_files}`,
      `Languages: ${snapshot.languages_detected.join(', ')}`,
      `Test framework: ${snapshot.test_framework ?? 'none'}`,
      `Build tool: ${snapshot.build_tool ?? 'none'}`,
    ].join('\n');

    const auditResult = await executePrompt(auditPrompt);
    const auditResponse = auditResult.response;

    // 4. Parse findings from audit response (simplified extraction)
    const findings = parseAuditFindings(auditResponse);

    // 5. Build structured audit report
    const auditReport = buildAuditReport({
      repoSnapshot: artifactManager.toArtifactRef(snapshotEntry),
      findings,
    });

    // 6. Store audit report
    const auditEntry = artifactManager.createAndStoreJson(
      'audit_report',
      auditReport,
      'AUDIT',
    );
    artifacts.push(auditEntry);

    // Also store the raw audit text
    const auditTextEntry = artifactManager.createAndStoreText(
      'audit_report',
      auditResponse,
      'AUDIT',
    );
    artifacts.push(auditTextEntry);

    // 7. v1.1: Create change requests for architectural findings
    const changeRequests = createAuditChangeRequests(findings, artifactManager, snapshotEntry);
    for (const cr of changeRequests) {
      const crEntry = artifactManager.createAndStoreText(
        'change_request',
        formatChangeRequest(cr),
        'AUDIT',
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

    pipeline.artifacts.push(...artifacts);

    // 8. Journalist trigger
    await triggerJournalist('AUDIT', artifacts, context);

    return successResult(
      'AUDIT',
      artifacts,
      `Audit ${auditReport.overall_status}: ${findings.length} findings, risk score ${auditReport.system_risk_score}, ${changeRequests.length} CRs`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('AUDIT', 'Audit failed', message);
  }
}

/** Parse audit findings from LLM response (best-effort) */
function parseAuditFindings(response: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const lines = response.split('\n');
  let findingCount = 0;

  for (const line of lines) {
    // Look for severity markers: P0, P1, P2, P3
    const severityMatch = line.match(/\b(P[0-3])\b/);
    if (severityMatch) {
      findingCount++;
      const severity = severityMatch[1] as 'P0' | 'P1' | 'P2' | 'P3';
      findings.push({
        id: `finding-${findingCount}`,
        severity,
        category: 'integration', // Default; would be refined with better parsing
        description: line.trim(),
        evidence: [],
        suggested_owner: 'DISPATCHER',
        blocking: severity === 'P0' || severity === 'P1',
      });
    }
  }

  return findings;
}

/** Create change requests for high-severity audit findings (v1.1) */
function createAuditChangeRequests(
  findings: AuditFinding[],
  artifactManager: ArtifactManager,
  snapshotEntry: ArtifactEntry,
): ChangeRequest[] {
  const changeRequests: ChangeRequest[] = [];

  // Create CRs for blocking findings in integration/schema categories
  const architecturalFindings = findings.filter(
    (f) => f.blocking && (f.category === 'integration' || f.category === 'schema'),
  );

  if (architecturalFindings.length > 0) {
    const cr = buildChangeRequest({
      originPhase: 'AUDIT',
      requestedBy: 'AUDITOR',
      changeType: 'architecture',
      description: `${architecturalFindings.length} blocking architectural findings: ${architecturalFindings.map((f) => f.description.slice(0, 80)).join('; ')}`,
      justification: 'Blocking audit findings require architectural review before production',
      affectedArtifacts: [artifactManager.toArtifactRef(snapshotEntry)],
      affectedPhases: ['CONSENSUS_ARCHITECTURE', 'IMPLEMENTATION'],
      riskLevel: architecturalFindings.some((f) => f.severity === 'P0') ? 'high' : 'medium',
    });
    changeRequests.push(cr);
  }

  // Create CRs for security findings
  const securityFindings = findings.filter(
    (f) => f.blocking && f.category === 'security',
  );

  if (securityFindings.length > 0) {
    const cr = buildChangeRequest({
      originPhase: 'AUDIT',
      requestedBy: 'AUDITOR',
      changeType: 'requirement',
      description: `${securityFindings.length} blocking security findings require review`,
      justification: 'Security issues must be resolved before production deployment',
      affectedArtifacts: [artifactManager.toArtifactRef(snapshotEntry)],
      affectedPhases: ['CONSENSUS_MASTER_PLAN', 'IMPLEMENTATION'],
      riskLevel: 'high',
    });
    changeRequests.push(cr);
  }

  return changeRequests;
}
