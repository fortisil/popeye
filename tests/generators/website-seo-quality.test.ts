/**
 * SEO + accessibility quality gate tests
 * Validates that generated website pages have proper SEO tags,
 * heading hierarchy, JSON-LD, OpenGraph, and accessibility attributes
 */

import { describe, it, expect } from 'vitest';
import {
  generateWebsiteLandingPage,
  generateWebsiteLayout,
  generateWebsitePricingPage,
} from '../../src/generators/templates/website.js';
import {
  generateJsonLdComponent,
  generateEnhancedSitemap,
  generate404Page,
  generate500Page,
  generateWebManifest,
  generateMetaHelper,
} from '../../src/generators/templates/website-seo.js';
import {
  generateWebsiteHeader,
  generateWebsiteFooter,
} from '../../src/generators/templates/website-components.js';
import type { WebsiteContentContext } from '../../src/generators/website-context.js';
import type { WebsiteStrategyDocument } from '../../src/types/website-strategy.js';

const mockStrategy: WebsiteStrategyDocument = {
  icp: {
    primaryPersona: 'Engineering managers at mid-size companies',
    painPoints: ['Slow deployments', 'Poor visibility'],
    goals: ['Ship faster', 'Better monitoring'],
    objections: ['Learning curve', 'Migration cost'],
  },
  positioning: {
    category: 'Developer Tools',
    differentiators: ['AI-powered', 'Zero config'],
    valueProposition: 'Deploy 10x faster with AI-powered CI/CD',
    proofPoints: ['Used by 500+ teams'],
  },
  messaging: {
    headline: 'Ship Code 10x Faster',
    subheadline: 'AI-Powered CI/CD for Modern Teams',
    elevatorPitch: 'Deploy with confidence using AI that learns your codebase.',
    longDescription: 'An AI-powered CI/CD platform that analyzes your codebase and optimizes build pipelines automatically.',
  },
  seoStrategy: {
    primaryKeywords: ['CI/CD', 'deployment automation', 'AI DevOps'],
    secondaryKeywords: ['continuous integration', 'deployment pipeline'],
    longTailKeywords: ['AI-powered CI/CD platform', 'automated deployment tool'],
    titleTemplates: { home: 'Ship Code 10x Faster', pricing: 'Plans & Pricing' },
    metaDescriptions: { home: 'AI-powered CI/CD platform', pricing: 'Simple, transparent pricing' },
  },
  siteArchitecture: {
    pages: [
      { path: '/', title: 'Home', purpose: 'conversion', pageType: 'landing', sections: ['hero', 'features'], seoKeywords: ['ci/cd'], conversionGoal: 'sign up' },
      { path: '/pricing', title: 'Pricing', purpose: 'pricing', pageType: 'pricing', sections: ['tiers'], seoKeywords: ['pricing'], conversionGoal: 'start trial' },
      { path: '/docs', title: 'Docs', purpose: 'education', pageType: 'docs', sections: ['getting-started'], seoKeywords: ['docs'], conversionGoal: 'adopt' },
    ],
    navigation: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Docs', href: '/docs' },
    ],
    footerSections: [
      { title: 'Product', links: [{ label: 'Features', href: '/#features' }] },
      { title: 'Legal', links: [{ label: 'Privacy', href: '/privacy' }] },
    ],
  },
  conversionStrategy: {
    primaryCta: { text: 'Start Free Trial', href: '/pricing' },
    secondaryCta: { text: 'Read Docs', href: '/docs' },
    trustSignals: ['SOC 2 Compliant', 'GDPR Ready'],
    socialProof: ['Used by 500+ engineering teams worldwide'],
    leadCapture: 'webhook',
  },
  competitiveContext: {
    category: 'CI/CD',
    competitors: ['CircleCI', 'GitHub Actions'],
    differentiators: ['AI-powered pipeline optimization'],
  },
};

const mockContext: WebsiteContentContext = {
  productName: 'DeployAI',
  tagline: 'Ship Code 10x Faster',
  description: 'An AI-powered CI/CD platform.',
  features: [
    { title: 'AI Optimization', description: 'Automatically optimize build pipelines' },
    { title: 'Zero Config', description: 'Works out of the box' },
    { title: 'Real-time Monitoring', description: 'Full observability' },
  ],
  brand: { primaryColor: '#2563EB' },
  rawDocs: '',
  strategy: mockStrategy,
};

