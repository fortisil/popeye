/**
 * Pipeline core enums — phase and role definitions.
 */

import { z } from 'zod';

// ─── Pipeline Phases ─────────────────────────────────────

export const PipelinePhaseSchema = z.enum([
  'INTAKE',
  'CONSENSUS_MASTER_PLAN',
  'ARCHITECTURE',
  'CONSENSUS_ARCHITECTURE',
  'ROLE_PLANNING',
  'CONSENSUS_ROLE_PLANS',
  'IMPLEMENTATION',
  'QA_VALIDATION',
  'REVIEW',
  'AUDIT',
  'PRODUCTION_GATE',
  'RECOVERY_LOOP',
  'DONE',
  'STUCK',
]);
export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;

/** Ordered list of phases for sequential progression */
export const PIPELINE_PHASE_ORDER: readonly PipelinePhase[] = [
  'INTAKE',
  'CONSENSUS_MASTER_PLAN',
  'ARCHITECTURE',
  'CONSENSUS_ARCHITECTURE',
  'ROLE_PLANNING',
  'CONSENSUS_ROLE_PLANS',
  'IMPLEMENTATION',
  'QA_VALIDATION',
  'REVIEW',
  'AUDIT',
  'PRODUCTION_GATE',
] as const;

// ─── Pipeline Roles ──────────────────────────────────────

export const PipelineRoleSchema = z.enum([
  'DISPATCHER',
  'ARCHITECT',
  'DB_EXPERT',
  'BACKEND_PROGRAMMER',
  'FRONTEND_PROGRAMMER',
  'WEBSITE_PROGRAMMER',
  'QA_TESTER',
  'REVIEWER',
  'ARBITRATOR',
  'DEBUGGER',
  'AUDITOR',
  'JOURNALIST',
  'RELEASE_MANAGER',
  'MARKETING_EXPERT',
  'SOCIAL_EXPERT',
  'UI_UX_SPECIALIST',
]);
export type PipelineRole = z.infer<typeof PipelineRoleSchema>;
