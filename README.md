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
3. **Plans** a complete development roadmap with milestones and tasks
4. **Validates** the plan through AI consensus (multiple AI systems must agree)
5. **Implements** each task autonomously, writing production-quality code
6. **Styles** the application with a professional design system and component library
7. **Tests** the implementation and fixes issues automatically
8. **Delivers** a complete, working project with polished UI

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         POPEYE WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [Your Idea] ──► [Specification] ──► [UI Design] ──► [Dev Plan]   │
│                        ▲                   │               │        │
│                        │                   │               ▼        │
│                   OpenAI expands      Auto-design    Claude creates │
│                                       theme/style                   │
│                                                            │        │
│                                                            ▼        │
│                   ┌─────────────────────────────────────┐          │
│                   │      CONSENSUS LOOP (95%+)          │          │
│                   │  ┌─────────┐     ┌─────────┐       │          │
│                   │  │ OpenAI  │◄───►│ Claude  │       │          │
│                   │  │ Reviews │     │ Revises │       │          │
│                   │  └─────────┘     └─────────┘       │          │
│                   └─────────────────────────────────────┘          │
│                                              │                      │
│                                              ▼                      │
│                   ┌─────────────────────────────────────┐          │
│                   │      EXECUTION MODE                  │          │
│                   │  For each task:                      │          │
│                   │    1. Claude implements              │          │
│                   │    2. Tests run automatically        │          │
│                   │    3. Fix issues (up to 3 retries)   │          │
│                   │    4. Mark complete                  │          │
│                   └─────────────────────────────────────┘          │
│                                              │                      │
│                                              ▼                      │
│                   ┌─────────────────────────────────────┐          │
│                   │      UI SETUP & STYLING              │          │
│                   │  - Install Tailwind CSS              │          │
│                   │  - Configure shadcn/ui components    │          │
│                   │  - Apply selected theme              │          │
│                   └─────────────────────────────────────┘          │
│                                              │                      │
│                                              ▼                      │
│                        [Complete Project with Polished UI]          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

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
```

### 3. Monitor Progress

Popeye provides real-time feedback:

```
[Plan] Creating development plan...
[UI Design] Analyzing project idea for UI intent...
[UI Design] UI Intent: modern style for consumer audience
[UI Design] Selected theme: Modern Blue
[UI Design] UI design complete: Modern Blue theme with 12 components
[Consensus] Review round 1: 78% agreement
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

## Features

### Core Features

- **Fully Autonomous**: Runs from idea to complete project without manual intervention
- **Dual-AI Consensus**: Plans validated by multiple AI systems before execution
- **Multi-Language Support**: Generate projects in Python, TypeScript, or Fullstack (React + FastAPI)
- **Automatic Testing**: Tests are generated and run for each implementation
- **Error Recovery**: Failed tests trigger automatic fix attempts (up to 3 retries)
- **Auto-Generated README**: At project completion, generates a comprehensive README with:
  - Project description and features
  - Prerequisites and installation instructions
  - Environment setup guide
  - How to run (development, tests, production)
  - Project structure overview

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
| `-l, --language <lang>` | `python` or `typescript` | `python` |
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
/lang <lang>               Set language (py/ts/fs or python/typescript/fullstack)
/info                      Show system info (Claude CLI status, API keys, etc.)
/clear                     Clear screen
/exit                      Exit interactive mode
```

**Language Shortcuts:**
- `/lang py` or `/lang python` - Python projects
- `/lang ts` or `/lang typescript` - TypeScript projects
- `/lang fs` or `/lang fullstack` - Fullstack projects (React + FastAPI)

**Status Bar Indicators:**
The input box shows current configuration:
- Language: `py`, `ts`, or `fs`
- Reviewer: `O` (OpenAI), `G` (Gemini), or `X` (Grok)
- Arbitrator: `O`, `G`, `X`, or `-` (disabled)
- Auth status: Filled circle when all required APIs are authenticated

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

## Session History
- 2024-01-15: Project created
- 2024-01-15: Last session
```

This means you no longer need to run `/lang fullstack` every time you resume a project - the configuration is automatically restored.

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
    model: gpt-4o
    temperature: 0.3
    max_tokens: 4096
  gemini:
    model: gemini-2.0-flash
    temperature: 0.3
    max_tokens: 4096

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
POPEYE_DEFAULT_LANGUAGE=python     # Default output language
POPEYE_OPENAI_MODEL=gpt-4o         # OpenAI model
POPEYE_GEMINI_MODEL=gemini-2.0-flash  # Gemini model
POPEYE_CONSENSUS_THRESHOLD=95      # Consensus threshold (0-100)
POPEYE_MAX_ITERATIONS=10           # Max iterations before escalation
POPEYE_REVIEWER=openai             # Primary reviewer (openai, gemini, or grok)
POPEYE_ARBITRATOR=gemini           # Arbitrator (openai, gemini, grok, or off)
POPEYE_GROK_KEY=...                # Grok API key (optional)
POPEYE_LOG_LEVEL=debug             # Enable verbose logging
```

### Configuration Priority

1. Environment variables (highest)
2. Project-level `popeye.md` (for language, reviewer, arbitrator)
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
│   └── WORKFLOW_LOG.md
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml         # Full stack orchestration
├── popeye.md                  # Project configuration
└── .popeye/
    ├── state.json
    └── ui-spec.json
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
│   ├── interactive.ts    # REPL mode
│   └── commands/         # Individual commands
├── adapters/             # AI service adapters
│   ├── claude.ts         # Claude Agent SDK (with rate limiting)
│   ├── openai.ts         # OpenAI API (default reviewer)
│   ├── gemini.ts         # Google Gemini API (reviewer/arbitrator)
│   └── grok.ts           # xAI Grok API (reviewer/arbitrator)
├── auth/                 # Authentication
│   ├── keychain.ts       # Credential storage
│   └── server.ts         # OAuth callback server
├── config/               # Configuration
│   ├── schema.ts         # Zod schemas
│   ├── defaults.ts       # Default values
│   └── index.ts          # Config loading
├── generators/           # Project generators
│   ├── python.ts         # Python scaffolding
│   ├── typescript.ts     # TypeScript scaffolding
│   └── templates/        # File templates
├── state/                # State management
│   ├── persistence.ts    # File operations
│   └── index.ts          # State API + verification
├── workflow/             # Workflow engine
│   ├── consensus.ts      # Consensus loop
│   ├── plan-mode.ts      # Planning phase
│   ├── execution-mode.ts # Execution phase
│   ├── milestone-workflow.ts
│   ├── task-workflow.ts
│   ├── test-runner.ts    # Test execution
│   ├── workflow-logger.ts # Persistent logging
│   ├── ui-designer.ts    # AI-powered UI design generation
│   ├── ui-setup.ts       # Tailwind/shadcn setup automation
│   ├── ui-verification.ts # UI setup verification
│   ├── project-verification.ts # Project quality checks
│   └── auto-fix.ts       # Automatic error fixing
└── types/                # TypeScript types
    ├── project.ts
    ├── workflow.ts
    └── consensus.ts
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
