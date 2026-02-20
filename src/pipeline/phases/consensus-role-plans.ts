/**
 * CONSENSUS_ROLE_PLANS phase — validate each role plan.
 * Checks dependency satisfaction (FE->API, BE->DB, QA->features).
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

export async function runConsensusRolePlans(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, gateEngine, consensusRunner, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Fresh repo snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const snapshotEntry = createSnapshotArtifact(snapshot, artifactManager, 'CONSENSUS_ROLE_PLANS');
    artifacts.push(snapshotEntry);
    pipeline.latestRepoSnapshot = artifactManager.toArtifactRef(snapshotEntry);

    // 2. Find all role plan artifacts
    const rolePlanArtifacts = pipeline.artifacts.filter((a) => a.type === 'role_plan');
    if (rolePlanArtifacts.length === 0) {
      return failureResult('CONSENSUS_ROLE_PLANS', 'No role plan artifacts found');
    }

    const masterPlanArtifact = pipeline.artifacts.find((a) => a.type === 'master_plan');

    // 3. Build plan packet referencing all role plans
    const planPacket = buildPlanPacket({
      phase: 'CONSENSUS_ROLE_PLANS',
      submittedBy: 'DISPATCHER',
      masterPlanRef: masterPlanArtifact
        ? artifactManager.toArtifactRef(masterPlanArtifact)
        : { artifact_id: 'none', path: '', sha256: '', version: 1, type: 'master_plan' },
      constitutionRef: getConstitutionRef(pipeline),
      repoSnapshotRef: artifactManager.toArtifactRef(snapshotEntry),
      proposedArtifacts: rolePlanArtifacts.map((a) => artifactManager.toArtifactRef(a)),
      acceptanceCriteria: [
        'All required role plans present',
        'Each plan includes deterministic file-level outputs',
        'FE plan references API contracts',
        'BE plan references DB schema',
        'QA plan lists executable tests',
      ],
      dependencies: [],
      constraints: [],
    });

    // 4. Run consensus
    const gateDef = gateEngine.getGateDefinition('CONSENSUS_ROLE_PLANS');
    const consensusPacket = await consensusRunner.runStructuredConsensus(planPacket, gateDef);

    // 5. Store consensus artifact
    const consensusEntry = artifactManager.createAndStoreJson(
      'consensus',
      consensusPacket,
      'CONSENSUS_ROLE_PLANS',
    );
    artifacts.push(consensusEntry);
    pipeline.artifacts.push(...artifacts);

    // 5b. Store consensus score in gateResults for parseConsensusScore()
    pipeline.gateResults['CONSENSUS_ROLE_PLANS'] = {
      phase: 'CONSENSUS_ROLE_PLANS',
      pass: consensusPacket.final_status === 'APPROVED' || consensusPacket.final_status === 'ARBITRATED',
      score: consensusPacket.consensus_result.weighted_score,
      blockers: [],
      missingArtifacts: [],
      failedChecks: [],
      consensusScore: consensusPacket.consensus_result.score,
      timestamp: new Date().toISOString(),
    };

    // 6. Journalist trigger
    await triggerJournalist('CONSENSUS_ROLE_PLANS', artifacts, context);

    const approved = consensusPacket.final_status === 'APPROVED' || consensusPacket.final_status === 'ARBITRATED';
    return successResult(
      'CONSENSUS_ROLE_PLANS',
      artifacts,
      approved ? 'Role plans consensus APPROVED' : 'Role plans consensus REJECTED',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('CONSENSUS_ROLE_PLANS', 'Role plans consensus failed', message);
  }
}
