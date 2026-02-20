/**
 * Consensus Runner — adapter layer between structured packets
 * and existing consensus machinery.
 *
 * Two modes (P1-D):
 * 1. Independent Review (DEFAULT): N reviewers review simultaneously,
 *    no reviewer sees other reviewers' output.
 * 2. Iterative Consensus (optional): for recovery plan iteration.
 */

import { createHash } from 'node:crypto';

import type {
  PlanPacket,
  ConsensusPacket,
  ReviewerVote,
} from '../types.js';
import type { GateDefinition } from '../gate-engine.js';
import { buildConsensusPacket } from '../packets/consensus-packet-builder.js';
import type { ConsensusRules } from '../packets/consensus-packet-builder.js';

// Re-use existing consensus infrastructure
import { iterateUntilConsensus } from '../../workflow/consensus.js';
import type { ConsensusConfig, ConsensusResult } from '../../types/consensus.js';

// ─── Types ───────────────────────────────────────────────

export interface ConsensusRunnerConfig {
  mode: 'independent' | 'iterative';
  minReviewers: number;
  threshold: number;
  quorum: number;
  projectDir: string;
  consensusConfig?: Partial<ConsensusConfig>;
  /** Provider configurations for multi-LLM review */
  reviewerProviders?: ReviewerProviderConfig[];
}

export interface ReviewerProviderConfig {
  provider: string;   // 'openai' | 'gemini' | 'grok'
  model: string;
  temperature: number;
}

const DEFAULT_PROVIDERS: ReviewerProviderConfig[] = [
  { provider: 'openai', model: 'gpt-4o', temperature: 0.3 },
  { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.3 },
];

// ─── Consensus Runner ────────────────────────────────────

export class ConsensusRunner {
  private readonly config: ConsensusRunnerConfig;

  constructor(config: ConsensusRunnerConfig) {
    this.config = config;
  }

  /** Run structured consensus on a plan packet */
  async runStructuredConsensus(
    planPacket: PlanPacket,
    gateDefinition: GateDefinition,
  ): Promise<ConsensusPacket> {
    const rules: ConsensusRules = {
      threshold: gateDefinition.consensusThreshold ?? this.config.threshold,
      quorum: this.config.quorum,
      min_reviewers: gateDefinition.minReviewers ?? this.config.minReviewers,
    };

    let votes: ReviewerVote[];

    if (this.config.mode === 'independent') {
      votes = await this.runIndependentReview(planPacket);
    } else {
      votes = await this.runIterativeReview(planPacket);
    }

    // Build consensus packet from votes
    const packet = buildConsensusPacket({
      planPacketRef: {
        artifact_id: planPacket.metadata.packet_id,
        path: '',
        sha256: '',
        version: planPacket.metadata.version,
        type: 'consensus',
      },
      votes,
      rules,
    });

    return packet;
  }

  /** Independent review: spawn N reviewers, each reviews independently */
  async runIndependentReview(planPacket: PlanPacket): Promise<ReviewerVote[]> {
    const providers = this.config.reviewerProviders ?? DEFAULT_PROVIDERS;
    const numReviewers = Math.max(
      this.config.minReviewers,
      providers.length,
    );

    // Build the review prompt from the plan packet
    const prompt = buildReviewPrompt(planPacket);
    const promptHash = createHash('sha256').update(prompt).digest('hex');

    // Spawn reviewers in parallel
    const reviewPromises: Promise<ReviewerVote>[] = [];
    for (let i = 0; i < numReviewers; i++) {
      const provider = providers[i % providers.length];
      reviewPromises.push(
        this.spawnSingleReviewer(
          prompt,
          promptHash,
          provider,
          `reviewer-${provider.provider}-${i}`,
        ),
      );
    }

    return Promise.all(reviewPromises);
  }

  /** Iterative review: wraps existing iterateUntilConsensus */
  async runIterativeReview(planPacket: PlanPacket): Promise<ReviewerVote[]> {
    const prompt = buildReviewPrompt(planPacket);

    try {
      const result = await iterateUntilConsensus(
        prompt,
        `Phase: ${planPacket.metadata.phase}`,
        {
          projectDir: this.config.projectDir,
          config: this.config.consensusConfig,
        },
      );

      // Convert legacy result to ReviewerVote format
      const vote: ReviewerVote = {
        reviewer_id: 'iterative-reviewer',
        provider: 'openai',
        model: this.config.consensusConfig?.openaiModel ?? 'gpt-4o',
        temperature: this.config.consensusConfig?.temperature ?? 0.3,
        prompt_hash: createHash('sha256').update(prompt).digest('hex'),
        vote: result.approved ? 'APPROVE' : 'REJECT',
        confidence: result.finalScore ?? 0.5,
        blocking_issues: result.finalConcerns ?? [],
        suggestions: result.finalRecommendations ?? [],
        evidence_refs: [],
      };

      return [vote];
    } catch {
      return [{
        reviewer_id: 'iterative-reviewer-error',
        provider: 'openai',
        model: 'unknown',
        temperature: 0,
        prompt_hash: '',
        vote: 'REJECT',
        confidence: 0,
        blocking_issues: ['Iterative consensus failed'],
        suggestions: [],
        evidence_refs: [],
      }];
    }
  }

