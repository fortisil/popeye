/**
 * Recovery system for the audit feature.
 *
 * Evidence-based trigger logic, finding-to-milestone conversion,
 * and safe state injection for recovery execution.
 */

import { addMilestones, updateState } from '../state/index.js';
import type { Milestone, ProjectState, Task } from '../types/workflow.js';
import type {
  AuditFinding,
  ComponentKind,
  ProjectAuditReport,
  RecoveryMilestone,
  RecoveryPlan,
  RecoveryTask,
} from '../types/audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECOVERY_PREFIX = '[RECOVERY]';
const ACTIONABLE_CATEGORIES = new Set([
  'integration-wiring',
  'test-coverage',
  'config-deployment',
]);
const DEFAULT_SCORE_THRESHOLD = 70;

// ---------------------------------------------------------------------------
// Trigger logic
// ---------------------------------------------------------------------------

/**
 * Determine if recovery should be triggered based on evidence in the report.
 *
 * Trigger conditions (any one suffices):
 * - criticalCount > 0
 * - strict mode AND majorCount > 0
 * - overallScore < threshold AND at least one finding is autoFixable
 *   or belongs to an actionable category
 *
 * Does NOT trigger on info-only or purely cosmetic issues.
 *
 * @param report - The audit report.
 * @param strict - Whether strict mode is active.
 * @returns True if recovery should be triggered.
 */
