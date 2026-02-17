/**
 * Tests for website-pricing module
 * Verifies pricing page generation with tiers, comparison table, and FAQ
 */

import { describe, it, expect } from 'vitest';
import { generateWebsitePricingPage } from '../../src/generators/templates/website-pricing.js';
import type { WebsiteContentContext } from '../../src/generators/website-context.js';

function makeContext(): WebsiteContentContext {
  return {
    productName: 'Gateco',
    features: [],
    rawDocs: 'docs',
    pricing: [
      {
        name: 'Free',
        price: 'Free',
        period: '',
        description: 'Dev & POC',
        features: ['Basic access', 'Community support'],
        cta: 'Get started',
        featured: false,
      },
      {
        name: 'Pro',
        price: '$99',
        period: '/month',
        description: 'Production workloads',
        features: ['Basic access', 'Priority support', 'Advanced analytics'],
        cta: 'Start free trial',
        featured: true,
      },
      {
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        description: 'Regulated environments',
        features: ['Basic access', 'Priority support', 'Advanced analytics', 'SLA guarantee'],
        cta: 'Contact sales',
        featured: false,
      },
    ],
  };
}

describe('generateWebsitePricingPage', () => {
  it('generates page with tier cards', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    expect(code).toContain('Free');
    expect(code).toContain('$99');
    expect(code).toContain('Custom');
  });

  it('includes monthly/annual toggle', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    expect(code).toContain('Annual');
    expect(code).toContain('Save 20%');
    expect(code).toContain('useState(false)');
  });

  it('marks featured tier as Most Popular', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    expect(code).toContain('Most Popular');
  });

  it('includes feature comparison table when tiers have features', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    expect(code).toContain('Compare plans');
    expect(code).toContain('Basic access');
  });

  it('includes pricing FAQ', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    expect(code).toContain('Pricing FAQ');
    expect(code).toContain('switch plans');
    expect(code).toContain('free trial');
  });

  it('includes enterprise CTA section', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    expect(code).toContain('custom plan');
    expect(code).toContain('/contact');
  });

  it('renders single H1', () => {
    const code = generateWebsitePricingPage('gateco', makeContext());
    const h1Count = (code.match(/<h1/g) || []).length;
    expect(h1Count).toBe(1);
  });

  it('generates defaults when no pricing provided', () => {
    const code = generateWebsitePricingPage('gateco');
    expect(code).toContain('Starter');
    expect(code).toContain('Pro');
    expect(code).toContain('Enterprise');
  });
});
