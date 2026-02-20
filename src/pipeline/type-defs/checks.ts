/**
 * Gate check types — check definitions and results.
 */

import { z } from 'zod';
import { ArtifactRefSchema } from './artifacts.js';

// ─── Gate Check Types ────────────────────────────────────

export const GateCheckTypeSchema = z.enum([
  'build',
  'test',
  'lint',
  'typecheck',
  'migration',
  'placeholder_scan',
  'start',
  'env_check',
]);
export type GateCheckType = z.infer<typeof GateCheckTypeSchema>;

// ─── Gate Check Result ───────────────────────────────────

export const GateCheckResultSchema = z.object({
  check_type: GateCheckTypeSchema,
  status: z.enum(['pass', 'fail', 'skip']),
  command: z.string(),
  exit_code: z.number().int(),
  stdout_artifact: ArtifactRefSchema.optional(),
  stderr_summary: z.string().optional(),
  duration_ms: z.number(),
  timestamp: z.string(),
});
export type GateCheckResult = z.infer<typeof GateCheckResultSchema>;

// ─── Resolved Commands ───────────────────────────────────

export const ResolvedCommandsSchema = z.object({
  build: z.string().optional(),
  test: z.string().optional(),
  lint: z.string().optional(),
  typecheck: z.string().optional(),
  migrations: z.string().optional(),
  start: z.string().optional(),
  resolved_from: z.string(),
});
export type ResolvedCommands = z.infer<typeof ResolvedCommandsSchema>;