export function shouldTriggerRecovery(
  report: ProjectAuditReport,
  strict: boolean
): boolean {
  if (report.criticalCount > 0) return true;
  if (strict && report.majorCount > 0) return true;

  if (report.overallScore < DEFAULT_SCORE_THRESHOLD) {
    const hasActionable = report.findings.some(
      (f) => f.autoFixable || ACTIONABLE_CATEGORIES.has(f.category)
    );
    if (hasActionable) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Recovery plan generation
// ---------------------------------------------------------------------------

/**
 * Infer the target component from a finding's evidence file paths.
 *
 * @param finding - An audit finding.
 * @returns The most likely component kind.
 */
function inferAppTarget(finding: AuditFinding): ComponentKind {
  const paths = finding.evidence.map((e) => e.file);
  for (const p of paths) {
    if (p.includes('frontend') || p.includes('web') || p.includes('client')) return 'frontend';
    if (p.includes('backend') || p.includes('api') || p.includes('server')) return 'backend';
    if (p.includes('website') || p.includes('landing')) return 'website';
    if (p.includes('infra') || p.includes('docker') || p.includes('deploy')) return 'infra';
  }

  // Reason: Fall back based on category
  if (finding.category === 'integration-wiring') return 'backend';
  if (finding.category === 'test-coverage') return 'shared';
  if (finding.category === 'config-deployment') return 'infra';
  return 'shared';
}

/**
 * Convert a finding into a recovery task.
 *
 * @param finding - An audit finding.
 * @returns A recovery task.
 */
function findingToRecoveryTask(finding: AuditFinding): RecoveryTask {
  return {
    name: finding.title,
    description: `${finding.description}\n\nRecommendation: ${finding.recommendation}`,
    findingIds: [finding.id],
    acceptanceCriteria: [
      finding.recommendation,
      `Verify finding ${finding.id} is resolved`,
    ],
    testPlan: finding.category === 'test-coverage'
      ? 'Add missing tests and verify they pass'
      : undefined,
    appTarget: inferAppTarget(finding),
  };
}

/**
 * Generate a recovery plan from audit report findings.
 *
 * Groups findings into milestones by severity:
 * - Critical -> [RECOVERY] Critical Fixes
 * - Major -> [RECOVERY] Major Improvements (grouped by category)
 * - Minor + autoFixable -> [RECOVERY] Polish
 *
 * @param report - The audit report.
 * @returns A structured recovery plan.
 */
export function generateRecoveryPlan(report: ProjectAuditReport): RecoveryPlan {
  const milestones: RecoveryMilestone[] = [];

  // Critical findings -> separate milestone
  const criticalFindings = report.findings.filter((f) => f.severity === 'critical');
  if (criticalFindings.length > 0) {
    milestones.push({
      name: `${RECOVERY_PREFIX} Critical Fixes`,
      description: 'Address all critical audit findings that block production readiness.',
      tasks: criticalFindings.map(findingToRecoveryTask),
    });
  }

  // Major findings -> grouped by category
  const majorFindings = report.findings.filter((f) => f.severity === 'major');
  if (majorFindings.length > 0) {
    // Group by category
    const byCategory = new Map<string, AuditFinding[]>();
    for (const f of majorFindings) {
      const existing = byCategory.get(f.category) ?? [];
      existing.push(f);
      byCategory.set(f.category, existing);
    }

    const majorTasks: RecoveryTask[] = [];
    for (const [, findings] of byCategory) {
      majorTasks.push(...findings.map(findingToRecoveryTask));
    }

    milestones.push({
      name: `${RECOVERY_PREFIX} Major Improvements`,
      description: 'Address major audit findings that significantly affect quality.',
      tasks: majorTasks,
    });
  }

  // Minor + autoFixable -> polish milestone
  const polishFindings = report.findings.filter(
    (f) => f.severity === 'minor' && f.autoFixable
  );
  if (polishFindings.length > 0) {
    milestones.push({
      name: `${RECOVERY_PREFIX} Polish`,
      description: 'Address minor auto-fixable findings for polish.',
      tasks: polishFindings.map(findingToRecoveryTask),
    });
  }

  // Estimate effort based on finding count and severity
  const effortHours = criticalFindings.length * 2 + majorFindings.length * 1 + polishFindings.length * 0.5;
  const estimatedEffort = effortHours <= 2
    ? '1-2 hours'
    : effortHours <= 8
      ? `${Math.ceil(effortHours / 2)}-${Math.ceil(effortHours)} hours`
      : `${Math.ceil(effortHours / 8)} days`;

  return {
    generatedAt: new Date().toISOString(),
    auditScore: report.overallScore,
    auditRunId: report.auditRunId,
    totalFindings: report.findings.length,
    criticalFindings: report.criticalCount,
    milestones,
    estimatedEffort,
  };
}

// ---------------------------------------------------------------------------
// Recovery -> milestone conversion
// ---------------------------------------------------------------------------

/**
 * Convert a recovery plan into milestone objects compatible with addMilestones().
 *
 * Each recovery milestone becomes an Omit<Milestone, 'id'> with tasks
 * that have the standard Task shape.
 *
 * @param recovery - The recovery plan.
 * @param language - Project language (for task context).
 * @returns Array of milestone objects ready for addMilestones().
 */
export function recoveryToMilestones(
  recovery: RecoveryPlan,
  _language: string
): Omit<Milestone, 'id'>[] {
  return recovery.milestones.map((rm) => ({
    name: rm.name,
    description: rm.description,
    status: 'pending' as const,
    tasks: rm.tasks.map((rt): Task => ({
      id: '', // Reason: addMilestones() auto-assigns IDs
      name: rt.name,
      description: buildTaskDescription(rt),
      status: 'pending' as const,
    })),
  }));
}

/**
 * Build a detailed task description for execution.
 *
 * @param task - Recovery task.
 * @param language - Project language.
 * @returns Formatted description string.
 */
function buildTaskDescription(task: RecoveryTask): string {
  const parts = [task.description];

  parts.push(`\nTarget component: ${task.appTarget}`);
  parts.push(`Related findings: ${task.findingIds.join(', ')}`);

  if (task.acceptanceCriteria.length > 0) {
    parts.push('\nAcceptance criteria:');
    for (const ac of task.acceptanceCriteria) {
      parts.push(`- ${ac}`);
    }
  }

  if (task.testPlan) {
    parts.push(`\nTest plan: ${task.testPlan}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// State injection
// ---------------------------------------------------------------------------

/**
 * Inject recovery milestones into the project state.
 *
 * This APPENDS recovery milestones — it never clobbers existing milestones.
 * Milestone names are prefixed with [RECOVERY] for visibility.
 * Sets audit tracking fields and switches phase to 'execution'.
 *
 * @param projectDir - Project root directory.
 * @param milestones - Recovery milestones (without IDs).
 * @param auditRunId - The audit run identifier for lineage.
 * @returns Updated project state.
 */
export async function injectRecoveryIntoState(
  projectDir: string,
  milestones: Omit<Milestone, 'id'>[],
  auditRunId: string
): Promise<ProjectState> {
  // Reason: addMilestones appends to existing milestones, no clobbering
  await addMilestones(projectDir, milestones);

  const updatedState = await updateState(projectDir, {
    phase: 'execution',
    status: 'in-progress',
    auditRecoveryInProgress: true,
    auditRunId,
    auditLastRunAt: new Date().toISOString(),
  } as Partial<ProjectState>);

  return updatedState;
}
