/**
 * Report generation for the audit system.
 *
 * Builds summary + full reports, writes markdown and JSON artifacts
 * to the project's .popeye/ directory.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState } from '../types/workflow.js';
import type {
  AuditCategory,
  AuditFinding,
  AuditModeOptions,
  AuditRecommendation,
  ProjectAuditReport,
  ProjectScanResult,
  ProjectSummaryReport,
  RecoveryPlan,
  SearchMetadata,
} from '../types/audit.js';

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------

/**
 * Build a summary report from the scan result and project state.
 *
 * @param scan - The project scan result.
 * @param state - Current project state.
 * @param aiOverview - Optional AI-generated overview text.
 * @returns A structured summary report.
 */
export function buildSummaryReport(
  scan: ProjectScanResult,
  state: ProjectState,
  aiOverview?: string
): ProjectSummaryReport {
  const depCount = scan.dependencies.reduce((sum, d) => {
    const deps = d.dependencies ? Object.keys(d.dependencies).length : 0;
    const devDeps = d.devDependencies ? Object.keys(d.devDependencies).length : 0;
    return sum + deps + devDeps;
  }, 0);

  return {
    projectName: state.name,
    language: scan.language,
    totalSourceFiles: scan.totalSourceFiles,
    totalTestFiles: scan.totalTestFiles,
    totalLinesOfCode: scan.totalLinesOfCode,
    totalLinesOfTests: scan.totalLinesOfTests,
    componentCount: scan.components.length,
    detectedComposition: [...scan.detectedComposition],
    entryPointCount: scan.entryPoints.length,
    routeCount: scan.routeFiles.length,
    dependencyCount: depCount,
    hasDocker: scan.configFiles.includes('docker-compose.yml')
      || scan.configFiles.includes('docker-compose.yaml')
      || scan.configFiles.includes('Dockerfile'),
    hasEnvExample: !!scan.envExampleContent,
    hasCiConfig: scan.configFiles.some((f) =>
      f.includes('.github') || f.includes('Jenkinsfile') || f.includes('.gitlab-ci')
    ),
    aiOverview,
  };
}

// ---------------------------------------------------------------------------
// Audit report
// ---------------------------------------------------------------------------

/**
 * Derive the overall recommendation from finding counts and score.
 *
 * @param criticalCount - Number of critical findings.
 * @param majorCount - Number of major findings.
 * @param overallScore - The overall audit score (0-100).
 * @param strict - Whether strict mode is enabled.
 * @returns The recommendation string.
 */
function deriveRecommendation(
  criticalCount: number,
  majorCount: number,
  overallScore: number,
  strict: boolean
): AuditRecommendation {
  if (criticalCount >= 3 || overallScore < 50) return 'major-rework';
  if (criticalCount === 0 && (strict ? majorCount === 0 : majorCount <= 2)) return 'pass';
  return 'fix-and-recheck';
}

/**
 * Build the full audit report from all analysis results.
 *
 * @param summary - The summary report.
 * @param findings - All audit findings.
 * @param scores - Overall and category scores.
 * @param searchMeta - Serena search tracking metadata.
 * @param options - Audit options (for strict mode, etc.).
 * @param auditRunId - Unique run identifier.
 * @returns The complete audit report.
 */
