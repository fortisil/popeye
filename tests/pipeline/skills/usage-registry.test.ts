/**
 * SkillUsageRegistry tests — recording, querying, and array reference sharing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillUsageRegistry } from '../../../src/pipeline/skills/usage-registry.js';
import type { SkillUsageEvent } from '../../../src/pipeline/skills/usage-registry.js';

describe('SkillUsageRegistry', () => {
  let events: SkillUsageEvent[];
  let registry: SkillUsageRegistry;

  beforeEach(() => {
    events = [];
    registry = new SkillUsageRegistry(events);
  });

  describe('record', () => {
    it('should record a usage event with all fields', () => {
      registry.record('ARCHITECT', 'ARCHITECTURE', 'system_prompt', 'defaults', '1.0');

      const recorded = registry.getEvents();
      expect(recorded).toHaveLength(1);
      expect(recorded[0].role).toBe('ARCHITECT');
      expect(recorded[0].phase).toBe('ARCHITECTURE');
      expect(recorded[0].used_as).toBe('system_prompt');
      expect(recorded[0].skill_source).toBe('defaults');
      expect(recorded[0].skill_version).toBe('1.0');
      expect(recorded[0].timestamp).toBeTruthy();
    });

    it('should record event without optional version', () => {
      registry.record('REVIEWER', 'REVIEW', 'review_prompt', 'project_override');

      const recorded = registry.getEvents();
      expect(recorded).toHaveLength(1);
      expect(recorded[0].skill_version).toBeUndefined();
    });

    it('should push into the shared array reference', () => {
      registry.record('AUDITOR', 'AUDIT', 'system_prompt', 'defaults');

      // The underlying events array should be mutated directly
      expect(events).toHaveLength(1);
      expect(events[0].role).toBe('AUDITOR');
    });
  });

  describe('getEvents', () => {
    it('should return a copy of events', () => {
      registry.record('ARCHITECT', 'ARCHITECTURE', 'system_prompt', 'defaults');
      const copy = registry.getEvents();

      // Mutating the copy should not affect the original
      copy.push({
        role: 'DEBUGGER',
        phase: 'RECOVERY_LOOP',
        used_as: 'system_prompt',
        skill_source: 'defaults',
        timestamp: new Date().toISOString(),
      });

      expect(registry.getEvents()).toHaveLength(1);
    });
  });

  describe('getEventsForRole', () => {
    it('should filter events by role', () => {
      registry.record('ARCHITECT', 'ARCHITECTURE', 'system_prompt', 'defaults');
      registry.record('REVIEWER', 'REVIEW', 'review_prompt', 'defaults');
      registry.record('ARCHITECT', 'CONSENSUS_ARCHITECTURE', 'other', 'defaults');

      const architectEvents = registry.getEventsForRole('ARCHITECT');
      expect(architectEvents).toHaveLength(2);
      expect(architectEvents.every((e) => e.role === 'ARCHITECT')).toBe(true);
    });

    it('should return empty array for role with no events', () => {
      registry.record('ARCHITECT', 'ARCHITECTURE', 'system_prompt', 'defaults');

      const debuggerEvents = registry.getEventsForRole('DEBUGGER');
      expect(debuggerEvents).toHaveLength(0);
    });
  });

  describe('hasUsage', () => {
    it('should return true for role with recorded events', () => {
      registry.record('AUDITOR', 'AUDIT', 'system_prompt', 'defaults');

      expect(registry.hasUsage('AUDITOR')).toBe(true);
    });

    it('should return false for role with no events', () => {
      expect(registry.hasUsage('DEBUGGER')).toBe(false);
    });
  });

  describe('state serialization', () => {
    it('should round-trip through JSON correctly', () => {
      registry.record('ARCHITECT', 'ARCHITECTURE', 'system_prompt', 'defaults', '1.0');
      registry.record('REVIEWER', 'REVIEW', 'review_prompt', 'project_override', '2.0');

      // Simulate state serialization
      const serialized = JSON.stringify(events);
      const deserialized = JSON.parse(serialized) as SkillUsageEvent[];

      // Create new registry from deserialized data
      const newRegistry = new SkillUsageRegistry(deserialized);
      expect(newRegistry.getEvents()).toHaveLength(2);
      expect(newRegistry.hasUsage('ARCHITECT')).toBe(true);
      expect(newRegistry.hasUsage('REVIEWER')).toBe(true);
    });
  });
});