  /** Spawn a single independent reviewer */
  private async spawnSingleReviewer(
    prompt: string,
    promptHash: string,
    provider: ReviewerProviderConfig,
    reviewerId: string,
  ): Promise<ReviewerVote> {
    try {
      const result = await this.callProviderForReview(prompt, provider);

      return {
        reviewer_id: reviewerId,
        provider: provider.provider,
        model: provider.model,
        temperature: provider.temperature,
        prompt_hash: promptHash,
        vote: result.approved ? 'APPROVE' : 'REJECT',
        confidence: result.confidence,
        blocking_issues: result.blockingIssues,
        suggestions: result.suggestions,
        evidence_refs: [],
      };
    } catch {
      return {
        reviewer_id: reviewerId,
        provider: provider.provider,
        model: provider.model,
        temperature: provider.temperature,
        prompt_hash: promptHash,
        vote: 'REJECT',
        confidence: 0,
        blocking_issues: [`Review failed for ${provider.provider}`],
        suggestions: [],
        evidence_refs: [],
      };
    }
  }

  /** Call the appropriate provider adapter for a review */
  private async callProviderForReview(
    prompt: string,
    provider: ReviewerProviderConfig,
  ): Promise<ProviderReviewResult> {
    switch (provider.provider) {
      case 'openai': {
        const { requestConsensus } = await import('../../adapters/openai.js');
        const result = await requestConsensus(prompt, '', {
          openaiModel: provider.model,
          temperature: provider.temperature,
        } as Partial<ConsensusConfig>);
        return parseConsensusResult(result);
      }
      case 'gemini': {
        const { requestConsensus } = await import('../../adapters/gemini.js');
        const result = await requestConsensus(prompt, '', {
          model: provider.model as never,
          temperature: provider.temperature,
        });
        return parseConsensusResult(result);
      }
      case 'grok': {
        const { requestConsensus } = await import('../../adapters/grok.js');
        const result = await requestConsensus(prompt, '', {
          model: provider.model,
          temperature: provider.temperature,
        });
        return parseConsensusResult(result);
      }
      default:
        throw new Error(`Unknown provider: ${provider.provider}`);
    }
  }
}

// ─── Helper Types ────────────────────────────────────────

interface ProviderReviewResult {
  approved: boolean;
  confidence: number;
  blockingIssues: string[];
  suggestions: string[];
}

function parseConsensusResult(result: ConsensusResult): ProviderReviewResult {
  return {
    approved: result.approved,
    confidence: result.score / 100, // score is 0-100, confidence is 0-1
    blockingIssues: result.concerns ?? [],
    suggestions: result.recommendations ?? [],
  };
}

// ─── Prompt Builder ──────────────────────────────────────

export function buildReviewPrompt(planPacket: PlanPacket): string {
  const lines: string[] = [
    `# Independent Plan Review`,
    ``,
    `## Phase: ${planPacket.metadata.phase}`,
    `## Submitted by: ${planPacket.metadata.submitted_by}`,
    `## Version: ${planPacket.metadata.version}`,
    ``,
    `## Acceptance Criteria`,
    ...planPacket.acceptance_criteria.map((c) => `- ${c}`),
    ``,
    `## Constraints`,
    ...planPacket.constraints.map((c) => `- [${c.type}] ${c.description}`),
    ``,
  ];

  if (planPacket.open_questions?.length) {
    lines.push(`## Open Questions`);
    lines.push(...planPacket.open_questions.map((q) => `- ${q}`));
    lines.push('');
  }

  lines.push(
    `## Review Instructions`,
    ``,
    `You are an independent reviewer. Evaluate this plan for:`,
    `1. Completeness — are all required artifacts defined?`,
    `2. Consistency — do acceptance criteria match constraints?`,
    `3. Feasibility — can this be implemented as described?`,
    `4. Constitution compliance — does it follow governance rules?`,
    ``,
    `Respond with:`,
    `- APPROVE, REJECT, or CONDITIONAL`,
    `- Confidence score (0-1)`,
    `- Blocking issues (if any)`,
    `- Suggestions for improvement`,
  );

  return lines.join('\n');
}

// ─── Factory ─────────────────────────────────────────────

export function createConsensusRunner(
  projectDir: string,
  consensusConfig?: Partial<ConsensusConfig>,
): ConsensusRunner {
  return new ConsensusRunner({
    mode: 'independent',
    minReviewers: 2,
    threshold: 0.95,
    quorum: 2,
    projectDir,
    consensusConfig,
  });
}
