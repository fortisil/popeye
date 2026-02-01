/**
 * Central type exports for Popeye CLI
 * Re-exports all types from subdirectories for easy importing
 */

// Project types
export {
  OutputLanguageSchema,
  OpenAIModelSchema,
  ProjectSpecSchema,
  OPENAI_MODELS,
  type OutputLanguage,
  type OpenAIModel,
  type ProjectSpec,
  type GeneratedProject,
  type GenerationOptions,
} from './project.js';

// Workflow types
export {
  WorkflowPhaseSchema,
  TaskStatusSchema,
  ProjectStateSchema,
  ProjectStatusSchema,
  TaskSchema,
  MilestoneSchema,
  type WorkflowPhase,
  type ProjectStatus,
  type TaskStatus,
  type Task,
  type Milestone,
  type ProjectState,
  type WorkflowEvent,
} from './workflow.js';

// Consensus types
export {
  ConsensusConfigSchema,
  DEFAULT_CONSENSUS_CONFIG,
  type ConsensusResult,
  type ConsensusIteration,
  type ConsensusConfig,
  type PlanDocument,
  type ConsensusRequest,
  type EscalationDetails,
} from './consensus.js';

// CLI types
export {
  EXIT_CODES,
  type GlobalOptions,
  type CreateOptions,
  type ResumeOptions,
  type StatusOptions,
  type AuthOptions,
  type ConfigOptions,
  type AuthStatus,
  type InteractiveSession,
  type SlashCommand,
  type ProgressInfo,
  type OutputStyles,
  type BannerConfig,
  type ExitCode,
} from './cli.js';
