/**
 * Artifact Completeness Validators — deterministic structural checks.
 * Runs BEFORE LLM review in consensus phases to catch obvious issues.
 * Each validator checks for required sections, minimum content length,
 * and structural integrity specific to its artifact type.
 */

import type { ArtifactType } from './types.js';

// ─── Types ───────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Section Patterns ────────────────────────────────────

/** Regex patterns for detecting markdown sections (case-insensitive) */
function hasSection(content: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(content));
}

function findMissingSections(
  content: string,
  required: { name: string; patterns: RegExp[] }[],
): string[] {
  const missing: string[] = [];
  for (const { name, patterns } of required) {
    if (!hasSection(content, patterns)) {
      missing.push(name);
    }
  }
  return missing;
}

// ─── Per-Type Validators ─────────────────────────────────

function validateMasterPlan(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (content.length < 200) {
    errors.push('Master plan is too short (min 200 characters)');
  }

  const missing = findMissingSections(content, [
    { name: 'Goals/Objectives', patterns: [/#+\s*(goals?|objectives?)/i, /\bgoals?\b.*:/i] },
    { name: 'Milestones', patterns: [/#+\s*milestones?/i, /\bmilestone\s+\d/i] },
    { name: 'Success Criteria', patterns: [/#+\s*success\s+criteria/i, /\bsuccess\s+criteria\b/i, /#+\s*acceptance\s+criteria/i] },
  ]);

  for (const section of missing) {
    errors.push(`Missing required section: ${section}`);
  }

  // Check for empty sections (heading followed by another heading or end)
  const emptyHeadings = content.match(/^(#+\s+.+)\n(?=#+\s+|\s*$)/gm);
  if (emptyHeadings && emptyHeadings.length > 2) {
    warnings.push(`${emptyHeadings.length} potentially empty sections detected`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateArchitecture(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (content.length < 200) {
    errors.push('Architecture document is too short (min 200 characters)');
  }

  const missing = findMissingSections(content, [
    { name: 'Components/Modules', patterns: [/#+\s*(components?|modules?|services?)/i, /\bcomponent\b/i] },
    { name: 'Data Flow/Contracts', patterns: [/#+\s*(data\s+flow|contracts?|api|interfaces?)/i, /\bcontract\b/i, /\bdata\s+flow\b/i] },
    { name: 'Tech Stack', patterns: [/#+\s*(tech\s+stack|technology|stack)/i, /\btech\s+stack\b/i] },
  ]);

  for (const section of missing) {
    errors.push(`Missing required section: ${section}`);
  }

  // Must reference at least one file path
  const hasFilePath = /(?:src\/|app\/|pages\/|lib\/|\.ts|\.js|\.py|\.go)/.test(content);
  if (!hasFilePath) {
    warnings.push('Architecture should reference at least one file path');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateRolePlan(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (content.length < 100) {
    errors.push('Role plan is too short (min 100 characters)');
  }

  const missing = findMissingSections(content, [
    { name: 'Tasks/Responsibilities', patterns: [/#+\s*(tasks?|responsibilities?|work\s+items?)/i, /\btask\b/i] },
    { name: 'Dependencies', patterns: [/#+\s*(dependenc|prerequisites?|requires?)/i, /\bdepend/i] },
    { name: 'Acceptance Criteria', patterns: [/#+\s*(acceptance|done\s+when|completion)/i, /\bacceptance\b/i, /\bdone\s+when\b/i] },
  ]);

  for (const section of missing) {
    errors.push(`Missing required section: ${section}`);
  }

  // Should reference a role name
  const rolePatterns = /\b(DISPATCHER|ARCHITECT|DB_EXPERT|BACKEND|FRONTEND|WEBSITE|QA_TESTER|REVIEWER|AUDITOR|JOURNALIST)\b/i;
  if (!rolePatterns.test(content)) {
    warnings.push('Role plan should reference the role name');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateQaValidation(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const missing = findMissingSections(content, [
    { name: 'Test Results', patterns: [/#+\s*(test\s+results?|results?)/i, /\btest\s+results?\b/i, /\bpass(?:ed|ing)?\b/i] },
    { name: 'Coverage', patterns: [/#+\s*coverage/i, /\bcoverage\b/i, /\d+\s*%/] },
  ]);

  for (const section of missing) {
    errors.push(`Missing required section: ${section}`);
  }

  // Should contain pass/fail counts
  const hasPassFail = /\b\d+\s*(pass|fail|error|skip)/i.test(content);
  if (!hasPassFail) {
    warnings.push('QA validation should include pass/fail counts');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAuditReport(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Try JSON parsing
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.findings)) {
      errors.push('Audit report must have a "findings" array');
    }
    if (typeof parsed.overall_status !== 'string') {
      errors.push('Audit report must have "overall_status"');
    }
    if (typeof parsed.system_risk_score !== 'number') {
      errors.push('Audit report must have "system_risk_score"');
    }
  } catch {
    // Not JSON — check for markdown-style audit
    if (!content.includes('findings') && !content.includes('finding')) {
      errors.push('Audit report must contain findings');
    }
    if (!content.includes('status') && !content.includes('PASS') && !content.includes('FAIL')) {
      errors.push('Audit report must contain overall status');
    }
    if (!content.includes('risk') && !content.includes('score')) {
      warnings.push('Audit report should include risk score');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Validator Registry ──────────────────────────────────

const VALIDATORS: Partial<Record<ArtifactType, (content: string) => ValidationResult>> = {
  master_plan: validateMasterPlan,
  architecture: validateArchitecture,
  role_plan: validateRolePlan,
  qa_validation: validateQaValidation,
  audit_report: validateAuditReport,
};

// ─── Public API ──────────────────────────────────────────

/**
 * Validate artifact content completeness based on type-specific rules.
 * Returns a ValidationResult with errors (blocking) and warnings (non-blocking).
 *
 * Args:
 *   type: The artifact type to validate against.
 *   content: The artifact content string.
 *
 * Returns:
 *   ValidationResult with valid flag, errors, and warnings.
 */
export function validateArtifactCompleteness(
  type: ArtifactType,
  content: string,
): ValidationResult {
  const validator = VALIDATORS[type];
  if (!validator) {
    // No validator for this type — pass by default
    return { valid: true, errors: [], warnings: [] };
  }

  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      errors: [`${type} artifact has empty content`],
      warnings: [],
    };
  }

  return validator(content);
}

/**
 * Get all artifact types that have validators.
 */
export function getValidatableArtifactTypes(): ArtifactType[] {
  return Object.keys(VALIDATORS) as ArtifactType[];
}
