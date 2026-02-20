/**
 * Constitution tests — artifact creation, hash computation, verification.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  computeConstitutionHash,
  createConstitutionArtifact,
  verifyConstitution,
} from '../../src/pipeline/constitution.js';
import { createArtifactManager } from '../../src/pipeline/artifact-manager.js';
import { createDefaultPipelineState } from '../../src/pipeline/types.js';

const TEST_DIR = join(process.cwd(), 'tmp-constitution-test');

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'skills'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('computeConstitutionHash', () => {
  it('should compute SHA-256 of constitution file', () => {
    const content = '# POPEYE CONSTITUTION\nRule 1: Be deterministic';
    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), content);

    const hash = computeConstitutionHash(TEST_DIR);
    const expected = createHash('sha256').update(content, 'utf-8').digest('hex');
    expect(hash).toBe(expected);
  });

  it('should return empty string when file not found', () => {
    const hash = computeConstitutionHash(TEST_DIR + '-nonexistent');
    expect(hash).toBe('');
  });

  it('should produce different hashes for different content', () => {
    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), 'Version 1');
    const hash1 = computeConstitutionHash(TEST_DIR);

    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), 'Version 2');
    const hash2 = computeConstitutionHash(TEST_DIR);

    expect(hash1).not.toBe(hash2);
  });
});

describe('createConstitutionArtifact', () => {
  it('should create an artifact from constitution file', () => {
    writeFileSync(
      join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'),
      '# Constitution\nRule 1',
    );
    const am = createArtifactManager(TEST_DIR);
    const entry = createConstitutionArtifact(TEST_DIR, am);

    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('constitution');
    expect(entry!.phase).toBe('INTAKE');
  });

  it('should return null when constitution file missing', () => {
    const am = createArtifactManager(TEST_DIR);
    const entry = createConstitutionArtifact(TEST_DIR + '-nope', am);
    expect(entry).toBeNull();
  });
});

describe('verifyConstitution', () => {
  it('should pass when hash matches', () => {
    const content = '# Constitution\nRule 1: Immutable';
    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), content);

    const pipeline = createDefaultPipelineState();
    pipeline.constitutionHash = computeConstitutionHash(TEST_DIR);

    const result = verifyConstitution(pipeline, TEST_DIR);
    expect(result.valid).toBe(true);
  });

  it('should fail when constitution has been modified', () => {
    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), 'Original');
    const pipeline = createDefaultPipelineState();
    pipeline.constitutionHash = computeConstitutionHash(TEST_DIR);

    // Modify the file
    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), 'Modified!');

    const result = verifyConstitution(pipeline, TEST_DIR);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('modified');
  });

  it('should skip verification when no hash stored (pre-INTAKE)', () => {
    const pipeline = createDefaultPipelineState();
    // constitutionHash is '' by default

    const result = verifyConstitution(pipeline, TEST_DIR);
    expect(result.valid).toBe(true);
  });

  it('should fail when constitution file deleted after hash stored', () => {
    writeFileSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'), 'Content');
    const pipeline = createDefaultPipelineState();
    pipeline.constitutionHash = computeConstitutionHash(TEST_DIR);

    // Delete the file
    rmSync(join(TEST_DIR, 'skills', 'POPEYE_CONSTITUTION.md'));

    const result = verifyConstitution(pipeline, TEST_DIR);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not found');
  });
});
