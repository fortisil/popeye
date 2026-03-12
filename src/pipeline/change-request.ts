/**
 * Change Request mechanism — structured change tracking for mid-pipeline modifications.
 * CRs are created when drift is detected (REVIEW) or architectural issues found (AUDIT).
 * Each CR routes to the appropriate consensus phase for approval.
 */

import { randomUUID, createHash } from 'node:crypto';

import type {
  PipelinePhase,
  PipelineRole,
  ArtifactRef,
  ChangeRequest,
} from './types.js';

// ─── CR Builder ──────────────────────────────────────────

export interface BuildChangeRequestArgs {
  originPhase: PipelinePhase;
  requestedBy: PipelineRole;
  changeType: ChangeRequest['change_type'];
  description: string;
  justification: string;
  affectedArtifacts: ArtifactRef[];
  affectedPhases: PipelinePhase[];
  riskLevel: 'low' | 'medium' | 'high';
  /** Deterministic drift fingerprint for CR deduplication (v2.4.9) */
  driftKey?: string;
}

/**
 * Build a change request with generated ID and timestamp.
 *
 * Args:
 *   args: Change request parameters.
 *
 * Returns:
 *   A fully formed ChangeRequest in 'proposed' status.
 */
export function buildChangeRequest(args: BuildChangeRequestArgs): ChangeRequest {
  return {
    cr_id: `CR-${randomUUID().split('-')[0].toUpperCase()}`,
    timestamp: new Date().toISOString(),
    origin_phase: args.originPhase,
    requested_by: args.requestedBy,
    change_type: args.changeType,
    description: args.description,
    justification: args.justification,
    impact_analysis: {
      affected_artifacts: args.affectedArtifacts,
      affected_phases: args.affectedPhases,
      risk_level: args.riskLevel,
    },
    status: 'proposed',
    drift_key: args.driftKey,
  };
}

// ─── CR Routing ──────────────────────────────────────────

/** Maps change types to the consensus phase that must approve them */
const CHANGE_TYPE_ROUTING: Record<ChangeRequest['change_type'], PipelinePhase> = {
  scope: 'CONSENSUS_MASTER_PLAN',
  architecture: 'CONSENSUS_ARCHITECTURE',
  dependency: 'CONSENSUS_ROLE_PLANS',
  config: 'QA_VALIDATION',
  requirement: 'CONSENSUS_MASTER_PLAN',
};

/**
 * Determine which consensus phase should review a change request.
 *
 * Args:
 *   cr: The change request to route.
 *
 * Returns:
 *   The pipeline phase that should handle the CR approval.
 */
export function routeChangeRequest(cr: ChangeRequest): PipelinePhase {
  return CHANGE_TYPE_ROUTING[cr.change_type];
}

// ─── CR Formatting ───────────────────────────────────────

/**
 * Format a change request as markdown for inclusion in artifacts.
 *
 * Args:
 *   cr: The change request to format.
 *
 * Returns:
 *   Markdown-formatted string.
 */
export function formatChangeRequest(cr: ChangeRequest): string {
  const lines = [
    `# Change Request ${cr.cr_id}`,
    '',
    `**Status:** ${cr.status}`,
    `**Type:** ${cr.change_type}`,
    `**Origin Phase:** ${cr.origin_phase}`,
    `**Requested By:** ${cr.requested_by}`,
    `**Risk Level:** ${cr.impact_analysis.risk_level}`,
    `**Timestamp:** ${cr.timestamp}`,
    '',
    '## Description',
    cr.description,
    '',
    '## Justification',
    cr.justification,
    '',
    '## Impact Analysis',
    `- Affected phases: ${cr.impact_analysis.affected_phases.join(', ')}`,
    `- Affected artifacts: ${cr.impact_analysis.affected_artifacts.length}`,
    `- Risk level: ${cr.impact_analysis.risk_level}`,
  ];

  if (cr.approval_artifact) {
    lines.push('', `## Approval: ${cr.approval_artifact.artifact_id}`);
  }

  return lines.join('\n');
}

// ─── Drift Key Dedup (v2.4.9) ────────────────────────────

/**
 * Compute a deterministic drift key for CR deduplication.
 * Same drift (same change type, baseline, changed configs, content hashes)
 * always produces the same key, regardless of input order.
 *
 * Args:
 *   changeType: The CR change type (config, scope, etc.).
 *   baselineSnapshotId: The artifact_id of the baseline snapshot.
 *   changedConfigs: List of changed config file paths.
 *   configHashPairs: Array of "path:beforeHash->afterHash" strings.
 *
 * Returns:
 *   A 32-char hex string (SHA-256 prefix).
 */
export function computeDriftKey(
  changeType: string,
  baselineSnapshotId: string,
  changedConfigs: string[],
  configHashPairs: string[],
): string {
  const sortedConfigs = [...changedConfigs].sort().join(',');
  const sortedPairs = [...configHashPairs].sort().join(',');
  const input = `${changeType}|${baselineSnapshotId}|${sortedConfigs}|${sortedPairs}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/** Pending CR shape from PipelineState */
interface PendingCR {
  cr_id: string;
  change_type: string;
  target_phase: string;
  status: string;
  drift_key?: string;
}

/**
 * Check whether a pending CR with the same drift_key already exists.
 * Returns true if any non-rejected CR has the same drift_key (proposed,
 * approved, or resolved CRs all count as "already tracked").
 *
 * Args:
 *   pendingCRs: The current pending change requests array (may be undefined).
 *   driftKey: The drift key to check.
 *
 * Returns:
 *   true if a non-rejected duplicate exists.
 */
export function isDuplicateCR(
  pendingCRs: PendingCR[] | undefined,
  driftKey: string,
): boolean {
  if (!pendingCRs) return false;
  return pendingCRs.some(
    (cr) => cr.drift_key === driftKey && cr.status !== 'rejected',
  );
}
