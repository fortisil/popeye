/**
 * Tests for website-context module
 * Verifies doc discovery, brand asset detection, and context building
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  discoverProjectDocs,
  readProjectDocs,
  findBrandAssets,
  buildWebsiteContext,
  validateWebsiteContextOrThrow,
  type WebsiteContentContext,
} from '../../src/generators/website-context.js';

describe('discoverProjectDocs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('finds .md files matching spec/pricing/color patterns', async () => {
    await fs.writeFile(path.join(tmpDir, 'product-spec.md'), '# Product Spec');
    await fs.writeFile(path.join(tmpDir, 'pricing.md'), '# Pricing');
    await fs.writeFile(path.join(tmpDir, 'color-scheme.md'), '# Colors');
    await fs.writeFile(path.join(tmpDir, 'random-notes.md'), '# Notes');

    const docs = await discoverProjectDocs(tmpDir);

    expect(docs.length).toBe(3);
    expect(docs.some((d) => d.includes('product-spec.md'))).toBe(true);
    expect(docs.some((d) => d.includes('pricing.md'))).toBe(true);
    expect(docs.some((d) => d.includes('color-scheme.md'))).toBe(true);
    // random-notes.md should NOT match
    expect(docs.some((d) => d.includes('random-notes.md'))).toBe(false);
  });

  it('ignores node_modules and .popeye directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'node_modules', 'spec.md'),
      '# Should be ignored'
    );
    await fs.mkdir(path.join(tmpDir, '.popeye'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.popeye', 'spec.md'),
      '# Should be ignored'
    );
    await fs.writeFile(path.join(tmpDir, 'real-spec.md'), '# Real spec');

    const docs = await discoverProjectDocs(tmpDir);

    expect(docs.length).toBe(1);
    expect(docs[0]).toContain('real-spec.md');
  });

  it('returns empty for directory with no docs', async () => {
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'export const x = 1;');

    const docs = await discoverProjectDocs(tmpDir);

    expect(docs).toEqual([]);
  });

  it('scans docs/ subdirectory', async () => {
    await fs.mkdir(path.join(tmpDir, 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'docs', 'api-guide.md'),
      '# API Guide'
    );

    const docs = await discoverProjectDocs(tmpDir);

    expect(docs.length).toBe(1);
    expect(docs[0]).toContain('api-guide.md');
  });
});

describe('readProjectDocs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('concatenates content with headers and caps at maxLength', async () => {
    const file1 = path.join(tmpDir, 'spec.md');
    const file2 = path.join(tmpDir, 'pricing.md');
    await fs.writeFile(file1, 'Spec content here');
    await fs.writeFile(file2, 'Pricing content here');

    const result = await readProjectDocs([file1, file2]);

    expect(result).toContain('--- spec.md ---');
    expect(result).toContain('Spec content here');
    expect(result).toContain('--- pricing.md ---');
    expect(result).toContain('Pricing content here');
  });

  it('respects maxLength cap', async () => {
    const file1 = path.join(tmpDir, 'big.md');
    await fs.writeFile(file1, 'x'.repeat(10000));

    const result = await readProjectDocs([file1], 100);

    expect(result.length).toBeLessThanOrEqual(120); // header + trimmed content
    expect(result).toContain('...');
  });
});

describe('findBrandAssets', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('finds logo PNG/SVG files', async () => {
    await fs.writeFile(path.join(tmpDir, 'Company Logo.png'), 'fake-png');

    const result = await findBrandAssets(tmpDir);

    expect(result.logoPath).toBeDefined();
    expect(result.logoPath).toContain('Logo.png');
  });

  it('returns empty when no logo found', async () => {
    await fs.writeFile(path.join(tmpDir, 'screenshot.png'), 'fake-png');

    const result = await findBrandAssets(tmpDir);

    expect(result.logoPath).toBeUndefined();
  });
});

describe('buildWebsiteContext', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates structured context from docs with specification', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'color-scheme.md'),
      '# Colors\nPrimary: #2563EB\n'
    );

    const context = await buildWebsiteContext(
      tmpDir,
      'my-project',
      '# Overview\nA permission-aware retrieval layer for AI systems.\n## Features\n- Access control'
    );

    expect(context.productName).toBe('my-project');
    expect(context.description).toContain('permission-aware');
    expect(context.brand?.primaryColor).toBe('#2563EB');
    expect(context.rawDocs).toContain('color-scheme.md');
  });

  it('returns minimal context when no docs exist', async () => {
    const context = await buildWebsiteContext(tmpDir, 'empty-project');

    expect(context.productName).toBe('empty-project');
    expect(context.features).toEqual([]);
    expect(context.rawDocs).toBe('');
  });

  it('extracts product name, tagline, features, and pricing from rich docs', async () => {
    // Simulate Gateco-like docs (wrapped in code fences like the real files)
    await fs.writeFile(
      path.join(tmpDir, 'Gateco-spec.md'),
      '```md\n# Gateco — Permission-Aware Retrieval for AI Systems\n\n## 2. What Is Gateco?\n\n**Gateco** is a permission-aware retrieval layer that sits between AI agents and vector databases.\n\nIt enforces:\n- organizational permissions\n- identity-based access control\n\n## 3. Core Design Principles\n\n1. **Vector DB agnostic**\n2. **Embedding agnostic**\n3. **Identity-driven** - not prompt-driven\n4. **Late-binding authorization**\n```'
    );
    await fs.writeFile(
      path.join(tmpDir, 'Gateco-pricing.md'),
      '```md\n# Gateco Pricing\n\n## Pricing Overview\n\n| Plan | Price |\n|---|---|\n| **Free (Dev & POC)** | Free |\n| **Pro (Usage-Based)** | $99 / month minimum |\n| **Enterprise** | Custom pricing |\n\n## Plan Positioning\n\n- **Free (Dev & POC)**\n  *Build and test safely.*\n\n- **Pro (Usage-Based)**\n  *Run production AI workloads.*\n\n- **Enterprise**\n  *Deploy in regulated environments.*\n```'
    );
    await fs.writeFile(
      path.join(tmpDir, 'color-scheme.md'),
      '# Colors\n\n| Token | Hex | Usage |\n|---|---|---|\n| `bg-primary` | `#0F172A` | Dark background |\n| `accent-primary` | `#2563EB` | Primary CTA, links |\n'
    );

    const context = await buildWebsiteContext(tmpDir, 'read-all-files');

    // Product name extracted from spec heading, not folder name
    expect(context.productName).toBe('Gateco');
    // Tagline from "— tagline" pattern
    expect(context.tagline).toContain('Permission-Aware Retrieval');
    // Description from "What Is Gateco?" section
    expect(context.description).toContain('permission-aware retrieval layer');
    // Features extracted from Core Design Principles
    expect(context.features.length).toBeGreaterThanOrEqual(2);
    expect(context.features.some((f) => f.title.includes('Vector DB'))).toBe(true);
    // Pricing tiers extracted
    expect(context.pricing).toBeDefined();
    expect(context.pricing!.length).toBe(3);
    expect(context.pricing![0].name).toContain('Free');
    expect(context.pricing![1].price).toBe('$99');
    expect(context.pricing![2].price).toBe('Custom');
    // Primary color is accent-primary (#2563EB), NOT bg-primary (#0F172A)
    expect(context.brand?.primaryColor).toBe('#2563EB');
  });

  it('discovers docs from parent directory via workspace root', async () => {
    // Simulate: tmpDir has docs, tmpDir/project/.popeye/ is the project dir
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(path.join(projectDir, '.popeye'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'product-spec.md'),
      '# MyProduct — A great product\n## Features\n- Feature 1'
    );

    const context = await buildWebsiteContext(projectDir, 'project');

    // Should find docs from parent directory
    expect(context.rawDocs).toContain('product-spec.md');
    expect(context.productName).toBe('MyProduct');
  });

  it('finds brand assets from parent directory', async () => {
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'company-logo.png'), 'fake-png');

    const result = await findBrandAssets(projectDir);

    // findBrandAssets now scans parent dirs via workspace root
    // The logo should be found in tmpDir
    expect(result.logoPath).toBeDefined();
    expect(result.logoPath).toContain('company-logo.png');
  });

  it('enforces per-file cap to prevent single large doc from consuming budget', async () => {
    await fs.writeFile(path.join(tmpDir, 'huge-spec.md'), 'x'.repeat(20000));
    await fs.writeFile(path.join(tmpDir, 'color-scheme.md'), '# Colors\nPrimary: #FF0000');

    const docs = await discoverProjectDocs(tmpDir);
    const content = await readProjectDocs(docs);

    // Color-scheme should be present (it's prioritized and small)
    expect(content).toContain('color-scheme.md');
    // The huge spec should be capped at 8000 chars
    const specSection = content.split('--- huge-spec.md ---')[1];
    if (specSection) {
      // Per-file cap is 8000 + "..." suffix
      expect(specSection.length).toBeLessThan(8100);
    }
  });
});

describe('validateWebsiteContextOrThrow', () => {
  const baseContext: WebsiteContentContext = {
    productName: 'Gateco',
    features: [{ title: 'Auth', description: 'Access control' }],
    rawDocs: 'x'.repeat(200),
    strategy: {
      icp: { primaryPersona: 'devs', painPoints: [], goals: [], objections: [] },
      positioning: { category: 'Security', differentiators: [], valueProposition: 'Secure AI', proofPoints: [] },
      messaging: { headline: 'h', subheadline: 's', elevatorPitch: 'e', longDescription: 'l' },
      seoStrategy: { primaryKeywords: [], secondaryKeywords: [], longTailKeywords: [], titleTemplates: {}, metaDescriptions: {} },
      siteArchitecture: { pages: [], navigation: [], footerSections: [] },
      conversionStrategy: { primaryCta: { text: 'Go', href: '/' }, secondaryCta: { text: 'More', href: '/' }, trustSignals: [], socialProof: [], leadCapture: 'none' },
      competitiveContext: { category: 'sec', competitors: [], differentiators: [] },
    },
  };

  it('passes with valid context', () => {
    const result = validateWebsiteContextOrThrow(baseContext, 'gateco');
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails when strategy is missing', () => {
    const ctx: WebsiteContentContext = { ...baseContext, strategy: undefined };
    expect(() => validateWebsiteContextOrThrow(ctx, 'gateco')).toThrow('strategy missing');
  });

  it('fails when features are empty', () => {
    const ctx: WebsiteContentContext = { ...baseContext, features: [] };
    expect(() => validateWebsiteContextOrThrow(ctx, 'gateco')).toThrow('features');
  });

  it('fails when product name looks like a directory', () => {
    const ctx: WebsiteContentContext = { ...baseContext, productName: 'my-cool-project' };
    expect(() => validateWebsiteContextOrThrow(ctx, 'x')).toThrow('directory name');
  });

  it('fails when no docs found', () => {
    const ctx: WebsiteContentContext = { ...baseContext, rawDocs: '' };
    expect(() => validateWebsiteContextOrThrow(ctx, 'gateco')).toThrow('documentation');
  });

  it('fails when brand/color docs exist but no color extracted', () => {
    const ctx: WebsiteContentContext = {
      ...baseContext,
      rawDocs: 'x'.repeat(200) + 'color brand guide',
      brand: undefined,
    };
    expect(() => validateWebsiteContextOrThrow(ctx, 'gateco')).toThrow('primary color');
  });

  it('fails when logo found but output path not resolved', () => {
    const ctx: WebsiteContentContext = {
      ...baseContext,
      brand: { logoPath: '/some/logo.png' },
      brandAssets: undefined,
    };
    expect(() => validateWebsiteContextOrThrow(ctx, 'gateco')).toThrow('output path not resolved');
  });
});
