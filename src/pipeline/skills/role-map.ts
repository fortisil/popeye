/**
 * Shared role mapping and tech stack inference.
 * Extracted from migration.ts to be the single source of truth for
 * language-to-role mapping and tech stack detection.
 */

import type { OutputLanguage } from '../../types/project.js';
import type { PipelineRole, RepoSnapshot } from '../types.js';
import type { TechStack } from './types.js';

// ─── Role Categories ────────────────────────────────────

/** Roles that always participate regardless of language */
export const SUPPORT_ROLES: PipelineRole[] = [
  'DISPATCHER',
  'ARCHITECT',
  'QA_TESTER',
  'REVIEWER',
  'ARBITRATOR',
  'DEBUGGER',
  'AUDITOR',
  'JOURNALIST',
  'RELEASE_MANAGER',
];

/** Language-specific implementation role sets */
const IMPLEMENTATION_ROLE_MAP: Record<OutputLanguage, PipelineRole[]> = {
  python: ['DB_EXPERT', 'BACKEND_PROGRAMMER'],
  typescript: ['FRONTEND_PROGRAMMER', 'UI_UX_SPECIALIST'],
  fullstack: ['DB_EXPERT', 'BACKEND_PROGRAMMER', 'FRONTEND_PROGRAMMER', 'UI_UX_SPECIALIST'],
  website: ['WEBSITE_PROGRAMMER', 'UI_UX_SPECIALIST', 'MARKETING_EXPERT', 'SOCIAL_EXPERT'],
  all: [
    'DB_EXPERT', 'BACKEND_PROGRAMMER', 'FRONTEND_PROGRAMMER',
    'WEBSITE_PROGRAMMER', 'UI_UX_SPECIALIST', 'MARKETING_EXPERT', 'SOCIAL_EXPERT',
  ],
};

/** All possible implementation roles across all languages */
export const IMPLEMENTATION_ROLES: PipelineRole[] = [
  'DB_EXPERT', 'BACKEND_PROGRAMMER', 'FRONTEND_PROGRAMMER',
  'WEBSITE_PROGRAMMER', 'UI_UX_SPECIALIST', 'MARKETING_EXPERT', 'SOCIAL_EXPERT',
];

// ─── Active Role Selection ──────────────────────────────

/**
 * Determine the active roles for a given language.
 *
 * @param language - The project's output language
 * @returns All roles (support + implementation) active for this language
 */
export function getActiveRoles(language: OutputLanguage): PipelineRole[] {
  const implRoles = IMPLEMENTATION_ROLE_MAP[language] ?? ['BACKEND_PROGRAMMER'];
  return [...SUPPORT_ROLES, ...implRoles];
}

// ─── Tech Stack Inference ───────────────────────────────

/** Framework detection patterns for snapshot config key_fields */
const FRAMEWORK_PATTERNS: Record<string, Partial<TechStack>> = {
  fastapi: { backend: 'FastAPI' },
  django: { backend: 'Django' },
  flask: { backend: 'Flask' },
  express: { backend: 'Express' },
  nestjs: { backend: 'NestJS' },
  'next': { frontend: 'Next.js' },
  nuxt: { frontend: 'Nuxt' },
  react: { frontend: 'React' },
  vue: { frontend: 'Vue' },
  svelte: { frontend: 'SvelteKit' },
  angular: { frontend: 'Angular' },
  sqlalchemy: { orm: 'SQLAlchemy' },
  prisma: { orm: 'Prisma' },
  drizzle: { orm: 'Drizzle' },
  typeorm: { orm: 'TypeORM' },
  sequelize: { orm: 'Sequelize' },
  postgresql: { database: 'PostgreSQL' },
  postgres: { database: 'PostgreSQL' },
  mysql: { database: 'MySQL' },
  sqlite: { database: 'SQLite' },
  mongodb: { database: 'MongoDB' },
  mongoose: { database: 'MongoDB' },
  pytest: { testing: 'Pytest' },
  vitest: { testing: 'Vitest' },
  jest: { testing: 'Jest' },
  mocha: { testing: 'Mocha' },
};

/** Language-based defaults when no signals are available */
const LANGUAGE_DEFAULTS: Record<OutputLanguage, TechStack> = {
  python: {
    language: 'Python 3.11+',
    backend: 'FastAPI',
    database: 'PostgreSQL',
    orm: 'SQLAlchemy',
    testing: 'Pytest',
  },
  typescript: {
    language: 'TypeScript 5.x',
    frontend: 'React + Vite',
    testing: 'Vitest',
  },
  fullstack: {
    language: 'TypeScript 5.x / Python 3.11+',
    backend: 'FastAPI',
    frontend: 'React + Vite',
    database: 'PostgreSQL',
    orm: 'SQLAlchemy',
    testing: 'Vitest + Pytest',
  },
  website: {
    language: 'TypeScript 5.x',
    frontend: 'Next.js',
    testing: 'Vitest',
  },
  all: {
    language: 'TypeScript 5.x / Python 3.11+',
    backend: 'FastAPI',
    frontend: 'React + Vite',
    database: 'PostgreSQL',
    orm: 'SQLAlchemy',
    testing: 'Vitest + Pytest',
  },
};

