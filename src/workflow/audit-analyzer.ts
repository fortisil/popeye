/**
 * AI-powered project analyzer for the audit system.
 *
 * Constructs analysis prompts, executes them through Claude with Serena-first
 * search strategy (with retries and fallback), parses findings, and scores.
 */

import { executePrompt, type ClaudeExecuteResult } from '../adapters/claude.js';
import type { ProjectState } from '../types/workflow.js';
import type {
  AuditCategory,
  AuditFinding,
  AuditModeOptions,
  ProjectScanResult,
  SearchMetadata,
  WiringMismatch,
} from '../types/audit.js';
import { AuditFindingSchema } from '../types/audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERENA_TOOLS = [
  'mcp__serena__find_symbol',
  'mcp__serena__get_symbols_overview',
  'mcp__serena__search_symbol',
  'mcp__serena__get_file_symbols',
];

const FALLBACK_TOOLS = [
  'Read', 'Glob', 'Grep',
];

const ALL_AUDIT_TOOLS = [...SERENA_TOOLS, ...FALLBACK_TOOLS];

const MAX_SERENA_RETRIES = 2;

const CATEGORY_WEIGHTS: Record<AuditCategory, number> = {
  'feature-completeness': 25,
  'integration-wiring': 15,
  'test-coverage': 15,
  'config-deployment': 10,
  'dependency-sanity': 10,
  'consistency': 10,
  'security': 10,
  'documentation': 5,
};

const SEVERITY_DEDUCTIONS: Record<string, number> = {
  critical: 20,
  major: 10,
  minor: 3,
  info: 0,
};

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the analysis prompt for Claude, embedding scan results and context.
 *
 * @param scan - The project scan result.
 * @param state - Current project state.
 * @param depth - Audit depth (1=shallow, 2=standard, 3=deep).
 * @param strict - Whether to use strict scoring.
 * @returns The complete analysis prompt string.
 */
