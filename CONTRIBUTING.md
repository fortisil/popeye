# Contributing to Popeye CLI

First off, thank you for considering contributing to Popeye CLI! It's people like you that make Popeye such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How Can I Contribute?](#how-can-i-contribute)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Testing](#testing)
- [Questions?](#questions)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to providing a welcoming and inclusive environment. By participating, you are expected to:

- Be respectful and considerate in your communication
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

Popeye CLI is built with TypeScript and uses several AI providers (Claude, OpenAI, Gemini) for its consensus-based code generation workflow.

### Prerequisites

- Node.js 18+
- npm 9+
- API keys for at least one AI provider (Claude recommended)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/popeye.git
   cd popeye
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Run tests**
   ```bash
   npm test
   ```

6. **Link for local development**
   ```bash
   npm link
   # Now you can run 'popeye' command locally
   ```

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (project idea, configuration, etc.)
- **Describe the behavior you observed and what you expected**
- **Include logs** from `~/.popeye/logs/` if available
- **Include your environment** (OS, Node version, npm version)

### Suggesting Features

Feature suggestions are welcome! Please provide:

- **A clear and descriptive title**
- **Detailed description of the proposed feature**
- **Explain why this feature would be useful** to most users
- **List any alternatives you've considered**

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `documentation` - Improvements to docs

### Areas We'd Love Help With

- **New AI Provider Adapters** - Add support for more AI providers
- **Language Support** - Extend beyond TypeScript/Python
- **UI Components** - Add more shadcn/ui components to the setup
- **Testing** - Improve test coverage
- **Documentation** - Tutorials, examples, translations
- **Bug Fixes** - Check the issues page

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear, readable code
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   npm run build
   npm test
   npm run lint
   ```

4. **Commit with a clear message**
   ```bash
   git commit -m "feat: add support for X"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `style:` - Formatting, no code change
   - `refactor:` - Code change that neither fixes a bug nor adds a feature
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **In your PR description**
   - Describe what changes you made and why
   - Reference any related issues (`Fixes #123`)
   - Include screenshots for UI changes
   - Note any breaking changes

## Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable and function names
- Add JSDoc comments for public functions
- Keep functions focused and small

```typescript
/**
 * Generate a development plan from a specification
 *
 * @param spec - The project specification
 * @param context - Additional context for planning
 * @returns The generated plan
 */
export async function createPlan(
  spec: string,
  context: string
): Promise<string> {
  // Implementation
}
```

### File Organization

```
src/
├── adapters/      # AI provider integrations
├── auth/          # Authentication handling
├── cli/           # CLI commands and interface
├── config/        # Configuration management
├── generators/    # Project scaffolding
├── state/         # State management
├── types/         # TypeScript type definitions
└── workflow/      # Core workflow logic
```

### Formatting

We use Prettier for code formatting:

```bash
npm run format
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Place tests in `tests/` directory mirroring `src/` structure
- Use descriptive test names
- Test both success and failure cases

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/myModule';

describe('myFunction', () => {
  it('should return expected result for valid input', () => {
    const result = myFunction('valid input');
    expect(result).toBe('expected output');
  });

  it('should throw error for invalid input', () => {
    expect(() => myFunction('')).toThrow('Invalid input');
  });
});
```

## Project Architecture

Understanding the codebase:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  (cli/commands/*.ts - User interaction)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Workflow Layer                           │
│  (workflow/*.ts - Plan mode, Execution mode, Consensus)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Adapter Layer                            │
│  (adapters/*.ts - Claude, OpenAI, Gemini)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      State Layer                             │
│  (state/*.ts - Project state, persistence)                  │
└─────────────────────────────────────────────────────────────┘
```

## Questions?

Feel free to:

- Open an issue for questions
- Start a discussion on GitHub
- Reach out to maintainers

Thank you for contributing to Popeye CLI!
