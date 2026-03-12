/**
 * Constitution generator tests — deterministic template generation, skip logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateConstitution,
  shouldSkipConstitution,
  getTechStackSection,
  getArchitectureRules,
  getCodeQualityRules,
  getConstraintsSection,
} from '../../../src/pipeline/skills/constitution-generator.js';
import type { ConstitutionContext } from '../../../src/pipeline/skills/types.js';

const TEST_DIR = join(process.cwd(), '.test-constitution-gen');
const SKILLS_DIR = join(TEST_DIR, 'skills');

function makeContext(overrides: Partial<ConstitutionContext> = {}): ConstitutionContext {
  return {
    language: 'python',
    projectName: 'TestProject',
    techStack: {
      language: 'Python 3.11+',
      backend: 'FastAPI',
      database: 'PostgreSQL',
      orm: 'SQLAlchemy',
      testing: 'Pytest',
    },
    expandedSpec: 'Build a REST API',
    skillsDir: SKILLS_DIR,
    ...overrides,
  };
}

describe('constitution-generator', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(SKILLS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('shouldSkipConstitution', () => {
    it('should return false when constitution does not exist', () => {
      expect(shouldSkipConstitution(SKILLS_DIR)).toBe(false);
    });

    it('should return true when constitution already exists', () => {
      writeFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'existing');
      expect(shouldSkipConstitution(SKILLS_DIR)).toBe(true);
    });
  });

  describe('generateConstitution', () => {
    it('should create POPEYE_CONSTITUTION.md', () => {
      generateConstitution(makeContext());
      const path = join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md');
      expect(existsSync(path)).toBe(true);
    });

    it('should include project name in header', () => {
      generateConstitution(makeContext());
      const content = readFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'utf-8');
      expect(content).toContain('# Project Constitution: TestProject');
    });

    it('should include tech stack section', () => {
      generateConstitution(makeContext());
      const content = readFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'utf-8');
      expect(content).toContain('## Tech Stack');
      expect(content).toContain('FastAPI');
      expect(content).toContain('PostgreSQL');
      expect(content).toContain('SQLAlchemy');
    });

    it('should include governance rules', () => {
      generateConstitution(makeContext());
      const content = readFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'utf-8');
      expect(content).toContain('## Governance Rules');
      expect(content).toContain('Consensus threshold: 0.95');
      expect(content).toContain('immutable once stored');
      expect(content).toContain('No placeholder content');
    });

    it('should include immutability notice', () => {
      generateConstitution(makeContext());
      const content = readFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'utf-8');
      expect(content).toContain('## Immutability');
      expect(content).toContain('MUST NOT be modified during pipeline execution');
    });

    it('should not overwrite existing constitution', () => {
      writeFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'hand-written content');
      generateConstitution(makeContext());
      const content = readFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'utf-8');
      expect(content).toBe('hand-written content');
    });

    it('should include session guidance when provided', () => {
      generateConstitution(makeContext({ sessionGuidance: 'Focus on security' }));
      const content = readFileSync(join(SKILLS_DIR, 'POPEYE_CONSTITUTION.md'), 'utf-8');
      expect(content).toContain('Focus on security');
    });

    it('should create skills dir if it does not exist', () => {
      rmSync(SKILLS_DIR, { recursive: true });
      expect(existsSync(SKILLS_DIR)).toBe(false);
      generateConstitution(makeContext());
      expect(existsSync(SKILLS_DIR)).toBe(true);
    });
  });

  describe('getTechStackSection', () => {
    it('should list all available tech stack fields', () => {
      const section = getTechStackSection({
        language: 'Python 3.11+',
        backend: 'FastAPI',
        database: 'PostgreSQL',
        orm: 'SQLAlchemy',
        testing: 'Pytest',
      });
      expect(section).toContain('- Language: Python 3.11+');
      expect(section).toContain('- Framework: FastAPI');
      expect(section).toContain('- Database: PostgreSQL');
      expect(section).toContain('- ORM: SQLAlchemy');
      expect(section).toContain('- Testing: Pytest');
    });

    it('should skip undefined fields', () => {
      const section = getTechStackSection({ language: 'Python 3.11+' });
      expect(section).toContain('- Language: Python 3.11+');
      expect(section).not.toContain('Framework');
      expect(section).not.toContain('Database');
    });
  });

  describe('getArchitectureRules', () => {
    it('should include FastAPI async rule for FastAPI projects', () => {
      const rules = getArchitectureRules({ backend: 'FastAPI' });
      expect(rules).toContain('async/await');
    });

    it('should include SQLAlchemy rule for SQLAlchemy projects', () => {
      const rules = getArchitectureRules({ orm: 'SQLAlchemy' });
      expect(rules).toContain('SQLAlchemy ORM');
    });

    it('should include Python-specific rules', () => {
      const rules = getArchitectureRules({ language: 'Python 3.11+' });
      expect(rules).toContain('PEP8');
      expect(rules).toContain('python-dotenv');
    });

    it('should include TypeScript-specific rules', () => {
      const rules = getArchitectureRules({ language: 'TypeScript 5.x' });
      expect(rules).toContain('strict mode');
    });

    it('should provide generic rules when no tech matches', () => {
      const rules = getArchitectureRules({});
      expect(rules).toContain('Environment variables');
    });
  });

  describe('getCodeQualityRules', () => {
    it('should include file size limit', () => {
      const rules = getCodeQualityRules();
      expect(rules).toContain('500 lines');
    });

    it('should include test requirements', () => {
      const rules = getCodeQualityRules();
      expect(rules).toContain('Unit tests');
    });
  });

  describe('getConstraintsSection', () => {
    it('should include Python constraints for python language', () => {
      const section = getConstraintsSection('python');
      expect(section).toContain('Python 3.11+');
      expect(section).toContain('venv');
    });

    it('should include TypeScript constraints for typescript', () => {
      const section = getConstraintsSection('typescript');
      expect(section).toContain('Node.js 18+');
      expect(section).toContain('ESM');
    });

    it('should include session guidance when provided', () => {
      const section = getConstraintsSection('python', 'Focus on security');
      expect(section).toContain('Session-Specific Guidance');
      expect(section).toContain('Focus on security');
    });
  });
});