export function buildAnalysisPrompt(
  scan: ProjectScanResult,
  state: ProjectState,
  depth: number,
  strict: boolean
): string {
  const sections: string[] = [];

  sections.push(`# Project Audit Analysis

You are auditing the project "${state.name}" (language: ${scan.language}).
Depth level: ${depth} (1=shallow checks, 2=standard, 3=deep investigation).
${strict ? 'STRICT MODE: Apply higher standards for all checks.' : ''}

## Instructions
Analyze the project and return findings as a JSON array of objects. Each finding must have:
- id: string (format "AUD-NNN")
- category: one of "feature-completeness", "integration-wiring", "test-coverage", "config-deployment", "dependency-sanity", "consistency", "security", "documentation"
- severity: one of "critical", "major", "minor", "info"
- title: short summary
- description: detailed explanation
- evidence: array of { file: string, line?: number, snippet?: string, description?: string }
- recommendation: actionable fix
- autoFixable: boolean

Use Serena tools first for code navigation. If they fail, fall back to Read/Glob/Grep.

Return ONLY a JSON array wrapped in \`\`\`json fences. No other text.`);

  // Component structure
  sections.push(`## Component Structure
Components detected: ${scan.detectedComposition.join(', ')}
State language: ${scan.stateLanguage}
Composition mismatch: ${scan.compositionMismatch}

${scan.components.map((c) =>
    `### ${c.kind} (${c.rootDir})
- Language: ${c.language}${c.framework ? `, Framework: ${c.framework}` : ''}
- Source files: ${c.sourceFiles.length}
- Test files: ${c.testFiles.length}
- Entry points: ${c.entryPoints.join(', ') || 'none'}
- Route files: ${c.routeFiles.join(', ') || 'none'}
- Dependencies: ${c.dependencyManifests.map((d) => d.file).join(', ') || 'none'}`
  ).join('\n\n')}`);

  // File tree
  sections.push(`## Project Tree (truncated)
\`\`\`
${scan.tree}
\`\`\``);

  // Totals
  sections.push(`## Totals
- Source files: ${scan.totalSourceFiles}
- Test files: ${scan.totalTestFiles}
- Lines of code: ${scan.totalLinesOfCode}
- Lines of tests: ${scan.totalLinesOfTests}
- Config files: ${scan.configFiles.join(', ') || 'none'}`);

  // CLAUDE.md context
  if (scan.claudeMdContent) {
    sections.push(`## CLAUDE.md (project instructions)
\`\`\`
${scan.claudeMdContent.slice(0, 3000)}
\`\`\``);
  }

  // README
  if (scan.readmeContent) {
    sections.push(`## README.md
\`\`\`
${scan.readmeContent.slice(0, 3000)}
\`\`\``);
  }

  // Specification from state
  if (state.specification) {
    sections.push(`## Project Specification
\`\`\`
${state.specification.slice(0, 3000)}
\`\`\``);
  }

  // Milestone status
  if (state.milestones && state.milestones.length > 0) {
    sections.push(`## Milestone Status
${state.milestones.map((m) =>
      `- ${m.name}: ${m.status} (${m.tasks.filter((t) => t.status === 'complete').length}/${m.tasks.length} tasks)`
    ).join('\n')}`);
  }

  // Wiring matrix pre-analysis
  if (scan.wiring) {
    sections.push(`## FE<->BE Wiring Matrix
- Frontend API env keys: ${scan.wiring.frontendApiBaseEnvKeys.join(', ') || 'none'}
- Frontend API resolved: ${scan.wiring.frontendApiBaseResolved || 'not set'}
- Backend CORS origins: ${scan.wiring.backendCorsOrigins?.join(', ') || 'not found'}
- Backend API prefix: ${scan.wiring.backendApiPrefix || 'not found'}
- Detected mismatches: ${scan.wiring.potentialMismatches.length}`);
  }

  // Env + Docker
  if (scan.envExampleContent) {
    sections.push(`## .env.example
\`\`\`
${scan.envExampleContent}
\`\`\``);
  }
  if (scan.dockerComposeContent) {
    sections.push(`## docker-compose.yml
\`\`\`
${scan.dockerComposeContent}
\`\`\``);
  }

  // Framework-specific checks
  const frameworks = scan.components.map((c) => c.framework).filter(Boolean);
  if (frameworks.some((f) => f === 'next')) {
    sections.push(`## Next.js-Specific Checks (IMPORTANT)
- Check for hydration mismatches: event handlers (onClick, onSubmit, onChange) in Server Components (files WITHOUT 'use client' directive) cause hydration errors
- Check for \`new Date()\`, \`Date.now()\`, \`Math.random()\` in Server Components — these produce different values on server vs client
- Check for \`typeof window\`, \`localStorage\`, \`navigator\` usage in render path of Server Components
- Check for invalid HTML nesting: \`<p>\` inside \`<p>\`, \`<div>\` inside \`<p>\`, block elements inside inline elements
- Verify that components with hooks (useState, useEffect, useRef) have 'use client' directive
- Check for proper 'use client' boundary — interactive components (forms, buttons with handlers) must be Client Components`);
  }
  if (frameworks.some((f) => f === 'react' || f === 'vue' || f === 'svelte')) {
    sections.push(`## Frontend Framework Checks
- Check for missing key props on list items
- Verify error boundaries exist for critical routes
- Check for potential memory leaks (event listeners not cleaned up)
- Verify environment variables used at runtime are prefixed correctly (VITE_, NEXT_PUBLIC_, REACT_APP_)`);
  }

  // Depth-specific instructions
  if (depth >= 2) {
    sections.push(`## Depth-2 Checks
- Verify test coverage for all route handlers
- Check for missing error boundaries / error handling
- Validate dependency versions are not wildly outdated
- Confirm env variables used in code match .env.example`);
  }
  if (depth >= 3) {
    sections.push(`## Depth-3 Checks
- Trace data flow from API endpoints to database
- Check for security issues (OWASP Top 10)
- Verify all imports resolve correctly
- Check for dead code and unused exports`);
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

/**
 * Parse AI response into validated AuditFinding objects.
 *
 * Handles JSON wrapped in code fences, partial JSON, and malformed responses.
 *
 * @param rawResponse - Raw AI response text.
 * @returns Array of validated findings.
 */
export function parseAuditFindings(rawResponse: string): AuditFinding[] {
  // Extract JSON from code fences
  const jsonMatch = rawResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Attempt to find a JSON array in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        parsed = JSON.parse(arrayMatch[0]);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const findings: AuditFinding[] = [];
  for (const item of parsed) {
    try {
      const finding = AuditFindingSchema.parse(item);
      findings.push(finding);
    } catch {
      // Skip malformed findings — partial results better than none
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Deterministic findings from wiring/composition
// ---------------------------------------------------------------------------

/**
 * Generate deterministic findings from wiring mismatches and composition issues.
 *
 * @param scan - The project scan result.
 * @returns Array of deterministic findings.
 */
function generateDeterministicFindings(scan: ProjectScanResult): AuditFinding[] {
  const findings: AuditFinding[] = [];
  let counter = 900; // Reason: Start at 900 to avoid ID collision with AI findings

  // Composition mismatch
  if (scan.compositionMismatch) {
    findings.push({
      id: `AUD-${counter++}`,
      category: 'consistency',
      severity: 'major',
      title: 'Workspace composition mismatch',
      description: `State language is "${scan.stateLanguage}" but filesystem shows components: [${scan.detectedComposition.join(', ')}]. This may indicate an incomplete workspace setup or a stale state file.`,
      evidence: [
        { file: '.popeye/state.json', description: `language: "${scan.stateLanguage}"` },
      ],
      recommendation: 'Verify that all expected workspace apps are created and update project language if needed.',
      autoFixable: false,
    });
  }

  // Wiring mismatches
  if (scan.wiring) {
    for (const mismatch of scan.wiring.potentialMismatches) {
      findings.push(wiringMismatchToFinding(mismatch, counter++));
    }
  }

  // No test files at all
  if (scan.totalTestFiles === 0 && scan.totalSourceFiles > 0) {
    findings.push({
      id: `AUD-${counter++}`,
      category: 'test-coverage',
      severity: 'critical',
      title: 'No test files found',
      description: `Project has ${scan.totalSourceFiles} source files but zero test files.`,
      evidence: [],
      recommendation: 'Add unit tests for critical paths.',
      autoFixable: false,
    });
  }

  // No README
  if (!scan.readmeContent) {
    findings.push({
      id: `AUD-${counter++}`,
      category: 'documentation',
      severity: 'minor',
      title: 'Missing README.md',
      description: 'No README.md file found in project root.',
      evidence: [],
      recommendation: 'Add a README.md with project overview, setup, and usage instructions.',
      autoFixable: true,
    });
  }

  // No .env.example for multi-component projects
  if (!scan.envExampleContent && scan.components.length > 1) {
    findings.push({
      id: `AUD-${counter++}`,
      category: 'config-deployment',
      severity: 'major',
      title: 'Missing .env.example for workspace project',
      description: 'Multi-component project should have a .env.example documenting required environment variables.',
      evidence: [],
      recommendation: 'Create .env.example with all required env variables and comments.',
      autoFixable: true,
    });
  }

  return findings;
}

/**
 * Convert a wiring mismatch into an audit finding.
 *
 * @param mismatch - The wiring mismatch.
 * @param counter - Finding ID counter.
 * @returns An audit finding.
 */
function wiringMismatchToFinding(mismatch: WiringMismatch, counter: number): AuditFinding {
  return {
    id: `AUD-${counter}`,
    category: 'integration-wiring',
    severity: 'major',
    title: `Wiring issue: ${mismatch.type}`,
    description: mismatch.details,
    evidence: mismatch.evidence,
    recommendation: 'Update CORS or API base URL configuration to ensure frontend and backend can communicate.',
    autoFixable: true,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Calculate audit scores from findings and scan data.
 *
 * @param findings - All audit findings (AI + deterministic).
 * @param scan - The project scan result.
 * @returns Overall score (0-100) and per-category scores.
 */
export function calculateAuditScores(
  findings: AuditFinding[],
  _scan: ProjectScanResult
): { overallScore: number; categoryScores: Record<AuditCategory, number> } {
  const categories = Object.keys(CATEGORY_WEIGHTS) as AuditCategory[];
  const categoryScores: Record<string, number> = {};

  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat);
    let score = 100;
    for (const f of catFindings) {
      score -= SEVERITY_DEDUCTIONS[f.severity] ?? 0;
    }
    categoryScores[cat] = Math.max(0, Math.min(100, score));
  }

  // Weighted average
  let overallScore = 0;
  let totalWeight = 0;
  for (const cat of categories) {
    overallScore += (categoryScores[cat] ?? 100) * CATEGORY_WEIGHTS[cat];
    totalWeight += CATEGORY_WEIGHTS[cat];
  }
  overallScore = Math.round(overallScore / totalWeight);

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    categoryScores: categoryScores as Record<AuditCategory, number>,
  };
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

/**
 * Analyze the project using AI with Serena-first search strategy.
 *
 * The analysis flow:
 * 1. Build prompt from scan data and state
 * 2. Execute through Claude with Serena tools + fallback tools
 * 3. Parse AI findings from the response
 * 4. Merge with deterministic findings (wiring, composition, missing tests)
 * 5. Track Serena usage in SearchMetadata
 *
 * @param scan - The project scan result from audit-scanner.
 * @param state - Current project state.
 * @param options - Audit mode options (depth, strict, etc.).
 * @returns Findings array and search metadata.
 */
export async function analyzeProject(
  scan: ProjectScanResult,
  state: ProjectState,
  options: Pick<AuditModeOptions, 'depth' | 'strict' | 'projectDir'>
): Promise<{ findings: AuditFinding[]; searchMetadata: SearchMetadata }> {
  const metadata: SearchMetadata = {
    serenaUsed: false,
    serenaRetries: 0,
    serenaErrors: [],
    fallbackUsed: false,
    fallbackTool: '',
    searchQueries: [],
  };

  const prompt = buildAnalysisPrompt(scan, state, options.depth, options.strict);
  metadata.searchQueries.push('audit-analysis-prompt');

  // Attempt execution with Serena tools
  let result: ClaudeExecuteResult | undefined;
  let serenaAttempt = 0;

  while (serenaAttempt <= MAX_SERENA_RETRIES) {
    try {
      result = await executePrompt(prompt, {
        cwd: options.projectDir,
        allowedTools: ALL_AUDIT_TOOLS,
        permissionMode: 'bypassPermissions',
        timeout: 120_000,
      });

      if (result.success) {
        metadata.serenaUsed = true;
        break;
      }

      // Serena failure: retry with alternate approach
      metadata.serenaRetries++;
      metadata.serenaErrors.push(result.error ?? 'Unknown error');
      serenaAttempt++;
    } catch (err) {
      metadata.serenaRetries++;
      metadata.serenaErrors.push(err instanceof Error ? err.message : 'Unknown error');
      serenaAttempt++;
    }
  }

  // Fallback: use only Read/Glob/Grep if Serena failed
  if (!result?.success) {
    metadata.fallbackUsed = true;
    metadata.fallbackTool = 'grep';
    try {
      result = await executePrompt(prompt, {
        cwd: options.projectDir,
        allowedTools: FALLBACK_TOOLS,
        permissionMode: 'bypassPermissions',
        timeout: 120_000,
      });
    } catch {
      // Complete failure — proceed with deterministic findings only
    }
  }

  // Parse AI findings
  let aiFindings: AuditFinding[] = [];
  if (result?.success && result.response) {
    aiFindings = parseAuditFindings(result.response);
  }

  // Merge with deterministic findings
  const deterministicFindings = generateDeterministicFindings(scan);
  const allFindings = [...aiFindings, ...deterministicFindings];

  return { findings: allFindings, searchMetadata: metadata };
}
