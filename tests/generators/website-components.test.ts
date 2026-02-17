/**
 * Website shared component tests
 * Validates Header, Footer, and Navigation generation with strategy data
 */

import { describe, it, expect } from 'vitest';
import {
  generateWebsiteHeader,
  generateWebsiteFooter,
  generateWebsiteNavigation,
} from '../../src/generators/templates/website-components.js';
import type { WebsiteContentContext } from '../../src/generators/website-context.js';
import type { WebsiteStrategyDocument } from '../../src/types/website-strategy.js';

const mockStrategy: WebsiteStrategyDocument = {
  icp: { primaryPersona: 'Developers', painPoints: [], goals: [], objections: [] },
  positioning: { category: 'DevTools', differentiators: [], valueProposition: 'Fast deploys', proofPoints: [] },
  messaging: { headline: 'Ship Fast', subheadline: 'AI CI/CD', elevatorPitch: 'Deploy faster.', longDescription: 'AI CI/CD platform.' },
  seoStrategy: { primaryKeywords: [], secondaryKeywords: [], longTailKeywords: [], titleTemplates: {}, metaDescriptions: {} },
  siteArchitecture: {
    pages: [
      { path: '/', title: 'Home', purpose: 'conversion', pageType: 'landing', sections: [], seoKeywords: [], conversionGoal: 'trial' },
    ],
    navigation: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'API Docs', href: '/docs' },
    ],
    footerSections: [
      { title: 'Product', links: [{ label: 'Features', href: '/#features' }, { label: 'Pricing', href: '/pricing' }] },
      { title: 'Company', links: [{ label: 'About', href: '/about' }] },
      { title: 'Legal', links: [{ label: 'Privacy', href: '/privacy' }] },
    ],
  },
  conversionStrategy: {
    primaryCta: { text: 'Get Started Free', href: '/signup' },
    secondaryCta: { text: 'View Docs', href: '/docs' },
    trustSignals: [], socialProof: [], leadCapture: 'webhook',
  },
  competitiveContext: { category: 'DevTools', competitors: [], differentiators: [] },
};

const contextWithLogo: WebsiteContentContext = {
  productName: 'DeployAI',
  features: [],
  rawDocs: '',
  brandAssets: {
    logoPath: '/path/to/logo.png',
    logoOutputPath: 'public/brand/logo.png',
  },
};

const contextNoLogo: WebsiteContentContext = {
  productName: 'DeployAI',
  features: [],
  rawDocs: '',
};

describe('generateWebsiteHeader', () => {
  it('renders logo image when brandAssets.logoOutputPath provided', () => {
    const header = generateWebsiteHeader('deploy-ai', contextWithLogo, mockStrategy);
    expect(header).toContain('Image');
    expect(header).toContain('logo.png');
    expect(header).toContain('alt="DeployAI"');
  });

  it('renders text fallback when no logo', () => {
    const header = generateWebsiteHeader('deploy-ai', contextNoLogo, mockStrategy);
    expect(header).toContain('DeployAI');
    expect(header).toContain('font-bold text-foreground');
  });

  it('includes navigation links from strategy', () => {
    const header = generateWebsiteHeader('deploy-ai', contextNoLogo, mockStrategy);
    expect(header).toContain('Features');
    expect(header).toContain('/#features');
    expect(header).toContain('Pricing');
    expect(header).toContain('/pricing');
    expect(header).toContain('API Docs');
  });

  it('includes primary CTA from strategy', () => {
    const header = generateWebsiteHeader('deploy-ai', contextNoLogo, mockStrategy);
    expect(header).toContain('Get Started Free');
    expect(header).toContain('/signup');
  });

  it('includes mobile hamburger menu', () => {
    const header = generateWebsiteHeader('deploy-ai', contextNoLogo, mockStrategy);
    expect(header).toContain('mobileMenuOpen');
    expect(header).toContain('md:hidden');
  });

  it('uses default nav items when no strategy', () => {
    const header = generateWebsiteHeader('deploy-ai', contextNoLogo);
    expect(header).toContain('Features');
    expect(header).toContain('Pricing');
    expect(header).toContain('Docs');
    expect(header).toContain('Blog');
  });
});

describe('generateWebsiteFooter', () => {
  it('includes multi-column sections from strategy', () => {
    const footer = generateWebsiteFooter('deploy-ai', contextNoLogo, mockStrategy);
    expect(footer).toContain('Product');
    expect(footer).toContain('Company');
    expect(footer).toContain('Legal');
    expect(footer).toContain('Privacy');
    expect(footer).toContain('/about');
  });

  it('includes brand name and tagline', () => {
    const ctxWithTagline: WebsiteContentContext = {
      ...contextNoLogo,
      tagline: 'Ship Code 10x Faster',
    };
    const footer = generateWebsiteFooter('deploy-ai', ctxWithTagline, mockStrategy);
    expect(footer).toContain('DeployAI');
    expect(footer).toContain('Ship Code 10x Faster');
  });

  it('includes copyright notice', () => {
    const footer = generateWebsiteFooter('deploy-ai', contextNoLogo);
    expect(footer).toContain('All rights reserved');
    expect(footer).toContain('DeployAI');
  });

  it('uses default sections when no strategy', () => {
    const footer = generateWebsiteFooter('deploy-ai', contextNoLogo);
    expect(footer).toContain('Product');
    expect(footer).toContain('Resources');
    expect(footer).toContain('Legal');
  });
});

describe('generateWebsiteNavigation', () => {
  it('generates nav config from strategy', () => {
    const nav = generateWebsiteNavigation(mockStrategy);
    expect(nav).toContain('NAV_ITEMS');
    expect(nav).toContain('Features');
    expect(nav).toContain('/#features');
    expect(nav).toContain('Pricing');
  });

  it('uses default nav items when no strategy', () => {
    const nav = generateWebsiteNavigation();
    expect(nav).toContain('Features');
    expect(nav).toContain('Pricing');
    expect(nav).toContain('Docs');
    expect(nav).toContain('Blog');
  });

  it('exports NavItem interface', () => {
    const nav = generateWebsiteNavigation();
    expect(nav).toContain('export interface NavItem');
    expect(nav).toContain('children?: NavItem[]');
  });
});
