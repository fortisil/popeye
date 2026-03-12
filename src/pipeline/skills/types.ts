/**
 * Type definitions for project-specific skill and constitution generation.
 */

import type { OutputLanguage } from '../../types/project.js';
import type { PipelineRole, RepoSnapshot } from '../types.js';

// ─── Tech Stack ─────────────────────────────────────────

export interface TechStack {
  backend?: string;
  frontend?: string;
  database?: string;
  orm?: string;
  testing?: string;
  language?: string;
}

// ─── Skill Generation Context ───────────────────────────

export interface SkillGenerationContext {
  language: OutputLanguage;
  expandedSpec: string;
  snapshot: RepoSnapshot;
  userDocs?: string;
  sessionGuidance?: string;
  brandContext?: { logoPath?: string; primaryColor?: string };
  activeRoles: PipelineRole[];
  skillsDir: string;
  projectName: string;
}

// ─── Constitution Context ───────────────────────────────

export interface ConstitutionContext {
  language: OutputLanguage;
  projectName: string;
  techStack: TechStack;
  expandedSpec: string;
  sessionGuidance?: string;
  brandContext?: { logoPath?: string; primaryColor?: string };
  skillsDir: string;
}

// ─── Marker File ────────────────────────────────────────

export interface SkillsGenerationMarker {
  timestamp: string;
  pipelineVersion: string;
  activeRoles: string[];
  techStack: TechStack;
  aiGenerated: boolean;
}
