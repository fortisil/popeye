/**
 * Workflow-related type definitions
 * Defines workflow modes, tasks, milestones, and state transitions
 */

import { z } from 'zod';
import { OutputLanguageSchema } from './project.js';
import type { OutputLanguage, OpenAIModel } from './project.js';
import type { ConsensusIteration } from './consensus.js';

/**
 * Workflow phases
 */
export const WorkflowPhaseSchema = z.enum(['plan', 'execution', 'complete']);
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

/**
 * Project status
 */
export const ProjectStatusSchema = z.enum(['pending', 'in-progress', 'complete', 'failed', 'paused']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/**
 * Status of a task or milestone
 */
export const TaskStatusSchema = z.enum(['pending', 'in-progress', 'complete', 'failed', 'paused']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Per-app consensus tracking (for fullstack projects)
 */
export interface AppConsensusTracking {
  score?: number;
  iterations?: number;
  approved?: boolean;
  feedbackDoc?: string;  // Path to app-specific feedback
}

/**
 * Individual task within a milestone
 */
export interface Task {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  testsPassed?: boolean;
  testPlan?: string;
  error?: string;
  // Per-task consensus tracking
  plan?: string;                    // Detailed task implementation plan
  consensusScore?: number;          // Consensus score for task plan (0-100)
  consensusIterations?: number;     // Number of iterations to reach consensus
  consensusApproved?: boolean;      // Whether task plan was approved
  planDoc?: string;                 // Path to task plan document
  testResultsDoc?: string;          // Path to test results document
  implementationComplete?: boolean; // Whether code implementation finished (for resume)

  // Remediation tracking (for failure recovery)
  remediationAttempts?: number;       // Number of remediation attempts made
  lastFailureAnalysis?: string;       // Root cause analysis from last failure
  lastRemediationPlan?: string;       // Fix plan from last remediation attempt

  // Per-app consensus tracking (fullstack projects)
  frontendConsensus?: AppConsensusTracking;
  backendConsensus?: AppConsensusTracking;
  unifiedConsensus?: AppConsensusTracking;

  // App target (which app this task affects)
  appTarget?: 'frontend' | 'backend' | 'unified';
}

/**
 * Zod schema for per-app consensus tracking
 */
export const AppConsensusTrackingSchema = z.object({
  score: z.number().optional(),
  iterations: z.number().optional(),
  approved: z.boolean().optional(),
  feedbackDoc: z.string().optional(),
});

/**
 * Zod schema for Task
 */
export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  testsPassed: z.boolean().optional(),
  testPlan: z.string().optional(),
  error: z.string().optional(),
  plan: z.string().optional(),
  consensusScore: z.number().optional(),
  consensusIterations: z.number().optional(),
  consensusApproved: z.boolean().optional(),
  planDoc: z.string().optional(),
  testResultsDoc: z.string().optional(),
  implementationComplete: z.boolean().optional(),
  // Remediation tracking
  remediationAttempts: z.number().optional(),
  lastFailureAnalysis: z.string().optional(),
  lastRemediationPlan: z.string().optional(),
  // Per-app consensus tracking (fullstack)
  frontendConsensus: AppConsensusTrackingSchema.optional(),
  backendConsensus: AppConsensusTrackingSchema.optional(),
  unifiedConsensus: AppConsensusTrackingSchema.optional(),
  appTarget: z.enum(['frontend', 'backend', 'unified']).optional(),
});

/**
 * Milestone containing multiple tasks
 */
export interface Milestone {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  tasks: Task[];
  // Per-milestone consensus tracking
  plan?: string;                    // Detailed milestone plan
  consensusScore?: number;          // Consensus score for milestone plan
  consensusIterations?: number;     // Number of iterations to reach consensus
  consensusApproved?: boolean;      // Whether milestone plan was approved
  planDoc?: string;                 // Path: docs/plans/milestone-N/plan.md
  // Milestone completion review
  completionReview?: string;        // Code review and summary
  completionScore?: number;         // Consensus score for completion
  completionApproved?: boolean;     // Whether milestone completion was approved
  completionDoc?: string;           // Path: docs/milestone_N_complete.md