describe('SEO Quality Gates', () => {
  it('layout has title and description metadata', () => {
    const layout = generateWebsiteLayout('deploy-ai', mockContext);
    expect(layout).toContain('title:');
    expect(layout).toContain('description:');
    expect(layout).toContain('DeployAI');
  });

  it('landing page has exactly one H1 tag', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    const h1Matches = page.match(/<h1[\s>]/g);
    expect(h1Matches).toHaveLength(1);
  });

  it('landing page includes JSON-LD script via component', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    expect(page).toContain('JsonLd');
    expect(page).toContain('ORG_SCHEMA');
    expect(page).toContain('PRODUCT_SCHEMA');
  });

  it('landing page includes OpenGraph meta via layout', () => {
    const layout = generateWebsiteLayout('deploy-ai', mockContext);
    expect(layout).toContain('openGraph');
    expect(layout).toContain('twitter');
  });

  it('layout includes metadataBase for canonical URLs', () => {
    const layout = generateWebsiteLayout('deploy-ai', mockContext);
    expect(layout).toContain('metadataBase');
    expect(layout).toContain('NEXT_PUBLIC_SITE_URL');
  });

  it('sitemap includes all strategy pages', () => {
    const sitemap = generateEnhancedSitemap('deploy-ai', mockStrategy);
    expect(sitemap).toContain('/pricing');
    expect(sitemap).toContain('/docs');
    // Landing page has empty path
    expect(sitemap).toContain('baseUrl');
  });

  it('landing page uses strategy headline not generic text', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    expect(page).toContain('Ship Code 10x Faster');
    expect(page).not.toContain('Welcome to');
  });

  it('landing page includes trust signals when strategy provides them', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    expect(page).toContain('SOC 2 Compliant');
    expect(page).toContain('GDPR Ready');
  });

  it('landing page includes social proof when strategy provides it', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    expect(page).toContain('500+ engineering teams');
  });

  it('pricing page has proper H1 tag', () => {
    const page = generateWebsitePricingPage('deploy-ai', mockContext);
    const h1Matches = page.match(/<h1[\s>]/g);
    expect(h1Matches).toHaveLength(1);
  });

  it('pricing page includes enterprise CTA', () => {
    const page = generateWebsitePricingPage('deploy-ai', mockContext);
    expect(page).toContain('Need a custom plan');
    expect(page).toContain('/contact');
  });
});

describe('Accessibility Quality Gates', () => {
  it('logo image has alt text in header', () => {
    const contextWithLogo: WebsiteContentContext = {
      ...mockContext,
      brandAssets: {
        logoPath: '/path/to/logo.svg',
        logoOutputPath: 'public/brand/logo.svg',
      },
    };
    const header = generateWebsiteHeader('deploy-ai', contextWithLogo, mockStrategy);
    expect(header).toContain('alt="DeployAI"');
  });

  it('CTA buttons have accessible text', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    expect(page).toContain('Start Free Trial');
    expect(page).toContain('Read Docs');
  });

  it('heading hierarchy is sequential (no h1 -> h3 skip)', () => {
    const page = generateWebsiteLandingPage('deploy-ai', mockContext);
    // After h1, should use h2 (not h3)
    const headings = [...page.matchAll(/<h(\d)/g)].map(m => parseInt(m[1], 10));
    for (let i = 1; i < headings.length; i++) {
      // Each heading should not skip more than 1 level
      expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  it('mobile menu button has aria-label', () => {
    const header = generateWebsiteHeader('deploy-ai', mockContext, mockStrategy);
    expect(header).toContain('aria-label');
    expect(header).toContain('aria-expanded');
  });

  it('404 page has back-to-home link', () => {
    const page = generate404Page('deploy-ai', mockContext);
    expect(page).toContain('href="/"');
    expect(page).toContain('DeployAI');
  });

  it('500 page has try-again action', () => {
    const page = generate500Page('deploy-ai');
    expect(page).toContain('reset()');
    expect(page).toContain('Try again');
  });
});

describe('SEO Component Quality', () => {
  it('JsonLd component renders structured data', () => {
    const component = generateJsonLdComponent();
    expect(component).toContain('application/ld+json');
    expect(component).toContain('dangerouslySetInnerHTML');
  });

  it('web manifest has correct structure', () => {
    const manifest = generateWebManifest('deploy-ai', mockContext);
    const parsed = JSON.parse(manifest);
    expect(parsed.name).toBe('DeployAI');
    expect(parsed.theme_color).toBe('#2563EB');
    expect(parsed.icons).toHaveLength(3);
    expect(parsed.display).toBe('standalone');
  });

  it('meta helper generates canonical URLs', () => {
    const helper = generateMetaHelper('deploy-ai', mockStrategy);
    expect(helper).toContain('canonical');
    expect(helper).toContain('NEXT_PUBLIC_SITE_URL');
    expect(helper).toContain('CI/CD');
  });

  it('footer includes all strategy sections', () => {
    const footer = generateWebsiteFooter('deploy-ai', mockContext, mockStrategy);
    expect(footer).toContain('Product');
    expect(footer).toContain('Legal');
    expect(footer).toContain('Privacy');
  });
});
