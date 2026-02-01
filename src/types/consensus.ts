/**
 * Consensus-related type definitions
 * Defines consensus results, iterations, and configuration
 */

import { z } from 'zod';
import type { OpenAIModel } from './project.js';

/**
 * Supported AI providers for reviews and arbitration
 */
export type AIProvider = 'openai' | 'gemini';

/**
 * Supported Gemini models
 */
export type GeminiModel = 'gemini-2.0-flash' | 'gemini-1.5-pro' | 'gemini-1.5-flash';

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
  openaiModel: OpenAIModel;
  geminiModel: GeminiModel;
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
export const DEFAULT_CONSENSUS_CONFIG: Omit<ConsensusConfig, 'openaiKey' | 'geminiKey'> = {
  threshold: 95,
  maxIterations: 10,
  openaiModel: 'gpt-4o',
  geminiModel: 'gemini-2.0-flash',
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
export const AIProviderSchema = z.enum(['openai', 'gemini']);

/**
 * Zod schema for Gemini model
 */
export const GeminiModelSchema = z.enum(['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']);

/**
 * Zod schema for consensus config validation
 */
export const ConsensusConfigSchema = z.object({
  threshold: z.number().min(0).max(100).default(95),
  maxIterations: z.number().min(1).max(20).default(10),
  openaiKey: z.string().optional(),
  geminiKey: z.string().optional(),
  openaiModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini']),
  geminiModel: GeminiModelSchema.default('gemini-2.0-flash'),
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
