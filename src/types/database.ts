/**
 * Database configuration types and Zod schemas
 * Defines DB lifecycle states, provisioning modes, and config tracking
 */

import { z } from 'zod';

/**
 * Database lifecycle status
 */
export const DbStatusSchema = z.enum([
  'unconfigured',
  'configured',
  'applying',
  'ready',
  'error',
]);
export type DbStatus = z.infer<typeof DbStatusSchema>;

/**
 * Database provisioning mode
 * - local_docker: PostgreSQL runs in Docker Compose
 * - managed: External managed database (Neon, Supabase, etc.)
 */
export const DbModeSchema = z.enum(['local_docker', 'managed']);
export type DbMode = z.infer<typeof DbModeSchema>;

/**
 * Database provider (informational only)
 */
export const DbProviderSchema = z.enum(['neon', 'supabase', 'other']);
export type DbProvider = z.infer<typeof DbProviderSchema>;

/**
 * Backend ORM choice
 */
export const BackendOrmSchema = z.enum(['sqlalchemy', 'prisma', 'drizzle']);
export type BackendOrm = z.infer<typeof BackendOrmSchema>;

/**
 * Setup pipeline steps (forward compat for Phase 2)
 */
export const DbSetupStepSchema = z.enum([
  'check_connection',
  'ensure_extensions',
  'apply_migrations',
  'seed_minimal',
  'readiness_tests',
  'mark_ready',
]);
export type DbSetupStep = z.infer<typeof DbSetupStepSchema>;

/**
 * Main database configuration tracking object
 */
export const DbConfigSchema = z.object({
  /** Whether DB layer was generated */
  designed: z.boolean(),
  /** Provisioning mode - unset until user configures */
  mode: DbModeSchema.optional(),
  /** Whether pgvector is included */
  vectorRequired: z.boolean(),
  /** Current lifecycle state */
  status: DbStatusSchema,
  /** Last error message */
  lastError: z.string().optional(),
  /** Number of migrations applied (updated by runner, not generator) */
  migrationsApplied: z.number(),
  /** ISO timestamp of last readiness check */
  readinessCheckedAt: z.string().optional(),
});
export type DbConfig = z.infer<typeof DbConfigSchema>;

/**
 * Default DB config for new fullstack/all projects
 * vectorRequired: true because fullstack/all projects get pgvector by default
 * mode is intentionally absent (unset until user configures provisioning)
 */
export const DEFAULT_DB_CONFIG: DbConfig = {
  designed: true,
  status: 'unconfigured',
  vectorRequired: true,
  migrationsApplied: 0,
};
