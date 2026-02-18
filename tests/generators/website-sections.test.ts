/**
 * Tests for website-sections module
 * Verifies FAQ, Stats (no fake numbers), HowItWorks, PainPoints
 */

import { describe, it, expect } from 'vitest';
import {
  mapFeatureIcon,
  isNumericMetric,
  generatePainPointsSection,
  generateDifferentiatorsSection,
  generateHowItWorksSection,
  generateStatsSection,
  generateSocialProofSection,
  generateFaqSection,
  buildFaqItemsDeclaration,
  generateFaqItemComponent,
  generateFaqSectionComponent,
  generatePricingTeaserSection,
} from '../../src/generators/templates/website-sections.js';
import type { WebsiteStrategyDocument } from '../../src/types/website-strategy.js';

function makeStrategy(overrides?: Partial<WebsiteStrategyDocument>): WebsiteStrategyDocument {
  return {
    icp: { primaryPersona: 'devs', painPoints: ['No ACL', 'Slow queries'], goals: [], objections: ['Is it secure?'] },
    positioning: {
      category: 'Security',
      differentiators: ['Zero-trust', 'DB agnostic'],
      valueProposition: 'Secure AI access',
      proofPoints: ['SOC2 compliant', '10K+ queries/sec', '99.9% uptime'],
    },
    messaging: { headline: 'h', subheadline: 's', elevatorPitch: 'e', longDescription: 'l' },
    seoStrategy: { primaryKeywords: [], secondaryKeywords: [], longTailKeywords: [], titleTemplates: {}, metaDescriptions: {} },
    siteArchitecture: { pages: [{ path: '/', title: 'Home', purpose: '', pageType: 'landing', sections: ['Sign Up', 'Configure', 'Deploy'], seoKeywords: [], conversionGoal: '' }], navigation: [], footerSections: [] },
    conversionStrategy: { primaryCta: { text: 'Go', href: '/' }, secondaryCta: { text: 'More', href: '/' }, trustSignals: [], socialProof: ['Great tool!'], leadCapture: 'none' },
    competitiveContext: { category: 'sec', competitors: [], differentiators: [] },
    ...overrides,
  };
}

describe('mapFeatureIcon', () => {
  it('maps security-related features to Shield icon', () => {
    expect(mapFeatureIcon('Access Control')).toBe('Shield');
    expect(mapFeatureIcon('Authentication')).toBe('Shield');
  });

  it('maps search features to Search icon', () => {
    expect(mapFeatureIcon('Vector Search')).toBe('Search');
  });

  it('returns Star for unknown features', () => {
    expect(mapFeatureIcon('Something Unique')).toBe('Star');
  });
});

describe('isNumericMetric', () => {
  it('detects numeric metrics', () => {
    expect(isNumericMetric('10K+ queries/sec')).toBe(true);
    expect(isNumericMetric('99.9% uptime')).toBe(true);
    expect(isNumericMetric('500+ customers')).toBe(true);
  });

  it('rejects qualitative metrics', () => {
    expect(isNumericMetric('SOC2 compliant')).toBe(false);
    expect(isNumericMetric('Enterprise ready')).toBe(false);
    expect(isNumericMetric('Audit-ready')).toBe(false);
  });
});

describe('generatePainPointsSection', () => {
  it('renders pain points from strategy', () => {
    const { jsx, info } = generatePainPointsSection(makeStrategy());
    expect(jsx).toContain('No ACL');
    expect(jsx).toContain('Slow queries');
    expect(info.dataSource).toBe('strategy');
    expect(info.itemCount).toBe(2);
  });

  it('skips when no pain points', () => {
    const strategy = makeStrategy({ icp: { primaryPersona: 'devs', painPoints: [], goals: [], objections: [] } });
    const { jsx, info } = generatePainPointsSection(strategy);
    expect(jsx).toBe('');
    expect(info.dataSource).toBe('skipped');
  });
});

describe('generateDifferentiatorsSection', () => {
  it('renders differentiators with value proposition heading', () => {
    const { jsx, info } = generateDifferentiatorsSection(makeStrategy());
    expect(jsx).toContain('Secure AI access');
    expect(jsx).toContain('Zero-trust');
    expect(info.dataSource).toBe('strategy');
  });

  it('skips when no differentiators', () => {
    const strategy = makeStrategy({
      positioning: { category: 'x', differentiators: [], valueProposition: '', proofPoints: [] },
    });
    const { jsx, info } = generateDifferentiatorsSection(strategy);
    expect(jsx).toBe('');
    expect(info.dataSource).toBe('skipped');
  });
});

describe('generateHowItWorksSection', () => {
  it('renders with strategy sections', () => {
    const { jsx, info } = generateHowItWorksSection(makeStrategy());
    expect(jsx).toContain('How it works');
    expect(info.dataSource).toBe('strategy');
    expect(info.itemCount).toBe(3);
  });

  it('uses defaults when no strategy', () => {
    const { jsx, info } = generateHowItWorksSection(undefined);
    expect(jsx).toContain('Sign Up');
    expect(jsx).toContain('Configure');
    expect(jsx).toContain('Deploy');
    expect(info.dataSource).toBe('defaults');
  });
});

