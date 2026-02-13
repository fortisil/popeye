# Popeye CLI

[![npm version](https://img.shields.io/npm/v/popeye-cli.svg)](https://www.npmjs.com/package/popeye-cli)
[![npm downloads](https://img.shields.io/npm/dm/popeye-cli.svg)](https://www.npmjs.com/package/popeye-cli)

A fully autonomous code generation tool that transforms your ideas into complete, tested, deployable code projects using AI-powered planning, consensus, and implementation.

## Quick Install

```bash
npm install -g popeye-cli
```

## What is Popeye?

Popeye is an autonomous software development agent that takes a simple project idea and builds it into a fully functional codebase. Unlike traditional code assistants that require constant guidance, Popeye operates autonomously through a structured workflow:

1. **Understands** your idea and expands it into a detailed specification
2. **Designs** the UI automatically based on the project context
3. **Strategizes** (website projects) by generating a marketing strategy with ICP, positioning, SEO, and conversion goals
4. **Plans** a complete development roadmap with milestones and tasks
5. **Validates** the plan through AI consensus (multiple AI systems must agree)
6. **Implements** each task autonomously, writing production-quality code
7. **Styles** the application with a professional design system and component library
8. **Tests** the implementation and fixes issues automatically
9. **Delivers** a complete, working project with polished UI

## How It Works

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            POPEYE WORKFLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Your Idea] ──► [Specification] ──► [UI Design] ──► [Dev Plan]         │
│                       ▲                   │               │              │
│                       │                   │               ▼              │
│                  OpenAI expands      Auto-design    Claude creates       │
│                                      theme/style                         │
│                                                           │              │
│                                                           ▼              │
│                  ┌────────────────────────────────────────────┐          │
│                  │  WEBSITE STRATEGY (website/all projects)   │          │
│                  │  - AI generates WebsiteStrategyDocument    │          │
│                  │  - ICP, positioning, messaging, SEO        │          │
│                  │  - Site architecture, conversion goals     │          │
│                  │  - Cached via SHA-256 hash                 │          │
│                  └────────────────────────────────────────────┘          │
│                                                           │              │
│                                                           ▼              │
│                  ┌────────────────────────────────────────────┐          │
│                  │      CONSENSUS LOOP (95%+)                 │          │
│                  │  ┌─────────┐     ┌─────────┐              │          │
│                  │  │ OpenAI  │◄───►│ Claude  │              │          │
│                  │  │ Reviews │     │ Revises │              │          │
│                  │  └─────────┘     └─────────┘              │          │
│                  │  (Marketing persona for website projects)  │          │
│                  └────────────────────────────────────────────┘          │
│                                                           │              │
│                                                           ▼              │
│                  ┌────────────────────────────────────────────┐          │
│                  │      EXECUTION MODE                        │          │
│                  │  For each task:                             │          │
│                  │    1. Claude implements                     │          │
│                  │    2. Tests run automatically               │          │
│                  │    3. Fix issues (up to 3 retries)          │          │
│                  │    4. Mark complete                         │          │
│                  └────────────────────────────────────────────┘          │
│                                                           │              │
│                                                           ▼              │
│                  ┌────────────────────────────────────────────┐          │
│                  │      UI SETUP & STYLING                     │          │
│                  │  - Install Tailwind CSS                     │          │
│                  │  - Configure shadcn/ui components           │          │
│                  │  - Apply selected theme                     │          │
│                  └────────────────────────────────────────────┘          │
│                                                           │              │
│                                                           ▼              │
│                       [Complete Project with Polished UI]                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Strategy-First Website Generation

For website and ALL projects, Popeye now includes a **strategy-first pipeline** that generates a complete marketing strategy document before any code is written:

```
[Product Docs] --> [AI Strategy Generation] --> [WebsiteStrategyDocument]
                                                        |
                    +-----------+-----------+-----------+
                    |           |           |           |
                 Landing    Pricing     SEO/Meta    Lead Capture
                  Page       Page      Components    System
```

The strategy document drives all downstream code generation, ensuring consistent messaging, SEO keywords, navigation structure, and conversion goals across every page.

### Multi-AI Consensus System

Popeye uses multiple AI systems that must agree before implementation begins:

- **Claude (via Claude Agent SDK)**: Primary code execution engine that generates plans, implements code, and runs tests
- **OpenAI GPT-4** (default reviewer): Evaluates plans for completeness, feasibility, and quality
- **Google Gemini** (optional): Can be configured as reviewer or arbitrator when consensus gets stuck
- **xAI Grok** (optional): Can be configured as reviewer or arbitrator as an alternative to Gemini

Plans are iteratively refined until systems reach **95%+ consensus**, ensuring well-thought-out implementations. When consensus cannot be reached, an arbitrator (configurable) makes the final decision.

---

## The AI Development Team Model

Popeye is built around a simple belief:

> **One AI writing code is dangerous. Multiple AIs disagreeing, reviewing, and resolving conflict is powerful.**

Instead of a single "genius" model, Popeye operates as a **virtual AI development team**, each role with a clear responsibility.

Every decision is recorded. Every disagreement is traceable. Nothing happens silently.

### The Three Roles

#### 1. Planner & Builder (The Implementer)

This role is responsible for **moving from idea to code**.

It:
- expands your idea into a full technical specification
- proposes architecture and project structure
- generates backend, frontend, configs, and tests
- makes concrete implementation choices

Think of this role as:
> *A senior engineer translating product intent into working software.*

#### 2. Reviewer (The Skeptic)

This role **does not write code**. Its job is to **challenge it**.

It:
- reviews the spec for gaps, contradictions, or risky assumptions
- checks generated code for correctness, maintainability, and structure
- looks for missing edge cases and test coverage
- flags anything that "works" but shouldn't ship

Think of this role as:
> *A strict code reviewer who wasn't emotionally attached to the solution.*

#### 3. Arbitrator (The Tie-Breaker)

When the Planner and Reviewer disagree, Popeye does **not** pick randomly.

The Arbitrator:
- evaluates both sides' arguments
- weighs correctness, simplicity, safety, and scope
- makes a final decision when consensus cannot be reached
- documents *why* the decision was made

Think of this role as:
> *A tech lead making the call after a heated design review.*

### How the Loop Works

```
1. You describe your idea
2. Planner generates a spec and implementation
3. Reviewer audits the plan and code
4. If the Reviewer approves → continue
5. If the Reviewer objects → feedback is sent back
6. If disagreement persists → Arbitrator decides
7. Final decision is applied and logged
```

No silent overrides. No "AI magic happened here".

### Everything Is Recorded

Popeye keeps a **paper trail**.

For each project, it records:
- the original user intent
- the expanded specification
- reviewer feedback
- arbitration decisions
- applied fixes and changes

This makes the system:
- debuggable
- auditable
- explainable
- reproducible

You can always answer: *"Why was this built this way?"*

### Why This Matters

Most AI code generators fail because:
- they don't question themselves
- they optimize for speed over correctness
- they hide mistakes behind confidence

Popeye assumes:
- first drafts are wrong
- disagreement is healthy
- quality emerges from review, not generation

This is how real engineering teams work. Popeye simply encodes that discipline into software.

### Not Perfect — Intentionally Transparent

The AI team can:
- miss edge cases
- argue poorly
- make suboptimal calls

That's why:
- logs are visible
- prompts are editable
- decisions are inspectable
- contributors can improve the process itself

You're not just reviewing code — you're reviewing **how decisions are made**.

### An Open Experiment

Popeye is not claiming:
> "This is how AI development *must* work."

It's saying:
> "This is one honest attempt — in the open."

If you believe there should be more roles, better arbitration logic, stronger review heuristics, or domain-specific reviewers — you can build them. The AI team is **part of the product**, not a black box.

### Where This Can Go

Over time, Popeye can evolve into:
- specialized reviewers (security, performance, UX)
- human-in-the-loop arbitration
- configurable team topologies
- per-project governance rules

But it starts with one principle:

> **AI should argue before it commits.**

---

## Prerequisites

Before installing Popeye, ensure you have:

### Required

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | 18.0+ | Runtime environment |
| **npm** | 8.0+ | Package manager |
| **Claude Code CLI** | Latest | Code generation engine |

### Claude Code CLI Installation

Popeye requires the Claude Code CLI to be installed and authenticated:

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# Authenticate with Claude (opens browser for OAuth)
claude auth login
```

Verify Claude Code is working:

```bash
claude --version
```

### API Keys Required

| Service | Required | Purpose |
|---------|----------|---------|
| **OpenAI API Key** | Yes | Plan review and consensus (default reviewer) |
| **Claude Auth** | Yes | Code generation (via Claude Code CLI) |
| **Gemini API Key** | Optional | Alternative reviewer or arbitrator |
| **Grok API Key** | Optional | Alternative reviewer or arbitrator (xAI) |

## Installation

### Global Installation (Recommended)

```bash
npm install -g popeye-cli
```

### Using npx (No Installation)

```bash
npx popeye-cli create "your project idea"
```

### From Source

```bash
git clone https://github.com/your-org/popeye-cli.git
cd popeye-cli
npm install
npm run build
npm link
```

## Quick Start

### 1. Authenticate

```bash
# Authenticate with Claude (browser-based OAuth)
popeye auth claude

# Set up OpenAI API key (required - default reviewer)
popeye auth openai

# Set up Gemini API key (optional - for arbitration or alternative reviewer)
popeye auth gemini

# Set up Grok API key (optional - alternative to Gemini)
popeye auth grok
```

### 2. Create a Project

```bash
# Create a Python project
popeye create "A REST API for managing todo items with SQLite storage" --language python

# Create a TypeScript project
popeye create "A React component library for data visualization" --language typescript

# Create a Fullstack project (React frontend + FastAPI backend)
popeye create "A task management app with user authentication" --language fullstack

# Create a Website project (Next.js marketing/landing site)
popeye create "A marketing website with blog and pricing page" --language website

# Create an ALL project (React app + FastAPI backend + Marketing website)
popeye create "A SaaS product with landing page and dashboard" --language all
```

### 3. Monitor Progress

Popeye provides real-time feedback:

```
[Plan] Creating development plan...
[UI Design] Analyzing project idea for UI intent...
[UI Design] UI Intent: modern style for consumer audience
[UI Design] Selected theme: Modern Blue
[UI Design] UI design complete: Modern Blue theme with 12 components
[Website Strategy] Analyzing product context for strategy...
[Website Strategy] Generating website strategy via AI...
[Website Strategy] Validating strategy schema...
[Website Strategy] Strategy cached to .popeye/website-strategy.json
[Consensus] Review round 1: 78% agreement (Marketing Strategist persona)
[Consensus] Addressing concerns...
[Consensus] Review round 2: 92% agreement
[Consensus] Review round 3: 97% agreement - APPROVED
[Execute] Milestone 1: Project Setup
[Execute]   Task 1.1: Initialize project structure... DONE
[Execute]   Task 1.2: Configure dependencies... DONE
[Execute] Milestone 2: Core Implementation
...
[UI Setup] Installing Tailwind CSS and dependencies...
[UI Setup] Installing UI component dependencies...
[UI Setup] Setting up theme and styles...
[UI Setup] UI setup complete: 5 components installed
[Complete] Project built successfully!
```

**Note:** The `[Website Strategy]` steps appear only for `website` and `all` project types. The marketing strategist persona for consensus review is also specific to website projects.

## Features

### Core Features

- **Fully Autonomous**: Runs from idea to complete project without manual intervention
- **Dual-AI Consensus**: Plans validated by multiple AI systems before execution
- **Multi-Language Support**: Generate projects in Python, TypeScript, Fullstack (React + FastAPI), Website, or ALL (React + FastAPI + Website)
- **Automatic Testing**: Tests are generated and run for each implementation
- **Error Recovery**: Failed tests trigger automatic fix attempts (up to 3 retries)
- **Auto-Generated README**: At project completion, generates a comprehensive README with:
  - Project description and features
  - Prerequisites and installation instructions
  - Environment setup guide
  - How to run (development, tests, production)
  - Project structure overview
- **Project Type Upgrade**: Upgrade projects in-place (e.g., python to fullstack, fullstack to all) with automatic file restructuring, scaffolding, and planning integration
- **Flexible Model Switching**: Use any AI model name for OpenAI, Gemini, or Grok providers -- not limited to a predefined list

### Automatic UI/UX Design

Popeye automatically handles all UI/UX decisions, eliminating the need for manual design work:

- **AI-Powered UI Design**: Analyzes your project idea to determine the optimal UI style, color scheme, and component needs
- **Theme Selection**: Automatically selects from professional themes based on project context:
  - **Modern Blue**: Clean, professional look for general applications
  - **Elegant Dark**: Sophisticated style with purple accents
  - **Minimal Clean**: Streamlined design for business tools
  - **Vibrant Gradient**: Bold, colorful design for consumer apps
- **Component Library Setup**: Installs and configures shadcn/ui with Tailwind CSS
- **Project-Aware Components**: Selects appropriate UI components based on project type:
  - Dashboard projects: tables, charts, cards, tabs
  - Kanban boards: drag-and-drop, context menus, popovers
  - E-commerce: carousels, accordions, sliders
  - Blogs: navigation menus, avatars, text areas
- **Accessibility Built-in**: Targets WCAG AA compliance by default
- **Dark Mode Support**: Automatic dark mode configuration
- **Mobile-First Design**: Responsive layouts out of the box

The UI design specification is saved to `.popeye/ui-spec.json` and is used to guide all code generation, ensuring consistent styling throughout the project.

### Production Marketing Website Generation

Popeye generates production-quality marketing websites through a strategy-first approach. Instead of generating generic templates, the system first creates a comprehensive marketing strategy document, then uses it to drive every aspect of the generated website.

#### Website Strategy Document

When you create a `website` or `all` project, Popeye generates a `WebsiteStrategyDocument` containing:

| Section | Contents |
|---------|----------|
| **ICP (Ideal Customer Profile)** | Primary persona, pain points, goals, objections |
| **Positioning** | Category, differentiators, value proposition, proof points |
| **Messaging** | Headline, subheadline, elevator pitch, long description |
| **SEO Strategy** | Primary/secondary/long-tail keywords, title templates, meta descriptions |
| **Site Architecture** | Pages with types, sections, SEO keywords, conversion goals, navigation, footer |
| **Conversion Strategy** | Primary/secondary CTAs, trust signals, social proof, lead capture provider |
| **Competitive Context** | Category, competitors (user-supplied only), differentiators |

The strategy is cached in `.popeye/website-strategy.json` with a SHA-256 hash of the inputs. It is only regenerated when inputs change (product docs, specification, or brand assets).

#### Generated Website Components

The strategy drives generation of the following production components:

- **Header** (`Header.tsx`): Logo with image/text fallback, strategy-driven navigation, primary CTA button, mobile hamburger menu with `aria-label` and `aria-expanded`
- **Footer** (`Footer.tsx`): Multi-column link sections from strategy, brand column with tagline, copyright
- **Navigation** (`nav.ts`): Exportable navigation config supporting nested items
- **Landing Page**: Strategy-driven hero headline, trust signals, social proof sections, dual CTAs
- **Pricing Page**: Strategy-aware with enterprise CTA variant
- **JSON-LD** (`JsonLd.tsx`): Reusable structured data component (Organization + SoftwareApplication schemas)
- **Sitemap** (`sitemap.ts`): Strategy-aware with per-page-type priority and change frequency
- **Robots.txt** (`robots.ts`): Standard configuration with sitemap reference
- **404 Page** (`not-found.tsx`): Branded error page with back-to-home CTA
- **500 Page** (`error.tsx`): Client error boundary with retry button
- **Web Manifest** (`manifest.webmanifest`): PWA manifest with brand colors and icons
- **Meta Helper** (`meta.ts`): Utility for building page-level metadata with OpenGraph and Twitter cards
- **Contact Form** (`ContactForm.tsx`): Lead capture form with loading/success/error states
- **Lead Capture API** (`api/lead/route.ts`): Server-side handler supporting webhook, Resend, or Postmark providers

#### Lead Capture System

The lead capture system supports three provider configurations:

| Provider | Environment Variables | Description |
|----------|----------------------|-------------|
| **webhook** | `LEAD_WEBHOOK_URL` | Sends lead data to any HTTP endpoint |
| **resend** | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `LEAD_NOTIFICATION_EMAIL` | Sends email notifications via Resend |
| **postmark** | `POSTMARK_API_KEY`, `POSTMARK_FROM_EMAIL`, `LEAD_NOTIFICATION_EMAIL` | Sends email notifications via Postmark |

The provider is selected by the AI strategy based on project context, and the corresponding `.env.example` entries are generated automatically.

#### Brand Assets Contract

Popeye automatically discovers brand assets (logos, favicons, color schemes) from your project documentation directory and maps them to deterministic output paths:

- Logo files are copied to `public/brand/logo.{ext}`
- Primary brand color is extracted from design docs or CSS variables
- The `BrandAssetsContract` interface ensures consistent logo placement across Header, manifest, and metadata

#### Reviewer Persona Switching

For website projects, the consensus reviewer automatically switches to a **Senior Product Marketing Strategist** persona instead of the default technical reviewer. This ensures the plan is evaluated for marketing effectiveness, conversion optimization, and SEO quality rather than purely technical criteria. The `reviewerPersona` field in `ConsensusConfig` controls this behavior and is threaded through all adapter implementations (OpenAI, Gemini, Grok).

### Fullstack Project Support

Popeye supports generating complete fullstack applications with coordinated frontend and backend development:

- **Frontend Stack**: React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui + Vitest
- **Backend Stack**: FastAPI (Python) + PostgreSQL
- **Monorepo Structure**: `apps/frontend/` and `apps/backend/` directories
- **App-Aware Planning**: Tasks are tagged with `[FE]`, `[BE]`, or `[INT]` for frontend, backend, and integration work
- **Coordinated Development**: Plans ensure proper sequencing of frontend and backend tasks
- **Integration Testing**: Dedicated integration tasks ensure frontend and backend work together

Example fullstack task in a plan:
```markdown
#### Task 1.1 [FE]: Create user login form
**App**: frontend
**Files**:
- `apps/frontend/src/components/LoginForm.tsx`
- `apps/frontend/src/pages/Login.tsx`

#### Task 1.2 [BE]: Implement authentication endpoint
**App**: backend
**Files**:
- `apps/backend/src/api/routes/auth.py`
- `apps/backend/src/models/user.py`

#### Task 1.3 [INT]: Connect login form to auth API
**App**: unified
**Dependencies**: Task 1.1, Task 1.2
```

### ALL Project Support (Fullstack + Website)

For comprehensive projects that need both an application and a marketing/landing website, Popeye supports the `all` project type which includes:

- **Frontend App**: React application (same as fullstack)
- **Backend API**: FastAPI backend (same as fullstack)
- **Website**: Static marketing/landing site (Astro, Next.js static, or similar)

Tasks can be tagged with:
- `[FE]` - Frontend application work
- `[BE]` - Backend API work
- `[WEB]` - Website/marketing pages work
- `[INT]` - Integration work across multiple apps

The consensus system tracks approval separately for each app target:
- `frontend` - React/Vue application components
- `backend` - API endpoints and database logic
- `website` - Marketing pages, landing pages, SEO content
- `unified` - Cross-app integration and shared concerns

### Reliability Features

- **Rate Limit Handling**: Automatically waits and retries when API rate limits are hit
  - Improved detection using specific regex patterns to avoid false positives
  - Distinguishes actual rate limit errors from plan content mentioning "rate limits"
  - Parses reset times from error messages (e.g., "resets 3pm")
  - Extracts clean error messages without including extraneous plan content
  - Configurable wait times (default: 1 min base, **10 min max**)
  - Up to 3 retry attempts before failing gracefully
  - **Capped wait time**: Will not wait longer than 10 minutes; fails with helpful message if reset time is too far
  - Progress updates during wait periods

- **Resume Capability**: Resume interrupted projects from where they left off
  - State persisted in `.popeye/state.json`
  - Tracks completed milestones and tasks
  - Survives crashes, rate limits, and manual interruptions
  - Automatically loads `popeye.md` configuration on resume

- **Smart Project Naming**: Generates meaningful project names from your idea
  - Detects explicit project names (e.g., "planning Gateco" becomes `gateco`)
  - Recognizes CamelCase names (e.g., "TodoMaster" becomes `todo-master`)
  - Filters out action verbs like "read", "start", "planning"
  - Falls back to extracting key nouns from the description

- **Plan File Extraction**: Handles various Claude response formats
  - Detects when Claude saves plans to `~/.claude/plans/`
  - Automatically extracts plan content from saved files
  - Validates plan structure before proceeding

- **Consensus Stuck Detection**: Prevents infinite loops in consensus phase
  - Detects stagnation (scores not improving)
  - Detects oscillation patterns (scores bouncing up and down)
  - 15-minute timeout with automatic arbitration
  - Per-iteration timing logs for debugging

### Observability Features

- **Workflow Logging**: Detailed logs written to `docs/WORKFLOW_LOG.md`
  - Tracks all phases: planning, consensus, execution
  - Timestamps and log levels (info, warn, error, success)
  - Useful for debugging and auditing

- **Code Quality Verification**: Validates actual code implementation
  - Checks source file count and lines of code
  - Verifies main entry points exist
  - Detects substantive code vs. empty scaffolding

- **UI Verification**: Validates UI setup and styling
  - Verifies Tailwind CSS installation
  - Checks component library setup
  - Validates theme configuration

### Consensus Documentation Storage

For fullstack and ALL projects, Popeye maintains detailed consensus documentation with per-app feedback tracking:

- **Per-App Feedback**: Feedback is stored separately for each app target:
  - `unified/` - Cross-app and integration concerns
  - `frontend/` - React/Vue application feedback
  - `backend/` - API and database feedback
  - `website/` - Marketing/landing page feedback (ALL projects only)

- **Hierarchical Storage**: Feedback is organized by plan level:
  - `docs/plans/master/` - Master plan feedback
  - `docs/plans/milestone-N/` - Milestone-level feedback
  - `docs/plans/milestone-N/tasks/task-N/` - Task-level feedback

- **Tracked Metadata**: Each plan level includes `metadata.json` with:
  - Per-app scores (frontendScore, backendScore, websiteScore, unifiedScore)
  - Per-app approval status
  - Correction history and iteration counts
  - Timestamps for auditing

- **Human-Readable Feedback**: Both JSON and Markdown formats:
  - `feedback.json` - Structured data for programmatic access
  - `feedback.md` - Human-readable reviewer feedback

This system ensures full traceability of all AI decisions and enables debugging of consensus failures.

## Commands

### `popeye create <idea>`

Create a new project from an idea.

```bash
popeye create "A CLI tool for converting markdown to PDF" \
  --name md2pdf \
  --language python \
  --directory ./projects
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Project name | Derived from idea |
| `-l, --language <lang>` | `python`, `typescript`, `fullstack`, `website`, or `all` | `python` |
| `-d, --directory <dir>` | Output directory | Current directory |
| `-m, --model <model>` | OpenAI model for consensus | `gpt-4o` |

### `popeye resume`

Resume an interrupted project.

```bash
popeye resume --project ./my-project
```

**Options:**
| Option | Description |
|--------|-------------|
| `-p, --project <dir>` | Project directory to resume |

### `popeye status`

Check the status of a project.

```bash
popeye status --project ./my-project
```

### `popeye auth <service>`

Manage authentication.

```bash
# Authenticate with Claude
popeye auth claude

# Authenticate with OpenAI (default reviewer)
popeye auth openai

# Authenticate with Gemini (optional - for arbitration)
popeye auth gemini

# Check credentials
popeye auth claude --check

# Remove credentials
popeye auth openai --logout
```

### `popeye config`

Manage configuration.

```bash
# Show current config
popeye config show

# Set a value
popeye config set consensus.threshold 90

# Reset to defaults
popeye config reset
```

### Interactive Mode

Launch an interactive REPL session:

```bash
popeye
```

**Available Commands:**
```
/help                      Show available commands
/create <idea>             Start a new project
/new <idea>                Force create new project (skips existing check)
/status                    Check current project status
/resume                    Resume interrupted project
/auth                      Manage authentication
/config                    View/edit configuration
/config reviewer <ai>      Set reviewer (openai/gemini/grok)
/config arbitrator <ai>    Set arbitrator (openai/gemini/grok/off)
/config model              Manage AI models via config subcommand
/lang <lang>               Set language (py/ts/fs/web/all)
/model [provider] [model]  Show/set AI model (openai/gemini/grok)
/model <provider> list     Show known models for a provider
/upgrade [target]          Upgrade project type (e.g., fullstack -> all)
/info                      Show system info (Claude CLI status, API keys, etc.)
/clear                     Clear screen
/exit                      Exit interactive mode
```

**Language Shortcuts:**
- `/lang py` or `/lang python` - Python projects
- `/lang ts` or `/lang typescript` - TypeScript projects
- `/lang fs` or `/lang fullstack` - Fullstack projects (React + FastAPI)
- `/lang web` or `/lang website` - Website projects (Next.js SSG/SSR)
- `/lang all` - ALL projects (React + FastAPI + Website)

**Status Bar Indicators:**
The input box shows current configuration:
- Language: `py`, `ts`, `fs`, `web`, or `all`
- Reviewer: `O` (OpenAI), `G` (Gemini), or `X` (Grok)
- Arbitrator: `O`, `G`, `X`, or `-` (disabled)
- Auth status: Filled circle when all required APIs are authenticated

### Model Switching (`/model`)

The `/model` command supports multi-provider model switching across OpenAI, Gemini, and Grok. Model names are flexible -- any valid model string is accepted, not just a predefined list. Unknown models are accepted with a warning note, allowing you to use newly released models immediately.

```bash
# Show current models for all providers
/model

# Set model for a specific provider
/model openai gpt-5
/model gemini gemini-2.5-pro
/model grok grok-3

# List known models for a provider (suggestions only)
/model openai list
/model gemini list

# Backward compatible: set OpenAI model directly
/model gpt-4o-mini
```

**Known Models (for reference):**

| Provider | Known Models |
|----------|-------------|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1-preview`, `o1-mini` |
| Gemini | `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` |
| Grok | `grok-3` (flexible string, any model accepted) |

All three model values (openaiModel, geminiModel, grokModel) are:
- Persisted to `popeye.md` and loaded automatically on resume
- Passed through to the consensus workflow for the reviewer and arbitrator
- Displayed by `/config` and `/config model`

### Project Type Upgrade (`/upgrade`)

The `/upgrade` command allows upgrading an existing project to a more comprehensive type without starting over. The upgrade is transactional: it creates backups before making changes and rolls back on failure.

```bash
# Show valid upgrade targets for current project
/upgrade

# Upgrade to a specific target
/upgrade fullstack
/upgrade all
```

**Valid Upgrade Paths:**

| From | Valid Targets | Description |
|------|-------------|-------------|
| `python` | `fullstack`, `all` | Add frontend (and website), move backend to `apps/backend/` |
| `typescript` | `fullstack`, `all` | Add backend (and website), move frontend to `apps/frontend/` |
| `fullstack` | `all` | Add website app to existing workspace |
| `website` | `all` | Add frontend + backend, move website to `apps/website/` |
| `all` | (none) | Already the most comprehensive type |

**What happens during an upgrade:**

1. **Backup**: Critical files are backed up for rollback
2. **Restructure**: For single-app projects (python, typescript, website), existing code is moved into the `apps/` monorepo structure
3. **Scaffold**: New app directories are created with starter files
4. **Update State**: Project state and workspace configuration are updated
5. **Validate**: The upgrade result is verified (directories exist, state is correct)
6. **Plan**: After a successful upgrade, Popeye automatically builds context about the existing project and triggers planning mode focused only on the new apps and integration tasks

The planner receives explicit instructions to focus only on new apps and not rebuild existing ones, along with integration guidance tailored to the specific upgrade path.

## Configuration

### Project Configuration File (`popeye.md`)

When you create a new project, Popeye automatically generates a `popeye.md` file in the project directory. This file:

- **Persists project settings**: Language, reviewer, and arbitrator choices are saved
- **Auto-loads on resume**: When you resume a project, settings are restored automatically
- **Contains project notes**: Add guidance or context for Claude in the Notes section
- **Tracks session history**: Records when the project was created and last accessed

**Example `popeye.md`:**
```markdown
---
# Popeye Project Configuration
language: fullstack
reviewer: openai
arbitrator: gemini
openaiModel: gpt-4o
geminiModel: gemini-2.0-flash
grokModel: grok-3
created: 2024-01-15T10:30:00.000Z
lastRun: 2024-01-15T14:45:00.000Z
projectName: task-manager
---

# task-manager

## Description
A task management app with user authentication and real-time updates.

## Notes
Add any guidance or notes for Claude here...
- Focus on simplicity
- Use PostgreSQL for the database
- Include dark mode support

## Configuration
- **Language**: fullstack
- **Reviewer**: openai
- **Arbitrator**: gemini
- **OpenAI Model**: gpt-4o
- **Gemini Model**: gemini-2.0-flash
- **Grok Model**: grok-3

## Session History
- 2024-01-15: Project created
- 2024-01-15: Last session
```

This means you no longer need to run `/lang fullstack` or `/model` every time you resume a project - the configuration (including all three model selections) is automatically restored.

### Global Configuration File

Create `popeye.config.yaml` in your project or `~/.popeye/config.yaml` globally:

```yaml
# Consensus settings
consensus:
  threshold: 95              # Minimum agreement percentage
  max_iterations: 10         # Max revision rounds
  reviewer: openai           # Primary reviewer (openai, gemini, or grok)
  arbitrator: gemini         # Arbitrator when stuck (openai, gemini, grok, or off)
  enable_arbitration: true   # Enable automatic arbitration
  arbitration_threshold: 85  # Score threshold to trigger arbitration
  stuck_iterations: 3        # Iterations without improvement before arbitration
  escalation_action: pause   # What to do if consensus fails

# API settings
apis:
  openai:
    model: gpt-4o             # Accepts any model name (e.g., gpt-5)
    temperature: 0.3
    max_tokens: 4096
  gemini:
    model: gemini-2.0-flash   # Accepts any model name
    temperature: 0.3
    max_tokens: 4096
  grok:
    model: grok-3             # Accepts any model name
    temperature: 0.3
    max_tokens: 4096
    api_url: https://api.x.ai/v1

# Rate limit settings
rateLimit:
  maxRetries: 3              # Max retry attempts
  baseWaitMs: 60000          # 1 minute base wait
  maxWaitMs: 600000          # 10 minutes max wait (capped to prevent long waits)

# Project defaults
project:
  default_language: python

# Output settings
output:
  verbose: false
  timestamps: true
  show_consensus_dialog: true
```

### Environment Variables

```bash
# Required
POPEYE_OPENAI_KEY=sk-...           # OpenAI API key

# Optional
POPEYE_GEMINI_KEY=...              # Gemini API key (for arbitration)
POPEYE_DEFAULT_LANGUAGE=python     # Default output language (python/typescript/fullstack/website/all)
POPEYE_OPENAI_MODEL=gpt-4o         # OpenAI model
POPEYE_GEMINI_MODEL=gemini-2.0-flash  # Gemini model
POPEYE_CONSENSUS_THRESHOLD=95      # Consensus threshold (0-100)
POPEYE_MAX_ITERATIONS=10           # Max iterations before escalation
POPEYE_REVIEWER=openai             # Primary reviewer (openai, gemini, or grok)
POPEYE_ARBITRATOR=gemini           # Arbitrator (openai, gemini, grok, or off)
POPEYE_GROK_KEY=...                # Grok API key (optional)
POPEYE_GROK_MODEL=grok-3           # Grok model (any model name accepted)
POPEYE_LOG_LEVEL=debug             # Enable verbose logging
```

### Configuration Priority

1. Environment variables (highest)
2. Project-level `popeye.md` (for language, reviewer, arbitrator, and all 3 model selections)
3. Project-level `popeye.config.yaml` or `.popeyerc.yaml`
4. Global `~/.popeye/config.yaml`
5. Built-in defaults (lowest)

## Generated Project Structure

### Python Projects

```
my-project/
├── src/
│   ├── __init__.py
│   └── main.py
├── tests/
│   ├── __init__.py
│   └── conftest.py
├── docs/
│   ├── PLAN.md              # Development plan
│   └── WORKFLOW_LOG.md      # Execution log
├── pyproject.toml
├── requirements.txt
├── README.md
├── .gitignore
├── .env.example
├── Dockerfile
├── popeye.md                # Project configuration (auto-generated)
└── .popeye/
    └── state.json           # Project state
```

### TypeScript Projects

```
my-project/
├── packages/
│   └── frontend/          # Frontend application (when applicable)
│       ├── src/
│       │   ├── components/
│       │   │   └── ui/    # shadcn/ui components
│       │   │       ├── button.tsx
│       │   │       ├── card.tsx
│       │   │       ├── input.tsx
│       │   │       ├── badge.tsx
│       │   │       └── skeleton.tsx
│       │   ├── lib/
│       │   │   └── utils.ts  # Tailwind utility functions
│       │   ├── index.css     # Global styles with theme
│       │   └── main.tsx
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       └── package.json
├── src/
│   └── index.ts
├── tests/
│   └── index.test.ts
├── docs/
│   ├── PLAN.md
│   └── WORKFLOW_LOG.md
├── package.json
├── tsconfig.json
├── README.md
├── .gitignore
├── .env.example
├── Dockerfile
├── popeye.md              # Project configuration (auto-generated)
└── .popeye/
    ├── state.json         # Project state
    └── ui-spec.json       # UI design specification
```

### Fullstack Projects

```
my-project/
├── apps/
│   ├── frontend/              # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   └── ui/        # shadcn/ui components
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   │   └── utils.ts
│   │   │   ├── index.css
│   │   │   └── main.tsx
│   │   ├── tests/
│   │   │   └── setup.ts       # Vitest setup
│   │   ├── tailwind.config.ts
│   │   ├── vite.config.ts
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   └── backend/               # FastAPI backend
│       ├── src/
│       │   ├── api/
│       │   │   └── routes/
│       │   ├── models/
│       │   ├── services/
│       │   └── main.py
│       ├── tests/
│       │   └── conftest.py
│       ├── pyproject.toml
│       └── requirements.txt
│
├── docs/
│   ├── PLAN.md                # Development plan with [FE], [BE], [INT] tags
│   ├── WORKFLOW_LOG.md
│   └── plans/                 # Consensus documentation (fullstack/all projects)
│       ├── master/
│       │   ├── plan.md
│       │   ├── metadata.json
│       │   ├── unified/       # Cross-app feedback
│       │   │   ├── feedback.json
│       │   │   └── feedback.md
│       │   ├── frontend/      # Frontend-specific feedback
│       │   │   ├── feedback.json
│       │   │   └── feedback.md
│       │   ├── backend/       # Backend-specific feedback
│       │   │   ├── feedback.json
│       │   │   └── feedback.md
│       │   └── website/       # Website-specific feedback (ALL projects)
│       │       ├── feedback.json
│       │       └── feedback.md
│       └── milestone-N/
│           ├── plan.md
│           ├── metadata.json
│           ├── unified/
│           ├── frontend/
│           ├── backend/
│           ├── website/
│           └── tasks/
│               └── task-N/
│                   ├── plan.md
│                   ├── metadata.json
│                   ├── unified/
│                   ├── frontend/
│                   ├── backend/
│                   └── website/
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml         # Full stack orchestration
├── popeye.md                  # Project configuration
└── .popeye/
    ├── state.json
    ├── workspace.json         # Workspace configuration for multi-app projects
    └── ui-spec.json
```

### ALL Projects (Fullstack + Website)

For projects using the `all` language option, an additional `website/` app is included:

```
my-project/
├── apps/
│   ├── frontend/              # React application
│   ├── backend/               # FastAPI backend
│   └── website/               # Marketing/landing site (Next.js)
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx         # Root layout with metadataBase
│       │   │   ├── page.tsx           # Strategy-driven landing page
│       │   │   ├── pricing/page.tsx   # Pricing with enterprise CTA
│       │   │   ├── not-found.tsx      # Branded 404 page
│       │   │   ├── error.tsx          # Error boundary (500)
│       │   │   ├── sitemap.ts         # Strategy-aware sitemap
│       │   │   ├── robots.ts          # Robots.txt config
│       │   │   └── api/
│       │   │       └── lead/route.ts  # Lead capture endpoint
│       │   ├── components/
│       │   │   ├── Header.tsx         # Logo/nav/CTA/mobile menu
│       │   │   ├── Footer.tsx         # Multi-column footer
│       │   │   ├── JsonLd.tsx         # Structured data component
│       │   │   └── ContactForm.tsx    # Lead capture form
│       │   └── lib/
│       │       ├── nav.ts             # Navigation config
│       │       └── meta.ts            # Metadata helper utility
│       ├── public/
│       │   ├── brand/                 # Discovered brand assets
│       │   │   └── logo.{ext}
│       │   └── manifest.webmanifest   # PWA manifest
│       ├── package.json
│       └── next.config.js
│
├── docs/
│   └── plans/                 # Includes website/ directories
│       └── ...
├── .popeye/
│   ├── state.json
│   ├── ui-spec.json
│   └── website-strategy.json  # Cached strategy (SHA-256 hash)
└── ...
```

## UI Design System

Popeye automatically generates a complete UI design system for frontend projects. The design decisions are based on analyzing your project idea and are fully customizable.

### Available Themes

| Theme | Best For | Primary Color | Border Radius | Font |
|-------|----------|---------------|---------------|------|
| **Modern Blue** | General apps, SaaS | Blue (221.2) | 0.5rem | Inter |
| **Elegant Dark** | Premium products | Purple (262.1) | 0.75rem | Plus Jakarta Sans |
| **Minimal Clean** | Business tools | Neutral gray | 0.375rem | System UI |
| **Vibrant Gradient** | Consumer apps | Pink (339) | 1rem | Poppins |

### Project Type Detection

Popeye automatically detects your project type from keywords in your idea:

| Project Type | Keywords | Components Included |
|--------------|----------|---------------------|
| Dashboard | dashboard, analytics, admin | tables, charts, tabs, cards |
| Kanban | kanban, project manage, task | drag-drop, context menu, popover |
| E-commerce | shop, store, product | carousel, accordion, slider |
| Blog | blog, article, content | navigation menu, avatar, textarea |
| Default | other | button, card, input, dialog, badge |

### UI Specification File

The UI specification is stored in `.popeye/ui-spec.json` and contains:

```json
{
  "intent": {
    "style": "modern",
    "audience": "consumer",
    "colorPreference": "cool",
    "features": ["cards", "forms", "navigation"],
    "accessibilityLevel": "AA",
    "darkMode": true,
    "mobileFirst": true
  },
  "theme": { /* theme colors and settings */ },
  "themeName": "modern",
  "projectType": "dashboard",
  "recommendedComponents": ["button", "card", "input", ...],
  "layoutPatterns": ["flex", "grid"],
  "navigationStyle": "sidebar",
  "keyPages": [
    { "name": "Dashboard", "route": "/", "layout": "dashboard" }
  ],
  "designNotes": "Use Modern Blue theme consistently..."
}
```

### Website Strategy Cache

For website and ALL projects, the marketing strategy is stored in `.popeye/website-strategy.json`:

```json
{
  "strategy": {
    "icp": { "primaryPersona": "...", "painPoints": [...] },
    "positioning": { "valueProposition": "..." },
    "messaging": { "headline": "...", "subheadline": "..." },
    "seoStrategy": { "primaryKeywords": [...], "titleTemplates": {...} },
    "siteArchitecture": { "pages": [...], "navigation": [...] },
    "conversionStrategy": { "primaryCta": {...}, "leadCapture": "webhook" },
    "competitiveContext": { "differentiators": [...] }
  },
  "metadata": {
    "inputHash": "sha256-of-product-context-and-brand-assets",
    "generatedAt": "2026-02-13T...",
    "version": 1
  }
}
```

The `inputHash` enables automatic staleness detection -- when product docs or brand assets change, the strategy is regenerated.

### Design Context in Code Generation

The UI specification is automatically injected into Claude's context when generating code, ensuring consistent styling. The design system prompt includes:

- Theme colors and typography
- Recommended components to use
- Layout patterns
- Accessibility requirements
- Mobile responsiveness guidelines
- Design notes for consistency

## Troubleshooting

### Rate Limit Errors

If you see "You've hit your limit" errors:

1. **Automatic Handling**: Popeye automatically waits and retries (up to 3 times)
2. **Capped Wait Time**: If the reset time is more than 10 minutes away, Popeye will fail gracefully with a "Please try again later" message instead of waiting for hours
3. **Manual Resume**: If Popeye exits, use `popeye resume` to continue
4. **Check Limits**: Verify your API usage at:
   - Claude: https://console.anthropic.com
   - OpenAI: https://platform.openai.com/usage
   - Gemini: https://console.cloud.google.com
   - Grok: https://console.x.ai

### Plan Validation Failures

If plans fail validation:

1. Check `~/.popeye/logs/` for detailed error logs
2. Ensure your idea is clear and specific enough
3. Try rephrasing your project description

**Note on False Positives**: Plan validation has been improved to avoid false positives. Phrases like "data is saved to database" in plan content no longer trigger garbage plan detection. Only actual meta-commentary (e.g., Claude describing what it did rather than outputting the plan) triggers validation failures.

### Authentication Issues

```bash
# Re-authenticate
popeye auth claude --logout
popeye auth claude

popeye auth openai --logout
popeye auth openai
```

### Stuck Projects

```bash
# Check status
popeye status --project ./my-project

# Resume from last checkpoint
popeye resume --project ./my-project
```

### UI Setup Issues

If the UI setup fails or produces unexpected results:

1. **Frontend Directory Not Found**: UI setup requires a `packages/frontend` directory structure. Ensure your project includes a frontend component.

2. **Missing Dependencies**: If component installation fails, try manually installing:
   ```bash
   cd packages/frontend
   npm install tailwindcss postcss autoprefixer tailwindcss-animate
   npm install class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-slot
   ```

3. **Theme Not Applied**: Check that `index.css` is imported in your main entry file (`main.tsx`).

4. **Components Not Working**: Verify the `@/lib/utils.ts` file exists with the `cn()` utility function.

5. **View/Edit UI Specification**: The UI design can be viewed and modified at:
   ```bash
   cat .popeye/ui-spec.json
   ```

## Architecture

```
src/
├── index.ts              # Entry point
├── cli/                  # CLI interface
│   ├── index.ts          # Command setup
│   ├── output.ts         # Output formatting
│   ├── interactive.ts    # REPL mode (with /model, /upgrade, /overview commands)
│   └── commands/         # Individual commands
├── adapters/             # AI service adapters
│   ├── claude.ts         # Claude Agent SDK (with rate limiting)
│   ├── openai.ts         # OpenAI API (default reviewer, marketing persona for websites)
│   ├── gemini.ts         # Google Gemini API (reviewer/arbitrator, persona support)
│   └── grok.ts           # xAI Grok API (reviewer/arbitrator, persona support)
├── auth/                 # Authentication
│   ├── keychain.ts       # Credential storage
│   └── server.ts         # OAuth callback server
├── config/               # Configuration
│   ├── schema.ts         # Zod schemas (uses OutputLanguageSchema for default_language)
│   ├── defaults.ts       # Default values
│   └── index.ts          # Config loading
├── generators/           # Project generators
│   ├── python.ts         # Python scaffolding
│   ├── typescript.ts     # TypeScript scaffolding
│   ├── fullstack.ts      # Fullstack scaffolding (React + FastAPI)
│   ├── website.ts        # Website scaffolding (Next.js, strategy-aware)
│   ├── website-context.ts # Doc discovery, brand assets, content context builder
│   ├── doc-parser.ts     # Product doc parsing (name, tagline, features, pricing, color)
│   ├── all.ts            # ALL project scaffolding (exports 5 generator functions)
│   └── templates/        # File templates
│       ├── python.ts
│       ├── typescript.ts
│       ├── fullstack.ts
│       ├── website.ts          # Strategy-aware landing + pricing pages
│       ├── website-config.ts   # Non-content config templates
│       ├── website-components.ts # Header, Footer, Navigation components
│       ├── website-seo.ts      # JSON-LD, sitemap, robots, 404, 500, manifest, meta
│       ├── website-conversion.ts # Lead capture route, contact form, env examples
│       └── index.ts            # Template module exports
├── state/                # State management
│   ├── persistence.ts    # File operations
│   └── index.ts          # State API + verification
├── upgrade/              # Project type upgrade system
│   ├── transitions.ts    # Valid upgrade paths and transition details
│   ├── handlers.ts       # Upgrade handlers (4 paths with file scaffolding)
│   ├── index.ts          # Transactional orchestrator with backup/rollback
│   └── context.ts        # Builds rich context for post-upgrade planning
├── workflow/             # Workflow engine
│   ├── consensus.ts      # Consensus loop (reviewerPersona threading)
│   ├── plan-mode.ts      # Planning phase (strategy generation, monorepo-aware)
│   ├── execution-mode.ts # Execution phase
│   ├── milestone-workflow.ts
│   ├── task-workflow.ts  # Uses isWorkspace() for multi-app checks
│   ├── test-runner.ts    # Test execution
│   ├── workflow-logger.ts # Persistent logging (website-strategy stage)
│   ├── plan-storage.ts   # Consensus docs storage (per-app feedback)
│   ├── workspace-manager.ts # Multi-app workspace management
│   ├── website-strategy.ts  # AI strategy generation, caching, staleness detection
│   ├── website-updater.ts   # Post-plan content refresh with strategy context
│   ├── overview.ts       # Project overview with progress and analysis
│   ├── ui-designer.ts    # AI-powered UI design generation
│   ├── ui-setup.ts       # Tailwind/shadcn setup automation
│   ├── ui-verification.ts # UI setup verification
│   ├── project-verification.ts # Project quality checks
│   ├── project-structure.ts    # Project directory scanner
│   ├── remediation.ts    # Consensus-driven failure recovery
│   └── auto-fix.ts       # Automatic error fixing (enhanced ENOENT tracking)
└── types/                # TypeScript types
    ├── project.ts        # OutputLanguage, isWorkspace(), flexible OpenAIModelSchema
    ├── workflow.ts       # ProjectStateSchema (websiteStrategy field)
    ├── consensus.ts      # GeminiModelSchema, GrokModelSchema, reviewerPersona
    └── website-strategy.ts # WebsiteStrategyDocument, BrandAssetsContract, DesignTokens
```

## Development

```bash
# Clone and install
git clone https://github.com/your-org/popeye-cli.git
cd popeye-cli
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Development mode (watch)
npm run dev
```

## License

MIT

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.
