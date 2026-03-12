/**
 * QA_VALIDATION phase — execute QA plan and validate critical paths.
 * Runs tests via checkRunner. Creates qa_validation artifact.
 */

import { join } from 'node:path';

import type { PhaseContext, PhaseResult } from './phase-context.js';
import { successResult, failureResult } from './phase-context.js';
import { resolveCommands } from '../command-resolver.js';
import {
  runCheck,
  storeCheckResults,
  shouldSkipInstall,
  writeInstallMarker,
  invalidateInstallMarker,
} from '../check-runner.js';
import { generateRepoSnapshot } from '../repo-snapshot.js';

export async function runQaValidation(context: PhaseContext): Promise<PhaseResult> {
  const { pipeline, artifactManager, skillLoader, skillUsageRegistry, projectDir } = context;
  const artifacts = [];

  try {
    // 1. Load QA_TESTER skill and record usage
    const { definition: _qaSkill, meta: qaMeta } = skillLoader.loadSkillWithMeta('QA_TESTER');
    skillUsageRegistry.record('QA_TESTER', 'QA_VALIDATION', 'system_prompt', qaMeta.source, qaMeta.version);

    // 2. Resolve test command
    const snapshot = await generateRepoSnapshot(projectDir);
    const commands = resolveCommands(snapshot);
    pipeline.resolvedCommands = commands;

    // 2.5. Install dependencies if needed
    if (commands.install) {
      const installCwd = commands.install_cwd
        ? join(projectDir, commands.install_cwd)
        : projectDir;
      const skipInstall = shouldSkipInstall(projectDir, snapshot);
      if (!skipInstall) {
        const installResult = await runCheck('install', commands.install, installCwd);
        const stored = storeCheckResults([installResult], artifactManager, 'QA_VALIDATION');
        artifacts.push(...stored);

        if (!pipeline.gateChecks['QA_VALIDATION']) {
          pipeline.gateChecks['QA_VALIDATION'] = [];
        }
        pipeline.gateChecks['QA_VALIDATION'].push(installResult);

        if (installResult.status === 'fail') {
          pipeline.artifacts.push(...artifacts);
          return failureResult('QA_VALIDATION', 'Dependency installation failed', installResult.stderr_summary ?? '');
        }

        writeInstallMarker(projectDir, snapshot);
      }
    }

    // 3. Run test command
    if (commands.test) {
      const testResult = await runCheck('test', commands.test, projectDir);
      const stored = storeCheckResults([testResult], artifactManager, 'QA_VALIDATION');
      artifacts.push(...stored);

      // Store in pipeline gate checks
      if (!pipeline.gateChecks['QA_VALIDATION']) {
        pipeline.gateChecks['QA_VALIDATION'] = [];
      }
      pipeline.gateChecks['QA_VALIDATION'].push(testResult);

      // Invalidate install marker on missing-module errors
      if (testResult.status === 'fail' && testResult.stderr_summary) {
        const missingModule = /Cannot find module|ModuleNotFoundError|Failed to resolve import/
          .test(testResult.stderr_summary);
        if (missingModule) {
          invalidateInstallMarker(projectDir);
        }
      }
    }

    // 4. Create QA validation summary artifact
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