describe('generateStatsSection', () => {
  it('renders numeric metrics as stats and qualitative as badges', () => {
    const { jsx, info } = generateStatsSection(makeStrategy());

    // Numeric: rendered as big stat
    expect(jsx).toContain('10K+ queries/sec');
    expect(jsx).toContain('99.9% uptime');

    // Qualitative: rendered as badge
    expect(jsx).toContain('SOC2 compliant');

    expect(info.dataSource).toBe('strategy');
    expect(info.itemCount).toBe(3);
  });

  it('does NOT fabricate numeric stats from qualitative data', () => {
    const strategy = makeStrategy({
      positioning: {
        category: 'x',
        differentiators: [],
        valueProposition: '',
        proofPoints: ['Audit-ready', 'HIPAA compliant'],
      },
    });
    const { jsx } = generateStatsSection(strategy);

    // Should NOT contain fabricated numbers
    expect(jsx).not.toContain('10K+');
    expect(jsx).not.toContain('99.9%');
    // Should contain qualitative badges
    expect(jsx).toContain('Audit-ready');
    expect(jsx).toContain('HIPAA compliant');
  });

  it('skips when no proof points', () => {
    const strategy = makeStrategy({
      positioning: { category: 'x', differentiators: [], valueProposition: '', proofPoints: [] },
    });
    const { jsx, info } = generateStatsSection(strategy);
    expect(jsx).toBe('');
    expect(info.dataSource).toBe('skipped');
  });
});

describe('generateSocialProofSection', () => {
  it('renders social proof quotes', () => {
    const { jsx, info } = generateSocialProofSection(makeStrategy());
    expect(jsx).toContain('Great tool!');
    expect(info.dataSource).toBe('strategy');
  });

  it('skips when empty', () => {
    const strategy = makeStrategy({
      conversionStrategy: {
        primaryCta: { text: 'Go', href: '/' },
        secondaryCta: { text: 'More', href: '/' },
        trustSignals: [],
        socialProof: [],
        leadCapture: 'none',
      },
    });
    const { jsx, info } = generateSocialProofSection(strategy);
    expect(jsx).toBe('');
    expect(info.dataSource).toBe('skipped');
  });
});

describe('generateFaqSection', () => {
  it('renders FAQ from objections', () => {
    const { jsx, info, needsClientDirective } = generateFaqSection(makeStrategy());
    // FAQ section uses FaqSection component (separate client component)
    expect(jsx).toContain('FaqSection');
    expect(jsx).toContain('faqItems');
    expect(info.dataSource).toBe('strategy');
    expect(needsClientDirective).toBe(true);
  });

  it('builds FAQ items declaration with objection content', () => {
    const decl = buildFaqItemsDeclaration(makeStrategy());
    expect(decl).toContain('Is it secure?');
    expect(decl).toContain('faqItems');
  });

  it('includes keyboard-accessible accordion in FaqItem component', () => {
    const component = generateFaqItemComponent();
    expect(component).toContain('aria-expanded');
    expect(component).toContain('onClick');
  });

  it('generates standalone FaqSection client component', () => {
    const component = generateFaqSectionComponent();
    expect(component).toContain("'use client'");
    expect(component).toContain('useState');
    expect(component).toContain('FaqSection');
    expect(component).toContain('FaqItem');
    expect(component).toContain('aria-expanded');
    expect(component).toContain('ChevronDown');
  });

  it('skips when no objections', () => {
    const strategy = makeStrategy({
      icp: { primaryPersona: 'devs', painPoints: [], goals: [], objections: [] },
    });
    const { jsx, info } = generateFaqSection(strategy);
    expect(jsx).toBe('');
    expect(info.dataSource).toBe('skipped');
  });
});

describe('generatePricingTeaserSection', () => {
  it('renders teaser when pricing exists', () => {
    const { jsx, info } = generatePricingTeaserSection({
      productName: 'Test',
      features: [],
      rawDocs: '',
      pricing: [
        { name: 'Free', price: 'Free', description: 'Basic', features: [], cta: 'Start' },
        { name: 'Pro', price: '$99', period: '/mo', description: 'Full', features: [], cta: 'Buy', featured: true },
      ],
    });
    expect(jsx).toContain('$99');
    expect(jsx).toContain('View full pricing');
    expect(info.dataSource).toBe('docs');
  });

  it('skips when no pricing', () => {
    const { jsx, info } = generatePricingTeaserSection({
      productName: 'Test',
      features: [],
      rawDocs: '',
    });
    expect(jsx).toBe('');
    expect(info.dataSource).toBe('skipped');
  });
});
