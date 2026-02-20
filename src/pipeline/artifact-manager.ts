/**
 * Artifact Manager — manages immutable versioned artifacts under /docs/.
 * Supports both Markdown and JSON content types (P0-C).
 * Implements version chains via group_id + previous_id (P1-2).
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import type {
  ArtifactType,
  ArtifactEntry,
  ArtifactRef,
  ContentType,
  PipelinePhase,
} from './types.js';

// ─── Constants ───────────────────────────────────────────

/** Directory mappings: artifact type -> subdirectory under /docs/ */
const ARTIFACT_DIRS: Record<string, string> = {
  master_plan: 'master-plan',
  architecture: 'architecture',
  role_plan: 'role-plans',
  consensus: 'consensus',
  arbitration: 'arbitration',
  audit_report: 'audit',
  rca_report: 'incidents',
  production_readiness: 'production',
  release_notes: 'release',
  deployment: 'release',
  rollback: 'release',
  repo_snapshot: 'snapshots',
  build_check: 'checks',
  test_check: 'checks',
  lint_check: 'checks',
  typecheck_check: 'checks',
  placeholder_scan: 'checks',
  qa_validation: 'role-plans',
  review_decision: 'consensus',
  stuck_report: 'incidents',
  journalist_trace: 'journal',
  resolved_commands: 'checks',
  constitution: 'governance',
  change_request: 'governance',
};

/** All required subdirectories under /docs/ */
const DOCS_SUBDIRS = [
  'master-plan',
  'architecture',
  'role-plans',
  'consensus',
  'arbitration',
  'audit',
  'incidents',
  'production',
  'release',
  'snapshots',
  'checks',
  'journal',
  'governance',
];

// ─── Helper Functions ────────────────────────────────────

function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function shortId(): string {
  return randomUUID().split('-')[0];
}

function formatDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getExtension(contentType: ContentType): string {
  return contentType === 'json' ? '.json' : '.md';
}

// ─── Artifact Manager ────────────────────────────────────

export interface ArtifactManagerOptions {
  projectDir: string;
}

export class ArtifactManager {
  private readonly projectDir: string;
  private readonly docsDir: string;

  constructor(options: ArtifactManagerOptions) {
    this.projectDir = options.projectDir;
    this.docsDir = join(options.projectDir, 'docs');
  }