/**
 * Infer the project's tech stack from available signals.
 * Priority: snapshot deps > spec mentions > language defaults.
 *
 * @param language - The project's output language
 * @param snapshot - Optional repo snapshot with config file data
 * @param expandedSpec - Optional expanded specification text
 * @returns Inferred tech stack
 */
export function inferTechStack(
  language: OutputLanguage,
  snapshot?: RepoSnapshot,
  expandedSpec?: string,
): TechStack {
  const defaults = LANGUAGE_DEFAULTS[language] ?? LANGUAGE_DEFAULTS.python;
  const detected: TechStack = { language: defaults.language };

  // 1. Scan snapshot config_files key_fields for dependency signals
  //    Only set each field once — first match wins per field.
  if (snapshot?.config_files) {
    for (const configFile of snapshot.config_files) {
      const keyFieldsStr = JSON.stringify(configFile.key_fields).toLowerCase();
      for (const [pattern, stack] of Object.entries(FRAMEWORK_PATTERNS)) {
        if (keyFieldsStr.includes(pattern)) {
          for (const [key, value] of Object.entries(stack)) {
            if (!detected[key as keyof TechStack]) {
              (detected as Record<string, string>)[key] = value;
            }
          }
        }
      }
    }
  }

  // 2. Use snapshot test_framework / build_tool if available
  if (snapshot?.test_framework) {
    const tfLower = snapshot.test_framework.toLowerCase();
    for (const [pattern, stack] of Object.entries(FRAMEWORK_PATTERNS)) {
      if (tfLower.includes(pattern) && stack.testing) {
        detected.testing = stack.testing;
      }
    }
  }

  // 3. Scan expandedSpec for framework mentions
  if (expandedSpec) {
    const specLower = expandedSpec.toLowerCase();
    for (const [pattern, stack] of Object.entries(FRAMEWORK_PATTERNS)) {
      if (specLower.includes(pattern)) {
        // Only fill in gaps — snapshot deps take priority
        for (const [key, value] of Object.entries(stack)) {
          if (!detected[key as keyof TechStack]) {
            (detected as Record<string, string>)[key] = value;
          }
        }
      }
    }
  }

  // 4. Fill remaining gaps with language defaults
  for (const [key, value] of Object.entries(defaults)) {
    if (!detected[key as keyof TechStack] && value) {
      (detected as Record<string, string>)[key] = value;
    }
  }

  return detected;
}

// ─── Template Constraints ───────────────────────────────

/** Governance constraints added to every generated skill */
const GOVERNANCE_CONSTRAINTS = [
  'must_follow_master_plan',
  'must_follow_architecture',
  'conflicts_require_change_request',
];

/** Tech-stack-specific constraints per role */
const TECH_CONSTRAINTS: Record<string, (ts: TechStack) => string[]> = {
  BACKEND_PROGRAMMER: (ts) => {
    const c: string[] = [];
    if (ts.backend?.includes('FastAPI')) c.push('fastapi_async_required', 'pydantic_validation');
    if (ts.backend?.includes('Django')) c.push('django_orm_required');
    if (ts.backend?.includes('Express')) c.push('express_middleware_pattern');
    if (ts.testing?.includes('Pytest')) c.push('pytest_testing');
    if (ts.testing?.includes('Vitest') || ts.testing?.includes('Jest')) c.push('unit_test_required');
    return c;
  },
  FRONTEND_PROGRAMMER: (ts) => {
    const c: string[] = [];
    if (ts.frontend?.includes('React')) c.push('react_component_pattern');
    if (ts.frontend?.includes('Next')) c.push('nextjs_app_router');
    if (ts.testing?.includes('Vitest') || ts.testing?.includes('Jest')) c.push('component_testing');
    return c;
  },
  DB_EXPERT: (ts) => {
    const c: string[] = [];
    if (ts.database?.includes('PostgreSQL')) c.push('postgresql_best_practices');
    if (ts.orm?.includes('SQLAlchemy')) c.push('sqlalchemy_migrations');
    if (ts.orm?.includes('Prisma')) c.push('prisma_schema');
    return c;
  },
  WEBSITE_PROGRAMMER: (ts) => {
    const c: string[] = [];
    if (ts.frontend?.includes('Next')) c.push('nextjs_ssg_ssr');
    c.push('seo_required', 'responsive_design');
    return c;
  },
};

/**
 * Get deterministic template constraints for a role based on tech stack.
 *
 * @param role - Pipeline role
 * @param techStack - Inferred tech stack
 * @returns Array of constraint identifiers
 */
export function getTemplateConstraints(role: PipelineRole, techStack: TechStack): string[] {
  const techFn = TECH_CONSTRAINTS[role];
  const techConstraints = techFn ? techFn(techStack) : [];
  return [...GOVERNANCE_CONSTRAINTS, ...techConstraints];
}
