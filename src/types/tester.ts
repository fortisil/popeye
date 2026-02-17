/**
 * Tester (QA) skill type definitions
 * Defines test planning, review, and fix plan structures
 */

import { z } from 'zod';

/**
 * Test verdict from the Tester's review
 */
export const TestVerdictSchema = z.enum(['PASS', 'PASS_WITH_NOTES', 'FAIL']);
export type TestVerdict = z.infer<typeof TestVerdictSchema>;

/**
 * Scope components that a test plan can cover
 */
export const TestScopeSchema = z.enum(['frontend', 'backend', 'db', 'infra']);
export type TestScope = z.infer<typeof TestScopeSchema>;

/**
 * A structured test command to execute
 */
export const TestCommandSchema = z.object({
  /** The shell command to run */
  command: z.string().min(1),
  /** Working directory (relative to project root) */
  cwd: z.string().optional(),
  /** Human-readable purpose of this command */
  purpose: z.string().min(1),
  /** Whether this command must pass for the test run to succeed */
  required: z.boolean(),
});
export type TestCommand = z.infer<typeof TestCommandSchema>;

/**
 * Individual test case in the test matrix
 */
export const TestCaseSchema = z.object({
  /** Unique identifier within the test plan */
  id: z.string().min(1),
  /** Category: unit, integration, e2e, smoke, lint, build */
  category: z.string().min(1),
  /** Human-readable description of what is being tested */
  description: z.string().min(1),
  /** What must be true for this test to pass */
  acceptanceCriteria: z.string().min(1),
  /** What evidence (log output, report) is needed to verify */
  evidenceRequired: z.string().min(1),
  /** Priority: critical, high, medium, low */
  priority: z.enum(['critical', 'high', 'medium', 'low']),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

/**
 * Structured test plan output from the Tester
 */
export const TestPlanOutputSchema = z.object({
  /** What risks this test plan targets */
  summary: z.string().min(1),
  /** Components covered by this plan */
  scope: z.array(TestScopeSchema).min(1),
  /** Matrix of test cases with acceptance criteria */
  testMatrix: z.array(TestCaseSchema).min(1),
  /** Exact commands to execute (with cwd, purpose, required flag) */
  commands: z.array(TestCommandSchema).min(1),
  /** Top risks this test plan focuses on (3-7 items) */
  riskFocus: z.array(z.string().min(1)).min(1),
  /** What evidence (logs, reports) to capture */
  evidenceRequired: z.array(z.string().min(1)).min(1),
  /** Minimum verification always present: build, lint, smoke */
  minimumVerification: z.array(z.string().min(1)).min(1),
  /** Rationale if tester decides no custom tests are needed (min verification still applies) */
  noTestsRationale: z.string().optional(),
});
export type TestPlanOutput = z.infer<typeof TestPlanOutputSchema>;

/**
 * Post-run review from the Tester
 */
export const TestRunReviewSchema = z.object({
  /** Overall verdict */
  verdict: TestVerdictSchema,
  /** Summary of the review */
  summary: z.string().min(1),
  /** List of evidence that was checked */
  evidenceReviewed: z.array(z.string().min(1)).min(1),
  /** Specific failures found (empty array if PASS) */
  failures: z.array(z.string()),
  /** Missing evidence or coverage gaps */
  gaps: z.array(z.string()),
  /** Recommendations for improvement */
  recommendations: z.array(z.string()),
  /** Whether this verdict requires consensus (true if FAIL) */
  requiresConsensus: z.boolean(),
});
export type TestRunReview = z.infer<typeof TestRunReviewSchema>;

/**
 * Individual fix step in a TestFixPlan
 */
export const FixStepSchema = z.object({
  /** File to modify */
  file: z.string().min(1),
  /** Description of the change */
  change: z.string().min(1),
  /** Why this change is needed */
  reason: z.string().min(1),
});
export type FixStep = z.infer<typeof FixStepSchema>;

/**
 * Fix plan proposed by the Tester when tests fail
 */
export const TestFixPlanSchema = z.object({
  /** Which acceptance criteria failed */
  failedCriteria: z.array(z.string().min(1)).min(1),
  /** Root cause analysis from the Tester */
  rootCauseAnalysis: z.string().min(1),
  /** Ordered steps to fix the failures */
  fixSteps: z.array(FixStepSchema).min(1),
  /** Risks of introducing regressions */
  regressionRisks: z.array(z.string()),
  /** Strategy for re-testing after fix */
  retestStrategy: z.string().min(1),
});
export type TestFixPlan = z.infer<typeof TestFixPlanSchema>;

/**
 * Discovered test infrastructure for a project
 */
export interface DiscoveredTestCommands {
  testCmd: string | null;
  lintCmd: string | null;
  buildCmd: string | null;
  typecheckCmd: string | null;
}
