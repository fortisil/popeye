/**
 * Tests for overview module
 * Verifies overview generation, formatting, analysis, and fix capabilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateOverview, formatOverview, fixOverviewIssues } from '../../src/workflow/overview.js';
import type { ProjectOverview, OverviewFixResult } from '../../src/workflow/overview.js';

// Mock the state module to avoid filesystem coupling in unit tests
vi.mock('../../src/state/index.js', async () => {
  const actual = await vi.importActual('../../src/state/index.js');
  return {
    ...actual,
    loadProject: vi.fn(),
    getProgress: vi.fn(),
    storeUserDocs: vi.fn(),
    storeBrandContext: vi.fn(),
  };
});

// Mock website-context to control doc discovery
vi.mock('../../src/generators/website-context.js', async () => {
  const actual = await vi.importActual('../../src/generators/website-context.js');
  return {
    ...actual,
    discoverProjectDocs: vi.fn().mockResolvedValue([]),
    readProjectDocs: vi.fn().mockResolvedValue(''),
    findBrandAssets: vi.fn().mockResolvedValue({}),
  };
});

// Mock website-updater
vi.mock('../../src/workflow/website-updater.js', () => ({
  updateWebsiteContent: vi.fn().mockResolvedValue(undefined),
}));

import { loadProject, getProgress, storeUserDocs, storeBrandContext } from '../../src/state/index.js';
import { discoverProjectDocs, readProjectDocs, findBrandAssets } from '../../src/generators/website-context.js';

const mockLoadProject = vi.mocked(loadProject);
const mockGetProgress = vi.mocked(getProgress);
const mockStoreUserDocs = vi.mocked(storeUserDocs);
const mockStoreBrandContext = vi.mocked(storeBrandContext);
const mockDiscoverDocs = vi.mocked(discoverProjectDocs);
const mockReadDocs = vi.mocked(readProjectDocs);
const mockFindBrand = vi.mocked(findBrandAssets);

const baseState = {
  id: 'test-id',
  name: 'test-project',
  idea: 'A test project',
  language: 'typescript' as const,
  openaiModel: 'gpt-4o',
  phase: 'execution' as const,
  status: 'in-progress' as const,
  specification: '# Overview\nA great project for testing.\n## Core Features\n- Feature A\n- Feature B',
  plan: '# Plan\n...',
  milestones: [
    {
      id: 'm1',
      name: 'Setup',
      description: 'Initial setup',
      status: 'complete' as const,
      tasks: [
        { id: 't1', name: 'Init project', description: 'Initialize', status: 'complete' as const },
        { id: 't2', name: 'Add config', description: 'Configuration', status: 'complete' as const },
      ],
    },
    {
      id: 'm2',
      name: 'Core Features',
      description: 'Build core features',
      status: 'in-progress' as const,
      tasks: [
        { id: 't3', name: 'Build API', description: 'API endpoints', status: 'complete' as const },
        { id: 't4', name: 'Build UI', description: 'User interface', status: 'pending' as const },
      ],
    },
  ],
  currentMilestone: 'm2',
  currentTask: 't4',
  consensusHistory: [],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-02',
};

describe('generateOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoverDocs.mockResolvedValue([]);
  });

  it('reads state and produces correct structure', async () => {
    mockLoadProject.mockResolvedValue({
      ...baseState,
      userDocs: '--- spec.md ---\nSome docs',
      brandContext: { primaryColor: '#2563EB' },
    });

    mockGetProgress.mockResolvedValue({
      totalMilestones: 2,
      completedMilestones: 1,
      totalTasks: 4,
      completedTasks: 3,
      percentComplete: 75,
    });

    const overview = await generateOverview('/fake/project/dir');

    expect(overview.name).toBe('test-project');
    expect(overview.language).toBe('typescript');
    expect(overview.phase).toBe('execution');
    expect(overview.plan.totalMilestones).toBe(2);
    expect(overview.plan.totalTasks).toBe(4);
    expect(overview.progress.percentComplete).toBe(75);
    expect(overview.progress.completedTasks).toBe(3);
    expect(overview.userDocs).toEqual(['spec.md']);
    expect(overview.brandContext?.primaryColor).toBe('#2563EB');
    expect(overview.specification.keyFeatures).toContain('Feature A');
    expect(overview.specification.keyFeatures).toContain('Feature B');
    expect(overview.issues).toBeDefined();
    expect(overview.availableDocs).toBeDefined();
  });

  it('detects missing docs when docs available in CWD', async () => {
    mockLoadProject.mockResolvedValue({ ...baseState });
    mockGetProgress.mockResolvedValue({
      totalMilestones: 2, completedMilestones: 1,
      totalTasks: 4, completedTasks: 3, percentComplete: 75,
    });
    mockDiscoverDocs.mockResolvedValue(['/fake/spec.md', '/fake/pricing.md']);

    const overview = await generateOverview('/fake/project/dir');

    expect(overview.availableDocs).toEqual(['spec.md', 'pricing.md']);
    const docsIssue = overview.issues.find((i) => i.category === 'docs');
    expect(docsIssue).toBeDefined();
    expect(docsIssue?.message).toContain('2 doc(s)');
    expect(docsIssue?.fix).toContain('/overview fix');
  });

  it('detects generic specification', async () => {
    mockLoadProject.mockResolvedValue({
      ...baseState,
      specification: "Here's a comprehensive software specification for your project...",
    });
    mockGetProgress.mockResolvedValue({
      totalMilestones: 2, completedMilestones: 1,
      totalTasks: 4, completedTasks: 3, percentComplete: 75,
    });

    const overview = await generateOverview('/fake/project/dir');

    const specIssue = overview.issues.find((i) => i.category === 'spec');
    expect(specIssue).toBeDefined();
    expect(specIssue?.message).toContain('generic AI-generated');
  });

  it('detects no brand context', async () => {
    mockLoadProject.mockResolvedValue({ ...baseState });
    mockGetProgress.mockResolvedValue({
      totalMilestones: 2, completedMilestones: 1,
      totalTasks: 4, completedTasks: 3, percentComplete: 75,
    });

    const overview = await generateOverview('/fake/project/dir');

    const brandIssue = overview.issues.find((i) => i.category === 'brand');
    expect(brandIssue).toBeDefined();
    expect(brandIssue?.message).toContain('No brand context');
  });

  it('detects very few tasks', async () => {
    mockLoadProject.mockResolvedValue({
      ...baseState,
      milestones: [{
        id: 'm1', name: 'Only', description: 'Only milestone',
        status: 'pending',
        tasks: [{ id: 't1', name: 'Only task', description: 'Only', status: 'pending' }],
      }],
    });
    mockGetProgress.mockResolvedValue({
      totalMilestones: 1, completedMilestones: 0,
      totalTasks: 1, completedTasks: 0, percentComplete: 0,
    });

    const overview = await generateOverview('/fake/project/dir');

    const planIssue = overview.issues.find((i) => i.category === 'plan');
    expect(planIssue).toBeDefined();
    expect(planIssue?.message).toContain('only 1 task(s)');
  });
});

describe('formatOverview', () => {
  it('produces formatted string with progress info', () => {
    const overview: ProjectOverview = {
      name: 'my-project',
      idea: 'A test idea',
      language: 'typescript',
      phase: 'execution',
      status: 'in-progress',
      specification: {
        summary: 'A great project',
        keyFeatures: ['Feature A', 'Feature B'],
      },
      plan: {
        totalMilestones: 2,
        totalTasks: 4,
        milestones: [
          {
            name: 'Setup',
            status: 'complete',
            taskCount: 2,
            completedTasks: 2,
            tasks: [
              { name: 'Init', status: 'complete' },
              { name: 'Config', status: 'complete' },
            ],
          },
          {
            name: 'Core',
            status: 'in-progress',
            taskCount: 2,
            completedTasks: 1,
            tasks: [
              { name: 'API', status: 'complete' },
              { name: 'UI', status: 'pending' },
            ],
          },
        ],
      },
      progress: {
        completedMilestones: 1,
        completedTasks: 3,
        percentComplete: 75,
      },
      issues: [],
      availableDocs: [],
    };

    const output = formatOverview(overview);

    expect(output).toContain('my-project');
    expect(output).toContain('75%');
    expect(output).toContain('3/4 tasks');
    expect(output).toContain('Setup');
    expect(output).toContain('Core');
    expect(output).toContain('[x]');  // complete status
    expect(output).toContain('[ ]');  // pending status
  });

  it('handles project with no milestones', () => {
    const overview: ProjectOverview = {
      name: 'empty-project',
      idea: 'Nothing yet',
      language: 'python',
      phase: 'plan',
      status: 'pending',
      specification: {
        summary: '',
        keyFeatures: [],
      },
      plan: {
        totalMilestones: 0,
        totalTasks: 0,
        milestones: [],
      },
      progress: {
        completedMilestones: 0,
        completedTasks: 0,
        percentComplete: 0,
      },
      issues: [],
      availableDocs: [],
    };

    const output = formatOverview(overview);

    expect(output).toContain('empty-project');
    expect(output).toContain('0%');
    expect(output).toContain('No milestones defined yet');
  });

  it('shows analysis section when issues exist', () => {
    const overview: ProjectOverview = {
      name: 'test-project',
      idea: 'Test',
      language: 'website',
      phase: 'complete',
      status: 'complete',
      specification: { summary: 'Test', keyFeatures: [] },
      plan: { totalMilestones: 1, totalTasks: 5, milestones: [] },
      progress: { completedMilestones: 1, completedTasks: 5, percentComplete: 100 },
      issues: [
        { severity: 'warning', category: 'docs', message: 'No docs found', fix: 'Add docs' },
        { severity: 'error', category: 'website', message: 'Placeholder content', fix: 'Run /overview fix' },
      ],
      availableDocs: ['spec.md'],
    };

    const output = formatOverview(overview);

    expect(output).toContain('ANALYSIS');
    expect(output).toContain('[!] DOCS: No docs found');
    expect(output).toContain('[!!] WEBSITE: Placeholder content');
    expect(output).toContain('-> Add docs');
    expect(output).toContain('-> Run /overview fix');
    expect(output).toContain('/overview fix');
  });

  it('shows available docs section when docs not yet imported', () => {
    const overview: ProjectOverview = {
      name: 'test-project',
      idea: 'Test',
      language: 'typescript',
      phase: 'execution',
      status: 'in-progress',
      specification: { summary: 'Test', keyFeatures: [] },
      plan: { totalMilestones: 1, totalTasks: 5, milestones: [] },
      progress: { completedMilestones: 0, completedTasks: 2, percentComplete: 40 },
      issues: [],
      availableDocs: ['spec.md', 'pricing.md'],
    };

    const output = formatOverview(overview);

    expect(output).toContain('AVAILABLE DOCS (not yet imported)');
    expect(output).toContain('spec.md');
    expect(output).toContain('pricing.md');
  });
});

describe('fixOverviewIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers docs and stores them', async () => {
    const stateWithDocs = { ...baseState, userDocs: '--- spec.md ---\nContent' };
    mockLoadProject.mockResolvedValue({ ...baseState });
    mockDiscoverDocs.mockResolvedValue(['/parent/spec.md']);
    mockReadDocs.mockResolvedValue('--- spec.md ---\nSpec content');
    mockFindBrand.mockResolvedValue({});
    mockStoreUserDocs.mockResolvedValue(stateWithDocs);

    const result = await fixOverviewIssues('/parent/project/dir');

    expect(result.docsDiscovered).toBe(1);
    expect(result.docsStored).toBe(true);
    expect(result.messages.some((m) => m.includes('spec.md'))).toBe(true);
    expect(mockStoreUserDocs).toHaveBeenCalledWith('/parent/project/dir', '--- spec.md ---\nSpec content');
  });

  it('finds brand assets and extracts colors', async () => {
    const stateWithBrand = {
      ...baseState,
      userDocs: '# Colors\nPrimary: #2563EB',
      brandContext: { logoPath: '/parent/logo.png', primaryColor: '#2563EB' },
    };
    mockLoadProject.mockResolvedValue({ ...baseState });
    mockDiscoverDocs.mockResolvedValue(['/parent/colors.md']);
    mockReadDocs.mockResolvedValue('# Colors\nPrimary: #2563EB');
    mockFindBrand.mockResolvedValue({ logoPath: '/parent/logo.png' });
    mockStoreUserDocs.mockResolvedValue({ ...baseState, userDocs: '# Colors\nPrimary: #2563EB' });
    mockStoreBrandContext
      .mockResolvedValueOnce({ ...baseState, brandContext: { logoPath: '/parent/logo.png' }, userDocs: '# Colors\nPrimary: #2563EB' })
      .mockResolvedValueOnce(stateWithBrand);

    const result = await fixOverviewIssues('/parent/project/dir');

    expect(result.brandFound).toBe(true);
    expect(result.messages.some((m) => m.includes('logo.png'))).toBe(true);
    expect(result.messages.some((m) => m.includes('#2563EB'))).toBe(true);
  });

  it('shows tip when no docs or brand found', async () => {
    mockLoadProject.mockResolvedValue({ ...baseState });
    mockDiscoverDocs.mockResolvedValue([]);
    mockFindBrand.mockResolvedValue({});

    const result = await fixOverviewIssues('/parent/project/dir');

    expect(result.docsDiscovered).toBe(0);
    expect(result.brandFound).toBe(false);
    expect(result.messages.some((m) => m.includes('Tip:'))).toBe(true);
  });
});
