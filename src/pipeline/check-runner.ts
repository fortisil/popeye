/**
 * Check Runner — executes build/test/lint/typecheck commands
 * and produces GateCheckResult artifacts.
 *
 * Safety: command sanitization, cwd enforcement, stream caps,
 * configurable timeouts (P2-G).
 */

import { exec } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

import type {
  GateCheckResult,
  GateCheckType,
  ResolvedCommands,
  RepoSnapshot,
  ArtifactEntry,
  PipelinePhase,
} from './types.js';
import { ArtifactManager } from './artifact-manager.js';

// ─── Constants ───────────────────────────────────────────

/** Default timeout per check type in milliseconds */
const DEFAULT_TIMEOUTS: Record<string, number> = {
  build: 20 * 60 * 1000,    // 20 minutes
  test: 10 * 60 * 1000,     // 10 minutes
  lint: 5 * 60 * 1000,      // 5 minutes
  typecheck: 5 * 60 * 1000, // 5 minutes
  migration: 5 * 60 * 1000, // 5 minutes
};

/** Max stdout/stderr capture in bytes */
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1 MB

/** Dangerous command patterns to reject */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s+/,
  />\s*\/dev\//,
  />\s*\/etc\//,
  />\s*\/usr\//,
  /;\s*rm\s/,
  /&&\s*rm\s/,
  /\|\s*sh$/,
  /\|\s*bash$/,
];

/** Placeholder patterns for scanning */
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bHACK\b/i,
  /\bXXX\b/i,
  /placeholder/i,
  /\bmock\b(?!\.)/i,   // 'mock' but not 'mock.'  (import paths)
  /\btemp\b(?!late)/i, // 'temp' but not 'template'
  /lorem ipsum/i,
  /example\.com/i,
];

// ─── Command Sanitization ────────────────────────────────

