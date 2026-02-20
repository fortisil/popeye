/**
 * Constitution management — artifact creation, hashing, and verification.
 * The constitution (skills/POPEYE_CONSTITUTION.md) is the immutable governance
 * document for the pipeline. This module ensures it is tracked as an artifact
 * and its integrity is verified at every gate.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ArtifactEntry, PipelineState } from './types.js';
import type { ArtifactManager } from './artifact-manager.js';

// ─── Constants ───────────────────────────────────────────

const CONSTITUTION_FILENAME = 'POPEYE_CONSTITUTION.md';
const SKILLS_DIR = 'skills';

// ─── Hash Computation ────────────────────────────────────

/**
 * Compute SHA-256 hash of constitution file content.
 *
 * Args:
 *   projectDir: Root project directory containing skills/ folder.
 *
 * Returns:
 *   Hex-encoded SHA-256 hash, or empty string if file not found.
 */
export function computeConstitutionHash(projectDir: string): string {
  const constitutionPath = join(projectDir, SKILLS_DIR, CONSTITUTION_FILENAME);
  if (!existsSync(constitutionPath)) {
    return '';
  }

  const content = readFileSync(constitutionPath, 'utf-8');
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ─── Artifact Creation ───────────────────────────────────

/**
 * Create a constitution artifact from the skills/POPEYE_CONSTITUTION.md file.
 *
 * Args:
 *   projectDir: Root project directory.
 *   artifactManager: The artifact manager instance.
 *
 * Returns:
 *   The created ArtifactEntry, or null if constitution file not found.
 */
export function createConstitutionArtifact(
  projectDir: string,
  artifactManager: ArtifactManager,
): ArtifactEntry | null {
  const constitutionPath = join(projectDir, SKILLS_DIR, CONSTITUTION_FILENAME);
  if (!existsSync(constitutionPath)) {
    return null;
  }

  const content = readFileSync(constitutionPath, 'utf-8');
  return artifactManager.createAndStoreText(
    'constitution',
    content,
    'INTAKE',
  );
}

// ─── Verification ────────────────────────────────────────

/**
 * Verify the constitution file has not been modified since pipeline start.
 * Compares current file hash against the hash stored in pipeline state.
 *
 * Args:
 *   pipeline: Current pipeline state (contains constitutionHash).
 *   projectDir: Root project directory.
 *
 * Returns:
 *   Object with valid=true if hash matches, or valid=false with reason.
 */
export function verifyConstitution(
  pipeline: PipelineState,
  projectDir: string,
): { valid: boolean; reason?: string } {
  // If no hash stored yet (pre-INTAKE), skip verification
  if (!pipeline.constitutionHash) {
    return { valid: true };
  }

  const currentHash = computeConstitutionHash(projectDir);

  if (!currentHash) {
    return {
      valid: false,
      reason: 'Constitution file not found — may have been deleted',
    };
  }

  if (currentHash !== pipeline.constitutionHash) {
    return {
      valid: false,
      reason: 'Constitution has been modified since pipeline start',
    };
  }

  return { valid: true };
}
