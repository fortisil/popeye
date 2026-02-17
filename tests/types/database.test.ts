/**
 * Tests for database types and schemas
 */

import { describe, it, expect } from 'vitest';
import {
  DbStatusSchema,
  DbModeSchema,
  DbProviderSchema,
  BackendOrmSchema,
  DbSetupStepSchema,
  DbConfigSchema,
  DEFAULT_DB_CONFIG,
} from '../../src/types/database.js';

describe('DbStatusSchema', () => {
  it('should accept all valid status values', () => {
    const validStatuses = ['unconfigured', 'configured', 'applying', 'ready', 'error'];
    for (const status of validStatuses) {
      expect(DbStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it('should reject invalid status values', () => {
    expect(DbStatusSchema.safeParse('pending').success).toBe(false);
    expect(DbStatusSchema.safeParse('active').success).toBe(false);
    expect(DbStatusSchema.safeParse('').success).toBe(false);
    expect(DbStatusSchema.safeParse(123).success).toBe(false);
  });
});

describe('DbModeSchema', () => {
  it('should accept valid modes', () => {
    expect(DbModeSchema.safeParse('local_docker').success).toBe(true);
    expect(DbModeSchema.safeParse('managed').success).toBe(true);
  });

  it('should reject unconfigured and unknown values', () => {
    expect(DbModeSchema.safeParse('unconfigured').success).toBe(false);
    expect(DbModeSchema.safeParse('cloud').success).toBe(false);
    expect(DbModeSchema.safeParse('').success).toBe(false);
  });
});

describe('DbProviderSchema', () => {
  it('should accept valid providers', () => {
    expect(DbProviderSchema.safeParse('neon').success).toBe(true);
    expect(DbProviderSchema.safeParse('supabase').success).toBe(true);
    expect(DbProviderSchema.safeParse('other').success).toBe(true);
  });

  it('should reject unknown providers', () => {
    expect(DbProviderSchema.safeParse('aws').success).toBe(false);
  });
});

describe('BackendOrmSchema', () => {
  it('should accept valid ORM values', () => {
    expect(BackendOrmSchema.safeParse('sqlalchemy').success).toBe(true);
    expect(BackendOrmSchema.safeParse('prisma').success).toBe(true);
    expect(BackendOrmSchema.safeParse('drizzle').success).toBe(true);
  });

  it('should reject unknown ORM values', () => {
    expect(BackendOrmSchema.safeParse('typeorm').success).toBe(false);
  });
});

describe('DbConfigSchema', () => {
  it('should accept a full config with all fields', () => {
    const config = {
      designed: true,
      mode: 'local_docker',
      vectorRequired: true,
      status: 'ready',
      lastError: undefined,
      migrationsApplied: 3,
      readinessCheckedAt: '2024-01-01T00:00:00Z',
    };
    const result = DbConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should accept a minimal config without optional mode', () => {
    const config = {
      designed: true,
      vectorRequired: true,
      status: 'unconfigured',
      migrationsApplied: 0,
    };
    const result = DbConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBeUndefined();
    }
  });

  it('should allow mode set with status unconfigured (valid during transitions)', () => {
    const config = {
      designed: true,
      mode: 'managed',
      vectorRequired: false,
      status: 'unconfigured',
      migrationsApplied: 0,
    };
    const result = DbConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject config with invalid status', () => {
    const config = {
      designed: true,
      vectorRequired: true,
      status: 'broken',
      migrationsApplied: 0,
    };
    expect(DbConfigSchema.safeParse(config).success).toBe(false);
  });

  it('should reject config missing required fields', () => {
    const config = { designed: true };
    expect(DbConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe('DEFAULT_DB_CONFIG', () => {
  it('should have correct initial values', () => {
    expect(DEFAULT_DB_CONFIG.designed).toBe(true);
    expect(DEFAULT_DB_CONFIG.status).toBe('unconfigured');
    expect(DEFAULT_DB_CONFIG.vectorRequired).toBe(true);
    expect(DEFAULT_DB_CONFIG.migrationsApplied).toBe(0);
  });

  it('should not have mode set (absent until user configures)', () => {
    expect(DEFAULT_DB_CONFIG.mode).toBeUndefined();
  });

  it('should parse through DbConfigSchema successfully', () => {
    const result = DbConfigSchema.safeParse(DEFAULT_DB_CONFIG);
    expect(result.success).toBe(true);
  });
});

describe('DbSetupStepSchema', () => {
  it('should accept all setup steps', () => {
    const steps = [
      'check_connection',
      'ensure_extensions',
      'apply_migrations',
      'seed_minimal',
      'readiness_tests',
      'mark_ready',
    ];
    for (const step of steps) {
      expect(DbSetupStepSchema.safeParse(step).success).toBe(true);
    }
  });
});

describe('ProjectStateSchema backward compatibility', () => {
  it('should parse existing state without dbConfig field', async () => {
    // Import ProjectStateSchema to verify backward compat
    const { ProjectStateSchema } = await import('../../src/types/workflow.js');

    const existingState = {
      id: 'test-id',
      name: 'test-project',
      idea: 'Build something',
      language: 'fullstack',
      openaiModel: 'gpt-4o',
      phase: 'plan',
      status: 'pending',
      milestones: [],
      currentMilestone: null,
      currentTask: null,
      consensusHistory: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const result = ProjectStateSchema.safeParse(existingState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dbConfig).toBeUndefined();
    }
  });
});