function sanitizeCommand(command: string): { safe: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Matches dangerous pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

// ─── Check Execution ─────────────────────────────────────

/** Execute a single check command */
export async function runCheck(
  checkType: GateCheckType,
  command: string,
  projectDir: string,
  timeoutOverride?: number,
): Promise<GateCheckResult> {
  const startTime = Date.now();

  // Sanitize command
  const { safe, reason } = sanitizeCommand(command);
  if (!safe) {
    return {
      check_type: checkType,
      status: 'fail',
      command,
      exit_code: -1,
      stderr_summary: `Command rejected: ${reason}`,
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const timeout = timeoutOverride ?? DEFAULT_TIMEOUTS[checkType] ?? 5 * 60 * 1000;

  return new Promise<GateCheckResult>((resolve) => {
    const proc = exec(command, {
      cwd: projectDir,
      timeout,
      maxBuffer: MAX_OUTPUT_SIZE,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CI: 'true',
      },
    }, (error, _stdout, stderr) => {
      const duration = Date.now() - startTime;
      const exitCode = error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0;

      // Truncate output for summary
      const stderrSummary = stderr
        ? stderr.slice(0, 2000) + (stderr.length > 2000 ? '\n... (truncated)' : '')
        : undefined;

      resolve({
        check_type: checkType,
        status: exitCode === 0 ? 'pass' : 'fail',
        command,
        exit_code: typeof exitCode === 'number' ? exitCode : 1,
        stdout_artifact: undefined,  // Filled by storeCheckResults if needed
        stderr_summary: stderrSummary,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
    });

    // Safety: kill after timeout (backup for exec timeout)
    setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
    }, timeout + 5000);
  });
}

/** Run all applicable checks based on resolved commands */
export async function runAllChecks(
  resolvedCommands: ResolvedCommands,
  projectDir: string,
): Promise<GateCheckResult[]> {
  const results: GateCheckResult[] = [];
  const checkMap: [GateCheckType, string | undefined][] = [
    ['build', resolvedCommands.build],
    ['test', resolvedCommands.test],
    ['lint', resolvedCommands.lint],
    ['typecheck', resolvedCommands.typecheck],
    ['migration', resolvedCommands.migrations],
  ];

  for (const [checkType, command] of checkMap) {
    if (!command) {
      results.push({
        check_type: checkType,
        status: 'skip',
        command: '',
        exit_code: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const result = await runCheck(checkType, command, projectDir);
    results.push(result);
  }

  return results;
}

/** Store check results as artifacts */
export function storeCheckResults(
  results: GateCheckResult[],
  artifactManager: ArtifactManager,
  phase: PipelinePhase,
): ArtifactEntry[] {
  const artifacts: ArtifactEntry[] = [];

  for (const result of results) {
    if (result.status === 'skip') continue;

    // Only store meaningful output
    const content = JSON.stringify(result, null, 2);
    if (content.length > 100) {
      const entry = artifactManager.createAndStoreJson(
        mapCheckTypeToArtifactType(result.check_type),
        result,
        phase,
      );
      artifacts.push(entry);
    }
  }

  return artifacts;
}

function mapCheckTypeToArtifactType(
  checkType: GateCheckType,
): 'build_check' | 'test_check' | 'lint_check' | 'typecheck_check' | 'placeholder_scan' {
  switch (checkType) {
    case 'build': return 'build_check';
    case 'test': return 'test_check';
    case 'lint': return 'lint_check';
    case 'typecheck': return 'typecheck_check';
    case 'placeholder_scan': return 'placeholder_scan';
    default: return 'build_check';
  }
}

// ─── Placeholder Scanner (P2-2) ──────────────────────────

/** Scan project for placeholder/TODO/mock content */
export function runPlaceholderScan(
  projectDir: string,
  allowlistPath?: string,
): GateCheckResult {
  const startTime = Date.now();
  const findings: string[] = [];

  // Load allowlist if present
  const allowlist = loadAllowlist(
    allowlistPath ?? join(projectDir, '.popeye-placeholder-allowlist'),
  );

  // Scan source directories
  const scanDirs = ['src', 'app', 'pages', 'components', 'lib', 'server', 'api'];

  for (const dir of scanDirs) {
    const fullDir = join(projectDir, dir);
    if (!existsSync(fullDir)) continue;
    scanDirForPlaceholders(fullDir, projectDir, allowlist, findings);
  }

  const duration = Date.now() - startTime;

  return {
    check_type: 'placeholder_scan',
    status: findings.length > 0 ? 'fail' : 'pass',
    command: 'placeholder-scan',
    exit_code: findings.length > 0 ? 1 : 0,
    stderr_summary: findings.length > 0
      ? `Found ${findings.length} placeholder(s):\n${findings.slice(0, 20).join('\n')}`
      : undefined,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
  };
}

function scanDirForPlaceholders(
  dir: string,
  projectDir: string,
  allowlist: Set<string>,
  findings: string[],
): void {
  const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirForPlaceholders(fullPath, projectDir, allowlist, findings);
      } else if (codeExts.has(extname(entry.name))) {
        const relativePath = fullPath.replace(projectDir + '/', '');
        if (allowlist.has(relativePath)) continue;

        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            for (const pattern of PLACEHOLDER_PATTERNS) {
              if (pattern.test(lines[i])) {
                findings.push(`${relativePath}:${i + 1}: ${lines[i].trim().slice(0, 80)}`);
                break; // One finding per line
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

function loadAllowlist(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  try {
    const content = readFileSync(path, 'utf-8');
    return new Set(
      content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
    );
  } catch {
    return new Set();
  }
}

// ─── Start Check (v1.1 Gap #5) ──────────────────────────

/**
 * Attempt to start the application and verify it does not crash immediately.
 * Optionally checks a health endpoint if a port is detected.
 *
 * Args:
 *   startCommand: The command to start the app (e.g., "npm run start").
 *   projectDir: Project root directory.
 *   options: Optional port, health path, and timeout.
 *
 * Returns:
 *   GateCheckResult with pass/fail status.
 */
export async function runStartCheck(
  startCommand: string,
  projectDir: string,
  options?: { port?: number; healthPath?: string; timeoutMs?: number },
): Promise<GateCheckResult> {
  const startTime = Date.now();
  const timeout = options?.timeoutMs ?? 15000;

  // Sanitize command
  const { safe, reason } = sanitizeCommand(startCommand);
  if (!safe) {
    return {
      check_type: 'start',
      status: 'fail',
      command: startCommand,
      exit_code: -1,
      stderr_summary: `Command rejected: ${reason}`,
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    };
  }

  return new Promise<GateCheckResult>((resolve) => {
    let stderr = '';
    let resolved = false;

    const proc = exec(startCommand, {
      cwd: projectDir,
      timeout: timeout + 5000,
      maxBuffer: MAX_OUTPUT_SIZE,
      env: { ...process.env, NODE_ENV: 'production' },
    }, (error, _stdout, stderrOutput) => {
      if (resolved) return;
      resolved = true;

      const duration = Date.now() - startTime;
      stderr = stderrOutput ?? '';

      // Process exited — if it exited within timeout, it crashed
      resolve({
        check_type: 'start',
        status: 'fail',
        command: startCommand,
        exit_code: error ? (typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
          ? (error as NodeJS.ErrnoException & { code?: number }).code!
          : 1) : 0,
        stderr_summary: stderr ? stderr.slice(0, 2000) : 'Process exited prematurely',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
    });

    // If process survives for the timeout period, consider it passing
    setTimeout(() => {
      if (resolved) return;
      resolved = true;

      // Kill the process
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }

      const duration = Date.now() - startTime;
      resolve({
        check_type: 'start',
        status: 'pass',
        command: startCommand,
        exit_code: 0,
        stderr_summary: stderr ? stderr.slice(0, 500) : undefined,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
    }, timeout);
  });
}

// ─── Env Check (v1.1 Gap #5) ────────────────────────────

/**
 * Validate that required environment variables exist.
 * Reads .env.example for required var names and checks .env has them set.
 *
 * Args:
 *   projectDir: Project root directory.
 *   _snapshot: Repo snapshot (for future use).
 *
 * Returns:
 *   GateCheckResult with pass/fail status.
 */
export function runEnvCheck(
  projectDir: string,
  _snapshot?: RepoSnapshot,
): GateCheckResult {
  const startTime = Date.now();
  const examplePath = join(projectDir, '.env.example');
  const envPath = join(projectDir, '.env');
  const missingVars: string[] = [];
  const emptyVars: string[] = [];

  // If no .env.example, skip check
  if (!existsSync(examplePath)) {
    return {
      check_type: 'env_check',
      status: 'pass',
      command: 'env-check',
      exit_code: 0,
      stderr_summary: 'No .env.example found — skipping env validation',
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Parse .env.example for required var names
  const exampleContent = readFileSync(examplePath, 'utf-8');
  const requiredVars = parseEnvVarNames(exampleContent);

  // Check .env exists
  if (!existsSync(envPath)) {
    return {
      check_type: 'env_check',
      status: 'fail',
      command: 'env-check',
      exit_code: 1,
      stderr_summary: `.env file not found. Required vars from .env.example: ${requiredVars.join(', ')}`,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Parse .env and check all required vars are present and non-empty
  const envContent = readFileSync(envPath, 'utf-8');
  const envVars = parseEnvVarValues(envContent);

  for (const varName of requiredVars) {
    if (!(varName in envVars)) {
      missingVars.push(varName);
    } else if (!envVars[varName]) {
      emptyVars.push(varName);
    }
  }

  const duration = Date.now() - startTime;
  const hasFail = missingVars.length > 0;
  const summaryParts: string[] = [];

  if (missingVars.length > 0) {
    summaryParts.push(`Missing vars: ${missingVars.join(', ')}`);
  }
  if (emptyVars.length > 0) {
    summaryParts.push(`Empty vars (warning): ${emptyVars.join(', ')}`);
  }

  return {
    check_type: 'env_check',
    status: hasFail ? 'fail' : 'pass',
    command: 'env-check',
    exit_code: hasFail ? 1 : 0,
    stderr_summary: summaryParts.length > 0 ? summaryParts.join('; ') : undefined,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
  };
}

/** Parse env var names from .env.example (lines like KEY=value or KEY=) */
function parseEnvVarNames(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter((name) => name.length > 0);
}

/** Parse env vars into key-value map from .env content */
function parseEnvVarValues(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = value;
  }
  return vars;
}
