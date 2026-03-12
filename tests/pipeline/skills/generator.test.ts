/**
 * Skill generator tests — prompt building, parsing, rendering, skip logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  shouldGenerateSkill,
  buildSkillGenPrompt,
  parseSkillPrompts,
  renderSkillMarkdown,
  writeGenerationMarker,
} from '../../../src/pipeline/skills/generator.js';
import type { SkillGenerationContext } from '../../../src/pipeline/skills/types.js';
import type { RepoSnapshot } from '../../../src/pipeline/types.js';

const TEST_DIR = join(process.cwd(), '.test-skill-generator');
const SKILLS_DIR = join(TEST_DIR, 'skills');

function makeSnapshot(): RepoSnapshot {
  return {
    snapshot_id: 'test-snap',
    timestamp: new Date().toISOString(),
    tree_summary: '',
    config_files: [],
    languages_detected: [],
    scripts: {},
    env_files: [],
    migrations_present: false,
    ports_entrypoints: [],
    total_files: 0,
    total_lines: 0,
  };
}

function makeContext(overrides: Partial<SkillGenerationContext> = {}): SkillGenerationContext {
  return {
    language: 'python',
    expandedSpec: 'Build a REST API for task management',
    snapshot: makeSnapshot(),
    activeRoles: ['DISPATCHER', 'ARCHITECT', 'BACKEND_PROGRAMMER', 'DB_EXPERT'],
    skillsDir: SKILLS_DIR,
    projectName: 'TestProject',
    ...overrides,
  };
}

describe('generator', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(SKILLS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('shouldGenerateSkill', () => {
    it('should return true when no .md file exists', () => {
      expect(shouldGenerateSkill(SKILLS_DIR, 'BACKEND_PROGRAMMER')).toBe(true);
    });

    it('should return false when .md file already exists', () => {
      writeFileSync(join(SKILLS_DIR, 'BACKEND_PROGRAMMER.md'), 'existing content');
      expect(shouldGenerateSkill(SKILLS_DIR, 'BACKEND_PROGRAMMER')).toBe(false);
    });

    it('should check per-role independently', () => {
      writeFileSync(join(SKILLS_DIR, 'ARCHITECT.md'), 'existing');
      expect(shouldGenerateSkill(SKILLS_DIR, 'ARCHITECT')).toBe(false);
      expect(shouldGenerateSkill(SKILLS_DIR, 'BACKEND_PROGRAMMER')).toBe(true);
    });
  });

  describe('buildSkillGenPrompt', () => {
    it('should include project name and tech stack', () => {
      const prompt = buildSkillGenPrompt(
        makeContext(),
        ['BACKEND_PROGRAMMER'],
        { backend: 'FastAPI', language: 'Python 3.11+' },
      );
      expect(prompt).toContain('TestProject');
      expect(prompt).toContain('FastAPI');
      expect(prompt).toContain('Python 3.11+');
    });

    it('should include role descriptions', () => {
      const prompt = buildSkillGenPrompt(
        makeContext(),
        ['BACKEND_PROGRAMMER', 'DB_EXPERT'],
        { backend: 'FastAPI' },
      );
      expect(prompt).toContain('BACKEND_PROGRAMMER');
      expect(prompt).toContain('DB_EXPERT');
    });

    it('should include session guidance when present', () => {
      const prompt = buildSkillGenPrompt(
        makeContext({ sessionGuidance: 'Focus on security' }),
        ['BACKEND_PROGRAMMER'],
        { backend: 'FastAPI' },
      );
      expect(prompt).toContain('Focus on security');
    });

    it('should include expanded spec', () => {
      const prompt = buildSkillGenPrompt(
        makeContext({ expandedSpec: 'Build a REST API with auth' }),
        ['BACKEND_PROGRAMMER'],
        { backend: 'FastAPI' },
      );
      expect(prompt).toContain('Build a REST API with auth');
    });
  });

  describe('parseSkillPrompts', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        BACKEND_PROGRAMMER: 'You are the Backend Programmer for MyProject.',
        DB_EXPERT: 'You are the DB Expert for MyProject.',
      });
      const result = parseSkillPrompts(response, ['BACKEND_PROGRAMMER', 'DB_EXPERT']);
      expect(result.BACKEND_PROGRAMMER).toContain('Backend Programmer');
      expect(result.DB_EXPERT).toContain('DB Expert');
    });

    it('should extract JSON from markdown code fences', () => {
      const response = '```json\n{"BACKEND_PROGRAMMER": "You are the Backend Programmer."}\n```';
      const result = parseSkillPrompts(response, ['BACKEND_PROGRAMMER']);
      expect(result.BACKEND_PROGRAMMER).toContain('Backend Programmer');
    });

    it('should return empty for malformed JSON', () => {
      const result = parseSkillPrompts('not json at all', ['BACKEND_PROGRAMMER']);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should skip roles not in expectedRoles', () => {
      const response = JSON.stringify({
        BACKEND_PROGRAMMER: 'Valid prompt for backend.',
        FRONTEND_PROGRAMMER: 'Should be ignored.',
      });
      const result = parseSkillPrompts(response, ['BACKEND_PROGRAMMER']);
      expect(result.BACKEND_PROGRAMMER).toBeDefined();
      expect(result.FRONTEND_PROGRAMMER).toBeUndefined();
    });

    it('should skip prompts shorter than 10 chars', () => {
      const response = JSON.stringify({
        BACKEND_PROGRAMMER: 'Short',
      });
      const result = parseSkillPrompts(response, ['BACKEND_PROGRAMMER']);
      expect(result.BACKEND_PROGRAMMER).toBeUndefined();
    });
  });

  describe('renderSkillMarkdown', () => {
    it('should produce valid YAML frontmatter format', () => {
      const md = renderSkillMarkdown(
        'BACKEND_PROGRAMMER',
        'You are the Backend Programmer.',
        ['follow_architecture', 'must_follow_master_plan'],
        ['endpoints', 'services'],
        ['ARCHITECT'],
      );

      expect(md).toMatch(/^---\n/);
      expect(md).toContain('role: BACKEND_PROGRAMMER');
      expect(md).toContain('version: 1.0-project');
      expect(md).toContain('  - endpoints');
      expect(md).toContain('  - services');
      expect(md).toContain('  - follow_architecture');
      expect(md).toContain('  - must_follow_master_plan');
      expect(md).toContain('depends_on:');
      expect(md).toContain('  - ARCHITECT');
      expect(md).toContain('You are the Backend Programmer.');
    });

    it('should omit depends_on when empty', () => {
      const md = renderSkillMarkdown(
        'DISPATCHER',
        'You are the Dispatcher.',
        ['governance'],
        ['phase_transition'],
        [],
      );
      expect(md).not.toContain('depends_on:');
    });
  });

  describe('writeGenerationMarker', () => {
    it('should write valid JSON marker file', () => {
      const marker = {
        timestamp: '2026-02-22T14:30:00Z',
        pipelineVersion: '1.0',
        activeRoles: ['DISPATCHER', 'BACKEND_PROGRAMMER'],
        techStack: { backend: 'FastAPI' },
        aiGenerated: true,
      };
      writeGenerationMarker(SKILLS_DIR, marker);

      const markerPath = join(SKILLS_DIR, '.popeye-skills-generated.json');
      expect(existsSync(markerPath)).toBe(true);

      const content = JSON.parse(readFileSync(markerPath, 'utf-8'));
      expect(content.pipelineVersion).toBe('1.0');
      expect(content.aiGenerated).toBe(true);
      expect(content.activeRoles).toContain('BACKEND_PROGRAMMER');
      expect(content.techStack.backend).toBe('FastAPI');
    });
  });
});
