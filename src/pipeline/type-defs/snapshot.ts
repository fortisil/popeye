/**
 * Repo snapshot types — project state capture for drift detection.
 */

import { z } from 'zod';

// ─── Config File Entry ───────────────────────────────────

export const ConfigFileEntrySchema = z.object({
  path: z.string(),
  type: z.string(),
  content_hash: z.string(),
  key_fields: z.record(z.string(), z.unknown()),
});
export type ConfigFileEntry = z.infer<typeof ConfigFileEntrySchema>;

// ─── Port Entry ──────────────────────────────────────────

export const PortEntrySchema = z.object({
  port: z.number().int(),
  service: z.string(),
  source: z.string(),
});
export type PortEntry = z.infer<typeof PortEntrySchema>;

// ─── Repo Snapshot ───────────────────────────────────────

export const RepoSnapshotSchema = z.object({
  snapshot_id: z.string(),
  timestamp: z.string(),
  tree_summary: z.string(),
  config_files: z.array(ConfigFileEntrySchema),
  languages_detected: z.array(z.string()),
  package_manager: z.string().optional(),
  scripts: z.record(z.string(), z.string()),
  test_framework: z.string().optional(),
  build_tool: z.string().optional(),
  env_files: z.array(z.string()),
  migrations_present: z.boolean(),
  ports_entrypoints: z.array(PortEntrySchema),
  total_files: z.number().int(),
  total_lines: z.number().int(),
});
export type RepoSnapshot = z.infer<typeof RepoSnapshotSchema>;

// ─── Snapshot Diff ───────────────────────────────────────

/** Diff between two snapshots for drift detection */
export interface SnapshotDiff {
  files_added: string[];
  files_removed: string[];
  configs_changed: string[];
  lines_delta: number;
  has_drift: boolean;
}
