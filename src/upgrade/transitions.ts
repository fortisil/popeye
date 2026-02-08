/**
 * Project type upgrade transitions
 * Defines valid upgrade paths between project types
 */

import { languageToApps } from '../types/project.js';
import type { OutputLanguage, AppType } from '../types/project.js';

/**
 * Details of a project type transition
 */
export interface UpgradeTransition {
  from: OutputLanguage;
  to: OutputLanguage;
  /** New apps that will be generated */
  newApps: AppType[];
  /** Whether existing code needs to be moved into apps/ directory */
  requiresRestructure: boolean;
  /** Description of what the upgrade does */
  description: string;
}

/**
 * Get valid upgrade targets for a given language
 *
 * @param from - Current project language
 * @returns Array of valid target languages
 */
export function getValidUpgradeTargets(from: OutputLanguage): OutputLanguage[] {
  const targets: Record<OutputLanguage, OutputLanguage[]> = {
    python: ['fullstack', 'all'],
    typescript: ['fullstack', 'all'],
    fullstack: ['all'],
    website: ['all'],
    all: [],
  };
  return targets[from];
}

/**
 * Get detailed transition information for an upgrade
 *
 * @param from - Current project language
 * @param to - Target project language
 * @returns Transition details or null if invalid
 */
export function getTransitionDetails(
  from: OutputLanguage,
  to: OutputLanguage,
): UpgradeTransition | null {
  const validTargets = getValidUpgradeTargets(from);
  if (!validTargets.includes(to)) {
    return null;
  }

  const currentApps = new Set(languageToApps(from));
  const targetApps = languageToApps(to);
  const newApps = targetApps.filter((app) => !currentApps.has(app));

  // Single-app types need restructuring into apps/ monorepo layout
  const singleAppTypes: OutputLanguage[] = ['python', 'typescript', 'website'];
  const requiresRestructure = singleAppTypes.includes(from);

  const descriptions: Record<string, string> = {
    'python->fullstack': 'Add frontend app, move backend to apps/backend/',
    'python->all': 'Add frontend + website, move backend to apps/backend/',
    'typescript->fullstack': 'Add backend app, move frontend to apps/frontend/',
    'typescript->all': 'Add backend + website, move frontend to apps/frontend/',
    'fullstack->all': 'Add website app to existing workspace',
    'website->all': 'Add frontend + backend, move website to apps/website/',
  };

  return {
    from,
    to,
    newApps,
    requiresRestructure,
    description: descriptions[`${from}->${to}`] || `Upgrade from ${from} to ${to}`,
  };
}
