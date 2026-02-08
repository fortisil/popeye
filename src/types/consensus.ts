/**
 * Consensus-related type definitions
 * Defines consensus results, iterations, and configuration
 */

import { z } from 'zod';
import type { OpenAIModel } from './project.js';
import { OpenAIModelSchema } from './project.js';

/**
 * Supported AI providers for reviews and arbitration
 */
export type AIProvider = 'openai' | 'gemini' | 'grok';

/**
 * Gemini model type - flexible string to support new models
 */
export type GeminiModel = string;

/**
 * Grok model type (flexible string - API evolves fast)
 */
export type GrokModel = string;

/**
 * Default Grok model
 */
export const DEFAULT_GROK_MODEL = 'grok-3';

/**
 * Result of a consensus review from OpenAI or Gemini
 */
export interface ConsensusResult {
  score: number;
  analysis: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  approved: boolean;
  rawResponse: string;
}

/**
 * Result of an arbitration decision
 */
export interface ArbitrationResult {
  approved: boolean;
  score: number;
  analysis: string;
  criticalConcerns: string[];
  minorConcerns: string[];
  subjectiveConcerns: string[];
  reasoning: string;
  suggestedChanges: string[];
  rawResponse: string;
}

/**
 * Single consensus iteration record
 */
export interface ConsensusIteration {
  iteration: number;
  plan: string;
  result: ConsensusResult;
  timestamp: string;
}

/**
 * Configuration for consensus process
 */
export interface ConsensusConfig {
  threshold: number;
  maxIterations: number;
  openaiKey?: string;
  geminiKey?: string;
  grokKey?: string;
  openaiModel: OpenAIModel;
  geminiModel: GeminiModel;
  grokModel: GrokModel;
  reviewer: AIProvider;
  arbitrator: AIProvider;
  enableArbitration: boolean;
  arbitrationThreshold: number; // Score at which to trigger arbitration (e.g., 85)
  stuckIterations: number; // Number of iterations without improvement before arbitration
  escalationAction: 'pause' | 'continue' | 'abort';
  temperature: number;
  maxTokens: number;
  /** Use optimized consensus with batched feedback and file-based plan storage (default: true) */
  useOptimizedConsensus?: boolean;
  /** Additional reviewers beyond primary (for parallel reviews) */
  additionalReviewers?: AIProvider[];
}

/**
 * Default consensus configuration
 */
export const DEFAULT_CONSENSUS_CONFIG: Omit<ConsensusConfig, 'openaiKey' | 'geminiKey' | 'grokKey'> = {
  threshold: 95,
  maxIterations: 10,
  openaiModel: 'gpt-4o',
  geminiModel: 'gemini-2.0-flash',
  grokModel: DEFAULT_GROK_MODEL,
  reviewer: 'openai',
  arbitrator: 'gemini',
  enableArbitration: true,
  arbitrationThreshold: 85,
  stuckIterations: 3,
  escalationAction: 'pause',
  temperature: 0.3,
  maxTokens: 4096,
};

/**
 * Zod schema for AI provider
 */
export const AIProviderSchema = z.enum(['openai', 'gemini', 'grok']);

/**
 * Known Gemini models (used for suggestions and display, not strict validation)
 */
export const KNOWN_GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] as const;

/**
 * Zod schema for Gemini model - accepts any non-empty string to support new models
 */
export const GeminiModelSchema = z.string().min(1, 'Model name must not be empty');

/**
 * Zod schema for Grok model (flexible string)
 */
export const GrokModelSchema = z.string().default(DEFAULT_GROK_MODEL);

/**
 * Zod schema for consensus config validation
 */
export const ConsensusConfigSchema = z.object({
  threshold: z.number().min(0).max(100).default(95),
  maxIterations: z.number().min(1).max(20).default(10),
  openaiKey: z.string().optional(),
  geminiKey: z.string().optional(),
  grokKey: z.string().optional(),
  openaiModel: OpenAIModelSchema,
  geminiModel: GeminiModelSchema.default('gemini-2.0-flash'),
  grokModel: GrokModelSchema.default(DEFAULT_GROK_MODEL),
  reviewer: AIProviderSchema.default('openai'),
  arbitrator: AIProviderSchema.default('gemini'),
  enableArbitration: z.boolean().default(true),
  arbitrationThreshold: z.number().min(0).max(100).default(85),
  stuckIterations: z.number().min(1).max(10).default(3),
  escalationAction: z.enum(['pause', 'continue', 'abort']).default('pause'),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().min(100).max(32000).default(4096),
});

