# Popeye CLI Cheatsheet

Quick reference for all Popeye CLI commands, interactive mode slash commands, and configuration options.

---

## CLI Commands

### `popeye-cli create <idea>`

Create a new project from a natural language description.

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --name <name>` | Project name | Auto-generated |
| `-l, --language <lang>` | Output language (`python`, `typescript`, `fullstack`, `website`, `all`) | `python` |
| `-m, --model <model>` | OpenAI model for consensus | `gpt-4o` |
| `-o, --output <dir>` | Output directory | Current directory |
| `--threshold <percent>` | Consensus threshold percentage | `95` |
| `--max-iterations <n>` | Maximum consensus iterations | `5` |
| `--skip-scaffold` | Skip initial project scaffolding | `false` |

```bash
popeye-cli create "todo app with user authentication" -l fullstack -n my-todo
```

---

### `popeye-cli interactive` (alias: `i`)

Start interactive mode for guided project creation and management. This is the default when running `popeye-cli` with no arguments.

```bash
popeye-cli interactive
popeye-cli i
```

---

### `popeye-cli status [directory]`

Show current project status and progress.

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show detailed status |
| `--json` | Output as JSON |

```bash
popeye-cli status ./my-project --verbose
```

---

### `popeye-cli validate [directory]`

Validate that a project structure is complete and ready for execution.

```bash
popeye-cli validate ./my-project
```

---

### `popeye-cli summary [directory]`

Show a detailed project summary including plan, milestones, and current progress.

```bash
popeye-cli summary ./my-project
```

---

### `popeye-cli resume [directory]`

Resume an interrupted workflow from where it left off.

| Option | Description | Default |
|--------|-------------|---------|
| `--threshold <percent>` | Consensus threshold | `95` |
| `--max-iterations <n>` | Max consensus iterations | `5` |
| `--max-retries <n>` | Max task retries | `3` |

```bash
popeye-cli resume ./my-project
```

---

### `popeye-cli reset [directory]`

Reset a project to a specific phase, discarding progress beyond that point.

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --phase <phase>` | Phase to reset to (`plan`, `execution`) | `plan` |
| `-f, --force` | Skip confirmation prompt | `false` |

```bash
popeye-cli reset ./my-project --phase plan --force
```

---

### `popeye-cli cancel [directory]`

Cancel and delete a project entirely.

| Option | Description |
|--------|-------------|
| `-f, --force` | Skip confirmation prompt |

```bash
popeye-cli cancel ./my-project --force
```

---

### `popeye-cli auth <subcommand>`

Manage authentication for AI provider services.

| Subcommand | Description |
|------------|-------------|
| `status` | Show authentication status for all services |
| `login [service]` | Authenticate with a service (`claude`, `openai`, `gemini`, `grok`, `all`) |
| `logout [service]` | Remove stored credentials for a service |
| `claude` | Authenticate with Claude CLI |
| `openai` | Authenticate with OpenAI API |
| `gemini` | Authenticate with Gemini API |
| `grok` | Authenticate with xAI Grok API |

The `login`, `openai`, `gemini`, and `grok` subcommands accept `--api-key <key>` to provide a key directly.

```bash
popeye-cli auth status
popeye-cli auth login openai --api-key sk-...
popeye-cli auth logout all
```

---

### `popeye-cli config <subcommand>`

Manage CLI configuration settings.

| Subcommand | Description |
|------------|-------------|
| `show` | Show current configuration (`--json` for JSON output) |
| `defaults` | Show default configuration values (`--json` for JSON output) |
| `get <key>` | Get a specific config value (e.g., `consensus.threshold`) |
| `path` | Show the configuration file path |
| `init` | Create a configuration file (`-f, --format <json\|yaml>`) |

```bash
popeye-cli config show --json
popeye-cli config get consensus.threshold
popeye-cli config init --format yaml
```

---

### `popeye-cli db <subcommand>`

Manage database configuration and setup for fullstack/all projects.

| Subcommand | Description |
|------------|-------------|
| `status [directory]` | Show database configuration and lifecycle status |
| `configure [directory]` | Configure database mode (local Docker or managed) and connection URL |
| `apply [directory]` | Run the full setup pipeline: connectivity check, extensions, migrations, seed, readiness |

The `apply` subcommand accepts `--skip-seed` to skip the seed step.

```bash
popeye-cli db status ./my-project
popeye-cli db configure ./my-project
popeye-cli db apply ./my-project --skip-seed
```

**Database lifecycle**: `unconfigured` -> `configured` -> `applying` -> `ready` (or `error`)

---

### `popeye-cli doctor [directory]`

Run comprehensive project and database readiness checks.

Checks performed:
1. **Project State** -- Verifies `.popeye/` state directory exists
2. **DB Layer** -- Confirms database layer was generated
3. **Docker Compose** -- Checks PostgreSQL service is defined
4. **DATABASE_URL** -- Validates the env var is configured
5. **DB Reachability** -- Tests actual database connectivity
6. **pgvector Extension** -- Checks if the vector extension is available
7. **Migrations Applied** -- Queries `alembic_version` for migration status
8. **Health Endpoint** -- Pings the backend `/health/db` endpoint

