# Changelog

All notable changes to Popeye CLI are documented in this file.

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
