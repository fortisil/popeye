/**
 * Tests for website content quality gate
 * Verifies that validateWebsiteContextOrThrow blocks generic websites
 * and validateWebsiteContext returns structured soft validation results
 */

import { describe, it, expect } from 'vitest';
import {
  validateWebsiteContextOrThrow,
  validateWebsiteContext,
} from '../../src/generators/website-context.js';
import type { WebsiteContentContext } from '../../src/generators/website-context.js';

function makeContext(overrides: Partial<WebsiteContentContext> = {}): WebsiteContentContext {
  return {
    productName: 'Gateco',
    features: [
      { title: 'Access Control', description: 'Fine-grained permissions' },
      { title: 'Vector DB Agnostic', description: 'Works with any vector database' },
    ],
    rawDocs: '--- spec.md ---\n# Gateco\nLong enough content to pass validation threshold.\n' + 'x'.repeat(100),
    strategy: {
      icp: { primaryPersona: 'devs', painPoints: [], goals: [], objections: [] },
      positioning: { category: 'Security', differentiators: [], valueProposition: 'Secure AI', proofPoints: [] },
      messaging: { headline: 'h', subheadline: 's', elevatorPitch: 'e', longDescription: 'l' },
      seoStrategy: { primaryKeywords: [], secondaryKeywords: [], longTailKeywords: [], titleTemplates: {}, metaDescriptions: {} },
      siteArchitecture: { pages: [], navigation: [], footerSections: [] },
      conversionStrategy: { primaryCta: { text: 'Go', href: '/' }, secondaryCta: { text: 'More', href: '/' }, trustSignals: [], socialProof: [], leadCapture: 'none' },
      competitiveContext: { category: 'sec', competitors: [], differentiators: [] },
    },
    ...overrides,
  };
}

describe('validateWebsiteContextOrThrow', () => {
  it('passes validation with valid product context', () => {
    const context = makeContext();

    expect(() => validateWebsiteContextOrThrow(context, 'gateco')).not.toThrow();
  });

  it('throws on suspicious product name (directory-like)', () => {
    const context = makeContext({ productName: 'read-all-files' });

    expect(() => validateWebsiteContextOrThrow(context, 'read-all-files')).toThrow(
      /looks like a directory name/
    );
  });

  it('throws when no docs found', () => {
    const context = makeContext({ rawDocs: '' });

    expect(() => validateWebsiteContextOrThrow(context, 'test')).toThrow(
      /No project documentation found/
    );
  });

  it('throws when no features extracted', () => {
    const context = makeContext({ features: [] });

    expect(() => validateWebsiteContextOrThrow(context, 'test')).toThrow(
      /No product features extracted/
    );
  });

  it('includes POPEYE_DEBUG_WEBSITE hint in error message', () => {
    const context = makeContext({ rawDocs: '' });

    try {
      validateWebsiteContextOrThrow(context, 'test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('POPEYE_DEBUG_WEBSITE=1');
    }
  });

  it('still throws when passed is false from validateWebsiteContext', () => {
    // Context with multiple blocking issues
    const context = makeContext({
      productName: 'my-app',
      rawDocs: '',
      features: [],
      strategy: undefined,
    });

    expect(() => validateWebsiteContextOrThrow(context, 'my-app')).toThrow(
      /Website generation blocked/
    );
  });
});

describe('validateWebsiteContext (soft mode)', () => {
  it('returns passed=true with no issues for valid context', () => {
    const context = makeContext({ tagline: 'Secure your AI' });
    const result = validateWebsiteContext(context, 'gateco');

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.contentScore).toBeGreaterThanOrEqual(90);
  });

  it('returns warnings without marking passed=false', () => {
    // Valid context but missing tagline triggers a warning, not an issue
    const context = makeContext({ tagline: undefined });
    const result = validateWebsiteContext(context, 'gateco');

    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /tagline/i.test(w))).toBe(true);
  });

  it('detects default pricing fingerprint as a warning', () => {
    const context = makeContext({
      pricing: [
        { name: 'Free', price: '$0', description: 'Basic', features: ['1 user'], cta: 'Start' },
        { name: 'Pro', price: '$29', description: 'Team', features: ['10 users'], cta: 'Go', featured: true },
        { name: 'Enterprise', price: 'Custom', description: 'Scale', features: ['Unlimited'], cta: 'Contact' },
      ],
    });
    const result = validateWebsiteContext(context, 'gateco');

    expect(result.passed).toBe(true);
    expect(result.warnings.some((w) => /default values/i.test(w))).toBe(true);
  });

  it('does not flag custom pricing as default', () => {
    const context = makeContext({
      pricing: [
        { name: 'Hobby', price: '$9', description: 'For side projects', features: ['5 APIs'], cta: 'Start' },
        { name: 'Team', price: '$49', description: 'For teams', features: ['50 APIs'], cta: 'Go' },
      ],
    });
    const result = validateWebsiteContext(context, 'gateco');

    expect(result.warnings.some((w) => /default values/i.test(w))).toBe(false);
  });

  it('decreases contentScore with more defaults', () => {
    const minimal = makeContext({
      tagline: undefined,
      description: undefined,
      brand: undefined,
    });
    const rich = makeContext({
      tagline: 'Secure your AI',
      description: 'The best AI security platform',
      brand: { primaryColor: '#3B82F6' },
    });

    const minResult = validateWebsiteContext(minimal, 'gateco');
    const richResult = validateWebsiteContext(rich, 'gateco');

    expect(richResult.contentScore).toBeGreaterThan(minResult.contentScore);
  });

  it('returns blocking issues for missing docs', () => {
    const context = makeContext({ rawDocs: '' });
    const result = validateWebsiteContext(context, 'test');

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => /documentation/i.test(i))).toBe(true);
  });

  it('warns about missing description', () => {
    const context = makeContext({ description: undefined });
    const result = validateWebsiteContext(context, 'gateco');

    expect(result.warnings.some((w) => /description/i.test(w))).toBe(true);
  });

  it('clamps score to 0 when everything is wrong', () => {
    const context: WebsiteContentContext = {
      productName: 'my-app',
      features: [],
      rawDocs: '',
      strategy: undefined,
    };
    const result = validateWebsiteContext(context, 'my-app');

    expect(result.contentScore).toBe(0);
    expect(result.passed).toBe(false);
  });
});
