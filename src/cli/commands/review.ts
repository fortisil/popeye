/**
 * CLI command: popeye review
 *
 * Runs a post-build audit/review of the project, producing a structured
 * report with findings and optional recovery tasks.
 *
 * Pattern follows doctor.ts command factory.
 */

import { Command } from 'commander';
import path from 'node:path';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printKeyValue,
  printSection,
} from '../output.js';
import { runAuditMode, type AuditModeRunOptions } from '../../workflow/audit-mode.js';
import type { AuditModeResult, ComponentKind } from '../../types/audit.js';

// ---------------------------------------------------------------------------
// Run audit (exported for testability + slash command reuse)
// ---------------------------------------------------------------------------

/**
 * Execute the audit and print results to the console.
 *
 * @param projectDir - Absolute path to the project directory.
 * @param options - CLI options.
 * @returns The audit result.
 */
export async function runReview(
  projectDir: string,
  options: {
    depth?: number;
    strict?: boolean;
    format?: 'json' | 'md' | 'both';
    recover?: boolean;
    target?: string;
  } = {}
): Promise<AuditModeResult> {
  printHeader('Project Audit / Review');

  const auditOptions: AuditModeRunOptions = {
    projectDir,
    depth: options.depth ?? 2,
    runTests: true,
    strict: options.strict ?? false,
    format: options.format ?? 'both',
    autoRecover: options.recover ?? true,
    target: (options.target ?? 'all') as 'all' | ComponentKind,
    onProgress: (stage, message) => {
      printInfo(`[${stage}] ${message}`);
    },
  };

  const result = await runAuditMode(auditOptions);

  if (!result.success) {
    printError(`Audit failed: ${result.error}`);
    return result;
  }

  // Print summary
  console.log();
  printSection('Summary');
  printKeyValue('Project', result.summary.projectName);
  printKeyValue('Language', result.summary.language);
  printKeyValue('Source files', result.summary.totalSourceFiles);
  printKeyValue('Test files', result.summary.totalTestFiles);
  printKeyValue('Lines of code', result.summary.totalLinesOfCode);
  printKeyValue('Components', result.summary.componentCount);

  // Print score
  console.log();
  printSection('Audit Score');
  const score = result.audit.overallScore;
  if (score >= 80) {
    printSuccess(`Overall: ${score}/100`);
  } else if (score >= 60) {
    printWarning(`Overall: ${score}/100`);
  } else {
    printError(`Overall: ${score}/100`);
  }

  // Print finding counts
  if (result.audit.criticalCount > 0) {
    printError(`Critical: ${result.audit.criticalCount}`);
  }
  if (result.audit.majorCount > 0) {
    printWarning(`Major: ${result.audit.majorCount}`);
  }
  if (result.audit.minorCount > 0) {
    printInfo(`Minor: ${result.audit.minorCount}`);
  }
  if (result.audit.infoCount > 0) {
    printInfo(`Info: ${result.audit.infoCount}`);
  }

  // Recommendation
  console.log();
  const rec = result.audit.recommendation;
  if (rec === 'pass') {
    printSuccess(`Recommendation: ${rec}`);
  } else if (rec === 'fix-and-recheck') {
    printWarning(`Recommendation: ${rec}`);
  } else {
    printError(`Recommendation: ${rec}`);
  }

  // Report paths
  if (Object.keys(result.reportPaths).length > 0) {
    console.log();
    printSection('Reports');
    if (result.reportPaths.auditMd) {
      printInfo(`Markdown: ${result.reportPaths.auditMd}`);
    }
    if (result.reportPaths.auditJson) {
      printInfo(`JSON: ${result.reportPaths.auditJson}`);
    }
    if (result.reportPaths.recoveryMd) {
      printWarning(`Recovery plan: ${result.reportPaths.recoveryMd}`);
    }
  }

  // Recovery info
  if (result.recovery) {
    console.log();
    printSection('Recovery Plan');
    printWarning(
      `${result.recovery.milestones.length} recovery milestone(s), estimated ${result.recovery.estimatedEffort}`
    );
    if (auditOptions.autoRecover) {
      printSuccess('Recovery milestones injected — run /resume to execute.');
    } else {
      printInfo('Run without --no-recover to auto-inject recovery milestones.');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Commander command factory
// ---------------------------------------------------------------------------

/**
 * Create the `popeye review` CLI command.
 *
 * @returns Commander command instance.
 */
export function createReviewCommand(): Command {
  const cmd = new Command('review')
    .alias('audit')
    .description('Run a post-build audit/review of the project')
    .argument('[directory]', 'Project directory', '.')
    .option('-d, --depth <level>', 'Audit depth: 1=shallow, 2=standard, 3=deep', '2')
    .option('-s, --strict', 'Enable strict mode (higher standards)', false)
    .option('-f, --format <type>', 'Output format: json, md, both', 'both')
    .option('--no-recover', 'Skip auto-injection of recovery milestones')
    .option('-t, --target <kind>', 'Audit target: all, frontend, backend, website', 'all')
    .action(async (directory: string, opts: Record<string, string | boolean>) => {
      const projectDir = path.resolve(directory);

      try {
        const result = await runReview(projectDir, {
          depth: parseInt(opts.depth as string, 10),
          strict: opts.strict as boolean,
          format: opts.format as 'json' | 'md' | 'both',
          recover: opts.recover as boolean,
          target: opts.target as string,
        });

        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : 'Audit failed');
        process.exit(1);
      }
    });

  return cmd;
}