export function buildAuditReport(
  summary: ProjectSummaryReport,
  findings: AuditFinding[],
  scores: { overallScore: number; categoryScores: Record<AuditCategory, number> },
  searchMeta: SearchMetadata,
  options: Pick<AuditModeOptions, 'strict'>,
  auditRunId: string
): ProjectAuditReport {
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const majorCount = findings.filter((f) => f.severity === 'major').length;
  const minorCount = findings.filter((f) => f.severity === 'minor').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  // Determine passed checks — categories with no findings
  const categoriesWithFindings = new Set(findings.map((f) => f.category));
  const allCategories: AuditCategory[] = [
    'feature-completeness', 'integration-wiring', 'test-coverage',
    'config-deployment', 'dependency-sanity', 'consistency', 'security', 'documentation',
  ];
  const passedChecks = allCategories
    .filter((c) => !categoriesWithFindings.has(c))
    .map((c) => `${c}: no issues found`);

  return {
    projectName: summary.projectName,
    language: summary.language,
    auditedAt: new Date().toISOString(),
    auditRunId,
    summary,
    findings,
    overallScore: scores.overallScore,
    categoryScores: scores.categoryScores,
    criticalCount,
    majorCount,
    minorCount,
    infoCount,
    passedChecks,
    searchMetadata: searchMeta,
    recommendation: deriveRecommendation(
      criticalCount, majorCount, scores.overallScore, options.strict
    ),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * Render the audit report as a markdown string.
 *
 * @param report - The audit report.
 * @returns Markdown string.
 */
function renderAuditMarkdown(report: ProjectAuditReport): string {
  const lines: string[] = [];

  lines.push(`# Audit Report: ${report.projectName}`);
  lines.push('');
  lines.push(`**Language:** ${report.language}`);
  lines.push(`**Audited:** ${report.auditedAt}`);
  lines.push(`**Run ID:** ${report.auditRunId}`);
  lines.push(`**Overall Score:** ${report.overallScore}/100`);
  lines.push(`**Recommendation:** ${report.recommendation}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Source files | ${report.summary.totalSourceFiles} |`);
  lines.push(`| Test files | ${report.summary.totalTestFiles} |`);
  lines.push(`| Lines of code | ${report.summary.totalLinesOfCode} |`);
  lines.push(`| Lines of tests | ${report.summary.totalLinesOfTests} |`);
  lines.push(`| Components | ${report.summary.componentCount} |`);
  lines.push(`| Entry points | ${report.summary.entryPointCount} |`);
  lines.push(`| Routes | ${report.summary.routeCount} |`);
  lines.push(`| Dependencies | ${report.summary.dependencyCount} |`);
  lines.push('');

  // Category scores
  lines.push('## Category Scores');
  lines.push('');
  for (const [cat, score] of Object.entries(report.categoryScores)) {
    lines.push(`- **${cat}:** ${score}/100`);
  }
  lines.push('');

  // Findings
  lines.push(`## Findings (${report.findings.length} total)`);
  lines.push('');
  lines.push(`- Critical: ${report.criticalCount}`);
  lines.push(`- Major: ${report.majorCount}`);
  lines.push(`- Minor: ${report.minorCount}`);
  lines.push(`- Info: ${report.infoCount}`);
  lines.push('');

  // Group findings by severity
  const severityOrder = ['critical', 'major', 'minor', 'info'] as const;
  for (const sev of severityOrder) {
    const sevFindings = report.findings.filter((f) => f.severity === sev);
    if (sevFindings.length === 0) continue;
    lines.push(`### ${sev.charAt(0).toUpperCase() + sev.slice(1)}`);
    lines.push('');
    for (const f of sevFindings) {
      lines.push(`#### ${f.id}: ${f.title}`);
      lines.push('');
      lines.push(f.description);
      if (f.evidence.length > 0) {
        lines.push('');
        lines.push('**Evidence:**');
        for (const e of f.evidence) {
          const loc = e.line ? `${e.file}:${e.line}` : e.file;
          lines.push(`- \`${loc}\`${e.description ? ` - ${e.description}` : ''}`);
        }
      }
      lines.push('');
      lines.push(`**Recommendation:** ${f.recommendation}`);
      lines.push(`**Auto-fixable:** ${f.autoFixable ? 'Yes' : 'No'}`);
      lines.push('');
    }
  }

  // Passed checks
  if (report.passedChecks.length > 0) {
    lines.push('## Passed Checks');
    lines.push('');
    for (const check of report.passedChecks) {
      lines.push(`- ${check}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render the recovery plan as a markdown string.
 *
 * @param recovery - The recovery plan.
 * @returns Markdown string.
 */
function renderRecoveryMarkdown(recovery: RecoveryPlan): string {
  const lines: string[] = [];

  lines.push('# Recovery Plan');
  lines.push('');
  lines.push(`**Generated:** ${recovery.generatedAt}`);
  lines.push(`**Audit Score:** ${recovery.auditScore}/100`);
  lines.push(`**Run ID:** ${recovery.auditRunId}`);
  lines.push(`**Total Findings:** ${recovery.totalFindings}`);
  lines.push(`**Critical Findings:** ${recovery.criticalFindings}`);
  lines.push(`**Estimated Effort:** ${recovery.estimatedEffort}`);
  lines.push('');

  for (const milestone of recovery.milestones) {
    lines.push(`## ${milestone.name}`);
    lines.push('');
    lines.push(milestone.description);
    lines.push('');

    for (const task of milestone.tasks) {
      lines.push(`### ${task.name} (target: ${task.appTarget})`);
      lines.push('');
      lines.push(task.description);
      lines.push('');
      lines.push('**Finding IDs:** ' + task.findingIds.join(', '));
      lines.push('');
      lines.push('**Acceptance Criteria:**');
      for (const ac of task.acceptanceCriteria) {
        lines.push(`- [ ] ${ac}`);
      }
      if (task.testPlan) {
        lines.push('');
        lines.push(`**Test Plan:** ${task.testPlan}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// File writers
// ---------------------------------------------------------------------------

/**
 * Ensure .popeye directory exists.
 *
 * @param projectDir - Project root directory.
 * @returns Path to .popeye directory.
 */
async function ensurePopeyeDir(projectDir: string): Promise<string> {
  const dir = path.join(projectDir, '.popeye');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Write the audit report as markdown.
 *
 * @param projectDir - Project root directory.
 * @param report - The audit report.
 * @returns Path to the written file.
 */
export async function writeAuditMarkdown(
  projectDir: string,
  report: ProjectAuditReport
): Promise<string> {
  const dir = await ensurePopeyeDir(projectDir);
  const filePath = path.join(dir, 'popeye.audit.md');
  await fs.writeFile(filePath, renderAuditMarkdown(report), 'utf-8');
  return filePath;
}

/**
 * Write the audit report as JSON.
 *
 * @param projectDir - Project root directory.
 * @param report - The audit report.
 * @returns Path to the written file.
 */
export async function writeAuditJson(
  projectDir: string,
  report: ProjectAuditReport
): Promise<string> {
  const dir = await ensurePopeyeDir(projectDir);
  const filePath = path.join(dir, 'popeye.audit.json');
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

/**
 * Write the recovery plan as markdown.
 *
 * @param projectDir - Project root directory.
 * @param recovery - The recovery plan.
 * @returns Path to the written file.
 */
export async function writeRecoveryMarkdown(
  projectDir: string,
  recovery: RecoveryPlan
): Promise<string> {
  const dir = await ensurePopeyeDir(projectDir);
  const filePath = path.join(dir, 'popeye.recovery.md');
  await fs.writeFile(filePath, renderRecoveryMarkdown(recovery), 'utf-8');
  return filePath;
}

/**
 * Write the recovery plan as JSON.
 *
 * @param projectDir - Project root directory.
 * @param recovery - The recovery plan.
 * @returns Path to the written file.
 */
export async function writeRecoveryJson(
  projectDir: string,
  recovery: RecoveryPlan
): Promise<string> {
  const dir = await ensurePopeyeDir(projectDir);
  const filePath = path.join(dir, 'popeye.recovery.json');
  await fs.writeFile(filePath, JSON.stringify(recovery, null, 2), 'utf-8');
  return filePath;
}
