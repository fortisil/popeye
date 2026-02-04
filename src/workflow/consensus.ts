/**
 * Consensus workflow module
 * Handles the iterative consensus-building process between Claude and OpenAI/Gemini
 * with arbitration support when consensus cannot be reached
 */

import type {
  ConsensusResult,
  ConsensusIteration,
  ConsensusConfig,
  ArbitrationResult,
  AIProvider,
  TaggedItem,
  AppConsensusScores,
  CorrectionRecord,
} from '../types/consensus.js';
import { DEFAULT_CONSENSUS_CONFIG } from '../types/consensus.js';
import { requestConsensus as requestOpenAIConsensus } from '../adapters/openai.js';
import { requestConsensus as requestGeminiConsensus, requestArbitration as requestGeminiArbitration } from '../adapters/gemini.js';
import { requestConsensus as requestGrokConsensus, requestArbitration as requestGrokArbitration } from '../adapters/grok.js';
import { revisePlan } from '../adapters/claude.js';
import { recordConsensusIteration } from '../state/index.js';
import {
  createPlanStorage,
  type ReviewerFeedback,
  type FullstackReviewerFeedback,
  type FeedbackAppTarget,
} from './plan-storage.js';

/**
 * Options for consensus iteration
 */
export interface ConsensusOptions {
  projectDir: string;
  config?: Partial<ConsensusConfig>;
  /** Whether this is a fullstack project (enables per-app tracking) */
  isFullstack?: boolean;
  /** Project language for revision prompts */
  language?: 'python' | 'typescript' | 'fullstack';
  onIteration?: (iteration: number, result: ConsensusResult) => void;
  onRevision?: (iteration: number, revisedPlan: string) => void;
  onConcerns?: (concerns: string[], recommendations: string[]) => void;
  onArbitration?: (result: ArbitrationResult) => void;
  onProgress?: (phase: string, message: string) => void;
}

/**
 * Result of the consensus process
 */
export interface ConsensusProcessResult {
  approved: boolean;
  finalPlan: string;
  finalScore: number;
  bestPlan: string;
  bestScore: number;
  bestIteration: number;
  iterations: ConsensusIteration[];
  totalIterations: number;
  finalConcerns: string[];
  finalRecommendations: string[];
  arbitrated: boolean;
  arbitrationResult?: ArbitrationResult;
  /** True if consensus timed out and we accepted the best available plan */
  timedOut?: boolean;
}

/**
 * Request consensus from the configured reviewer (OpenAI, Gemini, or Grok)
 */
