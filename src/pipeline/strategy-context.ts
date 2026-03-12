/**
 * Strategy context loader for pipeline roles.
 * Loads website strategy from disk and formats it for injection
 * into role planning and execution prompts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PipelineRole } from './types.js';
import { WebsiteStrategySchema } from '../types/website-strategy.js';
import { formatWebsiteStrategy } from '../shared/website-strategy-format.js';

/** Roles that should receive website strategy context */
export const STRATEGY_ROLES: readonly PipelineRole[] = [
  'WEBSITE_PROGRAMMER',
  'MARKETING_EXPERT',
  'SOCIAL_EXPERT',
];

/** Known strategy file locations, checked in order */
const STRATEGY_PATHS = [
  '.popeye/website-strategy.json',
  '.popeye/website-strategy.md',
] as const;

/**
 * Load website strategy from disk and format for prompt injection.
 * Checks known paths in order. Returns undefined if no valid strategy found.
 *
 * Args:
 *   projectDir: Root project directory containing .popeye/.
 *
 * Returns:
 *   string | undefined: Formatted strategy text, or undefined if not found/invalid.
 */
export function loadStrategyForRole(projectDir: string): string | undefined {
  for (const relPath of STRATEGY_PATHS) {
    const fullPath = join(projectDir, relPath);
    if (!existsSync(fullPath)) continue;

    try {
      const raw = readFileSync(fullPath, 'utf-8');

      // .md files: return raw content directly
      if (relPath.endsWith('.md')) return raw;

      // .json files: parse, validate, format
      const parsed = JSON.parse(raw);
      const strategyData = parsed.strategy ?? parsed;
      const result = WebsiteStrategySchema.safeParse(strategyData);
      if (!result.success) continue;

      return formatWebsiteStrategy(result.data);
    } catch {
      continue; // Malformed file, try next path
    }
  }
  return undefined;
}
