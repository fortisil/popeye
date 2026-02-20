/**
 * Central type exports for Popeye CLI
 * Re-exports all types from subdirectories for easy importing
 */

// Project types
export {
  OutputLanguageSchema,
  OpenAIModelSchema,
  KNOWN_OPENAI_MODELS,
  ProjectSpecSchema,
  OPENAI_MODELS,
  languageToApps,
  hasApp,
  type OutputLanguage,
  type OpenAIModel,
  type ProjectSpec,
  type GeneratedProject,
  type GenerationOptions,
  type AppType,
  type WorkspaceApp,
  type WorkspaceAppCommands,
  type WorkspaceAppDocker,
  type WorkspaceShared,
  type WorkspaceCommands,
  type WorkspaceDocker,
  type WorkspaceConfig,
  type WebsiteSpec,
  type WebsiteBrandColors,
  type WebsiteTypography,
  type WebsiteSeo,
  type WebsitePage,
  type WebsiteCta,
  type WebsiteFeatures,
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
  DEFAULT_GROK_MODEL,
  AIProviderSchema,
  KNOWN_GEMINI_MODELS,
  KNOWN_GROK_MODELS,
  GeminiModelSchema,
  GrokModelSchema,
  type AIProvider,
  type GeminiModel,
  type GrokModel,
  type ConsensusResult,
  type ConsensusIteration,
  type ConsensusConfig,
  type PlanDocument,
  type ConsensusRequest,
  type EscalationDetails,
  type ArbitrationResult,
  type ReviewAppTarget,
  type TaggedItem,
  type AppConsensusScores,
  type AppFeedback,
  type FullstackConsensusResult,
  type FullstackConsensusIteration,
  type CorrectionRecord,
  type ConsensusTrackingRecord,
} from './consensus.js';

// Tester (QA) types
export {
  TestVerdictSchema,
  TestScopeSchema,
  TestCommandSchema,
  TestCaseSchema,
  TestPlanOutputSchema,
  TestRunReviewSchema,
  FixStepSchema,
  TestFixPlanSchema,
  type TestVerdict,
  type TestScope,
  type TestCommand,
  type TestCase,
  type TestPlanOutput,
  type TestRunReview,
  type FixStep,
  type TestFixPlan,
  type DiscoveredTestCommands,
} from './tester.js';

// Database types
export {
  DbStatusSchema,
  DbModeSchema,
  DbProviderSchema,
  BackendOrmSchema,
  DbSetupStepSchema,
  DbConfigSchema,
  DEFAULT_DB_CONFIG,
  type DbStatus,
  type DbMode,
  type DbProvider,
  type BackendOrm,
  type DbSetupStep,
  type DbConfig,
} from './database.js';

// Database runtime types
export {
  SetupStepResultSchema,
  SetupResultSchema,
  ReadinessCheckSchema,
  ReadinessResultSchema,
  type SetupStepResult,
  type SetupResult,
  type ReadinessCheck,
  type ReadinessResult,
} from './database-runtime.js';

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
