# Changelog

All notable changes to Popeye CLI are documented in this file.

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
