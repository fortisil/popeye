/**
 * Tests for database lifecycle state machine
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transitionDbStatus,
  getAvailableTransitions,
} from '../../src/workflow/db-state-machine.js';

describe('canTransition', () => {
  it('should allow unconfigured -> configured', () => {
    expect(canTransition('unconfigured', 'configured')).toBe(true);
  });

  it('should allow configured -> applying', () => {
    expect(canTransition('configured', 'applying')).toBe(true);
  });

  it('should allow configured -> unconfigured (reset)', () => {
    expect(canTransition('configured', 'unconfigured')).toBe(true);
  });

  it('should allow applying -> ready', () => {
    expect(canTransition('applying', 'ready')).toBe(true);
  });

  it('should allow applying -> error', () => {
    expect(canTransition('applying', 'error')).toBe(true);
  });

  it('should allow ready -> configured (reconfigure)', () => {
    expect(canTransition('ready', 'configured')).toBe(true);
  });

  it('should allow ready -> unconfigured (reset)', () => {
    expect(canTransition('ready', 'unconfigured')).toBe(true);
  });

  it('should allow error -> configured (retry)', () => {
    expect(canTransition('error', 'configured')).toBe(true);
  });

  it('should allow error -> unconfigured (reset)', () => {
    expect(canTransition('error', 'unconfigured')).toBe(true);
  });

  it('should reject unconfigured -> ready (skip steps)', () => {
    expect(canTransition('unconfigured', 'ready')).toBe(false);
  });

  it('should reject unconfigured -> applying (must configure first)', () => {
    expect(canTransition('unconfigured', 'applying')).toBe(false);
  });

  it('should reject ready -> applying (must reconfigure first)', () => {
    expect(canTransition('ready', 'applying')).toBe(false);
  });

  it('should reject error -> ready (must reconfigure and reapply)', () => {
    expect(canTransition('error', 'ready')).toBe(false);
  });

  it('should reject self-transitions', () => {
    expect(canTransition('unconfigured', 'unconfigured')).toBe(false);
    expect(canTransition('ready', 'ready')).toBe(false);
    expect(canTransition('error', 'error')).toBe(false);
  });
});

describe('transitionDbStatus', () => {
  it('should return the target status on valid transition', () => {
    expect(transitionDbStatus('unconfigured', 'configured')).toBe('configured');
    expect(transitionDbStatus('configured', 'applying')).toBe('applying');
    expect(transitionDbStatus('applying', 'ready')).toBe('ready');
  });

  it('should throw on invalid transition', () => {
    expect(() => transitionDbStatus('unconfigured', 'ready')).toThrow(
      /Invalid DB status transition/
    );
  });

  it('should include available transitions in error message', () => {
    expect(() => transitionDbStatus('unconfigured', 'ready')).toThrow(
      /configured/
    );
  });
});

describe('getAvailableTransitions', () => {
  it('should return [configured] for unconfigured', () => {
    const transitions = getAvailableTransitions('unconfigured');
    expect(transitions).toEqual(['configured']);
  });

  it('should return [applying, unconfigured] for configured', () => {
    const transitions = getAvailableTransitions('configured');
    expect(transitions).toEqual(['applying', 'unconfigured']);
  });

  it('should return [ready, error] for applying', () => {
    const transitions = getAvailableTransitions('applying');
    expect(transitions).toEqual(['ready', 'error']);
  });

  it('should return [configured, unconfigured] for ready', () => {
    const transitions = getAvailableTransitions('ready');
    expect(transitions).toEqual(['configured', 'unconfigured']);
  });

  it('should return [configured, unconfigured] for error', () => {
    const transitions = getAvailableTransitions('error');
    expect(transitions).toEqual(['configured', 'unconfigured']);
  });
});