  // Per-app consensus tracking (fullstack projects)
  frontendConsensus?: AppConsensusTracking;
  backendConsensus?: AppConsensusTracking;
  unifiedConsensus?: AppConsensusTracking;

  // Feedback document paths (fullstack - separate by app)
  feedbackDocs?: {
    frontend?: string;  // docs/plans/milestone-N/frontend/feedback.md
    backend?: string;   // docs/plans/milestone-N/backend/feedback.md
    unified?: string;   // docs/plans/milestone-N/unified/feedback.md
  };
}

/**
 * Zod schema for Milestone
 */
export const MilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  tasks: z.array(TaskSchema),
  plan: z.string().optional(),
  consensusScore: z.number().optional(),
  consensusIterations: z.number().optional(),
  consensusApproved: z.boolean().optional(),
  planDoc: z.string().optional(),
  completionReview: z.string().optional(),
  completionScore: z.number().optional(),
  completionApproved: z.boolean().optional(),
  completionDoc: z.string().optional(),
  // Per-app consensus tracking (fullstack)
  frontendConsensus: AppConsensusTrackingSchema.optional(),
  backendConsensus: AppConsensusTrackingSchema.optional(),
  unifiedConsensus: AppConsensusTrackingSchema.optional(),
  feedbackDocs: z.object({
    frontend: z.string().optional(),
    backend: z.string().optional(),
    unified: z.string().optional(),
  }).optional(),
});

/**
 * Complete project state for persistence
 */
export interface ProjectState {
  id: string;
  name: string;
  idea: string;
  language: OutputLanguage;
  openaiModel: OpenAIModel;
  phase: WorkflowPhase;
  status: ProjectStatus;
  specification?: string;
  plan?: string;
  milestones: Milestone[];
  currentMilestone: string | null;
  currentTask: string | null;
  consensusHistory: ConsensusIteration[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** Raw user documentation discovered from CWD */
  userDocs?: string;
  /** Brand context discovered from CWD */
  brandContext?: {
    logoPath?: string;
    primaryColor?: string;
  };
  /** Path to website strategy JSON file (relative to .popeye/) */
  websiteStrategy?: string;
}

/**
 * Zod schema for project state validation
 */
export const ProjectStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  idea: z.string(),
  language: OutputLanguageSchema,
  openaiModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini']),
  phase: WorkflowPhaseSchema,
  status: ProjectStatusSchema,
  specification: z.string().optional(),
  plan: z.string().optional(),
  milestones: z.array(MilestoneSchema),
  currentMilestone: z.string().nullable(),
  currentTask: z.string().nullable(),
  consensusHistory: z.array(
    z.object({
      iteration: z.number(),
      plan: z.string(),
      result: z.object({
        score: z.number(),
        analysis: z.string(),
        strengths: z.array(z.string()),
        concerns: z.array(z.string()),
        recommendations: z.array(z.string()),
        approved: z.boolean(),
        rawResponse: z.string(),
      }),
      timestamp: z.string(),
    })
  ),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  userDocs: z.string().optional(),
  brandContext: z.object({
    logoPath: z.string().optional(),
    primaryColor: z.string().optional(),
  }).optional(),
  websiteStrategy: z.string().optional(),
});

/**
 * Workflow event types for state machine
 */
export type WorkflowEvent =
  | { type: 'START_PLANNING' }
  | { type: 'CONSENSUS_APPROVED'; score: number }
  | { type: 'CONSENSUS_REJECTED'; score: number; feedback: string }
  | { type: 'START_EXECUTION' }
  | { type: 'TASK_COMPLETED'; taskId: string }
  | { type: 'TASK_FAILED'; taskId: string; error: string }
  | { type: 'TEST_PASSED' }
  | { type: 'TEST_FAILED'; error: string }
  | { type: 'MILESTONE_COMPLETED'; milestoneId: string }
  | { type: 'PROJECT_COMPLETED' }
  | { type: 'ESCALATE_TO_USER'; reason: string };