```bash
popeye-cli doctor ./my-project
```

---

### `popeye-cli review [directory]` (alias: `audit`)

Run a post-build audit/review of the project. Scans the codebase, produces a structured report with findings, and optionally generates recovery milestones.

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --depth <level>` | Audit depth: `1`=shallow, `2`=standard, `3`=deep | `2` |
| `-s, --strict` | Enable strict mode (higher standards, stricter recovery triggers) | `false` |
| `-f, --format <type>` | Output format: `json`, `md`, `both` | `both` |
| `--no-recover` | Skip auto-injection of recovery milestones | Recovery enabled by default |
| `-t, --target <kind>` | Audit target: `all`, `frontend`, `backend`, `website` | `all` |

The audit runs three stages:
1. **Scan** -- Deterministic filesystem scan (files, LOC, deps, wiring matrix)
2. **Analyze** -- AI-powered analysis producing scored findings
3. **Recovery** -- Evidence-based recovery plan generation (if critical/major findings exist)

Reports are written to `.popeye/popeye.audit.md`, `.popeye/popeye.audit.json`, and optionally `.popeye/popeye.recovery.md`/`.json`.

```bash
popeye-cli review ./my-project
popeye-cli review ./my-project --depth 3 --strict
popeye-cli review ./my-project --format json --no-recover
popeye-cli audit ./my-project --target frontend
```

---

### `popeye-cli debug [projectDir]`

Start an interactive debugging session for a Popeye-generated project. Indexes the project, loads anchor docs (CLAUDE.md, README, config files), then opens a debug sub-REPL where you paste errors for AI-assisted diagnosis and fixes.

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --language <lang>` | Project language/type | `backend` |

```bash
popeye-cli debug ./my-project
popeye-cli debug ./my-project --language fullstack
```

**How it works:**
1. Scans the project directory and builds a lightweight file index (paths + metadata)
2. Loads anchor documents: CLAUDE.md, README, package.json, docker-compose.yml, etc.
3. Opens a `debug >` sub-REPL -- paste an error or describe a bug
4. Extracts file paths from stack traces and detects tech context (alembic, vite, fastapi, etc.)
5. Loads only the relevant source files on-demand (not the entire codebase)
6. Sends targeted context to Claude for structured diagnosis
7. Claude responds with: Diagnosis, Evidence, Proposed Fix, Commands to Verify, Ready to Apply

**Permission model:** Same as Claude Code -- asks before making any file edits (no auto-write).

---

## Interactive Mode Slash Commands

Enter these commands during an interactive session (started via `popeye-cli interactive`).

### Help and Info

| Command | Description |
|---------|-------------|
| `/help`, `/h`, `/?` | Show all available commands |
| `/info`, `/check` | Show system info: Claude CLI status, API auth status, environment |

### Project Creation and Management

| Command | Description |
|---------|-------------|
| `/new <idea>` | Start a new project (skips existing project check) |
| `/resume` | Resume an interrupted project with project discovery |
| `/status` | Show current project status and progress |
| `/overview [fix]` | Show full project plan and milestone review. Add `fix` to re-discover docs and auto-fix issues |

```
/new todo app with drag and drop
/resume
/overview fix
```

### Authentication

| Command | Description |
|---------|-------------|
| `/auth` | Re-run the authentication flow for all AI services |

### Configuration

| Command | Description |
|---------|-------------|
| `/config` | Show full configuration summary |
| `/config reviewer <provider>` | Set reviewer model (`openai`, `gemini`, `grok`) |
| `/config arbitrator <provider\|off>` | Set arbitrator model or disable it |
| `/config language <lang>` | Set project output language |
| `/config model <provider> [model]` | Show or set AI model for a provider |

### Language and Model Selection

| Command | Description |
|---------|-------------|
| `/language <lang>`, `/lang`, `/l` | Set output language: `be`, `fe`, `fs`, `web`, `all` |
| `/model` | Show current models for all providers |
| `/model <provider>` | Show available models for a provider |
| `/model <provider> <model>` | Set a specific model for a provider |

```
/lang fullstack
/model openai gpt-4o-mini
/model gemini gemini-2.0-flash
/model grok grok-3
```

### Project Upgrade

| Command | Description |
|---------|-------------|
| `/upgrade` | Show interactive upgrade menu |
| `/upgrade <target>` | Upgrade project to a different type (`fullstack`, `website`, `all`, etc.) |

Available upgrade paths depend on the current project type:
- `python` -> `fullstack`, `all`
- `typescript` -> `fullstack`, `all`
- `fullstack` -> `all`
- `website` -> `all`

```
/upgrade fullstack
/upgrade all
```

### Database and Health

