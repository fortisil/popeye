/**
 * Tests for doc-parser module
 * Verifies feature extraction, dev-task filtering, docs-first priority
 */

import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  extractProductName,
  extractTagline,
  extractDescription,
  extractPrimaryColor,
  extractPricing,
  isSuspiciousProductName,
} from '../../src/generators/doc-parser.js';

describe('extractFeatures', () => {
  it('extracts features from docs bullet list', () => {
    const docs = `# Product\n## Features\n- **Fast Search** - Lightning fast search\n- **Auth** - Built-in authentication`;
    const features = extractFeatures(docs);
    expect(features.length).toBeGreaterThanOrEqual(2);
    expect(features[0].title).toBe('Fast Search');
  });

  it('extracts from docs before specification', () => {
    const docs = `# Product\n## Features\n- **Real Feature** - From docs`;
    const spec = `## Features\n- Implement login page\n- Fix CSS bug`;
    const features = extractFeatures(docs, spec);
    // Should use docs features, not spec dev tasks
    expect(features[0].title).toBe('Real Feature');
  });

  it('falls back to specification when docs have no features', () => {
    const docs = `# Product\n## About\nJust a description.`;
    const spec = `## Core Design Principles\n1. **Vector DB agnostic**\n2. **Embedding agnostic**`;
    const features = extractFeatures(docs, spec);
    expect(features.length).toBeGreaterThanOrEqual(2);
    expect(features[0].title).toContain('Vector DB');
  });

  it('filters out dev-task verbs', () => {
    const docs = `# Tasks\n## Features\n- Implement user auth\n- Fix broken login\n- **Real Feature** - Does real stuff\n- Refactor database layer`;
    const features = extractFeatures(docs);
    // Dev tasks should be filtered out
    expect(features.some(f => f.title.startsWith('Implement'))).toBe(false);
    expect(features.some(f => f.title.startsWith('Fix'))).toBe(false);
    expect(features.some(f => f.title.startsWith('Refactor'))).toBe(false);
    // Real feature should remain
    expect(features.some(f => f.title === 'Real Feature')).toBe(true);
  });

  it('returns empty when no feature sections exist', () => {
    const docs = `# README\nJust a readme file.`;
    const features = extractFeatures(docs);
    expect(features).toEqual([]);
  });

  it('limits features to 6', () => {
    const items = Array.from({ length: 10 }, (_, i) => `- **Feature ${i + 1}** - Description ${i + 1}`).join('\n');
    const docs = `## Features\n${items}`;
    const features = extractFeatures(docs);
    expect(features.length).toBeLessThanOrEqual(6);
  });
});

describe('extractProductName', () => {
  it('extracts from "# Name -- tagline" heading', () => {
    const docs = '# Gateco -- Permission-Aware Retrieval';
    expect(extractProductName(docs)).toBe('Gateco');
  });

  it('picks shortest name when multiple headings', () => {
    const docs = '# Gateco -- main product\n# Gateco UI Color System -- colors';
    expect(extractProductName(docs)).toBe('Gateco');
  });

  it('returns undefined when no match', () => {
    expect(extractProductName('Just some text')).toBeUndefined();
  });
});

describe('extractPrimaryColor', () => {
  it('extracts accent-primary token', () => {
    const docs = '| `accent-primary` | `#2563EB` | Primary CTA |';
    expect(extractPrimaryColor(docs)).toBe('#2563EB');
  });

  it('skips dark background colors', () => {
    const docs = '| bg | #0F172A |\n| accent-primary | #2563EB |';
    expect(extractPrimaryColor(docs)).toBe('#2563EB');
  });
});

describe('isSuspiciousProductName', () => {
  it('flags directory-like names', () => {
    expect(isSuspiciousProductName('my-cool-project')).toBe(true);
    expect(isSuspiciousProductName('my-app')).toBe(true);
  });

  it('allows real product names', () => {
    expect(isSuspiciousProductName('Gateco')).toBe(false);
    expect(isSuspiciousProductName('SuperApp')).toBe(false);
  });
});

describe('extractPricing', () => {
  it('extracts pricing tiers from markdown table', () => {
    const docs = `## Pricing\n| Plan | Price |\n|---|---|\n| Free | Free |\n| Pro | $99/month minimum |\n| Enterprise | Custom pricing |`;
    const tiers = extractPricing(docs);
    expect(tiers).toBeDefined();
    expect(tiers!.length).toBe(3);
    expect(tiers![0].name).toContain('Free');
    expect(tiers![1].price).toBe('$99');
    expect(tiers![2].price).toBe('Custom');
  });

  it('returns undefined when no pricing found', () => {
    const docs = '# Product\nJust a product.';
    expect(extractPricing(docs)).toBeUndefined();
  });
});
