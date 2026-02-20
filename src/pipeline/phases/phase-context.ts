/**
 * Shared PhaseContext type and helpers for all phase implementations.
 */

import type { PipelinePhase, PipelineState, ArtifactEntry } from '../types.js';
import type { ArtifactManager } from '../artifact-manager.js';
import type { GateEngine } from '../gate-engine.js';
import type { SkillLoader } from '../skill-loader.js';
import type { ConsensusRunner } from '../consensus/consensus-runner.js';
import type { ProjectState } from '../../types/workflow.js';

// ─── PhaseContext ────────────────────────────────────────

export interface PhaseContext {
  state: ProjectState;
  pipeline: PipelineState;
  projectDir: string;
  skillLoader: SkillLoader;
  artifactManager: ArtifactManager;
  gateEngine: GateEngine;
  consensusRunner: ConsensusRunner;
}

// ─── PhaseResult ─────────────────────────────────────────

export interface PhaseResult {
  phase: PipelinePhase;
  success: boolean;
  artifacts: ArtifactEntry[];
  message: string;
  error?: string;
}

// ─── Journalist Helper (P1-F) ────────────────────────────

/** Trigger journalist after consensus/audit/production phases */
export async function triggerJournalist(
  phase: PipelinePhase,
  artifacts: ArtifactEntry[],
  context: PhaseContext,
): Promise<ArtifactEntry | null> {
  const skill = context.skillLoader.loadSkill('JOURNALIST');

  const traceContent = [
    `# Journalist Trace — ${phase}`,
    ``,
    `**Timestamp:** ${new Date().toISOString()}`,
    `**Phase:** ${phase}`,
    ``,
    `## Artifacts Recorded`,
    ``,
    ...artifacts.map((a) => `- [${a.type}] v${a.version}: ${a.path}`),
    ``,
    `## Skill: ${skill.role}`,
    `${skill.systemPrompt.slice(0, 200)}...`,
  ].join('\n');

  const entry = context.artifactManager.createAndStoreText(
    'journalist_trace',
    traceContent,
    phase,
  );

  // Update INDEX.md with all current artifacts
  context.artifactManager.updateIndex(context.pipeline.artifacts);

  return entry;
}

// ─── Phase Result Helpers ────────────────────────────────

export function successResult(
  phase: PipelinePhase,
  artifacts: ArtifactEntry[],
  message: string,
): PhaseResult {
  return { phase, success: true, artifacts, message };
}

export function failureResult(
  phase: PipelinePhase,
  message: string,
  error?: string,
): PhaseResult {
  return { phase, success: false, artifacts: [], message, error };
}
