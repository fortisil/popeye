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

Plans are iteratively refined until systems reach **95%+ consensus**, ensuring well-thought-out implementations. When consensus cannot be reached, an arbitrator (Gemini by default) makes the final decision.

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
```

### 2. Create a Project

```bash
# Create a Python project
popeye create "A REST API for managing todo items with SQLite storage" --language python

# Create a TypeScript project
popeye create "A React component library for data visualization" --language typescript
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
- **Multi-Language Support**: Generate projects in Python or TypeScript
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

### Reliability Features

- **Rate Limit Handling**: Automatically waits and retries when API rate limits are hit
  - Improved detection using specific regex patterns to avoid false positives
  - Distinguishes actual rate limit errors from plan content mentioning "rate limits"
  - Parses reset times from error messages (e.g., "resets 3pm")
  - Extracts clean error messages without including extraneous plan content
  - Configurable wait times (default: 5 min base, 2 hour max)
  - Up to 5 retry attempts before failing
  - Progress updates during wait periods

- **Resume Capability**: Resume interrupted projects from where they left off
  - State persisted in `.popeye/state.json`
  - Tracks completed milestones and tasks
  - Survives crashes, rate limits, and manual interruptions

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
/help              Show available commands
/create <idea>     Start a new project
/status            Check current project status
/resume            Resume interrupted project
/auth              Manage authentication
/config            View/edit configuration
/exit              Exit interactive mode
```

## Configuration

### Configuration File

Create `popeye.config.yaml` in your project or `~/.popeye/config.yaml` globally:

```yaml
# Consensus settings
consensus:
  threshold: 95              # Minimum agreement percentage
  max_iterations: 10         # Max revision rounds
  reviewer: openai           # Primary reviewer (openai or gemini)
  arbitrator: gemini         # Arbitrator when stuck (openai or gemini)
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

# Rate limit settings (new)
rateLimit:
  maxRetries: 5              # Max retry attempts
  baseWaitMs: 300000         # 5 minutes base wait
  maxWaitMs: 7200000         # 2 hours max wait

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
POPEYE_REVIEWER=openai             # Primary reviewer (openai or gemini)
POPEYE_ARBITRATOR=gemini           # Arbitrator (openai or gemini)
POPEYE_LOG_LEVEL=debug             # Enable verbose logging
```

### Configuration Priority

1. Environment variables (highest)
2. Project-level `popeye.config.yaml` or `.popeyerc.yaml`
3. Global `~/.popeye/config.yaml`
4. Built-in defaults (lowest)

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
└── .popeye/
    ├── state.json         # Project state
    └── ui-spec.json       # UI design specification
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

1. **Automatic Handling**: Popeye automatically waits and retries (up to 5 times)
2. **Manual Resume**: If Popeye exits, use `popeye resume` to continue
3. **Check Limits**: Verify your API usage at:
   - Claude: https://console.anthropic.com
   - OpenAI: https://platform.openai.com/usage

### Plan Validation Failures

If plans fail validation:

1. Check `~/.popeye/logs/` for detailed error logs
2. Ensure your idea is clear and specific enough
3. Try rephrasing your project description

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
│   └── gemini.ts         # Google Gemini API (reviewer/arbitrator)
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