| Command | Description |
|---------|-------------|
| `/db status` | Show database lifecycle status |
| `/db configure` | Configure database (redirects to CLI) |
| `/db apply` | Apply database setup (redirects to CLI) |
| `/doctor` | Run all readiness checks inline |
| `/review`, `/audit` | Run a post-build audit with findings and optional recovery |

### Debugging

| Command | Description |
|---------|-------------|
| `/debug`, `/dbg` | Start interactive debugging session (requires active project) |

Once inside the debug session, the following sub-commands are available:

| Debug Sub-Command | Description |
|-------------------|-------------|
| `/back`, `/done` | Return to main Popeye session |
| `/clear` | Reset conversation history |
| `/context` | Re-display project summary |
| `/fix` | Apply last proposed fix via Popeye execution pipeline |

**Debug session input:** Single Enter submits for commands and short messages. Multi-line paste is auto-detected and waits for the full paste to arrive before submitting.

```
# Start a debug session from the Popeye REPL
/debug

# Inside debug session, paste an error:
debug > Traceback (most recent call last):
  ...   File "/app/src/database/connection.py", line 15
  ...   ConnectionRefusedError: [Errno 111] Connection refused
  ...
  ... (paste auto-detected, submits after 2s pause)

# Apply the proposed fix
debug > /fix

# Return to main Popeye REPL (use /back, not /exit which would exit Popeye)
debug > /back
```

### Session Control

| Command | Description |
|---------|-------------|
| `/clear`, `/cls` | Clear screen and redraw the UI |
| `/exit`, `/quit`, `/q` | Exit Popeye CLI |

### Default Behavior

Typing anything without a `/` prefix treats the input as a project idea for creation or refinement.

---

## Language Aliases

| Language | Aliases | What it generates |
|----------|---------|-------------------|
| `python` | `be`, `backend`, `py` | FastAPI backend API |
| `typescript` | `fe`, `frontend`, `ts` | React + Vite frontend |
| `fullstack` | `fs` | Monorepo: React frontend + FastAPI backend + PostgreSQL |
| `website` | `web` | Next.js marketing/landing website |
| `all` | -- | Complete stack: frontend + backend + website + shared packages |

---

## Available AI Models

### OpenAI

`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1-preview`, `o1-mini` (custom models also accepted)

### Gemini

`gemini-2.0-flash`, `gemini-2.0-pro`, `gemini-1.5-flash`, `gemini-1.5-pro` (custom models also accepted)

### Grok (xAI)

`grok-3`, `grok-3-mini`, `grok-2` (custom models also accepted)

---

## Configuration Files

Popeye looks for configuration in these files (in order):

- `.popeyerc`
- `.popeyerc.json`
- `.popeyerc.yaml`
- `popeye.config.js`

### Config Sections

| Section | Keys | Description |
|---------|------|-------------|
| `consensus` | `threshold`, `maxIterations`, `temperature`, `maxTokens` | Consensus engine settings |
| `apis` | `openai.model`, `openai.timeout` | API provider settings |
| `project` | `defaultLanguage`, `defaultName` | Project defaults |
| `directories` | `output`, `state` | Directory paths |
| `output` | `verbose`, `colors`, `progress` | Display settings |

---

## Database Lifecycle States

```
unconfigured ──> configured ──> applying ──> ready
                     ^                        │
                     │            error <──────┘
                     │              │
                     └──────────────┘
```

| State | Meaning |
|-------|---------|
| `unconfigured` | No `DATABASE_URL` set, DB layer not configured |
| `configured` | URL set and DB reachable, migrations not yet applied |
| `applying` | Setup pipeline is running (migrations, extensions, seed) |
| `ready` | All checks passed, database is operational |
| `error` | Setup failed, can retry from `configured` |

---

## Setup Pipeline Steps

When you run `popeye-cli db apply`, the pipeline executes these steps in order:

1. **check_connection** -- Verify database is reachable
2. **ensure_extensions** -- Create required PostgreSQL extensions (pgvector)
3. **apply_migrations** -- Run `alembic upgrade head`
4. **seed_minimal** -- Execute seed script if present
5. **readiness_tests** -- Verify database is fully operational
6. **mark_ready** -- Transition status to `ready`

---

## Quick Examples

```bash
# Create a fullstack project
popeye-cli create "task management app" -l fullstack -n taskmaster

# Start interactive mode
popeye-cli

# Check project health
popeye-cli doctor ./taskmaster

# Set up the database
popeye-cli db configure ./taskmaster
popeye-cli db apply ./taskmaster

# Resume after interruption
popeye-cli resume ./taskmaster

# Audit the project after build
popeye-cli review ./taskmaster
popeye-cli review ./taskmaster --depth 3 --strict

# Debug a project (paste errors, get AI-assisted fixes)
popeye-cli debug ./taskmaster
popeye-cli debug ./taskmaster --language fullstack

# Reset and re-plan
popeye-cli reset ./taskmaster --phase plan
```
