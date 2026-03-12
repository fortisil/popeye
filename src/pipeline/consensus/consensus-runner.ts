/**
 * Consensus Runner — adapter layer between structured packets
 * and existing consensus machinery.
 *
 * Two modes (P1-D):
 * 1. Independent Review (DEFAULT): N reviewers review simultaneously,
 *    no reviewer sees other reviewers' output.
 * 2. Iterative Consensus (optional): for recovery plan iteration.
 *
 * v2.1: Vote normalization pipeline, tag reclassification, hard-blocker
 *       detection, config-driven arbitration, reviewer rubric.
 */

import { createHash } from 'node:crypto';
import logging from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import type {
  PlanPacket,
  ConsensusPacket,
  ReviewerVote,
} from '../types.js';
import type { GateDefinition } from '../gate-engine.js';
import { buildConsensusPacket } from '../packets/consensus-packet-builder.js';
import type { ConsensusRules, NormalizationSummary } from '../packets/consensus-packet-builder.js';
import { isNoneVariant } from '../../shared/text-utils.js';
import { queryProvider } from './arbitrator-query.js';

// Re-use existing consensus infrastructure
import { iterateUntilConsensus } from '../../workflow/consensus.js';
import type { ConsensusConfig, ArbitrationResult } from '../../types/consensus.js';

const logger = logging;

// ─── Hard Blocker Patterns ───────────────────────────────
// Module-level const so both containsHardBlockerPatterns() and
// the forced-REJECT block in normalizeVoteBlockers() can reference it.

const HARD_BLOCKER_PATTERNS: RegExp[] = [
  /\bsql injection\b/i,
  /\bxss\b/i,
  /\bsecurity vulnerabilit(?:y|ies)\b/i,
  /\b(?:build|tests?)\s+(?:is|are\s+)?failing\b/i,
  /\bfails?\s+(?:in\s+)?(?:ci|pipeline|compilation)\b/i,
  /\bdata loss\b/i,
  /\bcritical\s+(?:bug|defect|error)\b/i,
];

// ─── Tag Classification ──────────────────────────────────

interface TagClassification {
  blockers: string[];
  required: string[];
  suggestions: string[];
  untagged: Array<{ text: string; origin: 'blocking' | 'required' | 'suggestion' }>;
}

function stripTag(s: string): string {
  return s.replace(/^\[(BLOCKER|REQUIRED|SUGGESTION)\]\s*/i, '');
}

/**
 * Pool ALL issue lists, classify by tag prefix.
 * Untagged items retain their origin field for downstream routing.
 */
function parseTaggedIssues(
  blockingIssues: string[],
  requiredChanges: string[],
  suggestions: string[],
): TagClassification {
  const result: TagClassification = {
    blockers: [], required: [], suggestions: [], untagged: [],
  };

  function classify(items: string[], origin: 'blocking' | 'required' | 'suggestion') {
    for (const issue of items) {
      const trimmed = issue.trim();
      if (!trimmed) continue;
      if (/^\[BLOCKER\]/i.test(trimmed)) result.blockers.push(stripTag(trimmed));
      else if (/^\[REQUIRED\]/i.test(trimmed)) result.required.push(stripTag(trimmed));
      else if (/^\[SUGGESTION\]/i.test(trimmed)) result.suggestions.push(stripTag(trimmed));
      else result.untagged.push({ text: trimmed, origin });
    }
  }

  classify(blockingIssues, 'blocking');
  classify(requiredChanges, 'required');
  classify(suggestions, 'suggestion');
  return result;
}

// ─── Normalization Helpers ───────────────────────────────

const cleanText = (s: string): string => stripTag(s.trim());

