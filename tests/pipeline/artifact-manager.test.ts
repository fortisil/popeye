/**
 * Artifact Manager tests — create, version, verify, index.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createArtifactManager } from '../../src/pipeline/artifact-manager.js';

const TEST_DIR = join(process.cwd(), '.test-artifact-manager');

describe('ArtifactManager', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('ensureDocsStructure', () => {
    it('should create all required subdirectories', () => {
      const manager = createArtifactManager(TEST_DIR);
      manager.ensureDocsStructure();

      expect(existsSync(join(TEST_DIR, 'docs'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'docs', 'master-plan'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'docs', 'architecture'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'docs', 'consensus'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'docs', 'audit'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'docs', 'release'))).toBe(true);
    });
  });

  describe('createArtifactText', () => {
    it('should create a markdown artifact file', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createArtifactText(
        'master_plan',
        '# Master Plan\n\nThe plan.',
        'INTAKE',
      );

      expect(entry.type).toBe('master_plan');
      expect(entry.phase).toBe('INTAKE');
      expect(entry.version).toBe(1);
      expect(entry.content_type).toBe('markdown');
      expect(entry.immutable).toBe(true);
      expect(entry.path).toContain('master-plan');
      expect(entry.path).toContain('.md');

      // File should exist on disk
      const fullPath = join(TEST_DIR, entry.path);
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, 'utf-8')).toBe('# Master Plan\n\nThe plan.');
    });
  });

  describe('createArtifactJson', () => {
    it('should create a JSON artifact file', () => {
      const manager = createArtifactManager(TEST_DIR);
      const data = { key: 'value', count: 42 };
      const entry = manager.createArtifactJson(
        'repo_snapshot',
        data,
        'INTAKE',
      );

      expect(entry.content_type).toBe('json');
      expect(entry.path).toContain('.json');

      const fullPath = join(TEST_DIR, entry.path);
      expect(existsSync(fullPath)).toBe(true);

      const parsed = JSON.parse(readFileSync(fullPath, 'utf-8'));
      expect(parsed.key).toBe('value');
      expect(parsed.count).toBe(42);
    });
  });

  describe('verifyArtifact', () => {
    it('should verify intact artifacts', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createArtifactText(
        'master_plan',
        'Content here',
        'INTAKE',
      );

      expect(manager.verifyArtifact(entry)).toBe(true);
    });

    it('should detect missing artifacts', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createArtifactText(
        'master_plan',
        'Content',
        'INTAKE',
      );

      // Remove the file
      rmSync(join(TEST_DIR, entry.path));
      expect(manager.verifyArtifact(entry)).toBe(false);
    });
  });

  describe('version chains', () => {
    it('should auto-increment versions within a group', () => {
      const manager = createArtifactManager(TEST_DIR);
      const groupId = 'test-group';

      const v1 = manager.createAndStoreText('master_plan', 'v1 content', 'INTAKE', groupId);
      const v2 = manager.createAndStoreText('master_plan', 'v2 content', 'INTAKE', groupId);
      const v3 = manager.createAndStoreText('master_plan', 'v3 content', 'INTAKE', groupId);

      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);

      expect(v1.group_id).toBe(groupId);
      expect(v2.group_id).toBe(groupId);
      expect(v3.group_id).toBe(groupId);

      expect(v2.previous_id).toBe(v1.id);
      expect(v3.previous_id).toBe(v2.id);
    });

    it('should start at v1 for a new group', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createAndStoreText('architecture', 'content', 'ARCHITECTURE');
      expect(entry.version).toBe(1);
      expect(entry.previous_id).toBeUndefined();
    });
  });

  describe('toArtifactRef', () => {
    it('should convert entry to ref', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createArtifactText('master_plan', 'content', 'INTAKE');
      const ref = manager.toArtifactRef(entry);

      expect(ref.artifact_id).toBe(entry.id);
      expect(ref.path).toBe(entry.path);
      expect(ref.sha256).toBe(entry.sha256);
      expect(ref.version).toBe(entry.version);
      expect(ref.type).toBe(entry.type);
    });
  });

  describe('updateIndex', () => {
    it('should create INDEX.md with artifact listing', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createArtifactText('master_plan', 'content', 'INTAKE');

      manager.updateIndex([entry]);

      const indexPath = join(TEST_DIR, 'docs', 'INDEX.md');
      expect(existsSync(indexPath)).toBe(true);

      const indexContent = readFileSync(indexPath, 'utf-8');
      expect(indexContent).toContain('Documentation Index');
      expect(indexContent).toContain('master_plan');
      expect(indexContent).toContain('INTAKE');
    });
  });

  describe('storeArtifactMetadata', () => {
    it('should store and retrieve metadata', () => {
      const manager = createArtifactManager(TEST_DIR);
      const entry = manager.createArtifactText('master_plan', 'content', 'INTAKE');
      manager.storeArtifactMetadata(entry);

      const listed = manager.listArtifacts('master_plan');
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(entry.id);
    });
  });
});
