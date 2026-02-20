/**
 * Skill Loader tests — frontmatter parsing, raw fallback, merge, caching.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SkillLoader,
  parseSkillMarkdown,
  getDefaultSkill,
  createSkillLoader,
} from '../../src/pipeline/skill-loader.js';

const TEST_DIR = join(process.cwd(), '.test-skill-loader');
const SKILLS_DIR = join(TEST_DIR, 'skills');

describe('SkillLoader', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(SKILLS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('parseSkillMarkdown', () => {
    it('should parse frontmatter with body', () => {
      const md = `---
role: ARCHITECT
version: 2.0
required_outputs:
  - architecture_doc
  - api_contracts
constraints:
  - no implementation details
  - all contracts explicit
---
# System Prompt
You are the Architect responsible for system design.`;

      const result = parseSkillMarkdown(md);
      expect(result.role).toBe('ARCHITECT');
      expect(result.version).toBe('2.0');
      expect(result.required_outputs).toEqual(['architecture_doc', 'api_contracts']);
      expect(result.constraints).toEqual(['no implementation details', 'all contracts explicit']);
      expect(result.systemPrompt).toContain('You are the Architect');
    });

    it('should treat entire content as systemPrompt when no frontmatter', () => {
      const md = 'You are a specialized reviewer.\nReview all code carefully.';
      const result = parseSkillMarkdown(md);

      expect(result.systemPrompt).toBe(md);
      expect(result.role).toBeUndefined();
      expect(result.version).toBeUndefined();
    });

    it('should handle frontmatter with scalar values', () => {
      const md = `---
role: DEBUGGER
version: 1.5
---
Debug the issue.`;

      const result = parseSkillMarkdown(md);
      expect(result.role).toBe('DEBUGGER');
      expect(result.version).toBe('1.5');
      expect(result.systemPrompt).toBe('Debug the issue.');
    });

    it('should handle empty body after frontmatter', () => {
      const md = `---
role: QA_TESTER
version: 1.0
---
`;

      const result = parseSkillMarkdown(md);
      expect(result.role).toBe('QA_TESTER');
      expect(result.systemPrompt).toBeUndefined();
    });
  });

  describe('getDefaultSkill', () => {
    it('should return a valid skill for known roles', () => {
      const skill = getDefaultSkill('ARCHITECT');
      expect(skill.role).toBe('ARCHITECT');
      expect(skill.systemPrompt).toBeDefined();
      expect(skill.systemPrompt.length).toBeGreaterThan(0);
      expect(Array.isArray(skill.required_outputs)).toBe(true);
      expect(Array.isArray(skill.constraints)).toBe(true);
    });

    it('should return fallback for unknown roles', () => {
      const skill = getDefaultSkill('NONEXISTENT' as any);
      expect(skill.role).toBe('NONEXISTENT');
      expect(skill.systemPrompt).toContain('NONEXISTENT');
    });
  });

  describe('SkillLoader class', () => {
    it('should load default skills when no override exists', () => {
      const loader = new SkillLoader(SKILLS_DIR);
      const skill = loader.loadSkill('ARCHITECT');

      expect(skill.role).toBe('ARCHITECT');
      expect(skill.systemPrompt).toBeDefined();
    });

    it('should merge .md override with default', () => {
      writeFileSync(join(SKILLS_DIR, 'ARCHITECT.md'), `---
version: 3.0
constraints:
  - custom constraint
---
Custom architect prompt.`);

      const loader = new SkillLoader(SKILLS_DIR);
      const skill = loader.loadSkill('ARCHITECT');

      expect(skill.role).toBe('ARCHITECT');
      expect(skill.version).toBe('3.0');
      expect(skill.systemPrompt).toBe('Custom architect prompt.');
      expect(skill.constraints).toEqual(['custom constraint']);
    });

    it('should cache loaded skills', () => {
      const loader = new SkillLoader(SKILLS_DIR);
      const s1 = loader.loadSkill('DEBUGGER');
      const s2 = loader.loadSkill('DEBUGGER');
      expect(s1).toBe(s2); // Same reference = cached
    });

    it('should clear cache', () => {
      const loader = new SkillLoader(SKILLS_DIR);
      const s1 = loader.loadSkill('DEBUGGER');
      loader.clearCache();
      const s2 = loader.loadSkill('DEBUGGER');
      expect(s1).not.toBe(s2); // Different reference after cache clear
    });

    it('should load all skills for given roles', () => {
      const loader = new SkillLoader(SKILLS_DIR);
      const skills = loader.loadAllSkills(['ARCHITECT', 'DEBUGGER', 'QA_TESTER']);

      expect(skills.size).toBe(3);
      expect(skills.has('ARCHITECT')).toBe(true);
      expect(skills.has('DEBUGGER')).toBe(true);
      expect(skills.has('QA_TESTER')).toBe(true);
    });

    it('should list available overrides', () => {
      writeFileSync(join(SKILLS_DIR, 'ARCHITECT.md'), 'prompt');
      writeFileSync(join(SKILLS_DIR, 'REVIEWER.md'), 'prompt');

      const loader = new SkillLoader(SKILLS_DIR);
      const overrides = loader.listAvailableOverrides();

      expect(overrides).toContain('ARCHITECT');
      expect(overrides).toContain('REVIEWER');
    });

    it('should handle no skills directory gracefully', () => {
      const loader = new SkillLoader('/nonexistent/path');
      const skill = loader.loadSkill('ARCHITECT');

      // Falls back to default
      expect(skill.role).toBe('ARCHITECT');
      expect(skill.systemPrompt).toBeDefined();
    });
  });

  describe('createSkillLoader', () => {
    it('should create loader with skills dir', () => {
      const loader = createSkillLoader(TEST_DIR);
      expect(loader).toBeInstanceOf(SkillLoader);
    });

    it('should create loader without project dir', () => {
      const loader = createSkillLoader();
      expect(loader).toBeInstanceOf(SkillLoader);
    });
  });
});
