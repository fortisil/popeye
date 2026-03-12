/**
 * Deterministic constitution generation — no AI call required.
 * Produces skills/POPEYE_CONSTITUTION.md from templates + inferred tech stack.
 * Includes pipeline governance invariants that never change.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OutputLanguage } from '../../types/project.js';
import type { ConstitutionContext, TechStack } from './types.js';

// ─── Constants ──────────────────────────────────────────

const CONSTITUTION_FILENAME = 'POPEYE_CONSTITUTION.md';
const PIPELINE_VERSION = '1.0';

// ─── Public API ─────────────────────────────────────────

/**
 * Generate the project constitution file if it doesn't already exist.
 * Entirely deterministic — built from templates and tech stack data.
 *
 * @param context - Constitution generation context
 */
export function generateConstitution(context: ConstitutionContext): void {
  const { skillsDir } = context;

  if (shouldSkipConstitution(skillsDir)) {
    return;
  }

  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  const content = buildConstitutionContent(context);
  const constitutionPath = join(skillsDir, CONSTITUTION_FILENAME);
  writeFileSync(constitutionPath, content, 'utf-8');
}

/**
 * Check if constitution generation should be skipped.
 * Returns true if the file already exists (hand-written or prior run).
 *
 * @param skillsDir - Path to the skills directory
 * @returns true if generation should be skipped
 */
export function shouldSkipConstitution(skillsDir: string): boolean {
  const constitutionPath = join(skillsDir, CONSTITUTION_FILENAME);
  return existsSync(constitutionPath);
}

// ─── Content Assembly ───────────────────────────────────

/**
 * Build the full constitution markdown content.
 *
 * @param context - Constitution generation context
 * @returns Complete markdown string
 */
function buildConstitutionContent(context: ConstitutionContext): string {
  const { projectName, language, techStack, sessionGuidance } = context;
  const date = new Date().toISOString().split('T')[0];

  const sections = [
    `# Project Constitution: ${projectName}`,
    '',
    `Generated: ${date} | Language: ${language} | Pipeline: v${PIPELINE_VERSION}`,
    '',
    getTechStackSection(techStack),
    getArchitectureRules(techStack),
    getCodeQualityRules(),
    getGovernanceRules(),
    getConstraintsSection(language, sessionGuidance),
    getImmutabilitySection(),
  ];

  return sections.join('\n');
}

// ─── Template Sections ──────────────────────────────────

/**
 * Generate the tech stack section from inferred stack data.
 *
 * @param techStack - Inferred tech stack
 * @returns Markdown section
 */
export function getTechStackSection(techStack: TechStack): string {
  const lines = ['## Tech Stack'];
  if (techStack.language) lines.push(`- Language: ${techStack.language}`);
  if (techStack.backend) lines.push(`- Framework: ${techStack.backend}`);
  if (techStack.frontend) lines.push(`- Frontend: ${techStack.frontend}`);
  if (techStack.database) lines.push(`- Database: ${techStack.database}`);
  if (techStack.orm) lines.push(`- ORM: ${techStack.orm}`);
  if (techStack.testing) lines.push(`- Testing: ${techStack.testing}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Generate architecture rules based on the tech stack.
 *
 * @param techStack - Inferred tech stack
 * @returns Markdown section
 */
export function getArchitectureRules(techStack: TechStack): string {
  const rules: string[] = [];
  let ruleNum = 1;

  if (techStack.backend?.includes('FastAPI')) {
    rules.push(`${ruleNum++}. All API endpoints MUST use async/await`);
  }
  if (techStack.backend?.includes('Express')) {
    rules.push(`${ruleNum++}. Use Express middleware pattern for cross-cutting concerns`);
  }
  if (techStack.backend?.includes('Django')) {
    rules.push(`${ruleNum++}. Follow Django app structure conventions`);
  }
  if (techStack.orm?.includes('SQLAlchemy')) {
    rules.push(`${ruleNum++}. Database access exclusively via SQLAlchemy ORM`);
  }
  if (techStack.orm?.includes('Prisma')) {
    rules.push(`${ruleNum++}. Database access exclusively via Prisma client`);
  }
  if (techStack.language?.includes('Python')) {
    rules.push(`${ruleNum++}. Environment variables via python-dotenv, never hardcoded`);
    rules.push(`${ruleNum++}. PEP8 style with type hints on all functions`);
  }
  if (techStack.language?.includes('TypeScript')) {
    rules.push(`${ruleNum++}. TypeScript strict mode, no implicit any`);
    rules.push(`${ruleNum++}. Environment variables via dotenv, never hardcoded`);
  }
  if (techStack.frontend?.includes('React')) {
    rules.push(`${ruleNum++}. React components use functional patterns with hooks`);
  }
  if (techStack.frontend?.includes('Next')) {
    rules.push(`${ruleNum++}. Next.js App Router conventions for routing and layouts`);
  }

  // Always add a generic rule if nothing specific matched
  if (rules.length === 0) {
    rules.push('1. Environment variables never hardcoded in source code');
    rules.push('2. Clear separation of concerns between modules');
  }

  return ['## Architecture Rules', ...rules, ''].join('\n');
}

/**
 * Generate code quality rules (constant across all projects).
 *
 * @returns Markdown section
 */
export function getCodeQualityRules(): string {
  return [
    '## Code Quality',
    '1. Maximum 500 lines per source file',
    '2. Unit tests for every module (happy path + edge case + failure)',
    '3. Standard logging (no unstructured print statements)',
    '4. Docstrings/JSDoc on public functions',
    '',
  ].join('\n');
}

/**
 * Generate governance rules (pipeline invariants, constant).
 *
 * @returns Markdown section
 */
function getGovernanceRules(): string {
  return [
    '## Governance Rules',
    '1. Consensus threshold: 0.95 with minimum 2 reviewers',
    '2. All artifacts are immutable once stored (new versions create new files)',
    '3. No placeholder content in production code or generated output',
    '4. Gate failures route to RECOVERY_LOOP before phase retry',
    '5. Constitution modifications during pipeline execution are forbidden',
    '6. Change Requests required for scope changes after INTAKE',
    '',
  ].join('\n');
}

/**
 * Generate language-specific and session-specific constraints.
 *
 * @param language - Project language
 * @param sessionGuidance - Optional session guidance text
 * @returns Markdown section
 */
export function getConstraintsSection(
  language: OutputLanguage,
  sessionGuidance?: string,
): string {
  const lines = ['## Project Constraints'];

  const langConstraints: Record<string, string[]> = {
    python: ['- Python 3.11+ required', '- Use virtual environment (venv) for all operations'],
    typescript: ['- Node.js 18+ required', '- ESM modules (import/export, .js extensions)'],
    fullstack: [
      '- Python 3.11+ for backend, Node.js 18+ for frontend',
      '- Monorepo structure with clear app boundaries',
    ],
    website: ['- Node.js 18+ required', '- SSG/SSR optimization for performance and SEO'],
    all: [
      '- Python 3.11+ for backend, Node.js 18+ for frontend and website',
      '- Monorepo structure with clear app boundaries',
    ],
  };

  const constraints = langConstraints[language] ?? langConstraints.python;
  lines.push(...constraints);

  if (sessionGuidance) {
    lines.push('', '### Session-Specific Guidance');
    lines.push(sessionGuidance.slice(0, 500));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate the immutability notice (constant).
 *
 * @returns Markdown section
 */
function getImmutabilitySection(): string {
  return [
    '## Immutability',
    'This document MUST NOT be modified during pipeline execution.',
    'Any modification triggers constitution verification failure at next gate.',
    '',
  ].join('\n');
}
