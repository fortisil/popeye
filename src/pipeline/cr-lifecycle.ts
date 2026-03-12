/**
 * CR Lifecycle helpers — resolution after QA pass, stagnation detection.
 * Extracted from orchestrator to keep it under 500 lines.
 * v2.4.9
 */

import { createHash } from 'node:crypto';
import type { PipelineState } from './types.js';

/** Number of identical loop signatures before declaring stagnation */
export const STAGNATION_THRESHOLD = 3;

/**
 * Resolve the active CR after its routed phase (e.g. QA_VALIDATION) passes.
 * Sets CR status to 'resolved', clears activeChangeRequestId.
 * For config CRs: sets baselineSnapshotOverride to accept the drift.
 *
 * Args:
 *   pipeline: The current pipeline state (mutated in place).
 *   onProgress: Optional progress callback for logging.
 */
export function resolveActiveCR(
  pipeline: PipelineState,
  onProgress?: (message: string) => void,
): void {
  const activeCRId = pipeline.activeChangeRequestId;
  if (!activeCRId) return;

  const pending = pipeline.pendingChangeRequests;
  if (!pending) return;

  const cr = pending.find((c) => c.cr_id === activeCRId);
  if (!cr) return;

  cr.status = 'resolved';
  pipeline.activeChangeRequestId = undefined;

  // Advance baseline to accept the resolved drift (all CR types).
  // Reason: prevents REVIEW from re-detecting the same drift on the next pass.
  if (pipeline.latestRepoSnapshot) {
    pipeline.baselineSnapshotOverride = { ...pipeline.latestRepoSnapshot };
    onProgress?.(`CR ${cr.cr_id} resolved (${cr.change_type}) — baseline advanced to latest snapshot`);
  } else {
    onProgress?.(`CR ${cr.cr_id} resolved (${cr.change_type})`);
  }
}

/**
 * Compute a loop signature for stagnation detection.
 * Captures the essential state that should change between iterations.
 *
 * Args:
 *   pipeline: The current pipeline state.
 *
 * Returns:
 *   A 16-char hex string fingerprinting the current loop state.
 */
export function computeLoopSignature(pipeline: PipelineState): string {
  // Reason: Use boolean (not count) so signature stays stable even as CRs accumulate
  const hasPendingActive = pipeline.pendingChangeRequests
    ?.some((cr) => cr.status === 'proposed' || cr.status === 'approved') ?? false;

  const input = [
    pipeline.pipelinePhase,
    pipeline.baselineSnapshotOverride?.artifact_id ?? 'none',
    pipeline.latestRepoSnapshot?.artifact_id ?? 'none',
    hasPendingActive ? 'pending' : 'clear',
    pipeline.activeChangeRequestId ? 'active' : 'none',
  ].join('|');

  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Check for stagnation and update the rolling signature window.
 * Returns true if stagnation is detected (pipeline should transition to STUCK).
 *
 * Args:
 *   pipeline: The current pipeline state (mutated: lastSignatures updated).
 *   onProgress: Optional progress callback for logging.
 *
 * Returns:
 *   true if the same loop signature repeated STAGNATION_THRESHOLD times.
 */
export function checkStagnation(
  pipeline: PipelineState,
  onProgress?: (message: string) => void,
): boolean {
  const loopSig = computeLoopSignature(pipeline);
  if (!pipeline.lastSignatures) pipeline.lastSignatures = [];
  pipeline.lastSignatures.push(loopSig);
  if (pipeline.lastSignatures.length > STAGNATION_THRESHOLD) {
    pipeline.lastSignatures = pipeline.lastSignatures.slice(-STAGNATION_THRESHOLD);
  }
  if (
    pipeline.lastSignatures.length === STAGNATION_THRESHOLD &&
    pipeline.lastSignatures.every((s) => s === pipeline.lastSignatures![0])
  ) {
    onProgress?.(`Stagnation detected: identical loop signature ${loopSig} repeated ${STAGNATION_THRESHOLD} times`);
    return true;
  }
  return false;
}
