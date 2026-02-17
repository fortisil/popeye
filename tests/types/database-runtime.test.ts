/**
 * Tests for database runtime types and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  SetupStepResultSchema,
  SetupResultSchema,
  ReadinessCheckSchema,
  ReadinessResultSchema,
} from '../../src/types/database-runtime.js';

describe('SetupStepResultSchema', () => {
  it('should accept a valid successful step result', () => {
    const result = SetupStepResultSchema.safeParse({
      step: 'check_connection',
      success: true,
      message: 'Database connection verified',
      durationMs: 150,
    });
    expect(result.success).toBe(true);
  });

  it('should accept a failed step result with error', () => {
    const result = SetupStepResultSchema.safeParse({
      step: 'apply_migrations',
      success: false,
      message: 'Migration failed',
      durationMs: 3000,
      error: 'alembic upgrade head returned exit code 1',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid step names', () => {
    const result = SetupStepResultSchema.safeParse({
      step: 'invalid_step',
      success: true,
      message: 'ok',
      durationMs: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const result = SetupStepResultSchema.safeParse({
      step: 'check_connection',
      success: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('SetupResultSchema', () => {
  it('should accept a successful pipeline result', () => {
    const result = SetupResultSchema.safeParse({
      success: true,
      steps: [
        { step: 'check_connection', success: true, message: 'ok', durationMs: 100 },
        { step: 'apply_migrations', success: true, message: 'ok', durationMs: 200 },
      ],
      totalDurationMs: 300,
      finalStatus: 'ready',
    });
    expect(result.success).toBe(true);
  });

  it('should accept a failed pipeline result with error', () => {
    const result = SetupResultSchema.safeParse({
      success: false,
      steps: [
        { step: 'check_connection', success: false, message: 'fail', durationMs: 50, error: 'timeout' },
      ],
      totalDurationMs: 50,
      finalStatus: 'error',
      error: 'timeout',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty steps array', () => {
    const result = SetupResultSchema.safeParse({
      success: false,
      steps: [],
      totalDurationMs: 0,
      finalStatus: 'error',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid finalStatus', () => {
    const result = SetupResultSchema.safeParse({
      success: true,
      steps: [],
      totalDurationMs: 0,
      finalStatus: 'complete',
    });
    expect(result.success).toBe(false);
  });
});

describe('ReadinessCheckSchema', () => {
  it('should accept all severity levels', () => {
    for (const severity of ['critical', 'warning', 'info'] as const) {
      const result = ReadinessCheckSchema.safeParse({
        name: 'Test Check',
        passed: true,
        message: 'Check passed',
        severity,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid severity', () => {
    const result = ReadinessCheckSchema.safeParse({
      name: 'Test',
      passed: true,
      message: 'ok',
      severity: 'error',
    });
    expect(result.success).toBe(false);
  });
});

describe('ReadinessResultSchema', () => {
  it('should accept a healthy result with checks', () => {
    const result = ReadinessResultSchema.safeParse({
      healthy: true,
      checks: [
        { name: 'DB Connection', passed: true, message: 'Connected', severity: 'critical' },
        { name: 'pgvector', passed: true, message: 'Available', severity: 'warning' },
      ],
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('should accept an unhealthy result', () => {
    const result = ReadinessResultSchema.safeParse({
      healthy: false,
      checks: [
        { name: 'DB Connection', passed: false, message: 'Cannot connect', severity: 'critical' },
      ],
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty checks array', () => {
    const result = ReadinessResultSchema.safeParse({
      healthy: true,
      checks: [],
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});
