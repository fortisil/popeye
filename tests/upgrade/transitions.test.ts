/**
 * Tests for upgrade transitions
 */

import { describe, it, expect } from 'vitest';
import {
  getValidUpgradeTargets,
  getTransitionDetails,
} from '../../src/upgrade/transitions.js';

describe('getValidUpgradeTargets', () => {
  it('should return fullstack and all for python', () => {
    expect(getValidUpgradeTargets('python')).toEqual(['fullstack', 'all']);
  });

  it('should return fullstack and all for typescript', () => {
    expect(getValidUpgradeTargets('typescript')).toEqual(['fullstack', 'all']);
  });

  it('should return only all for fullstack', () => {
    expect(getValidUpgradeTargets('fullstack')).toEqual(['all']);
  });

  it('should return only all for website', () => {
    expect(getValidUpgradeTargets('website')).toEqual(['all']);
  });

  it('should return empty array for all (max scope)', () => {
    expect(getValidUpgradeTargets('all')).toEqual([]);
  });
});

describe('getTransitionDetails', () => {
  it('should return transition for fullstack -> all', () => {
    const transition = getTransitionDetails('fullstack', 'all');
    expect(transition).not.toBeNull();
    expect(transition!.newApps).toEqual(['website']);
    expect(transition!.requiresRestructure).toBe(false);
  });

  it('should return transition for python -> fullstack', () => {
    const transition = getTransitionDetails('python', 'fullstack');
    expect(transition).not.toBeNull();
    expect(transition!.newApps).toEqual(['frontend']);
    expect(transition!.requiresRestructure).toBe(true);
  });

  it('should return transition for typescript -> fullstack', () => {
    const transition = getTransitionDetails('typescript', 'fullstack');
    expect(transition).not.toBeNull();
    expect(transition!.newApps).toEqual(['backend']);
    expect(transition!.requiresRestructure).toBe(true);
  });

  it('should return transition for python -> all', () => {
    const transition = getTransitionDetails('python', 'all');
    expect(transition).not.toBeNull();
    expect(transition!.newApps).toContain('frontend');
    expect(transition!.newApps).toContain('website');
    expect(transition!.requiresRestructure).toBe(true);
  });

  it('should return transition for website -> all', () => {
    const transition = getTransitionDetails('website', 'all');
    expect(transition).not.toBeNull();
    expect(transition!.newApps).toContain('frontend');
    expect(transition!.newApps).toContain('backend');
    expect(transition!.requiresRestructure).toBe(true);
  });

  it('should return null for invalid transition all -> fullstack', () => {
    const transition = getTransitionDetails('all', 'fullstack');
    expect(transition).toBeNull();
  });

  it('should return null for same-type transition', () => {
    const transition = getTransitionDetails('python', 'python');
    expect(transition).toBeNull();
  });

  it('should return null for downgrade fullstack -> python', () => {
    const transition = getTransitionDetails('fullstack', 'python');
    expect(transition).toBeNull();
  });
});
