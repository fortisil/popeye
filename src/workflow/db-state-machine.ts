/**
 * Database lifecycle state machine
 * Enforces valid transitions between DB status states
 */

import type { DbStatus } from '../types/database.js';

/**
 * Valid state transitions map
 * Each key maps to an array of valid target states
 */
const VALID_TRANSITIONS: Record<DbStatus, DbStatus[]> = {
  unconfigured: ['configured'],
  configured: ['applying', 'unconfigured'],
  applying: ['ready', 'error'],
  ready: ['configured', 'unconfigured'],
  error: ['configured', 'unconfigured'],
};

/**
 * Check if a transition from current to target is valid
 *
 * @param current - Current DB status
 * @param target - Target DB status
 * @returns True if the transition is allowed
 */
export function canTransition(current: DbStatus, target: DbStatus): boolean {
  const allowed = VALID_TRANSITIONS[current];
  return allowed !== undefined && allowed.includes(target);
}

/**
 * Validate and execute a state transition
 *
 * @param current - Current DB status
 * @param target - Desired target status
 * @returns The new status
 * @throws Error if the transition is invalid
 */
export function transitionDbStatus(current: DbStatus, target: DbStatus): DbStatus {
  if (!canTransition(current, target)) {
    throw new Error(
      `Invalid DB status transition: '${current}' -> '${target}'. ` +
      `Allowed transitions from '${current}': [${getAvailableTransitions(current).join(', ')}]`
    );
  }
  return target;
}

/**
 * Get the list of valid next states from the current status
 *
 * @param current - Current DB status
 * @returns Array of valid target states
 */
export function getAvailableTransitions(current: DbStatus): DbStatus[] {
  return VALID_TRANSITIONS[current] || [];
}
