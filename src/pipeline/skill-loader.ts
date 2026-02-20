/**
 * Skill Loader — hybrid system loading from TS defaults + .md overrides.
 * .md files use YAML frontmatter for structured fields (P1-1).
 * If no frontmatter, entire file treated as raw systemPrompt override.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { PipelineRole } from './types.js';
import { DEFAULT_SKILLS } from './skills/defaults.js';

// ─── Types ───────────────────────────────────────────────

export interface SkillDefinition {
  role: PipelineRole;
  version: string;
  systemPrompt: string;
  required_outputs: string[];
  constraints: string[];
  depends_on?: PipelineRole[];
}

// ─── Skill Loader ────────────────────────────────────────

export class SkillLoader {
  private readonly skillsDir: string | undefined;
  private readonly cache = new Map<PipelineRole, SkillDefinition>();

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir;
  }

  /** Load skill definition for a role. Merges TS default + .md override. */
  loadSkill(role: PipelineRole): SkillDefinition {
    const cached = this.cache.get(role);
    if (cached) return cached;

    const defaultSkill = getDefaultSkill(role);
    const override = this.loadMarkdownOverride(role);

    const merged: SkillDefinition = {
      ...defaultSkill,
      ...override,
      role, // Always keep the role
    };

    // If override has systemPrompt, use it; otherwise keep default
    if (override?.systemPrompt) {
      merged.systemPrompt = override.systemPrompt;
    }

    this.cache.set(role, merged);
    return merged;
  }

  /** Load all skills for the given roles */
  loadAllSkills(roles: PipelineRole[]): Map<PipelineRole, SkillDefinition> {
    const result = new Map<PipelineRole, SkillDefinition>();
    for (const role of roles) {
      result.set(role, this.loadSkill(role));
    }
    return result;
  }

  /** Clear cache (useful after reloading .md files) */
  clearCache(): void {
    this.cache.clear();
  }

  /** List available .md skill files */
  listAvailableOverrides(): string[] {
    if (!this.skillsDir || !existsSync(this.skillsDir)) return [];
    return readdirSync(this.skillsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
  }

  // ─── Internal ────────────────────────────────────────────

  private loadMarkdownOverride(role: PipelineRole): Partial<SkillDefinition> | null {
    if (!this.skillsDir) return null;

    const mdPath = join(this.skillsDir, `${role}.md`);
    if (!existsSync(mdPath)) return null;

    try {
      const content = readFileSync(mdPath, 'utf-8');
      return parseSkillMarkdown(content);
    } catch {
      return null;
    }
  }
}

// ─── Default Skill Lookup ────────────────────────────────

export function getDefaultSkill(role: PipelineRole): SkillDefinition {
  return DEFAULT_SKILLS[role] ?? {
    role,
    version: '1.0',
    systemPrompt: `You are the ${role} in the Popeye pipeline.`,
    required_outputs: [],
    constraints: [],
  };
}

// ─── Markdown Parsing ────────────────────────────────────

/** Parse skill markdown with optional YAML frontmatter */
export function parseSkillMarkdown(content: string): Partial<SkillDefinition> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    // No frontmatter: entire content is systemPrompt
    return { systemPrompt: content.trim() };
  }

  const frontmatterRaw = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();

  const result: Partial<SkillDefinition> = {};

  // Parse simple YAML fields (no dependency on yaml library here)
  const lines = frontmatterRaw.split('\n');
  let currentKey = '';
  let currentList: string[] = [];

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous list
      if (currentKey && currentList.length > 0) {
        setField(result, currentKey, currentList);
        currentList = [];
      }

      const [, key, value] = kvMatch;
      currentKey = key;

      if (value.trim()) {
        setField(result, key, value.trim());
        currentKey = '';
      }
    } else {
      const listItemMatch = line.match(/^\s+-\s+(.*)$/);
      if (listItemMatch) {
        currentList.push(listItemMatch[1]);
      }
    }
  }

  // Flush last list
  if (currentKey && currentList.length > 0) {
    setField(result, currentKey, currentList);
  }

  // Body is always the systemPrompt
  if (body) {
    result.systemPrompt = body;
  }

  return result;
}

function setField(result: Partial<SkillDefinition>, key: string, value: string | string[]): void {
  switch (key) {
    case 'role':
      if (typeof value === 'string') result.role = value as PipelineRole;
      break;
    case 'version':
      if (typeof value === 'string') result.version = value;
      break;
    case 'required_outputs':
      if (Array.isArray(value)) result.required_outputs = value;
      break;
    case 'constraints':
      if (Array.isArray(value)) result.constraints = value;
      break;
  }
}

// ─── Factory ─────────────────────────────────────────────

export function resolveSkillsDir(projectDir: string): string {
  return join(projectDir, 'skills');
}

export function createSkillLoader(projectDir?: string): SkillLoader {
  const skillsDir = projectDir ? resolveSkillsDir(projectDir) : undefined;
  return new SkillLoader(skillsDir);
}
