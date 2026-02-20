/**
 * CONSENSUS_MASTER_PLAN phase — multi-LLM validation of Master Plan.
 * Uses independent review mode by default (P1-D).
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult, triggerJournalist } from './phase-context.js';
import { buildPlanPacket } from '../packets/plan-packet-builder.js';
import { generateRepoSnapshot, createSnapshotArtifact } from '../repo-snapshot.js';
import type { PipelineState, ArtifactRef } from '../types.js';

/** Get constitution artifact ref from pipeline state, or fallback */
function getConstitutionRef(pipeline: PipelineState): ArtifactRef {
  const constitutionArtifact = pipeline.artifacts.find((a) => a.type === 'constitution');
  if (constitutionArtifact) {
    return {
      artifact_id: constitutionArtifact.id,
      path: constitutionArtifact.path,
      sha256: constitutionArtifact.sha256,
      version: constitutionArtifact.version,
      type: 'constitution',
    };
  }
  return { artifact_id: 'constitution', path: 'skills/POPEYE_CONSTITUTION.md', sha256: '', version: 1, type: 'constitution' };
}

export async function runConsensusMasterPlan(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, gateEngine, consensusRunner, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Fresh repo snapshot for consensus
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'CONSENSUS_MASTER_PLAN');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Find master plan artifact
    const masterPlanArtifact = pipeline.artifacts.find((a) => a.type === 'master_plan');
    if (!masterPlanArtifact) {
      return failureResult('CONSENSUS_MASTER_PLAN', 'No master plan artifact found');
    }

    // 3. Build plan packet
    const planPacket = buildPlanPacket({
      phase: 'CONSENSUS_MASTER_PLAN',
      submittedBy: 'DISPATCHER',
      masterPlanRef: artifactManager.toArtifactRef(masterPlanArtifact),
      constitutionRef: getConstitutionRef(pipeline),
      repoSnapshotRef: artifactManager.toArtifactRef(snapshotEntry),
      proposedArtifacts: [],
      acceptanceCriteria: [
        'Master plan is deterministic (no vague features)',
        'Assumptions are explicit',
        'Out-of-scope is explicit',
        'Success criteria defined',
      ],
      dependencies: [],
      constraints: [],
    });

    // 4. Run structured consensus
    const gateDef = gateEngine.getGateDefinition('CONSENSUS_MASTER_PLAN');
    const consensusPacket = await consensusRunner.runStructuredConsensus(planPacket, gateDef);

    // 5. Store consensus artifact
    const consensusEntry = artifactManager.createAndStoreJson(
      'consensus',
      consensusPacket,
      'CONSENSUS_MASTER_PLAN',
    );
    artifacts.push(consensusEntry);
    pipeline.artifacts.push(...artifacts);

    // 5b. Store consensus score in gateResults for parseConsensusScore()
    pipeline.gateResults['CONSENSUS_MASTER_PLAN'] = {
      phase: 'CONSENSUS_MASTER_PLAN',
      pass: consensusPacket.final_status === 'APPROVED' || consensusPacket.final_status === 'ARBITRATED',
      score: consensusPacket.consensus_result.weighted_score,
      blockers: [],
      missingArtifacts: [],
      failedChecks: [],
      consensusScore: consensusPacket.consensus_result.score,
      timestamp: new Date().toISOString(),
    };

    // 6. Trigger journalist (P1-F)
    await triggerJournalist('CONSENSUS_MASTER_PLAN', artifacts, context);

    const approved = consensusPacket.final_status === 'APPROVED' || consensusPacket.final_status === 'ARBITRATED';
    return successResult(
      'CONSENSUS_MASTER_PLAN',
      artifacts,
      approved ? 'Master Plan consensus APPROVED' : 'Master Plan consensus REJECTED',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('CONSENSUS_MASTER_PLAN', 'Consensus failed', message);
  }
}