/**
 * Plan document structure for consensus review
 */
export interface PlanDocument {
  milestone: number;
  title: string;
  background: string;
  goals: string[];
  useCases: string[];
  risks: string[];
  tasks: {
    id: string;
    description: string;
    acceptanceCriteria: string[];
    dependencies: string[];
  }[];
  testPlan: {
    id: string;
    type: 'unit' | 'integration' | 'e2e';
    description: string;
    setup: string;
    steps: string[];
    expectedResult: string;
  }[];
  summary: string;
}

/**
 * Consensus request payload
 */
export interface ConsensusRequest {
  plan: string;
  context: string;
  previousFeedback?: string;
  iteration: number;
}

/**
 * Escalation details when consensus cannot be reached
 */
export interface EscalationDetails {
  reason: string;
  iterations: ConsensusIteration[];
  lastScore: number;
  unresolvable_concerns: string[];
  suggestedActions: string[];
}

/**
 * App target for fullstack/all reviews
 */
export type ReviewAppTarget = 'frontend' | 'backend' | 'website' | 'unified';

/**
 * Tagged concern/recommendation with app context
 */
export interface TaggedItem {
  app: ReviewAppTarget;
  content: string;
}

/**
 * Per-app consensus scores for fullstack/all projects
 */
export interface AppConsensusScores {
  frontend?: number;
  backend?: number;
  website?: number;
  unified: number;  // Combined/overall score
}

/**
 * Per-app feedback for fullstack reviews
 */
export interface AppFeedback {
  app: ReviewAppTarget;
  score: number;
  concerns: string[];
  recommendations: string[];
  analysis: string;
}

/**
 * Fullstack-aware consensus result
 */
export interface FullstackConsensusResult extends ConsensusResult {
  /** Per-app breakdown of scores */
  appScores: AppConsensusScores;
  /** Concerns tagged by app */
  taggedConcerns: TaggedItem[];
  /** Recommendations tagged by app */
  taggedRecommendations: TaggedItem[];
  /** Per-app feedback breakdown */
  appFeedback: AppFeedback[];
  /** Whether this is a fullstack project review */
  isFullstack: boolean;
}

/**
 * Fullstack consensus iteration with per-app tracking
 */
export interface FullstackConsensusIteration extends ConsensusIteration {
  /** Per-app scores for this iteration */
  appScores?: AppConsensusScores;
  /** Per-app approval status */
  appApproved?: {
    frontend?: boolean;
    backend?: boolean;
    website?: boolean;
    unified: boolean;
  };
}

/**
 * Correction/revision record for tracking all changes
 */
export interface CorrectionRecord {
  id: string;
  timestamp: string;
  app: ReviewAppTarget;
  previousScore: number;
  newScore: number;
  concerns: string[];
  changes: string[];
  reviewer: AIProvider;
}

/**
 * Complete consensus tracking for a plan level (master/milestone/task)
 */
export interface ConsensusTrackingRecord {
  planLevel: 'master' | 'milestone' | 'task';
  planId: string;
  milestoneName?: string;
  taskName?: string;
  isFullstack: boolean;

  /** Overall consensus status */
  overallScore: number;
  overallApproved: boolean;
  totalIterations: number;

  /** Per-app consensus status (fullstack only) */
  frontendScore?: number;
  frontendApproved?: boolean;
  frontendIterations?: number;

  backendScore?: number;
  backendApproved?: boolean;
  backendIterations?: number;

  websiteScore?: number;
  websiteApproved?: boolean;
  websiteIterations?: number;

  /** All corrections/revisions made */
  corrections: CorrectionRecord[];

  /** Timestamps */
  startedAt: string;
  completedAt?: string;

  /** Final status */
  status: 'in-progress' | 'approved' | 'escalated' | 'failed';
}