async function requestReviewerConsensus(
  plan: string,
  context: string,
  reviewer: AIProvider,
  config: Partial<ConsensusConfig>
): Promise<ConsensusResult> {
  if (reviewer === 'gemini') {
    return requestGeminiConsensus(plan, context, {
      model: config.geminiModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  if (reviewer === 'grok') {
    return requestGrokConsensus(plan, context, {
      model: config.grokModel,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }
  return requestOpenAIConsensus(plan, context, config);
}

/**
 * Request arbitration from the configured arbitrator (OpenAI, Gemini, or Grok)
 */
async function requestArbitratorDecision(
  plan: string,
  reviewerFeedback: string,
  claudeFeedback: string,
  iterations: number,
  scores: number[],
  arbitrator: AIProvider
): Promise<ArbitrationResult> {
  if (arbitrator === 'grok') {
    return requestGrokArbitration(plan, reviewerFeedback, claudeFeedback, iterations, scores);
  }
  // Default to Gemini for arbitration (most capable at reasoning)
  return requestGeminiArbitration(plan, reviewerFeedback, claudeFeedback, iterations, scores);
}

/**
 * Check if the consensus process is "stuck" (not improving)
 * Detects both:
 * 1. Stagnation: scores within 5% of each other
 * 2. Oscillation: scores going up and down without progress
 */
function isStuck(scores: number[], stuckIterations: number): boolean {
  if (scores.length < stuckIterations) return false;

  const recentScores = scores.slice(-stuckIterations);
  const maxRecent = Math.max(...recentScores);
  const minRecent = Math.min(...recentScores);

  // Check 1: Stagnation - all recent scores are within 5% of each other
  if ((maxRecent - minRecent) <= 5) {
    return true;
  }

  // Check 2: Oscillation - detect if we're going up and down without making progress
  // e.g., 70 -> 85 -> 75 -> 80 (oscillating around ~77.5)
  if (recentScores.length >= 3) {
    const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const deviations = recentScores.map(s => Math.abs(s - avg));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

    // If scores are oscillating around an average (avg deviation > 3% but range < 20%)
    // and we're not trending upward, consider it stuck
    if (avgDeviation > 3 && (maxRecent - minRecent) < 20) {
      // Check if we're trending upward (last score should be close to max)
      const lastScore = recentScores[recentScores.length - 1];
      const firstScore = recentScores[0];
      // Not improving if last score is not better than first
      if (lastScore <= firstScore + 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Default consensus timeout (15 minutes total)
 */
const DEFAULT_CONSENSUS_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Format a plan for consensus review
 * Structures the plan in a way that's optimal for review
 *
 * @param plan - The raw plan content
 * @param context - Project context
 * @returns Formatted plan string
 */
export function formatPlanForReview(plan: string, context: string): string {
  return `
## Development Plan

${plan}

## Project Context

${context}
`.trim();
}

/**
 * Extract concerns from a consensus result for revision
 *
 * @param result - The consensus result
 * @returns Array of concerns to address
 */
export function extractConcerns(result: ConsensusResult): string[] {
  const concerns: string[] = [];

  // Add explicit concerns
  if (result.concerns && result.concerns.length > 0) {
    concerns.push(...result.concerns);
  }

  // Add recommendations as concerns to address
  if (result.recommendations && result.recommendations.length > 0) {
    concerns.push(...result.recommendations.map((r) => `Consider: ${r}`));
  }

  return concerns;
}

/**
 * Check if consensus threshold is met
 *
 * @param score - The consensus score
 * @param threshold - The threshold to meet (default from config)
 * @returns True if threshold is met
 */
export function meetsThreshold(
  score: number,
  threshold: number = DEFAULT_CONSENSUS_CONFIG.threshold
): boolean {
  return score >= threshold;
}

/**
 * Iterate until consensus is reached
 * Supports configurable reviewer and arbitration when stuck
 *
 * @param initialPlan - The initial plan to review
 * @param context - Project context
 * @param options - Consensus options
 * @returns The consensus process result
 */
export async function iterateUntilConsensus(
  initialPlan: string,
  context: string,
  options: ConsensusOptions
): Promise<ConsensusProcessResult> {
  const {
    projectDir,
    config = {},
    isFullstack = false,
    language: providedLanguage,
    onIteration,
    onRevision,
    onConcerns,
    onArbitration,
    onProgress,
  } = options;

  // Derive language from isFullstack if not explicitly provided
  const language = providedLanguage || (isFullstack ? 'fullstack' : 'python');

  const {
    threshold = DEFAULT_CONSENSUS_CONFIG.threshold,
    maxIterations = DEFAULT_CONSENSUS_CONFIG.maxIterations,
    reviewer = DEFAULT_CONSENSUS_CONFIG.reviewer,
    arbitrator = DEFAULT_CONSENSUS_CONFIG.arbitrator,
    enableArbitration = DEFAULT_CONSENSUS_CONFIG.enableArbitration,
    arbitrationThreshold = DEFAULT_CONSENSUS_CONFIG.arbitrationThreshold,
    stuckIterations = DEFAULT_CONSENSUS_CONFIG.stuckIterations,
  } = config;

  const iterations: ConsensusIteration[] = [];
  const scores: number[] = [];
  let currentPlan = initialPlan;
  let iteration = 0;

  // Track the best plan throughout the process
  let bestPlan = initialPlan;
  let bestScore = 0;
  let bestIteration = 0;
  let lastConcerns: string[] = [];
  let lastRecommendations: string[] = [];
  let lastAnalysis = '';

  // Track arbitration attempts to prevent infinite loops
  let arbitrationAttempts = 0;

  // Track elapsed time to detect stuck processes
  const startTime = Date.now();
  const maxArbitrationAttempts = 2;

  onProgress?.('consensus', `Using ${reviewer} as reviewer${enableArbitration ? `, ${arbitrator} as arbitrator` : ''}`);

  while (iteration < maxIterations) {
    iteration++;

    // Check total elapsed time - if timing out, try arbitration before giving up
    const totalElapsed = Date.now() - startTime;
    if (totalElapsed > DEFAULT_CONSENSUS_TIMEOUT_MS && enableArbitration && arbitrationAttempts < maxArbitrationAttempts) {
      onProgress?.('consensus', `Consensus timeout after ${Math.round(totalElapsed / 60000)} minutes - invoking arbitrator before accepting`);

      try {
        arbitrationAttempts++;
        const arbitrationResult = await requestArbitratorDecision(
          bestPlan,
          lastAnalysis,
          `Consensus timed out after ${Math.round(totalElapsed / 60000)} minutes. Best score: ${bestScore}%. Main concerns: ${lastConcerns.slice(0, 3).join('; ')}`,
          iteration,
          scores,
          arbitrator
        );

        if (onArbitration) {
          onArbitration(arbitrationResult);
        }

        // Accept arbitration result (we're out of time)
        onProgress?.('arbitration', `Arbitrator decision: ${arbitrationResult.approved ? 'APPROVED' : 'REVISE'} with ${arbitrationResult.score}%`);

        return {
          approved: arbitrationResult.approved || arbitrationResult.score >= 80,
          finalPlan: bestPlan,
          finalScore: arbitrationResult.score,
          bestPlan,
          bestScore: arbitrationResult.score,
          bestIteration,
          iterations,
          totalIterations: iteration - 1,
          finalConcerns: arbitrationResult.minorConcerns || lastConcerns,
          finalRecommendations: arbitrationResult.suggestedChanges || lastRecommendations,
          arbitrated: true,
          arbitrationResult,
          timedOut: true,
        };
      } catch (arbError) {
        onProgress?.('arbitration', `Arbitration failed on timeout: ${arbError instanceof Error ? arbError.message : 'Unknown error'}`);
        // Fall through to accept best plan
      }
    }

    // Hard timeout - no more arbitration attempts left
    if (totalElapsed > DEFAULT_CONSENSUS_TIMEOUT_MS) {
      onProgress?.('consensus', `Consensus timeout - accepting best plan with ${bestScore}%`);
      return {
        approved: bestScore >= arbitrationThreshold,
        finalPlan: bestPlan,
        finalScore: bestScore,
        bestPlan,
        bestScore,
        bestIteration,
        iterations,
        totalIterations: iteration - 1,
        finalConcerns: lastConcerns,
        finalRecommendations: lastRecommendations,
        arbitrated: false,
        timedOut: true,
      };
    }

    // Log iteration timing
    const iterationStart = Date.now();
    const elapsedMinutes = Math.round((iterationStart - startTime) / 60000);
    onProgress?.('consensus', `Iteration ${iteration} starting (${elapsedMinutes}min elapsed)`);

    // Request consensus review from configured reviewer
    onProgress?.('consensus', `Requesting review from ${reviewer}...`);
    const consensusResult = await requestReviewerConsensus(currentPlan, context, reviewer, config);

    // Log iteration duration
    const iterationDuration = Math.round((Date.now() - iterationStart) / 1000);
    onProgress?.('consensus', `Review completed in ${iterationDuration}s - score: ${consensusResult.score}%`);

    scores.push(consensusResult.score);

    // Record the iteration
    const iterationRecord: ConsensusIteration = {
      iteration,
      plan: currentPlan,
      result: consensusResult,
      timestamp: new Date().toISOString(),
    };

    iterations.push(iterationRecord);

    // Save to project state
    await recordConsensusIteration(projectDir, iterationRecord);

    // Track best plan - only update if this score is better
    if (consensusResult.score > bestScore) {
      bestPlan = currentPlan;
      bestScore = consensusResult.score;
      bestIteration = iteration;
    }

    // Track concerns for output
    lastConcerns = consensusResult.concerns || [];
    lastRecommendations = consensusResult.recommendations || [];
    lastAnalysis = consensusResult.analysis || '';

    // Notify callbacks
    if (onIteration) {
      onIteration(iteration, consensusResult);
    }

    if (onConcerns && (lastConcerns.length > 0 || lastRecommendations.length > 0)) {
      onConcerns(lastConcerns, lastRecommendations);
    }

    // Check if we've reached consensus
    if (meetsThreshold(consensusResult.score, threshold)) {
      return {
        approved: true,
        finalPlan: currentPlan,
        finalScore: consensusResult.score,
        bestPlan: currentPlan,
        bestScore: consensusResult.score,
        bestIteration: iteration,
        iterations,
        totalIterations: iteration,
        finalConcerns: [],
        finalRecommendations: [],
        arbitrated: false,
      };
    }

    // Check if we're stuck and should trigger arbitration
    if (enableArbitration &&
        bestScore >= arbitrationThreshold &&
        isStuck(scores, stuckIterations) &&
        arbitrationAttempts < maxArbitrationAttempts) {

      arbitrationAttempts++;
      onProgress?.('arbitration', `Consensus stuck at ${bestScore}%, invoking ${arbitrator} arbitrator (attempt ${arbitrationAttempts}/${maxArbitrationAttempts})...`);

      try {
        const arbitrationResult = await requestArbitratorDecision(
          bestPlan,
          lastAnalysis,
          `The plan has been revised ${iteration} times. Best score achieved: ${bestScore}%. The reviewer's main concerns are: ${lastConcerns.slice(0, 3).join('; ')}`,
          iteration,
          scores,
          arbitrator
        );

        if (onArbitration) {
          onArbitration(arbitrationResult);
        }

        // Accept if arbitrator approves OR if arbitrator gives a high score (>= 88%)
        // This prevents infinite REVISE loops when the arbitrator is happy enough
        const acceptArbitration = arbitrationResult.approved ||
                                   arbitrationResult.score >= 88 ||
                                   (arbitrationAttempts >= maxArbitrationAttempts && arbitrationResult.score >= 80);

        if (acceptArbitration) {
          const reason = arbitrationResult.approved
            ? `Arbitrator approved plan with ${arbitrationResult.score}% confidence`
            : `Arbitrator score ${arbitrationResult.score}% is acceptable - proceeding with best plan`;
          onProgress?.('arbitration', reason);

          return {
            approved: true,
            finalPlan: bestPlan,
            finalScore: arbitrationResult.score,
            bestPlan,
            bestScore: arbitrationResult.score,
            bestIteration,
            iterations,
            totalIterations: iteration,
            finalConcerns: arbitrationResult.minorConcerns || [],
            finalRecommendations: arbitrationResult.suggestedChanges || [],
            arbitrated: true,
            arbitrationResult,
          };
        } else {
          onProgress?.('arbitration', `Arbitrator requests changes: ${arbitrationResult.suggestedChanges.slice(0, 2).join('; ')}`);
          // Apply arbitrator's suggested changes
          if (arbitrationResult.suggestedChanges.length > 0) {
            onProgress?.('consensus', 'Applying arbitrator suggestions...');
            const revisionResult = await revisePlan(
              bestPlan,
              arbitrationResult.reasoning,
              arbitrationResult.suggestedChanges,
              language
            );
            if (revisionResult.success && revisionResult.response) {
              currentPlan = revisionResult.response;
              // Reset stuck detection after arbitration revision
              scores.length = 0;
              scores.push(arbitrationResult.score);
              onProgress?.('consensus', 'Plan revised based on arbitrator feedback');
            } else {
              onProgress?.('consensus', 'Revision failed, continuing with current plan');
            }
          }
        }
      } catch (error) {
        onProgress?.('arbitration', `Arbitration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // If we've tried arbitration and it failed, accept the best plan we have
        if (arbitrationAttempts >= maxArbitrationAttempts && bestScore >= arbitrationThreshold) {
          onProgress?.('arbitration', `Max arbitration attempts reached, accepting best plan with ${bestScore}%`);
          return {
            approved: true,
            finalPlan: bestPlan,
            finalScore: bestScore,
            bestPlan,
            bestScore,
            bestIteration,
            iterations,
            totalIterations: iteration,
            finalConcerns: lastConcerns,
            finalRecommendations: lastRecommendations,
            arbitrated: true,
          };
        }
      }
    }

    // If not at max iterations, revise the plan
    if (iteration < maxIterations) {
      const concerns = extractConcerns(consensusResult);
      onProgress?.('consensus', 'Revising plan based on feedback...');

      // Create a progress handler for revision
      const revisionProgress = onProgress
        ? (msg: string) => onProgress('consensus', `[revision] ${msg}`)
        : undefined;

      // Use Claude to revise the plan
      const revisionResult = await revisePlan(
        currentPlan,
        consensusResult.analysis,
        concerns,
        language,
        revisionProgress
      );

      if (revisionResult.success && revisionResult.response) {
        // Only use the revised plan for the next iteration
        // The best plan tracking above will decide if it's actually better
        currentPlan = revisionResult.response;

        if (onRevision) {
          onRevision(iteration, currentPlan);
        }
      } else {
        // If revision fails, try to continue with best plan
        console.warn(`Plan revision failed at iteration ${iteration}:`, revisionResult.error);
        currentPlan = bestPlan;
      }
    }
  }

  // Max iterations reached without consensus
  // Return the BEST plan we found, not the last one
  return {
    approved: false,
    finalPlan: bestPlan,
    finalScore: bestScore,
    bestPlan,
    bestScore,
    bestIteration,
    iterations,
    totalIterations: iteration,
    finalConcerns: lastConcerns,
    finalRecommendations: lastRecommendations,
    arbitrated: false,
  };
}

/**
 * Get a summary of the consensus process
 *
 * @param result - The consensus process result
 * @returns Human-readable summary
 */
export function summarizeConsensusProcess(result: ConsensusProcessResult): string {
  const lines: string[] = [];

  lines.push(`## Consensus Summary`);
  lines.push('');
  lines.push(`**Status:** ${result.approved ? 'APPROVED' : 'NOT APPROVED'}${result.arbitrated ? ' (via arbitration)' : ''}`);
  lines.push(`**Final Score:** ${result.finalScore}%`);
  lines.push(`**Best Score:** ${result.bestScore}% (iteration ${result.bestIteration})`);
  lines.push(`**Total Iterations:** ${result.totalIterations}`);

  if (result.arbitrated && result.arbitrationResult) {
    lines.push('');
    lines.push(`### Arbitration Decision`);
    lines.push(`- Decision: ${result.arbitrationResult.approved ? 'APPROVED' : 'REVISE'}`);
    lines.push(`- Confidence: ${result.arbitrationResult.score}%`);
    if (result.arbitrationResult.criticalConcerns.length > 0) {
      lines.push(`- Critical Concerns: ${result.arbitrationResult.criticalConcerns.length}`);
    }
    if (result.arbitrationResult.minorConcerns.length > 0) {
      lines.push(`- Minor Concerns: ${result.arbitrationResult.minorConcerns.length}`);
    }
  }
  lines.push('');

  lines.push(`### Iteration History`);
  lines.push('');

  for (const iteration of result.iterations) {
    const isBest = iteration.iteration === result.bestIteration;
    lines.push(`#### Iteration ${iteration.iteration}${isBest ? ' (BEST)' : ''}`);
    lines.push(`- Score: ${iteration.result.score}%`);
    lines.push(`- Strengths: ${iteration.result.strengths?.length || 0}`);
    lines.push(`- Concerns: ${iteration.result.concerns?.length || 0}`);
    lines.push('');
  }

  if (!result.approved) {
    if (result.finalConcerns && result.finalConcerns.length > 0) {
      lines.push(`### Remaining Concerns`);
      lines.push('');
      for (const concern of result.finalConcerns) {
        lines.push(`- ${concern}`);
      }
      lines.push('');
    }

    if (result.finalRecommendations && result.finalRecommendations.length > 0) {
      lines.push(`### Recommendations`);
      lines.push('');
      for (const rec of result.finalRecommendations) {
        lines.push(`- ${rec}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Validate a plan structure has required sections
 *
 * @param plan - The plan to validate
 * @returns Validation result with missing sections
 */
export function validatePlanStructure(plan: string): {
  valid: boolean;
  missingSections: string[];
} {
  const requiredSections = [
    'Background',
    'Goals',
    'Milestones',
    'Tasks',
    'Test',
  ];

  const missingSections: string[] = [];

  for (const section of requiredSections) {
    // Check for section header (case-insensitive)
    const pattern = new RegExp(`(^|\\n)#+\\s*${section}`, 'i');
    if (!pattern.test(plan)) {
      missingSections.push(section);
    }
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
  };
}

/**
 * Calculate average score across iterations
 *
 * @param iterations - The consensus iterations
 * @returns Average score
 */
export function calculateAverageScore(iterations: ConsensusIteration[]): number {
  if (iterations.length === 0) return 0;

  const sum = iterations.reduce((acc, it) => acc + it.result.score, 0);
  return Math.round(sum / iterations.length);
}

/**
 * Get the score trend across iterations
 *
 * @param iterations - The consensus iterations
 * @returns 'improving', 'declining', or 'stable'
 */
export function getScoreTrend(
  iterations: ConsensusIteration[]
): 'improving' | 'declining' | 'stable' {
  if (iterations.length < 2) return 'stable';

  const scores = iterations.map((it) => it.result.score);
  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = secondAvg - firstAvg;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

/**
 * Options for optimized consensus
 */
export interface OptimizedConsensusOptions extends ConsensusOptions {
  milestoneId: string;
  milestoneName?: string;
  taskId?: string;
  taskName?: string;
  /** Use parallel reviews from multiple providers */
  parallelReviews?: boolean;
  /** Additional reviewers beyond primary */
  additionalReviewers?: AIProvider[];
  /** Whether this is a fullstack project (enables per-app tracking) */
  isFullstack?: boolean;
}

/**
 * Result for fullstack consensus with per-app tracking
 */
export interface FullstackConsensusProcessResult extends ConsensusProcessResult {
  /** Per-app scores */
  appScores: AppConsensusScores;
  /** Per-app approval status */
  appApproved: {
    frontend?: boolean;
    backend?: boolean;
    unified: boolean;
  };
  /** Tagged concerns by app */
  taggedConcerns: TaggedItem[];
  /** Tagged recommendations by app */
  taggedRecommendations: TaggedItem[];
  /** Corrections made during consensus */
  corrections: CorrectionRecord[];
}

/**
 * Collect feedback from a single reviewer
 */
async function collectReviewerFeedback(
  plan: string,
  context: string,
  reviewer: AIProvider,
  config: Partial<ConsensusConfig>,
  onProgress?: (phase: string, message: string) => void
): Promise<ReviewerFeedback> {
  onProgress?.('consensus', `Requesting review from ${reviewer}...`);
  const startTime = Date.now();

  const result = await requestReviewerConsensus(plan, context, reviewer, config);

  const duration = Math.round((Date.now() - startTime) / 1000);
  onProgress?.('consensus', `${reviewer} review completed in ${duration}s - score: ${result.score}%`);

  return {
    reviewer,
    score: result.score,
    timestamp: new Date().toISOString(),
    concerns: result.concerns || [],
    recommendations: result.recommendations || [],
    analysis: result.analysis || '',
  };
}

/**
 * Collect feedback from multiple reviewers in parallel
 */
async function collectAllFeedback(
  plan: string,
  context: string,
  reviewers: AIProvider[],
  config: Partial<ConsensusConfig>,
  onProgress?: (phase: string, message: string) => void
): Promise<ReviewerFeedback[]> {
  onProgress?.('consensus', `Collecting feedback from ${reviewers.length} reviewer(s) in parallel...`);

  const feedbackPromises = reviewers.map(reviewer =>
    collectReviewerFeedback(plan, context, reviewer, config, onProgress)
      .catch(error => {
        onProgress?.('consensus', `${reviewer} review failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
      })
  );

  const results = await Promise.all(feedbackPromises);
  return results.filter((f): f is ReviewerFeedback => f !== null);
}

/**
 * Categorize a concern or recommendation by app target
 * Analyzes text content to determine if it relates to frontend, backend, or unified
 */
function categorizeByContent(content: string): FeedbackAppTarget {
  const lowerContent = content.toLowerCase();

  // Frontend indicators
  const frontendKeywords = [
    'react', 'component', 'jsx', 'tsx', 'css', 'tailwind', 'ui', 'user interface',
    'button', 'form', 'input', 'modal', 'page', 'router', 'navigation', 'state management',
    'redux', 'zustand', 'vite', 'frontend', 'front-end', 'client', 'browser', 'dom',
    'styling', 'layout', 'responsive', 'animation', 'hook', 'usestate', 'useeffect',
    'shadcn', 'radix', 'tailwindcss', 'vitest', 'jest', 'testing-library', 'playwright',
  ];

  // Backend indicators
  const backendKeywords = [
    'fastapi', 'api', 'endpoint', 'route', 'database', 'sql', 'postgresql', 'neon',
    'model', 'schema', 'migration', 'orm', 'sqlalchemy', 'pydantic', 'validation',
    'authentication', 'authorization', 'jwt', 'token', 'middleware', 'backend', 'back-end',
    'server', 'python', 'pytest', 'alembic', 'celery', 'redis', 'cache', 'queue',
    'repository', 'service', 'crud', 'rest', 'graphql', 'websocket',
  ];

  // Count matches
  let frontendMatches = 0;
  let backendMatches = 0;

  for (const keyword of frontendKeywords) {
    if (lowerContent.includes(keyword)) {
      frontendMatches++;
    }
  }

  for (const keyword of backendKeywords) {
    if (lowerContent.includes(keyword)) {
      backendMatches++;
    }
  }

  // Determine category
  if (frontendMatches > backendMatches && frontendMatches >= 2) {
    return 'frontend';
  } else if (backendMatches > frontendMatches && backendMatches >= 2) {
    return 'backend';
  } else {
    return 'unified';
  }
}

/**
 * Categorize all concerns and recommendations by app target
 */
function categorizeFeedbackItems(
  concerns: string[],
  recommendations: string[]
): {
  taggedConcerns: TaggedItem[];
  taggedRecommendations: TaggedItem[];
  appScores: { frontend: number; backend: number; unified: number };
} {
  const taggedConcerns: TaggedItem[] = concerns.map(concern => ({
    app: categorizeByContent(concern),
    content: concern,
  }));

  const taggedRecommendations: TaggedItem[] = recommendations.map(rec => ({
    app: categorizeByContent(rec),
    content: rec,
  }));

  // Count items per app for score calculation
  const frontendConcerns = taggedConcerns.filter(c => c.app === 'frontend').length;
  const backendConcerns = taggedConcerns.filter(c => c.app === 'backend').length;
  const unifiedConcerns = taggedConcerns.filter(c => c.app === 'unified').length;

  const frontendRecs = taggedRecommendations.filter(r => r.app === 'frontend').length;
  const backendRecs = taggedRecommendations.filter(r => r.app === 'backend').length;
  const unifiedRecs = taggedRecommendations.filter(r => r.app === 'unified').length;

  // Calculate relative scores (more concerns = lower score)
  const totalItems = taggedConcerns.length + taggedRecommendations.length;
  const baseScore = totalItems > 0 ? 100 : 0;

  return {
    taggedConcerns,
    taggedRecommendations,
    appScores: {
      frontend: Math.max(0, baseScore - (frontendConcerns + frontendRecs) * 5),
      backend: Math.max(0, baseScore - (backendConcerns + backendRecs) * 5),
      unified: Math.max(0, baseScore - (unifiedConcerns + unifiedRecs) * 5),
    },
  };
}

/**
 * Calculate per-app scores from feedback
 */
function calculateAppScores(
  allFeedback: ReviewerFeedback[],
  taggedConcerns: TaggedItem[],
  taggedRecommendations: TaggedItem[]
): AppConsensusScores {
  // Base score from average feedback score
  const baseScore = allFeedback.length > 0
    ? Math.round(allFeedback.reduce((sum, f) => sum + f.score, 0) / allFeedback.length)
    : 0;

  // Count concerns per app
  const frontendConcerns = taggedConcerns.filter(c => c.app === 'frontend').length;
  const backendConcerns = taggedConcerns.filter(c => c.app === 'backend').length;
  const unifiedConcerns = taggedConcerns.filter(c => c.app === 'unified').length;

  const frontendRecs = taggedRecommendations.filter(r => r.app === 'frontend').length;
  const backendRecs = taggedRecommendations.filter(r => r.app === 'backend').length;

  // Calculate app-specific scores
  // More concerns = lower score (each concern/rec reduces score by 2 points)
  const frontendScore = frontendConcerns > 0 || frontendRecs > 0
    ? Math.max(0, baseScore - (frontendConcerns * 2 + frontendRecs))
    : baseScore;

  const backendScore = backendConcerns > 0 || backendRecs > 0
    ? Math.max(0, baseScore - (backendConcerns * 2 + backendRecs))
    : baseScore;

  // Unified score is the base combined score
  const unifiedScore = Math.max(0, baseScore - (unifiedConcerns * 2));

  return {
    frontend: frontendScore,
    backend: backendScore,
    unified: unifiedScore,
  };
}

/**
 * Optimized consensus process that batches feedback and reduces API calls
 *
 * Key optimizations:
 * 1. Plans stored in files, not regenerated from scratch
 * 2. Collects ALL reviewer feedback before revision
 * 3. Claude revises ONCE per round with combined feedback
 * 4. Parallel reviews when multiple reviewers configured
 * 5. Per-app tracking for fullstack projects (frontend/backend/unified)
 *
 * @param initialPlan - The initial plan to seek consensus on
 * @param context - Project context for review
 * @param options - Consensus options including tracking info
 * @returns Consensus process result (FullstackConsensusProcessResult for fullstack projects)
 */
export async function runOptimizedConsensusProcess(
  initialPlan: string,
  context: string,
  options: OptimizedConsensusOptions
): Promise<ConsensusProcessResult | FullstackConsensusProcessResult> {
  const {
    projectDir,
    config = {},
    onIteration,
    onRevision,
    onConcerns,
    onArbitration,
    onProgress,
    milestoneId,
    milestoneName,
    taskId,
    taskName,
    parallelReviews = true,
    additionalReviewers = [],
    isFullstack = false,
  } = options;

  // Derive language from isFullstack for revision prompts
  const language: 'python' | 'typescript' | 'fullstack' = isFullstack ? 'fullstack' : 'python';

  const {
    threshold = DEFAULT_CONSENSUS_CONFIG.threshold,
    maxIterations = DEFAULT_CONSENSUS_CONFIG.maxIterations,
    reviewer = DEFAULT_CONSENSUS_CONFIG.reviewer,
    arbitrator = DEFAULT_CONSENSUS_CONFIG.arbitrator,
    enableArbitration = DEFAULT_CONSENSUS_CONFIG.enableArbitration,
    arbitrationThreshold = DEFAULT_CONSENSUS_CONFIG.arbitrationThreshold,
    stuckIterations = DEFAULT_CONSENSUS_CONFIG.stuckIterations,
  } = config;

  // Initialize plan storage with fullstack support
  const planStorage = createPlanStorage(projectDir, isFullstack);
  await planStorage.initialize();

  // Track per-app consensus for fullstack projects
  const appScoresHistory: { frontend: number[]; backend: number[]; unified: number[] } = {
    frontend: [],
    backend: [],
    unified: [],
  };
  const allTaggedConcerns: TaggedItem[] = [];
  const allTaggedRecommendations: TaggedItem[] = [];
  const corrections: CorrectionRecord[] = [];

  // Determine all reviewers
  const allReviewers: AIProvider[] = [reviewer, ...additionalReviewers.filter(r => r !== reviewer)];

  const iterations: ConsensusIteration[] = [];
  const scores: number[] = [];
  let currentPlan = initialPlan;
  let iteration = 0;

  // Track the best plan
  let bestPlan = initialPlan;
  let bestScore = 0;
  let bestIteration = 0;
  let lastConcerns: string[] = [];
  let lastRecommendations: string[] = [];
  let lastAnalysis = '';

  const startTime = Date.now();

  onProgress?.('consensus', `Using optimized consensus with ${allReviewers.join(', ')} as reviewer(s)`);
  onProgress?.('consensus', `Plan tracking: milestone=${milestoneId}${taskId ? `, task=${taskId}` : ''}`);
  if (isFullstack) {
    onProgress?.('consensus', `Fullstack mode enabled - tracking per-app consensus (frontend/backend/unified)`);
  }

  // Save initial plan to storage
  await planStorage.savePlan(currentPlan, taskId ? 'task' : 'milestone', {
    milestoneId,
    milestoneName,
    taskId,
    taskName,
  });

  while (iteration < maxIterations) {
    iteration++;

    // Check timeout
    const totalElapsed = Date.now() - startTime;
    if (totalElapsed > DEFAULT_CONSENSUS_TIMEOUT_MS) {
      onProgress?.('consensus', `Consensus timeout after ${Math.round(totalElapsed / 60000)} minutes`);

      if (enableArbitration) {
        try {
          const arbitrationResult = await requestArbitratorDecision(
            bestPlan,
            lastAnalysis,
            `Timeout. Best score: ${bestScore}%. Concerns: ${lastConcerns.slice(0, 3).join('; ')}`,
            iteration,
            scores,
            arbitrator
          );

          if (onArbitration) onArbitration(arbitrationResult);

          return {
            approved: arbitrationResult.approved || arbitrationResult.score >= 80,
            finalPlan: bestPlan,
            finalScore: arbitrationResult.score,
            bestPlan,
            bestScore: arbitrationResult.score,
            bestIteration,
            iterations,
            totalIterations: iteration - 1,
            finalConcerns: arbitrationResult.minorConcerns || lastConcerns,
            finalRecommendations: arbitrationResult.suggestedChanges || lastRecommendations,
            arbitrated: true,
            arbitrationResult,
            timedOut: true,
          };
        } catch {
          // Fall through to accept best plan
        }
      }

      return {
        approved: bestScore >= arbitrationThreshold,
        finalPlan: bestPlan,
        finalScore: bestScore,
        bestPlan,
        bestScore,
        bestIteration,
        iterations,
        totalIterations: iteration - 1,
        finalConcerns: lastConcerns,
        finalRecommendations: lastRecommendations,
        arbitrated: false,
        timedOut: true,
      };
    }

    const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
    onProgress?.('consensus', `Iteration ${iteration} starting (${elapsedMinutes}min elapsed)`);

    // Clear previous feedback for this round
    await planStorage.clearFeedback(milestoneId, taskId);

    // ============================================
    // OPTIMIZATION: Collect ALL feedback in parallel
    // ============================================
    let allFeedback: ReviewerFeedback[];

    if (parallelReviews && allReviewers.length > 1) {
      allFeedback = await collectAllFeedback(currentPlan, context, allReviewers, config, onProgress);
    } else {
      // Sequential fallback
      allFeedback = [];
      for (const rev of allReviewers) {
        const feedback = await collectReviewerFeedback(currentPlan, context, rev, config, onProgress);
        allFeedback.push(feedback);
      }
    }

    // Combine all concerns and recommendations
    const allConcerns = [...new Set(allFeedback.flatMap(f => f.concerns))];
    const allRecommendations = [...new Set(allFeedback.flatMap(f => f.recommendations))];
    const combinedAnalysis = allFeedback.map(f => `[${f.reviewer}] ${f.analysis}`).join('\n\n');

    lastConcerns = allConcerns;
    lastRecommendations = allRecommendations;

    // ============================================
    // FULLSTACK: Categorize feedback by app target
    // ============================================
    let currentAppScores: AppConsensusScores = { unified: 0 };
    let iterationTaggedConcerns: TaggedItem[] = [];
    let iterationTaggedRecs: TaggedItem[] = [];

    if (isFullstack) {
      onProgress?.('consensus', 'Categorizing feedback by app (frontend/backend/unified)...');

      // Categorize concerns and recommendations
      const categorized = categorizeFeedbackItems(allConcerns, allRecommendations);
      iterationTaggedConcerns = categorized.taggedConcerns;
      iterationTaggedRecs = categorized.taggedRecommendations;

      // Calculate per-app scores
      currentAppScores = calculateAppScores(allFeedback, iterationTaggedConcerns, iterationTaggedRecs);

      // Track scores history
      appScoresHistory.frontend.push(currentAppScores.frontend || 0);
      appScoresHistory.backend.push(currentAppScores.backend || 0);
      appScoresHistory.unified.push(currentAppScores.unified);

      // Accumulate tagged items for final result
      allTaggedConcerns.push(...iterationTaggedConcerns);
      allTaggedRecommendations.push(...iterationTaggedRecs);

      // Log per-app breakdown
      const frontendConcerns = iterationTaggedConcerns.filter(c => c.app === 'frontend').length;
      const backendConcerns = iterationTaggedConcerns.filter(c => c.app === 'backend').length;
      const unifiedConcerns = iterationTaggedConcerns.filter(c => c.app === 'unified').length;

      onProgress?.('consensus', `Per-app concerns: FE=${frontendConcerns}, BE=${backendConcerns}, Unified=${unifiedConcerns}`);
      onProgress?.('consensus', `Per-app scores: FE=${currentAppScores.frontend}%, BE=${currentAppScores.backend}%, Unified=${currentAppScores.unified}%`);

      // Save feedback to per-app directories
      for (const feedback of allFeedback) {
        // Create fullstack feedback with tagged items
        const fullstackFeedback: FullstackReviewerFeedback = {
          ...feedback,
          appScores: currentAppScores,
          taggedConcerns: iterationTaggedConcerns.filter(c =>
            feedback.concerns.some(fc => fc === c.content)
          ),
          taggedRecommendations: iterationTaggedRecs.filter(r =>
            feedback.recommendations.some(fr => fr === r.content)
          ),
          isFullstack: true,
        };

        // Save to all app directories
        await planStorage.saveFullstackFeedback(
          fullstackFeedback,
          taskId ? 'task' : 'milestone',
          milestoneId,
          taskId
        );
      }
    } else {
      // Non-fullstack: save feedback without app categorization
      for (const feedback of allFeedback) {
        await planStorage.saveFeedback(feedback, milestoneId, taskId);
      }
      currentAppScores = { unified: allFeedback.length > 0
        ? Math.round(allFeedback.reduce((sum, f) => sum + f.score, 0) / allFeedback.length)
        : 0 };
    }

    // Calculate combined score (average of all reviewers)
    const combinedScore = allFeedback.length > 0
      ? Math.round(allFeedback.reduce((sum, f) => sum + f.score, 0) / allFeedback.length)
      : 0;

    scores.push(combinedScore);
    lastAnalysis = combinedAnalysis;

    // Create consensus result for tracking
    const consensusResult: ConsensusResult = {
      score: combinedScore,
      analysis: combinedAnalysis,
      concerns: allConcerns,
      recommendations: allRecommendations,
      approved: combinedScore >= threshold,
      strengths: [],
      rawResponse: combinedAnalysis,
    };

    // Record iteration
    const iterationRecord: ConsensusIteration = {
      iteration,
      plan: currentPlan,
      timestamp: new Date().toISOString(),
      result: consensusResult,
    };
    iterations.push(iterationRecord);

    if (onIteration) onIteration(iteration, consensusResult);
    if (onConcerns) onConcerns(allConcerns, allRecommendations);

    // Update best plan tracking
    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestPlan = currentPlan;
      bestIteration = iteration;
    }

    // Save plan with updated score (including per-app scores for fullstack)
    await planStorage.savePlan(currentPlan, taskId ? 'task' : 'milestone', {
      milestoneId,
      milestoneName,
      taskId,
      taskName,
      score: combinedScore,
      frontendScore: isFullstack ? currentAppScores.frontend : undefined,
      backendScore: isFullstack ? currentAppScores.backend : undefined,
      unifiedScore: isFullstack ? currentAppScores.unified : undefined,
    });

    // Record correction for fullstack tracking
    if (isFullstack && iteration > 1) {
      const previousScore = scores.length >= 2 ? scores[scores.length - 2] : 0;
      const correction: CorrectionRecord = {
        id: `correction-${iteration}`,
        timestamp: new Date().toISOString(),
        app: 'unified', // Top-level correction
        previousScore,
        newScore: combinedScore,
        concerns: lastConcerns.slice(0, 5),
        changes: lastRecommendations.slice(0, 3),
        reviewer,
      };
      corrections.push(correction);

      await planStorage.recordCorrection(
        taskId ? 'task' : 'milestone',
        correction,
        milestoneId,
        taskId
      );
    }

    // Record in project state
    await recordConsensusIteration(projectDir, iterationRecord);

    onProgress?.('consensus', `Combined score: ${combinedScore}% (from ${allFeedback.length} reviewer(s))`);

    // Check if consensus reached
    if (combinedScore >= threshold) {
      onProgress?.('consensus', `Consensus reached at ${combinedScore}%`);
      await planStorage.updateStatus('approved', taskId ? 'task' : 'milestone', milestoneId, taskId);

      // Update per-app approval status for fullstack
      if (isFullstack) {
        const feApproved = (currentAppScores.frontend || 0) >= threshold;
        const beApproved = (currentAppScores.backend || 0) >= threshold;

        await planStorage.updateAppApproval(taskId ? 'task' : 'milestone', 'frontend', feApproved, currentAppScores.frontend || 0, milestoneId, taskId);
        await planStorage.updateAppApproval(taskId ? 'task' : 'milestone', 'backend', beApproved, currentAppScores.backend || 0, milestoneId, taskId);
        await planStorage.updateAppApproval(taskId ? 'task' : 'milestone', 'unified', true, currentAppScores.unified, milestoneId, taskId);

        onProgress?.('consensus', `Per-app approval: FE=${feApproved}, BE=${beApproved}, Unified=true`);

        return {
          approved: true,
          finalPlan: currentPlan,
          finalScore: combinedScore,
          bestPlan: currentPlan,
          bestScore: combinedScore,
          bestIteration: iteration,
          iterations,
          totalIterations: iteration,
          finalConcerns: allConcerns,
          finalRecommendations: allRecommendations,
          arbitrated: false,
          // Fullstack-specific fields
          appScores: currentAppScores,
          appApproved: {
            frontend: feApproved,
            backend: beApproved,
            unified: true,
          },
          taggedConcerns: allTaggedConcerns,
          taggedRecommendations: allTaggedRecommendations,
          corrections,
        } as FullstackConsensusProcessResult;
      }

      return {
        approved: true,
        finalPlan: currentPlan,
        finalScore: combinedScore,
        bestPlan: currentPlan,
        bestScore: combinedScore,
        bestIteration: iteration,
        iterations,
        totalIterations: iteration,
        finalConcerns: allConcerns,
        finalRecommendations: allRecommendations,
        arbitrated: false,
      };
    }

    // Check if stuck
    if (isStuck(scores, stuckIterations) && enableArbitration) {
      onProgress?.('consensus', `Consensus stuck - invoking ${arbitrator} for arbitration`);

      try {
        const arbitrationResult = await requestArbitratorDecision(
          bestPlan,
          combinedAnalysis,
          `Stuck after ${iteration} iterations. Scores: ${scores.slice(-stuckIterations).join(', ')}`,
          iteration,
          scores,
          arbitrator
        );

        if (onArbitration) onArbitration(arbitrationResult);

        if (arbitrationResult.approved || arbitrationResult.score >= arbitrationThreshold) {
          onProgress?.('arbitration', `Arbitrator approved with ${arbitrationResult.score}%`);
          await planStorage.updateStatus('approved', taskId ? 'task' : 'milestone', milestoneId, taskId);

          if (isFullstack) {
            const feApproved = (currentAppScores.frontend || 0) >= arbitrationThreshold;
            const beApproved = (currentAppScores.backend || 0) >= arbitrationThreshold;

            return {
              approved: true,
              finalPlan: bestPlan,
              finalScore: arbitrationResult.score,
              bestPlan,
              bestScore: arbitrationResult.score,
              bestIteration,
              iterations,
              totalIterations: iteration,
              finalConcerns: arbitrationResult.minorConcerns || allConcerns,
              finalRecommendations: arbitrationResult.suggestedChanges || allRecommendations,
              arbitrated: true,
              arbitrationResult,
              // Fullstack-specific fields
              appScores: currentAppScores,
              appApproved: {
                frontend: feApproved,
                backend: beApproved,
                unified: true,
              },
              taggedConcerns: allTaggedConcerns,
              taggedRecommendations: allTaggedRecommendations,
              corrections,
            } as FullstackConsensusProcessResult;
          }

          return {
            approved: true,
            finalPlan: bestPlan,
            finalScore: arbitrationResult.score,
            bestPlan,
            bestScore: arbitrationResult.score,
            bestIteration,
            iterations,
            totalIterations: iteration,
            finalConcerns: arbitrationResult.minorConcerns || allConcerns,
            finalRecommendations: arbitrationResult.suggestedChanges || allRecommendations,
            arbitrated: true,
            arbitrationResult,
          };
        }
      } catch (arbError) {
        onProgress?.('arbitration', `Arbitration failed: ${arbError instanceof Error ? arbError.message : 'Unknown error'}`);
      }
    }

    // ============================================
    // OPTIMIZATION: Single revision with ALL feedback
    // ============================================
    if (iteration < maxIterations) {
      onProgress?.('consensus', `Revising plan with combined feedback from ${allFeedback.length} reviewer(s)...`);

      const revisionProgress = onProgress
        ? (msg: string) => onProgress('consensus', `[revision] ${msg}`)
        : undefined;

      // Use Claude to revise with ALL combined feedback (single API call)
      const revisionResult = await revisePlan(
        currentPlan,
        combinedAnalysis,
        allConcerns,
        language,
        revisionProgress
      );

      if (revisionResult.success && revisionResult.response) {
        currentPlan = revisionResult.response;

        // Save revised plan
        await planStorage.savePlan(currentPlan, taskId ? 'task' : 'milestone', {
          milestoneId,
          milestoneName,
          taskId,
          taskName,
        });

        if (onRevision) onRevision(iteration, currentPlan);
      } else {
        onProgress?.('consensus', `Revision failed, continuing with best plan`);
        currentPlan = bestPlan;
      }
    }
  }

  // Max iterations reached
  await planStorage.updateStatus('reviewing', taskId ? 'task' : 'milestone', milestoneId, taskId);

  // Final per-app scores from history
  const finalAppScores: AppConsensusScores = isFullstack ? {
    frontend: appScoresHistory.frontend.length > 0
      ? appScoresHistory.frontend[appScoresHistory.frontend.length - 1]
      : undefined,
    backend: appScoresHistory.backend.length > 0
      ? appScoresHistory.backend[appScoresHistory.backend.length - 1]
      : undefined,
    unified: appScoresHistory.unified.length > 0
      ? appScoresHistory.unified[appScoresHistory.unified.length - 1]
      : bestScore,
  } : { unified: bestScore };

  if (isFullstack) {
    const feApproved = (finalAppScores.frontend || 0) >= threshold;
    const beApproved = (finalAppScores.backend || 0) >= threshold;

    return {
      approved: false,
      finalPlan: bestPlan,
      finalScore: bestScore,
      bestPlan,
      bestScore,
      bestIteration,
      iterations,
      totalIterations: iteration,
      finalConcerns: lastConcerns,
      finalRecommendations: lastRecommendations,
      arbitrated: false,
      // Fullstack-specific fields
      appScores: finalAppScores,
      appApproved: {
        frontend: feApproved,
        backend: beApproved,
        unified: bestScore >= threshold,
      },
      taggedConcerns: allTaggedConcerns,
      taggedRecommendations: allTaggedRecommendations,
      corrections,
    } as FullstackConsensusProcessResult;
  }

  return {
    approved: false,
    finalPlan: bestPlan,
    finalScore: bestScore,
    bestPlan,
    bestScore,
    bestIteration,
    iterations,
    totalIterations: iteration,
    finalConcerns: lastConcerns,
    finalRecommendations: lastRecommendations,
    arbitrated: false,
  };
}
