/**
 * Audit Report Builder — constructs structured AuditReports
 * with auto-computed status, risk score, and recovery flag (P2-1).
 */

import { randomUUID } from 'node:crypto';

import type { ArtifactRef, AuditFinding, AuditReport } from '../types.js';

export interface BuildAuditReportArgs {
  repoSnapshot: ArtifactRef;
  findings: AuditFinding[];
}

/** Severity weights for risk score calculation */
const SEVERITY_WEIGHTS: Record<string, number> = {
  P0: 40,
  P1: 20,
  P2: 8,
  P3: 2,
};

export function buildAuditReport(args: BuildAuditReportArgs): AuditReport {
  const { repoSnapshot, findings } = args;

  const hasBlockingFindings = findings.some((f) => f.blocking);
  const overallStatus = hasBlockingFindings ? 'FAIL' : 'PASS';

  // Risk score: sum of severity weights, capped at 100
  const rawScore = findings.reduce((sum, f) => sum + (SEVERITY_WEIGHTS[f.severity] ?? 0), 0);
  const systemRiskScore = Math.min(100, rawScore);

  // Recovery needed if any blocking P0/P1 findings
  const recoveryRequired = findings.some(
    (f) => f.blocking && (f.severity === 'P0' || f.severity === 'P1'),
  );

  return {
    audit_id: randomUUID(),
    timestamp: new Date().toISOString(),
    repo_snapshot: repoSnapshot,
    overall_status: overallStatus,
    findings,
    system_risk_score: systemRiskScore,
    recovery_required: recoveryRequired,
  };
}
