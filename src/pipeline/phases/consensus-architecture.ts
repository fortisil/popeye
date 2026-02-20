/**
 * CONSENSUS_ARCHITECTURE phase — validate architecture is feasible,
 * consistent, and complete. Same pattern as consensus-master-plan.
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

export async function runConsensusArchitecture(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, gateEngine, consensusRunner, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Fresh repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'CONSENSUS_ARCHITECTURE');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Find architecture artifact
    const archArtifact = pipeline.artifacts.find((a) => a.type === 'architecture');
    if (!archArtifact) {
      return failureResult('CONSENSUS_ARCHITECTURE', 'No architecture artifact found');
    }

    const masterPlanArtifact = pipeline.artifacts.find((a) => a.type === 'master_plan');

    // 3. Build plan packet
    const planPacket = buildPlanPacket({
      phase: 'CONSENSUS_ARCHITECTURE',
      submittedBy: 'ARCHITECT',
      masterPlanRef: masterPlanArtifact
        ? artifactManager.toArtifactRef(masterPlanArtifact)
        : { artifact_id: 'none', path: '', sha256: '', version: 1, type: 'master_plan' },
      constitutionRef: getConstitutionRef(pipeline),
      repoSnapshotRef: artifactManager.toArtifactRef(snapshotEntry),
      proposedArtifacts: [artifactManager.toArtifactRef(archArtifact)],
      acceptanceCriteria: [
        'Contracts explicit enough for FE/BE to build without guessing',
        'Env vars enumerated',
        'Integration points enumerated',
        'No contradictory contracts',
      ],
      dependencies: [],
      constraints: [],
    });

    // 4. Run consensus
    const gateDef = gateEngine.getGateDefinition('CONSENSUS_ARCHITECTURE');
    const consensusPacket = await consensusRunner.runStructuredConsensus(planPacket, gateDef);

    // 5. Store consensus artifact
    const consensusEntry = artifactManager.createAndStoreJson(
      'consensus',
      consensusPacket,
      'CONSENSUS_ARCHITECTURE',
    );
    artifacts.push(consensusEntry);
    pipeline.artifacts.push(...artifacts);

    // 5b. Store consensus score in gateResults for parseConsensusScore()
    pipeline.gateResults['CONSENSUS_ARCHITECTURE'] = {
      phase: 'CONSENSUS_ARCHITECTURE',
      pass: consensusPacket.final_status === 'APPROVED' || consensusPacket.final_status === 'ARBITRATED',
      score: consensusPacket.consensus_result.weighted_score,
      blockers: [],
      missingArtifacts: [],
      failedChecks: [],
      consensusScore: consensusPacket.consensus_result.score,
      timestamp: new Date().toISOString(),
    };

    // 6. Journalist trigger
    await triggerJournalist('CONSENSUS_ARCHITECTURE', artifacts, context);

    const approved = consensusPacket.final_status === 'APPROVED' || consensusPacket.final_status === 'ARBITRATED';
    return successResult(
      'CONSENSUS_ARCHITECTURE',
      artifacts,
      approved ? 'Architecture consensus APPROVED' : 'Architecture consensus REJECTED',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('CONSENSUS_ARCHITECTURE', 'Architecture consensus failed', message);
  }
}
