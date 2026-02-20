/**
 * QA_VALIDATION phase — execute QA plan and validate critical paths.
 * Runs tests via checkRunner. Creates qa_validation artifact.
 */

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { resolveCommands } from '../command-resolver.js';
import { runCheck, storeCheckResults } from '../check-runner.js';
import { generateRepoSnapshot } from '../repo-snapshot.js';

export async function runQaValidation(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Resolve test command
    const snapshot = await generateRepoSnapshot(projectDir);
    const commands = resolveCommands(snapshot);
    pipeline.resolvedCommands = commands;

    // 2. Run test command
    if (commands.test) {
      const testResult = await runCheck('test', commands.test, projectDir);
      const stored = storeCheckResults([testResult], artifactManager, 'QA_VALIDATION');
      artifacts.push(...stored);

      // Store in pipeline gate checks
      if (!pipeline.gateChecks['QA_VALIDATION']) {
        pipeline.gateChecks['QA_VALIDATION'] = [];
      }
      pipeline.gateChecks['QA_VALIDATION'].push(testResult);
    }

    // 3. Create QA validation summary artifact
    const qaReport = [
      '# QA Validation Report',
      '',
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Test Command:** ${commands.test ?? 'none'}`,
      `**Test Status:** ${pipeline.gateChecks['QA_VALIDATION']?.[0]?.status ?? 'skip'}`,
      '',
      '## Results',
      '',
      pipeline.gateChecks['QA_VALIDATION']?.map((r) =>
        `- ${r.check_type}: ${r.status} (${r.duration_ms}ms)`,
      ).join('\n') ?? 'No checks run',
    ].join('\n');

    const qaEntry = artifactManager.createAndStoreText(
      'qa_validation',
      qaReport,
      'QA_VALIDATION',
    );
    artifacts.push(qaEntry);

    pipeline.artifacts.push(...artifacts);
    return successResult('QA_VALIDATION', artifacts, 'QA validation complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return failureResult('QA_VALIDATION', 'QA validation failed', message);
  }
}
