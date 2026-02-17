/**
 * Tests for the audit mode orchestrator.
 *
 * These tests mock the AI analyzer and state modules to validate
 * the orchestration flow without requiring real AI calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuditModeRunOptions } from '../../src/workflow/audit-mode.js';

// Mock the external dependencies before importing the module under test
vi.mock('../../src/state/index.js', () => ({
  loadProject: vi.fn().mockResolvedValue({
    id: 'test-id',
    name: 'Test Project',
    idea: 'A test project',
    language: 'typescript',
    openaiModel: 'gpt-4',
    phase: 'complete',
    status: 'complete',
    specification: 'Build a todo app',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }),
  updateState: vi.fn().mockResolvedValue({}),
  addMilestones: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/adapters/claude.js', () => ({
  executePrompt: vi.fn().mockResolvedValue({
    success: true,
    response: '```json\n[]\n```',
    toolCalls: [],
  }),
}));

// Import after mocks are set up
const { runAuditMode } = await import('../../src/workflow/audit-mode.js');
const { loadProject, updateState } = await import('../../src/state/index.js');

beforeEach(() => {
  vi.clearAllMocks();
});

function makeOptions(overrides: Partial<AuditModeRunOptions> = {}): AuditModeRunOptions {
  return {
    projectDir: '/tmp/fake-project',
    depth: 2,
    runTests: false,
    strict: false,
    format: 'json',
    autoRecover: false,
    target: 'all',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// runAuditMode
// ---------------------------------------------------------------------------

describe('runAuditMode', () => {
  it('should return error result when project cannot be loaded', async () => {
    vi.mocked(loadProject).mockRejectedValueOnce(new Error('Project not found'));

    const result = await runAuditMode(makeOptions());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Project not found');
  });

  it('should call progress callbacks through stages', async () => {
    const messages: Array<{ stage: string; msg: string }> = [];
    const result = await runAuditMode(
      makeOptions({
        onProgress: (stage, msg) => messages.push({ stage, msg }),
      })
    );

    // Should have stage-1, stage-2, and stage-3 messages
    expect(messages.some((m) => m.stage === 'stage-1')).toBe(true);
    expect(messages.some((m) => m.stage === 'stage-2')).toBe(true);
    expect(messages.some((m) => m.stage === 'stage-3')).toBe(true);
  });

  it('should update state with audit report path', async () => {
    await runAuditMode(makeOptions({ format: 'json' }));
    expect(updateState).toHaveBeenCalledWith(
      '/tmp/fake-project',
      expect.objectContaining({
        auditRunId: expect.any(String),
        auditLastRunAt: expect.any(String),
      })
    );
  });

  it('should not generate recovery when no trigger conditions met', async () => {
    const result = await runAuditMode(makeOptions());
    // With empty findings from mock, no recovery should be triggered
    expect(result.recovery).toBeUndefined();
  });

  it('should have a valid audit report structure', async () => {
    const result = await runAuditMode(makeOptions());
    expect(result.success).toBe(true);
    expect(result.audit).toBeDefined();
    expect(result.audit.projectName).toBe('Test Project');
    expect(result.audit.auditRunId).toBeTruthy();
    expect(result.summary).toBeDefined();
    expect(result.summary.projectName).toBe('Test Project');
  });
});
