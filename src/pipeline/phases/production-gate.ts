/**
 * PRODUCTION_GATE phase — binary PASS/FAIL production-ready decision.
 * Uses commandResolver + checkRunner. Runs placeholder scan (P2-2).
 * v1.1: Adds start check and env check.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult, triggerJournalist } from './phase-context.js';
import { resolveCommands } from '../command-resolver.js';
import { runAllChecks, runPlaceholderScan, runStartCheck, runEnvCheck, storeCheckResults } from '../check-runner.js';
import { generateRepoSnapshot } from '../repo-snapshot.js';

export async function runProductionGate(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Resolve commands from snapshot
    const snapshot = await generateRepoSnapshot(projectDir);
    const commands = resolveCommands(snapshot);
    pipeline.resolvedCommands = commands;

    // 2. Run all checks
    const checkResults = await runAllChecks(commands, projectDir);

    // 3. Run placeholder scan (P2-2)
    const placeholderResult = runPlaceholderScan(projectDir);
    checkResults.push(placeholderResult);

    // 4. Run env check (v1.1)
    const envResult = runEnvCheck(projectDir, snapshot);
    checkResults.push(envResult);

    // 5. Run start check if start command exists (v1.1)
    if (commands.start) {
      const startResult = await runStartCheck(commands.start, projectDir, {
        port: snapshot.ports_entrypoints[0]?.port,
      });
      checkResults.push(startResult);
    }

    // 6. Store check results as artifacts
    const checkArtifacts = storeCheckResults(checkResults, artifactManager, 'PRODUCTION_GATE');
    artifacts.push(...checkArtifacts);

    // 7. Store in pipeline gate checks
    pipeline.gateChecks['PRODUCTION_GATE'] = checkResults;

    // 8. Determine PASS/FAIL
    const failedChecks = checkResults.filter(
      (r) => r.status === 'fail' && r.check_type !== 'placeholder_scan',
    );
    const hasPlaceholders = placeholderResult.status === 'fail';
    const auditPassed = pipeline.artifacts.some((a) => a.type === 'audit_report');
    const passed = failedChecks.length === 0 && auditPassed;

    // 9. Create production readiness report
    const report = [
      '# Production Readiness Report',
      '',
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Verdict:** ${passed ? 'PASS' : 'FAIL'}`,
      '',
      '## Check Results',
      '',
      ...checkResults.map((r) =>
        `- **${r.check_type}**: ${r.status} ${r.duration_ms > 0 ? `(${r.duration_ms}ms)` : ''}`,
      ),
      '',
      hasPlaceholders ? '## Warning: Placeholder content detected\n' + (placeholderResult.stderr_summary ?? '') : '',
      '',
      '## Gate Status',
      `- Build: ${findCheckStatus(checkResults, 'build')}`,
      `- Tests: ${findCheckStatus(checkResults, 'test')}`,
      `- Lint: ${findCheckStatus(checkResults, 'lint')}`,
      `- Typecheck: ${findCheckStatus(checkResults, 'typecheck')}`,
      `- Env: ${findCheckStatus(checkResults, 'env_check')}`,
      `- Start: ${findCheckStatus(checkResults, 'start')}`,
      `- Audit: ${auditPassed ? 'PASS' : 'MISSING'}`,
      `- Placeholders: ${hasPlaceholders ? 'WARNING' : 'CLEAN'}`,
    ].join('\n');

    const reportEntry = artifactManager.createAndStoreText(
      'production_readiness',
      report,
      'PRODUCTION_GATE',
    );
    artifacts.push(reportEntry);

    pipeline.artifacts.push(...artifacts);

    // 10. Journalist trigger
    await triggerJournalist('PRODUCTION_GATE', artifacts, context);

    return successResult(
      'PRODUCTION_GATE',
      artifacts,
      passed ? 'Production Gate PASS' : `Production Gate FAIL: ${failedChecks.length} failed checks`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('PRODUCTION_GATE', 'Production gate failed', message);
  }
}

function findCheckStatus(
  results: { check_type: string; status: string }[],
  type: string,
): string {
  const r = results.find((c) => c.check_type === type);
  if (!r) return 'SKIP';
  return r.status.toUpperCase();
}