const cleanList = (arr: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const s = cleanText(raw);
    if (!s || isNoneVariant(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
};

function containsHardBlockerPatterns(issues: string[]): boolean {
  return issues.some(issue => HARD_BLOCKER_PATTERNS.some(p => p.test(issue)));
}

// ─── Vote Normalization Pipeline ─────────────────────────

/**
 * Normalize votes: pool → classify by tag → detect hard blockers → route by vote → dedup.
 * Called after collecting votes, before buildConsensusPacket().
 * Idempotent: running twice produces the same result.
 */
export function normalizeVoteBlockers(
  votes: ReviewerVote[],
): { votes: ReviewerVote[]; summary: NormalizationSummary } {
  const summary: NormalizationSummary = {
    tagged_blockers_demoted_to_suggestions: 0,
    tagged_blockers_demoted_to_required: 0,
    untagged_from_blocking_routed_to_required: 0,
    forced_rejects: 0,
  };

  const normalized = votes.map((v) => {
    // Step 1: Pool ALL issue lists, classify by tag
    const tagged = parseTaggedIssues(
      v.blocking_issues.filter(i => !isNoneVariant(i)),
      (v.required_changes ?? []),
      v.suggestions,
    );

    // Step 2: Contradiction guard — scan ALL pooled text for hard blockers
    const hasTaggedBlocker = tagged.blockers.length > 0;
    const allPooledText = [
      ...tagged.blockers, ...tagged.required, ...tagged.suggestions,
      ...tagged.untagged.map(u => u.text),
    ].map(cleanText);
    const hasHardPattern = containsHardBlockerPatterns(allPooledText);

    // v2.4.4: Vote-aware contradiction guard
    // Principle:
    //   APPROVE + any hard pattern anywhere = genuinely inconsistent -> force REJECT
    //   CONDITIONAL = force REJECT only if [BLOCKER] tag OR hard pattern in blocker-origin text
    //   REJECT = already reject, no forcing needed
    const hasHardPatternAnywhere = hasHardPattern; // already computed above (allPooledText)
    const blockerOriginText = [
      ...tagged.blockers,
      ...tagged.untagged.filter(u => u.origin === 'blocking').map(u => u.text),
    ].map(cleanText);
    const hasHardPatternInBlockers = containsHardBlockerPatterns(blockerOriginText);

    const forceReject =
      (v.vote === 'APPROVE' && (hasTaggedBlocker || hasHardPatternAnywhere)) ||
      (v.vote === 'CONDITIONAL' && (hasTaggedBlocker || hasHardPatternInBlockers));

    if (forceReject) {
      summary.forced_rejects++;

      // Debug logging for forced-reject diagnosis
      logger.log(
        `[consensus] Forced REJECT: vote=${v.vote} reviewer=${v.reviewer_id} ` +
        `hasTaggedBlocker=${hasTaggedBlocker} hasHardPatternAnywhere=${hasHardPatternAnywhere} ` +
        `hasHardPatternInBlockers=${hasHardPatternInBlockers}`,
      );

      // Build minimal hard-blocker set: tagged blockers + any text matching patterns
      const hardBlockers = [
        ...tagged.blockers,
        ...tagged.untagged.map(u => u.text).filter(t => HARD_BLOCKER_PATTERNS.some(p => p.test(t))),
        ...tagged.required.filter(t => HARD_BLOCKER_PATTERNS.some(p => p.test(t))),
        ...tagged.suggestions.filter(t => HARD_BLOCKER_PATTERNS.some(p => p.test(t))),
      ];
      // Non-hard items go to required_changes
      const nonHard = [
        ...tagged.required.filter(t => !HARD_BLOCKER_PATTERNS.some(p => p.test(t))),
        ...tagged.untagged.filter(u => u.origin === 'required').map(u => u.text),
        ...tagged.untagged.filter(u => u.origin === 'blocking').map(u => u.text)
          .filter(t => !HARD_BLOCKER_PATTERNS.some(p => p.test(t))),
      ];
      const nonHardSuggestions = [
        ...tagged.suggestions.filter(t => !HARD_BLOCKER_PATTERNS.some(p => p.test(t))),
        ...tagged.untagged.filter(u => u.origin === 'suggestion').map(u => u.text),
      ];
      return {
        ...v,
        vote: 'REJECT' as const,
        blocking_issues: cleanList(hardBlockers),
        required_changes: cleanList(nonHard),
        suggestions: cleanList(nonHardSuggestions),
        reviewer_inconsistency: true,
      };
    }

    // Step 3: Vote-consistent routing for untagged items
    switch (v.vote) {
      case 'APPROVE': {
        // APPROVE = execution-ready. Tagged blockers → suggestions. All untagged → suggestions.
        summary.tagged_blockers_demoted_to_suggestions += tagged.blockers.length;
        return {
          ...v,
          blocking_issues: [] as string[],
          required_changes: cleanList([...tagged.required]),
          suggestions: cleanList([
            ...tagged.suggestions,
            ...tagged.blockers,
            ...tagged.untagged.map(u => u.text),
          ]),
        };
      }
      case 'CONDITIONAL': {
        // CONDITIONAL: tagged blockers → required_changes, untagged-from-blocking → required_changes
        summary.tagged_blockers_demoted_to_required += tagged.blockers.length;
        summary.untagged_from_blocking_routed_to_required += tagged.untagged.filter(u => u.origin === 'blocking').length;
        return {
          ...v,
          blocking_issues: [] as string[],
          required_changes: cleanList([
            ...tagged.required,
            ...tagged.blockers,
            ...tagged.untagged.filter(u => u.origin === 'blocking').map(u => u.text),
            ...tagged.untagged.filter(u => u.origin === 'required').map(u => u.text),
          ]),
          suggestions: cleanList([
            ...tagged.suggestions,
            ...tagged.untagged.filter(u => u.origin === 'suggestion').map(u => u.text),
          ]),
        };
      }
      case 'REJECT': {
        // REJECT: untagged-from-blocking stays as blockers
        return {
          ...v,
          blocking_issues: cleanList([
            ...tagged.blockers,
            ...tagged.untagged.filter(u => u.origin === 'blocking').map(u => u.text),
          ]),
          required_changes: cleanList([
            ...tagged.required,
            ...tagged.untagged.filter(u => u.origin === 'required').map(u => u.text),
          ]),
          suggestions: cleanList([
            ...tagged.suggestions,
            ...tagged.untagged.filter(u => u.origin === 'suggestion').map(u => u.text),
          ]),
        };
      }
    }
  });

  return { votes: normalized, summary };
}

// ─── Vote Mapping ────────────────────────────────────────

/**
 * Floor confidence score for CONDITIONAL votes.
 * Matches adapter rubric: 80-94% = "minor revisions needed".
 */
export const DEFAULT_CONDITIONAL_FLOOR = 0.80;

/**
 * Map a reviewer's confidence score (0-1) to a structured vote.
 * Threshold-aware: APPROVE = meets gate bar, CONDITIONAL = iterate, REJECT = major rework.
 */
export function mapVote(
  confidence: number,
  threshold: number,
  conditionalFloor: number = DEFAULT_CONDITIONAL_FLOOR,
): 'APPROVE' | 'CONDITIONAL' | 'REJECT' {
  const c = Math.max(0, Math.min(1, confidence));
  const t = Math.max(0, Math.min(1, threshold));
  const f = Math.max(0, Math.min(t, conditionalFloor));

  if (c >= t) return 'APPROVE';
  if (c >= f) return 'CONDITIONAL';
  return 'REJECT';
}

// ─── Vote Disagreement Detection ─────────────────────────

/**
 * Check if votes have meaningful disagreement (not unanimous).
 */
export function hasVoteDisagreement(votes: ReviewerVote[]): boolean {
  if (votes.length <= 1) return false;
  const uniqueVotes = new Set(votes.map(v => v.vote));
  return uniqueVotes.size > 1;
}

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
  /** Arbitrator provider configuration (v2.1) */
  arbitratorProvider?: ReviewerProviderConfig;
  /** Enable arbitration for deadlocked votes (v2.1) */
  enableArbitration?: boolean;
  /** Skill loader for injecting reviewer/arbitrator skills (v2.2.1) */
  skillLoader?: import('../skill-loader.js').SkillLoader;
  /** Skill usage registry for recording usage events (v2.2.1) */
  skillUsageRegistry?: import('../skills/usage-registry.js').SkillUsageRegistry;
}

export interface ReviewerProviderConfig {
  provider: string;   // 'openai' | 'gemini' | 'grok'
  model: string;
  temperature: number;
}

const DEFAULT_PROVIDERS: ReviewerProviderConfig[] = [
  { provider: 'openai', model: 'gpt-4.1', temperature: 0.3 },
  { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 },
];

// ─── Plan Content Loader ─────────────────────────────────

/** Max plan content chars to embed in prompt (50K ~ safe for all providers). */
const MAX_PLAN_CONTENT_CHARS = 50_000;

/**
 * Safely load plan content from disk.
 * - Path traversal guard: resolved path must start with projectDir.
 * - Size cap: truncates with marker if content exceeds MAX_PLAN_CONTENT_CHARS.
 */
export function loadPlanContent(
  projectDir: string,
  artifactPath: string | undefined,
): { content: string; truncated: boolean } {
  if (!artifactPath) {
    logger.warn('[consensus] No master plan path in packet references');
    return { content: '', truncated: false };
  }

  const resolvedProject = resolve(projectDir);
  const fullPath = resolve(projectDir, artifactPath);

  // Path traversal guard: resolved path must be inside projectDir
  if (!fullPath.startsWith(resolvedProject + '/') && fullPath !== resolvedProject) {
    logger.warn(`[consensus] Path traversal blocked: ${artifactPath} resolved to ${fullPath}`);
    return { content: '', truncated: false };
  }

  if (!existsSync(fullPath)) {
    logger.warn(`[consensus] Plan artifact not found at ${fullPath}`);
    return { content: '', truncated: false };
  }

  let content = readFileSync(fullPath, 'utf-8');
  let truncated = false;

  if (content.length > MAX_PLAN_CONTENT_CHARS) {
    content = content.slice(0, MAX_PLAN_CONTENT_CHARS)
      + '\n\n[TRUNCATED -- plan exceeds 50K chars. Review based on visible content.]';
    truncated = true;
    logger.warn(`[consensus] Plan content truncated to ${MAX_PLAN_CONTENT_CHARS} chars`);
  }

  logger.log(`[consensus] Loaded plan content from ${artifactPath} (${content.length} chars${truncated ? ', truncated' : ''})`);
  return { content, truncated };
}

// ─── Arbitration Trigger Detection (v2.4.2) ─────────────

export type ArbitrationTrigger = 'DISAGREEMENT' | 'BORDERLINE_SCORE' | 'ALL_CONDITIONAL' | 'NONE';

/**
 * Determine whether arbitration should be triggered and why.
 * Pure function — no side effects, easily unit-testable.
 */
export function getArbitrationTrigger(
  votes: ReviewerVote[],
  weightedScore: number,
  threshold: number,
): ArbitrationTrigger {
  if (hasVoteDisagreement(votes)) return 'DISAGREEMENT';

  if (weightedScore >= (threshold - 0.10)) return 'BORDERLINE_SCORE';

  const avgConfidence = votes.reduce((s, v) => s + v.confidence, 0) / votes.length;
  const allConditional = votes.every(v => v.vote === 'CONDITIONAL');
  const totalRequired = votes.reduce((sum, v) => sum + (v.required_changes?.length ?? 0), 0);

  if (allConditional && avgConfidence >= 0.94 && totalRequired <= 3) return 'ALL_CONDITIONAL';
  return 'NONE';
}

// ─── Consensus Runner ────────────────────────────────────

export class ConsensusRunner {
  private readonly config: ConsensusRunnerConfig;
  private arbitrationAttempted = new Set<string>();

  constructor(config: ConsensusRunnerConfig) {
    this.config = config;
  }

  /** Run structured consensus on a plan packet */
  async runStructuredConsensus(
    planPacket: PlanPacket,
    gateDefinition: GateDefinition,
    options?: { revisionDirective?: string },
  ): Promise<ConsensusPacket> {
    const rules: ConsensusRules = {
      threshold: gateDefinition.consensusThreshold ?? this.config.threshold,
      quorum: this.config.quorum,
      min_reviewers: gateDefinition.minReviewers ?? this.config.minReviewers,
    };

    // v2.4.4: Dev-time warning when version is missing or stuck at 1
    if (planPacket.metadata.version === undefined || planPacket.metadata.version <= 1) {
      logger.warn(
        `[consensus] Phase ${planPacket.metadata.phase}: version=${planPacket.metadata.version ?? 'undefined'} ` +
        `— ensure this is intentional (not a missing recoveryCount passthrough)`,
      );
    }

    // v2.2.1: Record REVIEWER skill usage if loader available
    if (this.config.skillLoader && this.config.skillUsageRegistry) {
      const { meta } = this.config.skillLoader.loadSkillWithMeta('REVIEWER');
      this.config.skillUsageRegistry.record(
        'REVIEWER',
        planPacket.metadata.phase,
        'review_prompt',
        meta.source,
        meta.version,
      );
    }

    // Load actual plan content from disk for inclusion in review prompt
    const { content: planContent } = loadPlanContent(
      this.config.projectDir,
      planPacket.references.master_plan?.path,
    );

    const revisionDirective = options?.revisionDirective;
    let votes: ReviewerVote[];

    if (this.config.mode === 'independent') {
      votes = await this.runIndependentReview(planPacket, planContent, revisionDirective);
    } else {
      votes = await this.runIterativeReview(planPacket, planContent, revisionDirective);
    }

    // v2.1: Normalize votes before scoring
    const { votes: normalizedVotes, summary: normSummary } = normalizeVoteBlockers(votes);

    if (normSummary.forced_rejects > 0) {
      logger.warn(
        `[consensus] Normalization forced ${normSummary.forced_rejects} vote(s) to REJECT due to blocker/pattern contradiction`,
      );
    }

    logger.log(`[consensus] Normalization: ${JSON.stringify(normSummary)}`);
    for (const v of normalizedVotes) {
      logger.log(
        `[consensus] Normalized: ${v.reviewer_id} vote=${v.vote} conf=${v.confidence.toFixed(3)} blockers=${v.blocking_issues.length}`,
      );
    }

    // Build consensus packet from normalized votes
    const packet = buildConsensusPacket({
      planPacketRef: {
        artifact_id: planPacket.metadata.packet_id,
        path: '',
        sha256: '',
        version: planPacket.metadata.version,
        type: 'consensus',
      },
      votes: normalizedVotes,
      rules,
      normalizationMoves: normSummary,
    });

    logger.log(
      `[consensus] Result: weighted_score=${packet.consensus_result.weighted_score.toFixed(3)} score=${packet.consensus_result.score.toFixed(3)} status=${packet.final_status}`,
    );

    // v2.4.2: Attempt arbitration for REJECTED packets if enabled
    if (
      packet.final_status === 'REJECTED'
      && this.config.enableArbitration
      && !this.arbitrationAttempted.has(`${planPacket.metadata.phase}@v${planPacket.metadata.version}`)
    ) {
      const arbitrationTrigger = getArbitrationTrigger(
        normalizedVotes, packet.consensus_result.weighted_score, rules.threshold,
      );
      const shouldArbitrate = arbitrationTrigger !== 'NONE';

      if (shouldArbitrate) {
        logger.log(
          `[consensus] Arbitration triggered: reason=${arbitrationTrigger} weighted_score=${packet.consensus_result.weighted_score.toFixed(3)}`,
        );
        this.arbitrationAttempted.add(`${planPacket.metadata.phase}@v${planPacket.metadata.version}`);
        const arbResult = await this.callArbitrator(planPacket, normalizedVotes, rules, planContent);
        if (arbResult?.approved) {
          // v2.2.1: Record ARBITRATOR skill usage
          if (this.config.skillLoader && this.config.skillUsageRegistry) {
            const { meta } = this.config.skillLoader.loadSkillWithMeta('ARBITRATOR');
            this.config.skillUsageRegistry.record(
              'ARBITRATOR',
              planPacket.metadata.phase,
              'arbitration_prompt',
              meta.source,
              meta.version,
            );
          }

          // Rebuild with arbitration
          return buildConsensusPacket({
            planPacketRef: {
              artifact_id: planPacket.metadata.packet_id,
              path: '',
              sha256: '',
              version: planPacket.metadata.version,
              type: 'consensus',
            },
            votes: normalizedVotes,
            rules,
            arbitratorResult: {
              decision: arbResult.reasoning,
              merged_patch: arbResult.suggestedChanges?.join('\n'),
            },
            normalizationMoves: normSummary,
          });
        }
      }
    }

    // v2.2.1: Record ARBITRATOR skill usage if arbitration occurred (legacy path)
    if (packet.final_status === 'ARBITRATED' && this.config.skillLoader && this.config.skillUsageRegistry) {
      const { meta } = this.config.skillLoader.loadSkillWithMeta('ARBITRATOR');
      this.config.skillUsageRegistry.record(
        'ARBITRATOR',
        planPacket.metadata.phase,
        'arbitration_prompt',
        meta.source,
        meta.version,
      );
    }

    // v2.4.2: Diagnostic logging at high version counts
    if (planPacket.metadata.version >= 3) {
      logger.warn(
        `[consensus] High iteration count: phase=${planPacket.metadata.phase} version=${planPacket.metadata.version} `
        + `weighted_score=${packet.consensus_result.weighted_score.toFixed(3)} `
        + `has_true_blockers=${packet.consensus_result.has_true_blockers} `
        + `status=${packet.final_status}`,
      );
    }

    return packet;
  }

  /** Independent review: spawn N reviewers, each reviews independently */
  async runIndependentReview(planPacket: PlanPacket, planContent: string, revisionDirective?: string): Promise<ReviewerVote[]> {
    let providers = [...(this.config.reviewerProviders ?? DEFAULT_PROVIDERS)];

    // v2.4.2: Escalation — add tie-breaking reviewer on high iteration count.
    // Only select from configured providers (arbitrator config is a valid source).
    if (planPacket.metadata.version >= 3 && providers.length < 3) {
      const existingNames = new Set(providers.map(p => p.provider));

      // Build candidates from: arbitrator provider + all configured reviewers (deduplicated)
      const candidates = new Set<string>();
      if (this.config.arbitratorProvider) candidates.add(this.config.arbitratorProvider.provider);
      for (const p of this.config.reviewerProviders ?? DEFAULT_PROVIDERS) candidates.add(p.provider);

      // Pick first configured provider not already reviewing
      const PREFERRED_ORDER = ['grok', 'openai', 'gemini'];
      const tieBreaker = PREFERRED_ORDER.find(p => candidates.has(p) && !existingNames.has(p));

      if (tieBreaker) {
        const model = getModelForProvider(this.config.consensusConfig, tieBreaker);
        providers.push({ provider: tieBreaker, model, temperature: 0.3 });
        logger.log(
          `[consensus] Escalation: added ${tieBreaker}/${model} as tie-breaking reviewer (v${planPacket.metadata.version})`,
        );
      } else {
        logger.warn(
          `[consensus] Escalation: no additional provider available. ` +
          `configured=${[...candidates].join(',')} ` +
          `in_use=${[...existingNames].join(',')}`,
        );
      }
    }

    const numReviewers = Math.max(
      this.config.minReviewers,
      providers.length,
    );

    const prompt = buildReviewPrompt(planPacket, planContent, revisionDirective);
    const promptHash = createHash('sha256').update(prompt).digest('hex');

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
  async runIterativeReview(planPacket: PlanPacket, planContent: string, revisionDirective?: string): Promise<ReviewerVote[]> {
    const prompt = buildReviewPrompt(planPacket, planContent, revisionDirective);

    try {
      const result = await iterateUntilConsensus(
        prompt,
        `Phase: ${planPacket.metadata.phase}`,
        {
          projectDir: this.config.projectDir,
          config: this.config.consensusConfig,
        },
      );

      const iterativeConfidence = (result.finalScore ?? 50) / 100;
      const vote: ReviewerVote = {
        reviewer_id: 'iterative-reviewer',
        provider: 'openai',
        model: this.config.consensusConfig?.openaiModel ?? 'gpt-4.1',
        temperature: this.config.consensusConfig?.temperature ?? 0.3,
        prompt_hash: createHash('sha256').update(prompt).digest('hex'),
        vote: mapVote(iterativeConfidence, this.config.threshold),
        confidence: iterativeConfidence,
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

  /**
   * Spawn a single independent reviewer.
   * Governance rule: vote is ALWAYS derived from confidence via mapVote().
   * The LLM's explicit vote is advisory only — logged for debugging.
   */
  private async spawnSingleReviewer(
    prompt: string,
    promptHash: string,
    provider: ReviewerProviderConfig,
    reviewerId: string,
  ): Promise<ReviewerVote> {
    try {
      const result = await this.callProviderForReview(prompt, provider);

      // Governance: always derive vote from confidence, never trust LLM's explicit vote
      const derived = mapVote(result.confidence, this.config.threshold);
      const modelVote = result.modelVote ?? null;
      const reviewer_inconsistency = modelVote !== null && modelVote !== derived;

      if (reviewer_inconsistency) {
        logger.log(
          `[consensus] ${provider.provider}: model said ${modelVote} but confidence ${result.confidence.toFixed(3)} -> derived ${derived}`,
        );
      }

      logger.log(
        `[consensus] ${provider.provider}/${provider.model}: vote=${derived} confidence=${result.confidence.toFixed(3)} modelVote=${modelVote ?? 'none'} blockers=${result.blockingIssues.length}`,
      );

      return {
        reviewer_id: reviewerId,
        provider: provider.provider,
        model: provider.model,
        temperature: provider.temperature,
        prompt_hash: promptHash,
        vote: derived,
        confidence: result.confidence,
        blocking_issues: result.blockingIssues,
        required_changes: result.requiredChanges ?? [],
        suggestions: result.suggestions,
        evidence_refs: [],
        reviewer_inconsistency,
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

  /**
   * Call the appropriate provider adapter for a review.
   * Uses requestRawReview() to bypass adapter prompt wrapping/parsing —
   * the runner owns the prompt and parses the raw LLM response itself.
   */
  private async callProviderForReview(
    prompt: string,
    provider: ReviewerProviderConfig,
  ): Promise<ProviderReviewResult> {
    let raw: string;

    switch (provider.provider) {
      case 'openai': {
        const { requestRawReview } = await import('../../adapters/openai.js');
        raw = await requestRawReview(prompt, {
          openaiModel: provider.model,
          temperature: provider.temperature,
        } as Partial<ConsensusConfig>);
        break;
      }
      case 'gemini': {
        const { requestRawReview } = await import('../../adapters/gemini.js');
        raw = await requestRawReview(prompt, {
          model: provider.model,
          temperature: provider.temperature,
        });
        break;
      }
      case 'grok': {
        const { requestRawReview } = await import('../../adapters/grok.js');
        raw = await requestRawReview(prompt, {
          model: provider.model,
          temperature: provider.temperature,
        });
        break;
      }
      default:
        throw new Error(`Unknown provider: ${provider.provider}`);
    }

    logger.log(`[consensus] raw(${provider.provider}/${provider.model}): ${raw.slice(0, 500)}`);
    return parseRawReviewResponse(raw);
  }

  /**
   * Call arbitrator provider for tie-breaking (v2.1).
   * v2.4.2: Rotates arbitrator away from dissenting reviewers to prevent
   * systematic failure (e.g., Gemini rejects as reviewer + as arbitrator).
   */
  private async callArbitrator(
    planPacket: PlanPacket,
    votes: ReviewerVote[],
    _rules: ConsensusRules,
    planContent?: string,
  ): Promise<ArbitrationResult | null> {
    let provider = this.config.arbitratorProvider;
    if (!provider) return null;

    // v2.4.2: Rotate arbitrator away from dissenting reviewers
    const dissentingProviders = new Set(
      votes.filter(v => v.vote === 'REJECT').map(v => v.provider),
    );
    if (dissentingProviders.has(provider.provider)) {
      const configuredProviders = new Set(
        (this.config.reviewerProviders ?? DEFAULT_PROVIDERS).map(p => p.provider),
      );
      if (this.config.arbitratorProvider) configuredProviders.add(this.config.arbitratorProvider.provider);

      const ARBITRATOR_FALLBACK_ORDER = ['openai', 'grok', 'gemini'];
      const alternate = ARBITRATOR_FALLBACK_ORDER.find(
        p => !dissentingProviders.has(p) && configuredProviders.has(p),
      );
      if (alternate && alternate !== provider.provider) {
        const model = getModelForProvider(this.config.consensusConfig, alternate);
        logger.log(
          `[consensus] Arbitrator rotation: ${provider.provider} is a dissenter, switching to ${alternate}/${model}`,
        );
        provider = { provider: alternate, model, temperature: 0.2 };
      } else {
        logger.warn(
          `[consensus] Arbitrator rotation: no configured non-dissenter provider available, keeping ${provider.provider}`,
        );
      }
    }

    try {
      const prompt = buildArbitrationPrompt(planPacket, votes, planContent);

      // v2.6.0: Use shared queryProvider for adapter wiring + timeout
      const raw = await queryProvider(prompt, provider);
      if (!raw) return null;

      logger.log(`[consensus] arbitrator raw(${provider.provider}/${provider.model}): ${raw.slice(0, 500)}`);

      // v2.4.3: Dedicated arbitrator response parser (not reviewer schema)
      const parsed = parseArbitratorResponse(raw);

      logger.log(
        `[consensus] Arbitrator decision: approved=${parsed.approved} ` +
        `suggestedChanges=${parsed.suggestedChanges.length}`,
      );

      return {
        approved: parsed.approved,
        score: parsed.approved ? 90 : 10,
        analysis: raw.slice(0, 2000),
        criticalConcerns: [],
        minorConcerns: [],
        subjectiveConcerns: [],
        reasoning: parsed.reasoning || raw.slice(0, 2000),
        suggestedChanges: parsed.suggestedChanges,
        rawResponse: raw,
      };
    } catch (err) {
      logger.warn(`[consensus] Arbitration call failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }
  }
}

// ─── Helper Types ────────────────────────────────────────

export interface ProviderReviewResult {
  confidence: number;
  blockingIssues: string[];
  suggestions: string[];
  requiredChanges?: string[];
  /** LLM's explicit vote — advisory only, never used for gate decisions */
  modelVote?: 'APPROVE' | 'REJECT' | 'CONDITIONAL' | null;
}

// ─── JSON-first Response Parsing ─────────────────────────

/**
 * Zod schema for structured JSON review responses from the LLM.
 */
const ReviewResponseSchema = z.object({
  vote: z.enum(['APPROVE', 'CONDITIONAL', 'REJECT']),
  confidence: z.number().min(0).max(1),
  blocking_issues: z.array(z.string()).default([]),
  required_changes: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  analysis: z.string().optional(),
});

/**
 * Parse raw LLM response text into a ProviderReviewResult.
 * Strategy 1: Try JSON parse first (expected format).
 * Strategy 2: Regex fallback for free-form text responses.
 *
 * @param raw - Raw text from the LLM
 * @returns Parsed review result with confidence, issues, and advisory vote
 */
export function parseRawReviewResponse(raw: string): ProviderReviewResult {
  const jsonResult = tryParseJSON(raw);
  const result = jsonResult ?? parseRegexFallback(raw);

  // Correct confidence if vote and confidence are semantically contradictory
  const { confidence, wasContradiction, original } = correctConfidenceContradiction(
    result.modelVote ?? null,
    result.confidence,
  );

  if (wasContradiction) {
    logger.warn(
      `[consensus] Confidence contradiction corrected: vote=${result.modelVote} `
      + `conf=${original.toFixed(3)} -> corrected=${confidence.toFixed(3)}`,
    );
  }

  return { ...result, confidence };
}

/**
 * Attempt to parse a JSON response, optionally wrapped in markdown code fences.
 */
function tryParseJSON(raw: string): ProviderReviewResult | null {
  // Extract JSON from response (may be wrapped in markdown code fences)
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const candidate = (jsonMatch ? jsonMatch[1] : raw).trim();
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    const validated = ReviewResponseSchema.safeParse(parsed);
    if (!validated.success) return null;
    const d = validated.data;
    return {
      confidence: d.confidence,
      blockingIssues: d.blocking_issues,
      suggestions: d.suggestions,
      requiredChanges: d.required_changes,
      modelVote: d.vote,
    };
  } catch {
    return null;
  }
}

/**
 * Regex fallback parser for free-form text responses.
 * Extracts vote, confidence, and issue lists from unstructured text.
 */
function parseRegexFallback(raw: string): ProviderReviewResult {
  // Extract vote (advisory only)
  const voteMatch = raw.match(/\bVOTE:\s*(APPROVE|REJECT|CONDITIONAL)\b/i)
    || raw.match(/\b(APPROVE|REJECT|CONDITIONAL)\b/i);
  const modelVote = voteMatch
    ? voteMatch[1].toUpperCase() as 'APPROVE' | 'REJECT' | 'CONDITIONAL'
    : null;

  // Extract confidence (0-1 scale) — try multiple patterns
  // Note: JSON keys have quotes ("confidence": 0.88), so patterns must handle optional quotes
  let confidence = 0;
  const confPatterns = [
    /"?CONFIDENCE"?\s*:\s*(\d+\.?\d*)/i,
    /"?[Cc]onfidence"?\s*(?:score)?[:\s]+(\d+\.?\d*)/,
    /(\d+\.?\d*)\s*\/\s*1(?:\.0)?/,
  ];
  for (const pattern of confPatterns) {
    const match = raw.match(pattern);
    if (match) {
      const val = parseFloat(match[1]);
      confidence = val > 1 ? val / 100 : val;
      break;
    }
  }
  // Fallback: CONSENSUS: XX% format (legacy adapter format)
  if (confidence === 0) {
    const consensusMatch = raw.match(/CONSENSUS:\s*(\d+)%/i);
    if (consensusMatch) confidence = parseInt(consensusMatch[1], 10) / 100;
  }

  // Extract issues — handle flexible section headings and tagged items
  const blockingIssues = extractTaggedList(raw, 'BLOCKER')
    .concat(extractSectionList(raw, 'BLOCKING.?ISSUES'));
  const requiredChanges = extractTaggedList(raw, 'REQUIRED')
    .concat(extractSectionList(raw, 'REQUIRED.?CHANGES'));
  const suggestions = extractTaggedList(raw, 'SUGGESTION')
    .concat(extractSectionList(raw, 'SUGGESTIONS', 'CONCERNS', 'RECOMMENDATIONS'));

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    blockingIssues: dedup(blockingIssues),
    suggestions: dedup(suggestions),
    requiredChanges: dedup(requiredChanges),
    modelVote,
  };
}

/**
 * Extract items prefixed with [TAG] from raw text.
 * E.g. "[BLOCKER] SQL injection vulnerability" → "SQL injection vulnerability"
 */
function extractTaggedList(raw: string, tag: string): string[] {
  const regex = new RegExp(`\\[${tag}\\]\\s*:?\\s*(.+)`, 'gi');
  const items: string[] = [];
  let m;
  while ((m = regex.exec(raw)) !== null) items.push(m[1].trim());
  return items;
}

/**
 * Extract bullet items from a named section (flexible headings).
 * Handles "BLOCKING ISSUES:", "BLOCKING_ISSUES:", "Blocking Issues:", etc.
 */
function extractSectionList(raw: string, ...patterns: string[]): string[] {
  for (const pat of patterns) {
    const regex = new RegExp(`${pat}[:\\s]*\\n([\\s\\S]*?)(?=\\n(?:[A-Z][A-Z_\\s]+:|##)|$)`, 'i');
    const match = raw.match(regex);
    if (match) {
      return match[1]
        .split('\n')
        .map(l => l.replace(/^[\s]*[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(l => l.length > 0 && !/^none$/i.test(l));
    }
  }
  return [];
}

/**
 * Deduplicate a string array (case-insensitive).
 */
function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter(i => {
    const key = i.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


// ─── Confidence Contradiction Correction ─────────────────

/**
 * Correct confidence when it contradicts the model's explicit vote.
 *
 * The prompt defines confidence as "plan quality score" (0-1) and
 * assigns ranges: REJECT < 0.80, CONDITIONAL 0.80-0.94, APPROVE >= 0.95.
 * Some models confuse this with "assessment certainty" and return e.g.
 * REJECT + 0.99 ("99% sure it's bad"). This function inverts such
 * contradictions so mapVote() receives a semantically correct input.
 *
 * Correction is SYMMETRIC across all three bands:
 * - REJECT + conf >= 0.80  -> invert: min(0.79, 1 - conf)
 * - CONDITIONAL + conf >= 0.95 -> snap to midpoint 0.87
 * - CONDITIONAL + conf < 0.80  -> snap to midpoint 0.87
 * - APPROVE + conf < 0.80 -> invert: max(0.95, 1 - conf)
 * - APPROVE + conf in [0.80, 0.95) -> snap to 0.95
 *
 * If modelVote is null (regex fallback couldn't find a vote), no correction.
 */
export function correctConfidenceContradiction(
  modelVote: 'APPROVE' | 'REJECT' | 'CONDITIONAL' | null,
  rawConfidence: number,
): { confidence: number; wasContradiction: boolean; original: number } {
  if (modelVote === null) {
    return { confidence: rawConfidence, wasContradiction: false, original: rawConfidence };
  }
  const c = Math.max(0, Math.min(1, rawConfidence));

  // REJECT + confidence >= 0.80: model confused "certainty" with "quality"
  // Invert, cap at 0.79 (top of REJECT range)
  if (modelVote === 'REJECT' && c >= 0.80) {
    const corrected = Math.min(0.79, 1.0 - c);
    return { confidence: corrected, wasContradiction: true, original: c };
  }

  // CONDITIONAL outside its range [0.80, 0.95): snap to midpoint 0.87
  if (modelVote === 'CONDITIONAL' && (c >= 0.95 || c < 0.80)) {
    return { confidence: 0.87, wasContradiction: true, original: c };
  }

  // APPROVE + confidence < 0.80: model confused semantics
  // Invert, floor at 0.95 (bottom of APPROVE range)
  if (modelVote === 'APPROVE' && c < 0.80) {
    const corrected = Math.max(0.95, 1.0 - c);
    return { confidence: corrected, wasContradiction: true, original: c };
  }

  // APPROVE + confidence in [0.80, 0.95): slightly off, snap to 0.95
  if (modelVote === 'APPROVE' && c < 0.95) {
    return { confidence: 0.95, wasContradiction: true, original: c };
  }

  return { confidence: c, wasContradiction: false, original: c };
}

// ─── Arbitrator Response Parser (v2.4.3) ─────────────────

/**
 * Zod schema for arbitrator JSON responses.
 * Accepts both camelCase and snake_case for suggestedChanges.
 */
const ArbitratorResponseSchema = z.object({
  approved: z.boolean(),
  reasoning: z.string().optional(),
  suggestedChanges: z.array(z.string()).default([]),
  suggested_changes: z.array(z.string()).default([]),
});

/**
 * Parse raw arbitrator response into a structured result.
 * Strategy 1: JSON parse (optionally wrapped in code fences).
 * Strategy 2: Regex fallback for free-form text.
 *
 * @param raw - Raw text from the arbitrator LLM
 * @returns Parsed result with approved boolean, reasoning, and suggested changes
 */
export function parseArbitratorResponse(raw: string): {
  approved: boolean;
  reasoning: string;
  suggestedChanges: string[];
} {
  // Strategy 1: JSON parse (with optional code fence wrapping)
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const candidate = (jsonMatch ? jsonMatch[1] : raw).trim();
  try {
    const parsed = JSON.parse(candidate);
    const validated = ArbitratorResponseSchema.safeParse(parsed);
    if (validated.success) {
      const data = validated.data;
      return {
        approved: data.approved,
        reasoning: data.reasoning ?? '',
        suggestedChanges: [
          ...(data.suggestedChanges ?? []),
          ...(data.suggested_changes ?? []),
        ],
      };
    }
  } catch { /* fall through to regex */ }

  // Strategy 2: Regex fallback for free-form text
  let approved = false;
  const approvedMatch =
    raw.match(/approved\s*[:=]\s*(true|false)/i) ??
    raw.match(/\b(approve|approved|accept|accepted)\b/i) ??
    raw.match(/\b(reject|rejected|deny|denied)\b/i);

  if (approvedMatch) {
    const val = approvedMatch[1].toLowerCase();
    approved = ['true', 'approve', 'approved', 'accept', 'accepted'].includes(val);
  }

  const changes: string[] = [];
  const changeMatches = raw.matchAll(/(?:^|\n)\s*[-*\d.]+\s+(.+)/g);
  for (const m of changeMatches) changes.push(m[1].trim());

  return { approved, reasoning: raw.slice(0, 2000), suggestedChanges: changes };
}

// ─── Prompt Builder ──────────────────────────────────────

export function buildReviewPrompt(planPacket: PlanPacket, planContent?: string, revisionDirective?: string): string {
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

  // Render plan content (loaded from disk by caller)
  if (planContent && planContent.trim().length > 0) {
    lines.push(`## Plan Content`, ``, planContent, ``);
  } else {
    lines.push(
      `## Plan Content`,
      ``,
      `[WARNING: Plan content could not be loaded. Review based on metadata only.]`,
      ``,
    );
  }

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
    `## Scoring Guide`,
    ``,
    `The "confidence" field represents your assessment of PLAN QUALITY, NOT how certain you are about your review.`,
    `It answers: "How ready is this plan for execution on a scale of 0.00 to 1.00?"`,
    ``,
    `- confidence 0.95-1.00 (vote APPROVE): The plan is EXECUTION-READY as-is.`,
    `- confidence 0.80-0.94 (vote CONDITIONAL): The plan needs specific changes before execution.`,
    `- confidence below 0.80 (vote REJECT): The plan has fundamental issues.`,
    ``,
    `CRITICAL: Your vote and confidence MUST be consistent:`,
    `  - REJECT requires confidence below 0.80`,
    `  - CONDITIONAL requires confidence between 0.80 and 0.94`,
    `  - APPROVE requires confidence 0.95 or above`,
    `Do NOT use confidence to express how certain you are of your assessment.`,
    `A REJECT with confidence 0.99 is INVALID -- it implies the plan is 99% ready while rejecting it.`,
    `Mismatched vote+confidence will be auto-corrected by the system.`,
    ``,
    `IMPORTANT: "Execution-ready" means a competent developer could implement this plan successfully, not that the plan is theoretically perfect. Reserve CONDITIONAL for changes that would cause implementation to fail or produce incorrect results, not style preferences.`,
    ``,
    `## Output Format for Issues`,
    `- Prefix blocking issues with [BLOCKER]: items that MUST be fixed before approval`,
    `- Prefix required changes with [REQUIRED]: items that need changes but are not deal-breakers`,
    `- Prefix suggestions with [SUGGESTION]: nice-to-have improvements`,
    ``,
    `IMPORTANT: If your vote is APPROVE or CONDITIONAL, do NOT list [BLOCKER] items.`,
    `[BLOCKER] items are only valid with a REJECT vote.`,
    ``,
    `## Response Format`,
    ``,
    `Return ONLY a JSON object matching this schema:`,
    ``,
    '```json',
    `{`,
    `  "vote": "APPROVE" | "CONDITIONAL" | "REJECT",`,
    `  "confidence": 0.00,  // Plan quality score, NOT review certainty`,
    `  "blocking_issues": ["[BLOCKER] ..."],`,
    `  "required_changes": ["[REQUIRED] ..."],`,
    `  "suggestions": ["[SUGGESTION] ..."],`,
    `  "analysis": "Your detailed analysis here"`,
    `}`,
    '```',
    ``,
    `### Examples of VALID responses:`,
    `- APPROVE with confidence 0.97: "Plan is solid, minor style nits only"`,
    `- CONDITIONAL with confidence 0.85: "Need to add error handling for X"`,
    `- REJECT with confidence 0.45: "Missing entire auth layer, unclear data model"`,
    ``,
    `### Examples of INVALID responses (will be auto-corrected):`,
    `- REJECT with confidence 0.99: This means "plan is 99% ready" while rejecting it`,
    `- APPROVE with confidence 0.60: This means "plan has issues" while approving it`,
    ``,
    `Confidence = plan quality score (NOT review certainty):`,
    `- 0.95-1.00: APPROVE range -- plan is execution-ready`,
    `- 0.80-0.94: CONDITIONAL range -- specific changes needed`,
    `- Below 0.80: REJECT range -- fundamental issues`,
    ``,
    `Your vote and confidence MUST fall in the same range. Mismatches will be auto-corrected.`,
    ``,
    `If vote is APPROVE: blocking_issues and required_changes must be empty arrays.`,
    `If vote is CONDITIONAL: blocking_issues must be empty, use required_changes.`,
    `If vote is REJECT: use blocking_issues for critical issues.`,
  );

  // v2.4.2: Add revision notice + prior feedback for plan revisions
  if (planPacket.metadata.version > 1) {
    lines.push(
      ``,
      `## Revision Notice`,
      ``,
      `This is revision ${planPacket.metadata.version} of the plan.`,
      `Prioritize verifying whether prior issues have been adequately addressed.`,
      `Also flag any new *critical* issues you discover.`,
      ``,
    );
  }

  if (revisionDirective && revisionDirective.trim().length > 0) {
    const trimmed = revisionDirective.trim();
    const capped = trimmed.length > 2000
      ? trimmed.slice(0, 2000) + '\n\n[TRUNCATED -- full directive exceeds 2000 chars]'
      : trimmed;
    lines.push(
      `## Prior Feedback (Must Address)`,
      ``,
      capped,
      ``,
      `Confirm each item above is addressed or explain why it is not applicable.`,
      ``,
    );
  }

  return lines.join('\n');
}

/**
 * Build arbitration prompt with reviewer feedback context.
 */
function buildArbitrationPrompt(planPacket: PlanPacket, votes: ReviewerVote[], planContent?: string): string {
  const voteSummary = votes.map((v, i) => {
    const parts = [
      `### Reviewer ${i + 1} (${v.provider}/${v.model})`,
      `Vote: ${v.vote} (confidence: ${v.confidence.toFixed(2)})`,
    ];
    if (v.blocking_issues.length > 0) {
      parts.push(`Blocking: ${v.blocking_issues.join('; ')}`);
    }
    if (v.required_changes?.length) {
      parts.push(`Required changes: ${v.required_changes.join('; ')}`);
    }
    if (v.suggestions.length > 0) {
      parts.push(`Suggestions: ${v.suggestions.join('; ')}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const planSection = (planContent && planContent.trim().length > 0)
    ? [`## Plan Content`, ``, planContent, ``]
    : [`## Plan Content`, ``, `[WARNING: Plan content could not be loaded.]`, ``];

  return [
    `# Arbitration Request`,
    ``,
    `## Phase: ${planPacket.metadata.phase}`,
    `## Plan Version: ${planPacket.metadata.version}`,
    ``,
    ...planSection,
    `## Reviewer Votes`,
    voteSummary,
    ``,
    `## Instructions`,
    `The reviewers above could not reach consensus. As arbitrator:`,
    `1. Analyze the disagreement points`,
    `2. Determine if the plan is execution-ready with minor amendments`,
    `3. If approving, provide specific suggestedChanges that address each required_change`,
    `4. If the issues are fundamental, do NOT approve`,
    ``,
    `Provide your decision as: approved (true/false), reasoning, and suggestedChanges array.`,
  ].join('\n');
}

// ─── Factory ─────────────────────────────────────────────

/**
 * Helper to resolve model string for a given provider from consensus config.
 */
export function getModelForProvider(
  config: Partial<ConsensusConfig> | undefined,
  provider: string,
): string {
  if (!config) return provider === 'openai' ? 'gpt-4.1' : provider === 'gemini' ? 'gemini-2.5-flash' : 'grok-3';
  switch (provider) {
    case 'openai': return config.openaiModel ?? 'gpt-4.1';
    case 'gemini': return config.geminiModel ?? 'gemini-2.5-flash';
    case 'grok': return config.grokModel ?? 'grok-3';
    default: return 'gpt-4.1';
  }
}

export function createConsensusRunner(
  projectDir: string,
  consensusConfig?: Partial<ConsensusConfig>,
  skillLoader?: import('../skill-loader.js').SkillLoader,
  skillUsageRegistry?: import('../skills/usage-registry.js').SkillUsageRegistry,
): ConsensusRunner {
  // Wire arbitration from consensus config
  const enableArbitration = consensusConfig?.enableArbitration !== false;
  const arbitratorProvider = enableArbitration
    ? {
        provider: consensusConfig?.arbitrator ?? 'gemini',
        model: getModelForProvider(consensusConfig, consensusConfig?.arbitrator ?? 'gemini'),
        temperature: 0.2,
      }
    : undefined;

  return new ConsensusRunner({
    mode: 'independent',
    minReviewers: 2,
    threshold: 0.95,
    quorum: 2,
    projectDir,
    consensusConfig,
    arbitratorProvider,
    enableArbitration,
    skillLoader,
    skillUsageRegistry,
  });
}
