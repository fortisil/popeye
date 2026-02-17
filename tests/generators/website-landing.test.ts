/**
 * Tests for website-landing module
 * Verifies 10-section landing page generation with strategy data flow
 */

import { describe, it, expect } from 'vitest';
import { generateWebsiteLandingPageWithInfo } from '../../src/generators/templates/website-landing.js';
import type { WebsiteContentContext } from '../../src/generators/website-context.js';
import type { WebsiteStrategyDocument } from '../../src/types/website-strategy.js';

function makeStrategy(overrides?: Partial<WebsiteStrategyDocument>): WebsiteStrategyDocument {
  return {
    icp: {
      primaryPersona: 'Engineering teams',
      painPoints: ['Data leaks', 'No access control', 'Compliance gaps'],
      goals: ['Secure AI access'],
      objections: ['Is it secure?', 'Does it scale?'],
    },
    positioning: {
      category: 'AI Security',
      differentiators: ['Zero-trust by default', 'Vector DB agnostic'],
      valueProposition: 'Secure AI data access without complexity',
      proofPoints: ['SOC2 compliant', '10K+ queries/sec'],
    },
    messaging: {
      headline: 'Secure AI Retrieval',
      subheadline: 'Permission-aware access for AI agents',
      elevatorPitch: 'Stop worrying about data leaks',
      longDescription: 'A permission-aware retrieval layer for AI systems.',
    },
    seoStrategy: {
      primaryKeywords: ['AI security'],
      secondaryKeywords: [],
      longTailKeywords: [],
      titleTemplates: { home: 'Gateco - AI Security' },
      metaDescriptions: { home: 'Secure AI retrieval' },
    },
    siteArchitecture: {
      pages: [],
      navigation: [{ label: 'Features', href: '/#features' }],
      footerSections: [],
    },
    conversionStrategy: {
      primaryCta: { text: 'Try Free', href: '/signup' },
      secondaryCta: { text: 'View Docs', href: '/docs' },
      trustSignals: ['Enterprise ready', 'SOC2 compliant'],
      socialProof: ['Great product!'],
      leadCapture: 'none',
    },
    competitiveContext: { category: 'Security', competitors: [], differentiators: [] },
    ...overrides,
  };
}

function makeContext(overrides?: Partial<WebsiteContentContext>): WebsiteContentContext {
  return {
    productName: 'Gateco',
    features: [
      { title: 'Access Control', description: 'Fine-grained permissions' },
      { title: 'Vector Search', description: 'Fast semantic search' },
      { title: 'Audit Trail', description: 'Full audit logging' },
    ],
    rawDocs: 'docs content here',
    description: 'A permission-aware retrieval layer for AI systems.',
    pricing: [
      { name: 'Free', price: 'Free', description: 'Dev & POC', features: ['Basic'], cta: 'Start', featured: false },
      { name: 'Pro', price: '$99', period: '/month', description: 'Production', features: ['All'], cta: 'Subscribe', featured: true },
    ],
    strategy: makeStrategy(),
    ...overrides,
  };
}

describe('generateWebsiteLandingPageWithInfo', () => {
  it('generates page with all 10 sections when full context provided', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());

    // Hero
    expect(result.code).toContain('Secure AI Retrieval');
    expect(result.code).toContain('AI Security'); // eyebrow category

    // Sections rendered info should have all sections
    const sectionNames = result.sections.map(s => s.name);
    expect(sectionNames).toContain('Hero');
    expect(sectionNames).toContain('PainPoints');
    expect(sectionNames).toContain('Differentiators');
    expect(sectionNames).toContain('Features');
    expect(sectionNames).toContain('HowItWorks');
    expect(sectionNames).toContain('Stats');
    expect(sectionNames).toContain('SocialProof');
    expect(sectionNames).toContain('PricingTeaser');
    expect(sectionNames).toContain('FAQ');
    expect(sectionNames).toContain('FinalCTA');
  });

  it('includes strategy headline in hero', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Secure AI Retrieval');
  });

  it('includes pain points from strategy', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Data leaks');
    expect(result.code).toContain('No access control');
  });

  it('includes differentiators from strategy', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Zero-trust by default');
    expect(result.code).toContain('Vector DB agnostic');
  });

  it('renders features with lucide icons', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Access Control');
    expect(result.code).toContain('lucide-react');
    expect(result.code).toContain('ICON_MAP');
  });

  it('renders FAQ from strategy objections', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Is it secure?');
    expect(result.code).toContain('Does it scale?');
    expect(result.code).toContain('FaqItem');
  });

  it('renders pricing teaser from context pricing', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('View full pricing');
    expect(result.code).toContain('$99');
  });

  it('skips sections when data is missing', () => {
    const ctx = makeContext({
      strategy: makeStrategy({
        icp: { primaryPersona: 'devs', painPoints: [], goals: [], objections: [] },
        positioning: { category: 'SaaS', differentiators: [], valueProposition: '', proofPoints: [] },
        conversionStrategy: {
          primaryCta: { text: 'Go', href: '/' },
          secondaryCta: { text: 'More', href: '/' },
          trustSignals: [],
          socialProof: [],
          leadCapture: 'none',
        },
      }),
      pricing: undefined,
    });
    const result = generateWebsiteLandingPageWithInfo('gateco', ctx);

    const skipped = result.sections.filter(s => s.dataSource === 'skipped');
    expect(skipped.map(s => s.name)).toContain('PainPoints');
    expect(skipped.map(s => s.name)).toContain('SocialProof');
    expect(skipped.map(s => s.name)).toContain('FAQ');
    expect(skipped.map(s => s.name)).toContain('PricingTeaser');
  });

  it('uses product name as headline when no strategy', () => {
    const ctx = makeContext({ strategy: undefined });
    const result = generateWebsiteLandingPageWithInfo('gateco', ctx);
    expect(result.code).toContain('Gateco');
  });

  it('renders only a single H1', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    const h1Count = (result.code.match(/<h1/g) || []).length;
    expect(h1Count).toBe(1);
  });

  it('includes trust signals in hero', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Enterprise ready');
    expect(result.code).toContain('SOC2 compliant');
  });

  it('includes dual CTAs from strategy', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Try Free');
    expect(result.code).toContain('View Docs');
  });

  it('includes JSON-LD schemas', () => {
    const result = generateWebsiteLandingPageWithInfo('gateco', makeContext());
    expect(result.code).toContain('Organization');
    expect(result.code).toContain('SoftwareApplication');
    // FAQ schema when objections exist
    expect(result.code).toContain('FAQPage');
  });
});
