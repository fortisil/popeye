/**
 * Database runtime types and Zod schemas for Phase 2
 * Defines setup pipeline results, readiness checks, and doctor output
 */

import { z } from 'zod';
import { DbStatusSchema, DbSetupStepSchema } from './database.js';

/**
 * Result of a single setup pipeline step
 */
export const SetupStepResultSchema = z.object({
  /** Which pipeline step */
  step: DbSetupStepSchema,
  /** Whether the step succeeded */
  success: z.boolean(),
  /** Human-readable status message */
  message: z.string(),
  /** Duration in milliseconds */
  durationMs: z.number(),
  /** Error details if step failed */
  error: z.string().optional(),
});
export type SetupStepResult = z.infer<typeof SetupStepResultSchema>;

/**
 * Full setup pipeline result
 */
export const SetupResultSchema = z.object({
  /** Whether the entire pipeline succeeded */
  success: z.boolean(),
  /** Individual step results */
  steps: z.array(SetupStepResultSchema),
  /** Total pipeline duration in milliseconds */
  totalDurationMs: z.number(),
  /** Final DB status after pipeline */
  finalStatus: DbStatusSchema,
  /** Error message if pipeline failed */
  error: z.string().optional(),
});
export type SetupResult = z.infer<typeof SetupResultSchema>;

/**
 * Single readiness check (used by doctor command)
 */
export const ReadinessCheckSchema = z.object({
  /** Check name */
  name: z.string(),
  /** Whether the check passed */
  passed: z.boolean(),
  /** Human-readable result message */
  message: z.string(),
  /** Severity level */
  severity: z.enum(['critical', 'warning', 'info']),
});
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

/**
 * Full doctor readiness result
 */
export const ReadinessResultSchema = z.object({
  /** Overall health status */
  healthy: z.boolean(),
  /** Individual check results */
  checks: z.array(ReadinessCheckSchema),
  /** ISO timestamp of when checks ran */
  timestamp: z.string(),
});
export type ReadinessResult = z.infer<typeof ReadinessResultSchema>;
