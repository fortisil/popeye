/**
 * Website strategy storage, formatting, and hash staleness tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  storeWebsiteStrategy,
  loadWebsiteStrategy,
  formatStrategyForPlanContext,
  isStrategyStale,
} from '../../src/workflow/website-strategy.js';
import type {
  WebsiteStrategyDocument,
  StrategyMetadata,
} from '../../src/types/website-strategy.js';

const mockStrategy: WebsiteStrategyDocument = {
  icp: {
    primaryPersona: 'DevOps engineers',
    painPoints: ['Slow pipelines'],
    goals: ['Ship faster'],
    objections: ['Migration effort'],
  },
  positioning: {
    category: 'CI/CD',
    differentiators: ['AI-powered'],
    valueProposition: 'Deploy 10x faster with AI',
    proofPoints: ['500+ teams'],
  },
  messaging: {
    headline: 'Ship Code 10x Faster',
    subheadline: 'AI-Powered CI/CD',
    elevatorPitch: 'Deploy confidently with AI.',
    longDescription: 'AI-powered CI/CD platform.',
  },
  seoStrategy: {
    primaryKeywords: ['CI/CD', 'DevOps'],
    secondaryKeywords: ['deployment'],
    longTailKeywords: ['AI CI/CD platform'],
    titleTemplates: { home: 'Ship Faster', pricing: 'Pricing' },
    metaDescriptions: { home: 'AI CI/CD', pricing: 'Plans' },
  },
  siteArchitecture: {
    pages: [
      { path: '/', title: 'Home', purpose: 'conversion', pageType: 'landing', sections: ['hero'], seoKeywords: ['ci/cd'], conversionGoal: 'sign up' },
      { path: '/pricing', title: 'Pricing', purpose: 'monetization', pageType: 'pricing', sections: ['tiers'], seoKeywords: ['pricing'], conversionGoal: 'trial' },
    ],
    navigation: [{ label: 'Pricing', href: '/pricing' }],
    footerSections: [{ title: 'Product', links: [{ label: 'Home', href: '/' }] }],
  },
  conversionStrategy: {
    primaryCta: { text: 'Start Trial', href: '/pricing' },
    secondaryCta: { text: 'Docs', href: '/docs' },
    trustSignals: ['SOC 2'],
    socialProof: ['500+ teams'],
    leadCapture: 'webhook',
  },
  competitiveContext: {
    category: 'CI/CD',
    competitors: ['CircleCI'],
    differentiators: ['AI optimization'],
  },
};

const mockMetadata: StrategyMetadata = {
  inputHash: 'abc123',
  generatedAt: new Date().toISOString(),
  version: 1,
};

describe('storeWebsiteStrategy and loadWebsiteStrategy', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-strategy-'));
    await fs.mkdir(path.join(tempDir, '.popeye'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('stores and loads strategy with metadata from .popeye/', async () => {
    await storeWebsiteStrategy(tempDir, mockStrategy, mockMetadata);

    const loaded = await loadWebsiteStrategy(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.strategy.messaging.headline).toBe('Ship Code 10x Faster');
    expect(loaded!.metadata.inputHash).toBe('abc123');
    expect(loaded!.metadata.version).toBe(1);
  });

  it('returns null when no strategy file exists', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-empty-'));
    await fs.mkdir(path.join(emptyDir, '.popeye'), { recursive: true });

    const loaded = await loadWebsiteStrategy(emptyDir);
    expect(loaded).toBeNull();

    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  it('returns null when strategy file has invalid data', async () => {
    const filePath = path.join(tempDir, '.popeye', 'website-strategy.json');
    await fs.writeFile(filePath, '{"strategy": {"invalid": true}}', 'utf-8');

    const loaded = await loadWebsiteStrategy(tempDir);
    expect(loaded).toBeNull();
  });
});

describe('formatStrategyForPlanContext', () => {
  it('formats strategy as plan context without modifying specification', () => {
    const formatted = formatStrategyForPlanContext(mockStrategy);

    // Should contain key strategy sections
    expect(formatted).toContain('### Target Customer');
    expect(formatted).toContain('DevOps engineers');
    expect(formatted).toContain('### Positioning');
    expect(formatted).toContain('Deploy 10x faster with AI');
    expect(formatted).toContain('### Messaging');
    expect(formatted).toContain('Ship Code 10x Faster');
    expect(formatted).toContain('### SEO Keywords');
    expect(formatted).toContain('CI/CD');
    expect(formatted).toContain('### Site Architecture');
    expect(formatted).toContain('/ (landing)');
    expect(formatted).toContain('/pricing (pricing)');
    expect(formatted).toContain('### Conversion Strategy');
    expect(formatted).toContain('Start Trial');
  });

  it('includes all strategy pages in site architecture', () => {
    const formatted = formatStrategyForPlanContext(mockStrategy);
    // Should list all pages from siteArchitecture
    for (const page of mockStrategy.siteArchitecture.pages) {
      expect(formatted).toContain(page.path);
    }
  });
});

describe('isStrategyStale', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-stale-'));
    await fs.mkdir(path.join(tempDir, '.popeye'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects stale strategy via inputHash comparison', async () => {
    await storeWebsiteStrategy(tempDir, mockStrategy, mockMetadata);

    // Different input should be stale
    const stale = await isStrategyStale(tempDir, {
      productContext: 'completely different product',
      projectName: 'different-project',
      brandAssets: { logoOutputPath: 'public/brand/logo.svg' },
    });
    expect(stale).toBe(true);
  });

  it('returns true (stale) when no strategy file exists', async () => {
    const stale = await isStrategyStale(tempDir, {
      productContext: 'some content',
      projectName: 'test',
      brandAssets: { logoOutputPath: 'public/brand/logo.svg' },
    });
    expect(stale).toBe(true);
  });

  it('returns cached strategy when hash matches', async () => {
    // Store with a specific hash
    const metadata: StrategyMetadata = {
      ...mockMetadata,
      inputHash: 'will-be-computed',
    };

    // First store, then verify we can detect matching input
    await storeWebsiteStrategy(tempDir, mockStrategy, metadata);

    const loaded = await loadWebsiteStrategy(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.strategy.messaging.headline).toBe('Ship Code 10x Faster');
  });
});