  /** Ensure all /docs/ subdirectories exist */
  ensureDocsStructure(): void {
    if (!existsSync(this.docsDir)) {
      mkdirSync(this.docsDir, { recursive: true });
    }
    for (const subdir of DOCS_SUBDIRS) {
      const dirPath = join(this.docsDir, subdir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  /** Create an artifact from Markdown content */
  createArtifactText(
    type: ArtifactType,
    markdown: string,
    phase: PipelinePhase,
    groupId?: string,
  ): ArtifactEntry {
    return this.createArtifact(type, markdown, phase, 'markdown', groupId);
  }

  /** Create an artifact from a JSON-serializable object */
  createArtifactJson(
    type: ArtifactType,
    jsonObject: unknown,
    phase: PipelinePhase,
    groupId?: string,
  ): ArtifactEntry {
    const content = JSON.stringify(jsonObject, null, 2);
    return this.createArtifact(type, content, phase, 'json', groupId);
  }

  /** Core artifact creation logic */
  private createArtifact(
    type: ArtifactType,
    content: string,
    phase: PipelinePhase,
    contentType: ContentType,
    groupId?: string,
  ): ArtifactEntry {
    this.ensureDocsStructure();

    const resolvedGroupId = groupId ?? randomUUID();
    const existingArtifacts = this.listArtifacts(type);
    const version = this.getNextVersion(resolvedGroupId, existingArtifacts);
    const previousEntry = this.getLatestInGroup(resolvedGroupId, existingArtifacts);

    const id = randomUUID();
    const date = formatDate();
    const sid = shortId();
    const ext = getExtension(contentType);
    const filename = `${type}_${sid}_v${version}_${date}${ext}`;

    const subdir = ARTIFACT_DIRS[type] ?? 'misc';
    const dirPath = join(this.docsDir, subdir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    const filePath = join(dirPath, filename);
    const sha256 = computeSha256(content);

    writeFileSync(filePath, content, 'utf-8');

    const relativePath = relative(this.projectDir, filePath);

    const entry: ArtifactEntry = {
      id,
      type,
      phase,
      version,
      path: relativePath,
      sha256,
      timestamp: new Date().toISOString(),
      immutable: true,
      content_type: contentType,
      group_id: resolvedGroupId,
      previous_id: previousEntry?.id,
    };

    return entry;
  }

  /** Get the file path for a given artifact type and naming components */
  getArtifactPath(
    type: ArtifactType,
    sid: string,
    version: number,
    date: string,
    contentType: ContentType,
  ): string {
    const ext = getExtension(contentType);
    const subdir = ARTIFACT_DIRS[type] ?? 'misc';
    return join(this.docsDir, subdir, `${type}_${sid}_v${version}_${date}${ext}`);
  }

  /** List all artifacts, optionally filtered by type */
  listArtifacts(type?: ArtifactType): ArtifactEntry[] {
    // Scan for artifact JSON metadata files in a .artifacts/ dir
    const metaDir = join(this.docsDir, '.artifacts');
    if (!existsSync(metaDir)) {
      return [];
    }

    const entries: ArtifactEntry[] = [];
    const files = readdirSync(metaDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = readFileSync(join(metaDir, file), 'utf-8');
        const parsed = JSON.parse(raw) as ArtifactEntry;
        if (!type || parsed.type === type) {
          entries.push(parsed);
        }
      } catch {
        // Skip malformed metadata files
      }
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Verify an artifact's SHA-256 matches its stored content */
  verifyArtifact(entry: ArtifactEntry): boolean {
    const fullPath = join(this.projectDir, entry.path);
    if (!existsSync(fullPath)) {
      return false;
    }

    const content = readFileSync(fullPath, 'utf-8');
    const currentHash = computeSha256(content);
    return currentHash === entry.sha256;
  }

  /** Get the latest artifact of a given type */
  getLatestArtifact(type: ArtifactType): ArtifactEntry | null {
    const all = this.listArtifacts(type);
    if (all.length === 0) return null;
    return all[all.length - 1];
  }

  /** Get next version number for a group across existing artifacts */
  getNextVersion(groupId: string, existingArtifacts: ArtifactEntry[]): number {
    const groupArtifacts = existingArtifacts.filter((a) => a.group_id === groupId);
    if (groupArtifacts.length === 0) return 1;
    const maxVersion = Math.max(...groupArtifacts.map((a) => a.version));
    return maxVersion + 1;
  }

  /** Convert an ArtifactEntry to an ArtifactRef */
  toArtifactRef(entry: ArtifactEntry): ArtifactRef {
    return {
      artifact_id: entry.id,
      path: entry.path,
      sha256: entry.sha256,
      version: entry.version,
      type: entry.type,
    };
  }

  /** Store artifact metadata for later retrieval */
  storeArtifactMetadata(entry: ArtifactEntry): void {
    const metaDir = join(this.docsDir, '.artifacts');
    if (!existsSync(metaDir)) {
      mkdirSync(metaDir, { recursive: true });
    }

    const metaPath = join(metaDir, `${entry.id}.json`);
    writeFileSync(metaPath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  /** Create an artifact and store its metadata in one step */
  createAndStoreText(
    type: ArtifactType,
    markdown: string,
    phase: PipelinePhase,
    groupId?: string,
  ): ArtifactEntry {
    const entry = this.createArtifactText(type, markdown, phase, groupId);
    this.storeArtifactMetadata(entry);
    return entry;
  }

  /** Create a JSON artifact and store its metadata in one step */
  createAndStoreJson(
    type: ArtifactType,
    jsonObject: unknown,
    phase: PipelinePhase,
    groupId?: string,
  ): ArtifactEntry {
    const entry = this.createArtifactJson(type, jsonObject, phase, groupId);
    this.storeArtifactMetadata(entry);
    return entry;
  }

  /** Update /docs/INDEX.md with current artifact listing */
  updateIndex(artifacts: ArtifactEntry[]): void {
    this.ensureDocsStructure();

    const lines: string[] = [
      '# Documentation Index',
      '',
      `> Auto-generated by Popeye Pipeline — ${new Date().toISOString()}`,
      '',
      '## Artifacts',
      '',
      '| Type | Version | Path | Phase | Timestamp |',
      '|------|---------|------|-------|-----------|',
    ];

    const sorted = [...artifacts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    for (const a of sorted) {
      lines.push(`| ${a.type} | v${a.version} | ${a.path} | ${a.phase} | ${a.timestamp} |`);
    }

    lines.push('');
    const indexPath = join(this.docsDir, 'INDEX.md');
    writeFileSync(indexPath, lines.join('\n'), 'utf-8');
  }

  /** Get the latest artifact entry in a specific group */
  private getLatestInGroup(
    groupId: string,
    existingArtifacts: ArtifactEntry[],
  ): ArtifactEntry | null {
    const groupArtifacts = existingArtifacts
      .filter((a) => a.group_id === groupId)
      .sort((a, b) => a.version - b.version);
    if (groupArtifacts.length === 0) return null;
    return groupArtifacts[groupArtifacts.length - 1];
  }
}

/** Factory function */
export function createArtifactManager(projectDir: string): ArtifactManager {
  return new ArtifactManager({ projectDir });
}
