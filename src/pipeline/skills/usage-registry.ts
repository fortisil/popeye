/**
 * Skill Usage Registry — in-memory helper wrapping the persistent
 * SkillUsageEvent[] array from PipelineState.
 *
 * Records when a skill is actually injected into an LLM prompt
 * or execution context (not on mere load).
 */

import type { PipelineRole, PipelinePhase } from '../types.js';

// ─── Types ───────────────────────────────────────────────

export type SkillUsedAs =
  | 'system_prompt'
  | 'review_prompt'
  | 'arbitration_prompt'
  | 'role_context'
  | 'planning_prompt'
  | 'strategy_context'
  | 'other';

export type SkillSource = 'project_override' | 'defaults' | 'disk';

export interface SkillUsageEvent {
  role: PipelineRole;
  phase: PipelinePhase;
  used_as: SkillUsedAs;
  skill_source: SkillSource;
  skill_version?: string;
  timestamp: string;
}

// ─── Registry ────────────────────────────────────────────

/**
 * Wraps the persistent events array from PipelineState.
 * Pushes directly into the shared array reference so state
 * serialization captures all recorded events.
 */
export class SkillUsageRegistry {
  constructor(private readonly events: SkillUsageEvent[]) {}

  /**
   * Record a usage event.
   *
   * Call ONLY when skill is injected into an LLM prompt
   * or execution context, not on mere load.
   *
   * Args:
   *   role: The pipeline role whose skill was used.
   *   phase: The phase during which usage occurred.
   *   usedAs: How the skill was consumed.
   *   skillSource: Whether from project override or defaults.
   *   version: Optional skill version string.
   */
  record(
    role: PipelineRole,
    phase: PipelinePhase,
    usedAs: SkillUsedAs,
    skillSource: SkillSource,
    version?: string,
  ): void {
    this.events.push({
      role,
      phase,
      used_as: usedAs,
      skill_source: skillSource,
      skill_version: version,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get a copy of all recorded events. */
  getEvents(): SkillUsageEvent[] {
    return [...this.events];
  }

  /** Get events for a specific role. */
  getEventsForRole(role: PipelineRole): SkillUsageEvent[] {
    return this.events.filter((e) => e.role === role);
  }

  /** Check if any usage has been recorded for a role. */
  hasUsage(role: PipelineRole): boolean {
    return this.events.some((e) => e.role === role);
  }
}
