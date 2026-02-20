# Changelog

All notable changes to Popeye CLI are documented in this file.

## [2.1.0] - 2026-02-20

### Added — AI Model Updates (Feb 2026)

- **OpenAI models updated** — New default: `gpt-4.1` (was `gpt-4o`). Added: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3`, `o3-mini`, `o4-mini`. Kept for backward compatibility: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1-preview`, `o1-mini`.
- **Gemini models updated** — New default: `gemini-2.5-flash` (was `gemini-2.0-flash`). Added: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-pro`. Kept: `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`.
- **Grok models updated** — Default unchanged: `grok-3`. Added: `grok-4-0709`, `grok-3-fast`, `grok-3-mini-fast`. Created proper `KNOWN_GROK_MODELS` constant (was hardcoded in interactive.ts). Kept: `grok-3`, `grok-3-mini`, `grok-2`.
- **`KNOWN_GROK_MODELS`** constant in `src/types/consensus.ts` — matches `KNOWN_OPENAI_MODELS` and `KNOWN_GEMINI_MODELS` pattern.

### Changed — Model Flexibility

- `OpenAISettingsSchema` now uses `z.string().min(1)` instead of strict `z.enum()` — custom/new model names accepted everywhere.
- `ProjectStateSchema.openaiModel` now uses flexible `z.string().min(1)` — was blocking unrecognized models in state persistence.
- Removed strict `validModels` check in `create.ts` that rejected models not in the predefined list.
- Files changed: `src/types/project.ts`, `src/types/consensus.ts`, `src/types/workflow.ts`, `src/types/index.ts`, `src/config/schema.ts`, `src/config/defaults.ts`, `src/adapters/openai.ts`, `src/adapters/gemini.ts`, `src/auth/gemini.ts`, `src/cli/interactive.ts`, `src/cli/commands/create.ts`, `src/upgrade/handlers.ts`, `src/workflow/website-strategy.ts`, `src/pipeline/consensus/consensus-runner.ts`.

### Added — Review Bridge (/review -> Pipeline AUDIT Integration)

- **Review Bridge** (`src/pipeline/bridges/review-bridge.ts`, ~370 lines) — Bridge module connecting `/review` to the pipeline artifact and Change Request system for pipeline-managed projects.
  - `isPipelineManaged()` / `extractPipelineState()` — pipeline state detection helpers.
  - `mapSeverity()` — severity mapping: critical to P0, major to P1, minor to P2, info to P3.
  - `mapCategory()` — category mapping for workflow finding categories to pipeline categories.
  - `categoryToChangeType()` — CR routing: integration/schema to architecture, security to requirement, tests/config/deployment to config.
  - `convertFinding()` — converts workflow `AuditFinding` to pipeline `AuditFinding` with evidence refs.
  - `runReviewBridge()` — full orchestrator: snapshot, scan, analyze, convert, create artifacts, create CRs, persist.
- Modified `handleReviewSlashCommand` in `src/cli/interactive.ts` — detects pipeline-managed state and routes through the bridge (no milestone injection on pipeline projects).
- Created `tests/pipeline/bridges/review-bridge.test.ts` — 29 tests covering severity/category/CR mapping, finding conversion, pipeline detection, and CR routing determinism.

### Added — Pipeline Entry Point Integration v2.1

- **Fix A (P0): Thread `additionalContext` through pipeline**
  - Added `sessionGuidance` to `PipelineStateSchema` — persists user steering/upgrade context across phases.
  - Added `'additional_context'` artifact type.
  - Orchestrator accepts `additionalContext` option and stores in pipeline state.
  - INTAKE phase prepends guidance to plan input and creates `additional_context` artifact.
  - IMPLEMENTATION phase merges guidance with role prompt in system prompt.
  - RECOVERY_LOOP phase includes guidance in RCA prompt.
  - `resumeWorkflow()` passes `additionalContext` through to pipeline.
- **Fix B (P0): New projects use pipeline from start**
  - `runWorkflow()` bootstraps state via `createProject()` when `loadProject()` fails.
  - Pipeline runs from INTAKE for fresh projects instead of skipping to legacy workflow.
- **Fix C (P1): CLI commands load full consensus config**
  - Created `src/config/popeye-md.ts` — shared `readPopeyeMdConfig()` reader with `PopeyeMdConfig` interface.
  - CLI `create` and `resume` commands now load reviewer/arbitrator/model settings from `popeye.md`.

### Added — Tests

- 29 new tests in `tests/pipeline/bridges/review-bridge.test.ts`.
- 16 tests in `tests/pipeline/session-guidance.test.ts` (sessionGuidance threading, artifact type, injection into intake/implementation/recovery).
- 3 tests in `tests/workflow/pipeline-bootstrap.test.ts` (state bootstrap, existing state, legacy fallback).
- 9 tests in `tests/config/popeye-md.test.ts` (parsing, model fields, arbitrator off, missing fields, notes).
- Total: **1268 tests passing** across **76 test files**.

---

## [2.0.0] - 2026-02-20

### Breaking Changes
- **Full Autonomy Pipeline Engine** — Popeye now ships a complete 14-phase deterministic pipeline that replaces the ad-hoc plan-then-execute workflow with a gate-driven state machine. This is a fundamental architectural shift: every phase must produce typed artifacts, pass gate checks, and survive consensus review before the pipeline advances. The pipeline manages its own recovery, drift detection, and rewind logic without human intervention.
- `PipelineState` is now the authoritative runtime state for autonomous execution (distinct from the existing `ProjectState` used by the interactive CLI).
- New `src/pipeline/` module tree (33 source files) is a peer to the existing `src/workflow/` module.

### Added — Pipeline Core (Autonomy Hardening v1.0)

- **14-Phase State Machine** — `INTAKE` -> `CONSENSUS_MASTER_PLAN` -> `ARCHITECTURE` -> `CONSENSUS_ARCHITECTURE` -> `ROLE_PLANNING` -> `CONSENSUS_ROLE_PLANS` -> `IMPLEMENTATION` -> `QA_VALIDATION` -> `REVIEW` -> `AUDIT` -> `PRODUCTION_GATE` -> `DONE` (or `RECOVERY_LOOP` / `STUCK` on failure). Each phase has a dedicated handler in `src/pipeline/phases/`.
- **Gate Engine** (`gate-engine.ts`) — Pure deterministic evaluator. Each phase has a `GateDefinition` specifying required artifacts, required checks, consensus thresholds, allowed transitions, and fail transition. No side effects; reads state only.
- **Orchestrator** (`orchestrator.ts`) — Main loop that drives the pipeline from any phase to completion. Handles phase dispatch, gate evaluation, recovery routing, resume from saved state, and terminal state handling.
- **Type-Safe Artifact System** (`artifact-manager.ts`, `type-defs/artifacts.ts`) — 18 artifact types (`master_plan`, `architecture`, `role_plan`, `consensus`, `repo_snapshot`, `rca_report`, `audit_report`, `qa_validation`, `review_decision`, `production_readiness`, `constitution`, `change_request`, `release_notes`, `journalist_update`, `dependency_graph`, `implementation_log`, `recovery_log`, `skill_definition`). Each artifact has id, type, phase, version, path, sha256, timestamp, immutability flag, content_type, and group_id.
- **Consensus System** (`consensus/consensus-runner.ts`, `packets/consensus-packet-builder.ts`) — Multi-reviewer consensus with confidence-weighted scoring. `APPROVE` = 1.0, `CONDITIONAL` = 0.5, `REJECT` = 0.0, weighted by voter confidence. Any vote with `blocking_issues` forces `weighted_score` to 0. Three consensus phases (master plan, architecture, role plans) each produce `ConsensusPacket` artifacts.
- **Skill Loader** (`skill-loader.ts`, `skills/defaults.ts`) — 16 pipeline roles (`DISPATCHER`, `FRONTEND_PROGRAMMER`, `BACKEND_PROGRAMMER`, `DATABASE_SPECIALIST`, `DEVOPS_ENGINEER`, `QA_ENGINEER`, `UX_DESIGNER`, `TECHNICAL_WRITER`, `REVIEWER`, `AUDITOR`, `JOURNALIST`, `SECURITY_ANALYST`, `PERFORMANCE_ENGINEER`, `INTEGRATION_SPECIALIST`, `ARCHITECT`, `PROJECT_MANAGER`). Each role has a system prompt, constraints, output contract, and required sections.
- **Constitution System** (`constitution.ts`) — SHA-256 hash verification of `POPEYE_CONSTITUTION.md`. Created during INTAKE, verified before every gate evaluation. Hash mismatch blocks pipeline progression.
- **Repo Snapshot & Drift Detection** (`repo-snapshot.ts`) — File/line counting, language detection, config file inventory, port scanning, test framework and build tool detection. Snapshot diffing for drift detection between approved plans and implementation.
- **Check Runner** (`check-runner.ts`) — Deterministic command execution for `build`, `test`, `lint`, `typecheck`, `start`, and `env_check` gates. Captures exit code, stdout/stderr, duration.
- **Command Resolver** (`command-resolver.ts`) — Auto-detects `build`, `test`, `lint`, `typecheck`, and `start` commands from `package.json` scripts, `Makefile`, and common patterns.
- **Artifact Validators** (`artifact-validators.ts`) — Deterministic regex/structural checks before LLM review: `master_plan` (Goals, Milestones, Success Criteria sections, 200+ chars), `architecture` (Components, Data Flow, Tech Stack, file path references), `role_plan` (Tasks, Dependencies, Acceptance Criteria), `qa_validation` (Test Results, Coverage), `audit_report` (JSON with findings array, overall_status, system_risk_score).
- **Change Request System** (`change-request.ts`) — Structured drift tracking: `scope` -> `CONSENSUS_MASTER_PLAN`, `architecture` -> `CONSENSUS_ARCHITECTURE`, `dependency` -> `CONSENSUS_ROLE_PLANS`, `config` -> `QA_VALIDATION`, `requirement` -> `CONSENSUS_MASTER_PLAN`. CRs include origin phase, requester, impact analysis (affected artifacts, phases, risk level).
- **Role Execution Adapter** (`role-execution-adapter.ts`) — Bridges pipeline roles to execution. Builds role-specific system prompts from skill + role plan, defines allowed paths and forbidden patterns, injects context into `ClaudeExecuteOptions`.
- **RCA & Recovery** (`packets/rca-packet-builder.ts`, `phases/recovery-loop.ts`) — Root Cause Analysis packets with `requires_phase_rewind_to` for targeted recovery. Recovery loop reads RCA artifacts from disk to determine rewind targets.
- **Packet Builders** — `plan-packet-builder.ts` (PlanPacket with milestones, constraints, deliverables), `consensus-packet-builder.ts` (ConsensusPacket with votes, scores, conditions), `rca-packet-builder.ts` (RCAPacket with root cause, evidence, rewind target), `audit-report-builder.ts` (AuditReport with findings, risk score, status).
- **Migration System** (`migration.ts`) — Version-aware pipeline state migration for forward compatibility.
- **Pipeline Index** (`index.ts`) — Public API: `runPipeline()`, `resumePipeline()`, `createDefaultPipelineState()`, `createGateEngine()`, plus all type exports.

### Added — Autonomy Hardening v1.1 (Gap Fixes)

- **Deterministic CR Routing** — After REVIEW and AUDIT phases pass their gates, the orchestrator checks `pipeline.pendingChangeRequests` for proposed CRs. First proposed CR is marked `approved` and the pipeline transitions to its `target_phase` (a consensus phase). This is a real state machine transition, not advisory.
- **Constitution Verification in Orchestrator** — `verifyConstitution(pipeline, projectDir)` is called before every `evaluateGate()`. Result is passed as `{ constitutionValid, constitutionReason }` options. Gate engine adds constitution failure as a blocker.
- **Gate Result Merge** — `mergeGateResult()` preserves `score`/`consensusScore` stored by consensus phase handlers while updating `pass`/`blockers` from the gate engine. Prevents consensus scoring data loss on re-evaluation.
- **RCA Rewind from Disk** — `getLatestRCA()` reads the latest `rca_report` JSON artifact from the filesystem and parses `requires_phase_rewind_to`. Recovery loop uses this to rewind to the correct phase instead of always returning to the failed phase.
- `score?: number` on `GateResult` in `gate-engine.ts` (was present in type-defs but missing from the runtime interface).
- `pendingChangeRequests` array on `PipelineState` for CR lifecycle tracking (`proposed` -> `approved` -> routing).

### Added — Type System

- **Split `types.ts` into `type-defs/` directory** (8 files) — `enums.ts` (PipelinePhase, PipelineRole), `artifacts.ts` (18 artifact types, ArtifactEntry, ArtifactRef, DependencyEdge), `packets.ts` (PlanPacket, ConsensusPacket, ReviewerVote, RCAPacket, ChangeRequest, Constraint), `audit.ts` (AuditFinding, AuditReport), `snapshot.ts` (RepoSnapshot, ConfigFileEntry, PortEntry, SnapshotDiff), `checks.ts` (GateCheckType, GateCheckResult, ResolvedCommands), `state.ts` (PipelineState, GateResult, GateDefinition, SkillDefinition, PhaseResult, PhaseContext), `index.ts` (barrel re-export). All existing `from '../pipeline/types.js'` imports work unchanged.

### Added — Tests

- **59 new test files** covering the entire pipeline module with **1210 total tests** (up from 828):
  - `orchestrator.test.ts` (25 tests) — Happy path, recovery loop, resume, gate integration, v1.1 gap fixes (CR routing, constitution, merge, RCA rewind)
  - `gate-engine.test.ts` — Gate definitions, evaluations, transitions, consensus thresholds
  - `consensus-scoring.test.ts` — Weighted scoring, CONDITIONAL=0.5, blocking issues, confidence weights
  - `constitution.test.ts` — Artifact creation, hash computation, tamper detection
  - `artifact-validators.test.ts` — Each type: valid pass, missing sections, empty content, edge cases
  - `change-request.test.ts` — CR building, routing per change type, impact analysis
  - `role-execution-adapter.test.ts` — Role context, prompt injection, forbidden patterns
  - `start-env-checks.test.ts` — Start check (alive/crash/timeout), env check (complete/missing/empty)
  - `check-runner.test.ts`, `command-resolver.test.ts`, `consensus-runner.test.ts`, `repo-snapshot.test.ts`, `skill-loader.test.ts`, `artifact-manager.test.ts`, `migration.test.ts`, `types.test.ts`, `packets/builders.test.ts`

### Changed
- Orchestrator main loop now has 3 new behaviors between phase execution and transition: (1) constitution verification before gate eval, (2) gate result merging after gate eval, (3) CR routing check after REVIEW/AUDIT gate pass.
- REVIEW phase creates CRs for config drift and scope drift, registers them in `pipeline.pendingChangeRequests`.
- AUDIT phase creates CRs for blocking architectural and security findings, registers them in `pipeline.pendingChangeRequests`.
- `src/workflow/index.ts` — Added pipeline exports for integration with existing workflow system.

## [1.6.0] - 2026-02-17

### Added
- **Dual-Mode Website Validation** - `validateWebsiteContext()` (soft/non-throwing) and `validateWebsiteContextOrThrow()` (hard). All 4 website entry points now validate context quality (was 1 of 4). Returns `ValidationResult` with `passed`, `issues`, `warnings`, and `contentScore` (0-100).
- **Post-Generation Content Scanner** - `scanGeneratedContent()` scans generated `.tsx`/`.ts` files for placeholder fingerprints: TODO comments, default taglines, generic descriptions, default pricing tiers ($29/mo, Starter/Pro/Enterprise), default "How It Works" steps, lorem ipsum. Integrated into website generator (non-blocking warnings).
- **Workspace Root Detection** - `workspace-root.ts` detects monorepo roots via `.popeye/`, `package.json` workspaces, `pnpm-workspace.yaml`, `turbo.json`. Doc discovery and brand asset scanning now traverse workspace boundaries.
- **Shared Packages Module** - Extracted `generateDesignTokensPackage()` and `generateUiPackage()` from `all.ts` into `shared-packages.ts`. Brand-specific color scale generation (hex to HSL to 10-stop scale).
- **Frontend Design Analyzer** - `analyzeFrontendDesign()` extracts colors, fonts, and component library info from `apps/frontend/` CSS vars, Tailwind config, and package.json.
- **Bundler Error Auto-Fix** - `auto-fix-bundler.ts` handles CSS/PostCSS/Tailwind/webpack errors that the TypeScript-only parser misses. Discovers related config files, sends to Claude for fix.
- **CWD-Aware Project Naming** - `generateProjectName()` now checks docs first, then CWD basename, then idea text. Skips generic dir names (Projects, Desktop, tmp).
- **Project Brief Generation** - `generateProjectBrief()` creates `PROJECT_BRIEF.md` in `.popeye/` with product name, tagline, color, and source doc paths.
- **`[WEB]` App Tag Support** - Plan parser recognizes `[WEB]` tags on tasks, maps to `website` app target, counted in `webTasks` stat.
- **Website Debug Tracing** - `POPEYE_DEBUG_WEBSITE=1` env var enables detailed pipeline trace showing doc discovery, brand assets, template values, and validation results.
- **Strategy Context Packing** - `packProductContext()` with priority-based doc packing (spec > pricing > brand > features) and 16K budget.
- `skipValidation` option on `WebsiteGeneratorOptions` as escape hatch for scaffold-only use.
- `sourceDocPaths` field on `ProjectState` for doc awareness across sessions.
- `strategyError` field on `ProjectState` for strategy failure visibility.

### Fixed
- **Critical**: Website generation pipeline produced generic/broken output (TODO placeholders, wrong product names, default $29/mo pricing). Root cause: validation existed but was bypassed by 3 of 4 entry points. Now all entry points validate.
- **Critical**: Upgrade pipeline (`/upgrade fullstack -> all`) generated website with TODO placeholders. `buildUpgradeContentContext()` now builds full content context from user docs, brand assets, and strategy.
- **Critical**: `extractProductName()` returned directory names instead of product names. Now uses 5-step priority chain (docs heading > spec heading > spec label > package.json > undefined).
- **Critical**: `extractPricing()` matched design doc sections ("Plan-Based Color Usage") as pricing tiers. Now uses strict price validation and `Pricing` keyword only.
- `readProjectDocs` maxLength increased from 6K to 25K with per-file 8K cap. Brand/color docs sorted first to prevent truncation.
- `extractFeatures()` removed `enforce` keyword (matched "Enforcement Colors" in design docs), tightened `feature` to require plural or prefix.
- `extractTagline()` now prefers tagline from heading matching product name exactly (avoids wrong doc in multi-doc concatenation).
- `extractDescription()` prefers "What Is [Product]?" over generic "What is a [thing]?" sections.
- Logo copy path mismatch: `public/logo{ext}` corrected to `public/brand/logo{ext}` per `BrandAssetsContract`.
- Logo path in Header component: strips `public/` prefix for Next.js serving.
- Auto-fix false success: first attempt with zero parsed errors now returns `success: false` instead of `success: true`.
- `parseTypeScriptErrors` now supports both tsc and bundler output formats, strips ANSI codes, deduplicates.
- Plan parser: `[FE]`/`[BE]`/`[WEB]`/`[INT]` tags no longer block task name extraction by `isActionableTask()`.
- Tailwind config: brand color scale generated from hex instead of defaulting to sky-blue.

### Changed
- `validateWebsiteContextOrThrow()` now delegates to `validateWebsiteContext()` internally.
- `all.ts` website context building: validates with soft mode, logs warnings without blocking.
- `website-updater.ts`: reports quality issues via `onProgress` callback.
- `upgrade/handlers.ts`: `buildUpgradeContentContext()` includes validation warnings in return value.
- Website template files split into focused modules: `website-landing.ts`, `website-pricing.ts`, `website-layout.ts`, `website-sections.ts`.

## [1.5.0] - 2026-02-13

### Added
- **Strategy-First Website Generation** - AI-powered marketing strategy generation with ICP analysis, positioning, messaging, SEO strategy, site architecture, conversion strategy, and competitive context.
- **Reviewer Persona Switching** - `reviewerPersona` field in ConsensusConfig for marketing-specific consensus review.
- **Website Components** - Header (logo/text fallback, nav, CTA, mobile menu), Footer (multi-column, brand), Navigation config.
- **SEO Infrastructure** - JsonLd component, enhanced sitemap/robots, 404/500 error pages, web manifest, meta helper.
- **Lead Capture System** - API route with webhook/resend/postmark support, contact form, env examples.
- **Brand Assets Contract** - `BrandAssetsContract` interface and `resolveBrandAssets()` for deterministic logo/favicon placement.
- **Website Strategy Caching** - SHA-256 hash-based staleness detection, store/load with metadata.
- `'website-strategy'` workflow stage.
- `websiteStrategy` and `storeWebsiteStrategyPath()` in project state.

## [1.4.0] - 2026-02-08

### Added
- **Project Type Upgrade (`/upgrade`)** - Expand projects to new types at any time (e.g., fullstack -> all). Includes transactional upgrade with backup/rollback, automatic planning for new apps, and integration guidance for existing code.
- **Multi-Provider Model Switching (`/model`)** - Switch AI models per provider: `/model openai gpt-5`, `/model gemini gemini-2.5-pro`, `/model grok grok-3`. All 3 models persisted to `popeye.md` and loaded on resume.
- **Flexible Model Validation** - OpenAI and Gemini schemas now accept any model name (not just hardcoded enums), with known models shown as suggestions via `/model <provider> list`.
- **Upgrade Context Builder** - After upgrade, scans existing apps (dependencies, API routes, shared packages) and builds rich context so the planner focuses only on new apps with integration guidance.
- **Monorepo-Aware Codebase Analysis** - `getProjectContext()` now detects code in `apps/*/` subdirectories, not just root.
- `/config model` subcommand for model management.
- `isWorkspace()` helper replacing scattered `=== 'fullstack'` checks.
- `KNOWN_OPENAI_MODELS` and `KNOWN_GEMINI_MODELS` constants for display.

### Fixed
- **Critical**: `ProjectStateSchema` only accepted 3 of 5 language types, breaking `website` and `all` projects at the persistence layer. Now uses `OutputLanguageSchema` as single source of truth.
- **Critical**: `readPopeyeConfig()` used hardcoded language array, rejecting valid `website`/`all` values from `popeye.md`.
- `default_language` in config schema used hardcoded enum instead of `OutputLanguageSchema`.
- `/lang` help text now shows all 5 language shortcuts.

### Changed
- `OpenAIModelSchema` changed from strict `z.enum()` to flexible `z.string().min(1)`.
- `GeminiModelSchema` changed from strict `z.enum()` to flexible `z.string().min(1)`.
- `GeminiModel` type changed from union literal to `string` in both `consensus.ts` and `gemini.ts`.
- All `=== 'fullstack'` workspace checks replaced with `isWorkspace()` (covers both `fullstack` and `all`).

## [1.3.0] - 2026-02-05

### Added
- Website app support for ALL project type.
- Module exports for generator functions.

## [1.2.1] - 2026-02-05

### Fixed
- Rate limit handling with graceful pause instead of failure.
- Workflow saves progress on rate limit so `/resume` continues from where it stopped.

## [1.2.0] - 2026-02-04

### Added
- Grok AI provider support (reviewer/arbitrator).
- Fullstack project type with frontend + backend monorepo.
- `popeye.md` project configuration file.
- Multi-provider consensus (OpenAI + Gemini + Grok).

## [1.1.0] - 2026-02-03

### Added
- npm version badge and quick install instructions.
- CONTRIBUTING.md guidelines.
- Open Source Manifesto.

## [1.0.0] - 2026-02-01

### Added
- Initial release: AI-powered autonomous code generation.
- Interactive Claude Code-style CLI interface.
- Plan mode with idea expansion and consensus review.
- Execution mode with per-task planning, consensus, and implementation.
- Python and TypeScript project generators.
- OpenAI and Gemini adapter support.
- Test runner with automatic retry.
- Project state persistence and resume.
