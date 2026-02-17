/**
 * Tests for upgrade handler content context builder
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildUpgradeContentContext } from '../../src/upgrade/handlers.js';

// Mock external dependencies to isolate unit behavior
vi.mock('../../src/generators/website-context.js', () => ({
  buildWebsiteContext: vi.fn(),
  resolveBrandAssets: vi.fn(),
  validateWebsiteContext: vi.fn(),
}));

vi.mock('../../src/generators/workspace-root.js', () => ({
  resolveWorkspaceRoot: vi.fn(),
}));

vi.mock('../../src/workflow/website-strategy.js', () => ({
  loadWebsiteStrategy: vi.fn(),
}));

vi.mock('../../src/state/persistence.js', () => ({
  loadState: vi.fn(),
  saveState: vi.fn(),
}));

import { buildWebsiteContext, resolveBrandAssets, validateWebsiteContext } from '../../src/generators/website-context.js';
import { resolveWorkspaceRoot } from '../../src/generators/workspace-root.js';
import { loadWebsiteStrategy } from '../../src/workflow/website-strategy.js';
import { loadState } from '../../src/state/persistence.js';

const mockBuildWebsiteContext = vi.mocked(buildWebsiteContext);
const mockResolveBrandAssets = vi.mocked(resolveBrandAssets);
const mockValidateWebsiteContext = vi.mocked(validateWebsiteContext);
const mockResolveWorkspaceRoot = vi.mocked(resolveWorkspaceRoot);
const mockLoadWebsiteStrategy = vi.mocked(loadWebsiteStrategy);
const mockLoadState = vi.mocked(loadState);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-handlers-test-'));
  vi.clearAllMocks();

  // Default mock returns
  mockBuildWebsiteContext.mockResolvedValue({
    productName: 'TestProject',
    features: [{ title: 'Feature 1', description: 'A great feature' }],
    rawDocs: '# Test docs',
  });
  mockResolveBrandAssets.mockResolvedValue({
    logoSource: null,
    faviconSource: null,
    targets: [],
  });
  mockResolveWorkspaceRoot.mockResolvedValue(tmpDir);
  mockLoadWebsiteStrategy.mockResolvedValue(null);
  mockLoadState.mockResolvedValue(null);
  mockValidateWebsiteContext.mockReturnValue({
    passed: true,
    issues: [],
    warnings: [],
    contentScore: 100,
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('buildUpgradeContentContext', () => {
  it('should build context from user docs and return features', async () => {
    const { context, warning } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(warning).toBeUndefined();
    expect(context).toBeDefined();
    expect(context!.productName).toBe('TestProject');
    expect(context!.features).toHaveLength(1);
    expect(context!.features[0].title).toBe('Feature 1');

    // Verify buildWebsiteContext was called with correct args
    expect(mockBuildWebsiteContext).toHaveBeenCalledWith(tmpDir, 'TestProject');
  });

  it('should apply brand context from state when available', async () => {
    mockLoadState.mockResolvedValue({
      name: 'TestProject',
      language: 'all',
      brandContext: {
        primaryColor: '#2563EB',
        logoPath: '/path/to/logo.png',
      },
    } as any);

    const { context } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(context!.brand).toBeDefined();
    expect(context!.brand!.primaryColor).toBe('#2563EB');
    expect(context!.brand!.logoPath).toBe('/path/to/logo.png');
  });

  it('should load website strategy when available', async () => {
    const mockStrategy = {
      icp: { title: 'Developer', painPoints: ['slow builds'] },
      messaging: { headline: 'Build faster', subheadline: 'Ship more' },
    };
    mockLoadWebsiteStrategy.mockResolvedValue({
      strategy: mockStrategy as any,
      metadata: { inputHash: 'abc', generatedAt: '2024-01-01', version: '1.0' },
    });

    const { context } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(context!.strategy).toBeDefined();
    expect(context!.strategy).toBe(mockStrategy);
    expect(mockLoadWebsiteStrategy).toHaveBeenCalledWith(tmpDir);
  });

  it('should resolve brand assets using workspace root', async () => {
    const wsRoot = '/resolved/workspace/root';
    mockResolveWorkspaceRoot.mockResolvedValue(wsRoot);

    const { context } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(context).toBeDefined();
    expect(mockResolveWorkspaceRoot).toHaveBeenCalledWith(tmpDir);
    expect(mockResolveBrandAssets).toHaveBeenCalledWith(wsRoot, context!.brand);
  });

  it('should return warning on error without crashing', async () => {
    mockBuildWebsiteContext.mockRejectedValue(new Error('Docs directory not found'));

    const { context, warning } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(context).toBeUndefined();
    expect(warning).toBe('Docs directory not found');
  });

  it('should handle non-Error throws gracefully', async () => {
    mockBuildWebsiteContext.mockRejectedValue('unexpected string error');

    const { context, warning } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(context).toBeUndefined();
    expect(warning).toBe('Unknown error building website context');
  });

  it('should work when no state or strategy exists', async () => {
    // Default mocks already return null for state and strategy
    const { context, warning } = await buildUpgradeContentContext(tmpDir, 'TestProject');

    expect(warning).toBeUndefined();
    expect(context).toBeDefined();
    expect(context!.strategy).toBeUndefined();
    // Brand should still be whatever buildWebsiteContext returns
    expect(context!.productName).toBe('TestProject');
  });
});
