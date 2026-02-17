/**
 * Tests for website-debug module
 * Verifies trace includes sections + validation info
 */

import { describe, it, expect } from 'vitest';
import { formatDebugTrace, type WebsiteDebugTrace } from '../../src/generators/website-debug.js';

function makeTrace(overrides?: Partial<WebsiteDebugTrace>): WebsiteDebugTrace {
  return {
    workspaceRoot: '/tmp/project',
    docsFound: [{ path: '/tmp/project/spec.md', size: 1000 }],
    brandAssets: { logoPath: '/tmp/logo.png', logoOutputPath: 'public/brand/logo.png' },
    productName: { value: 'Gateco', source: 'docs' },
    primaryColor: { value: '#2563EB', source: 'brand-docs' },
    strategyStatus: 'success',
    templateValues: { headline: 'Secure AI', features: 3, pricingTiers: 3 },
    sectionsRendered: [
      { name: 'Hero', dataSource: 'strategy', itemCount: 1 },
      { name: 'PainPoints', dataSource: 'strategy', itemCount: 3 },
      { name: 'Features', dataSource: 'docs', itemCount: 3 },
      { name: 'FAQ', dataSource: 'skipped', itemCount: 0 },
    ],
    validationPassed: true,
    validationIssues: [],
    ...overrides,
  };
}

describe('formatDebugTrace', () => {
  it('formats basic trace fields', () => {
    const output = formatDebugTrace(makeTrace());
    expect(output).toContain('WEBSITE GENERATION DEBUG TRACE');
    expect(output).toContain('Gateco');
    expect(output).toContain('#2563EB');
    expect(output).toContain('success');
  });

  it('includes sections rendered with data sources', () => {
    const output = formatDebugTrace(makeTrace());
    expect(output).toContain('Sections Rendered (4)');
    expect(output).toContain('Hero: strategy (1 items)');
    expect(output).toContain('PainPoints: strategy (3 items)');
    expect(output).toContain('Features: docs (3 items)');
    expect(output).toContain('FAQ: skipped (0 items)');
  });

  it('shows validation passed', () => {
    const output = formatDebugTrace(makeTrace());
    expect(output).toContain('Validation: PASSED');
  });

  it('shows validation failed with issues', () => {
    const output = formatDebugTrace(makeTrace({
      validationPassed: false,
      validationIssues: ['Strategy missing', 'No features found'],
    }));
    expect(output).toContain('Validation: FAILED');
    expect(output).toContain('Strategy missing');
    expect(output).toContain('No features found');
  });

  it('handles empty sections list', () => {
    const output = formatDebugTrace(makeTrace({ sectionsRendered: [] }));
    expect(output).toContain('Sections Rendered (0)');
    expect(output).toContain('(none)');
  });

  it('shows strategy error when present', () => {
    const output = formatDebugTrace(makeTrace({
      strategyStatus: 'failed',
      strategyError: 'Rate limit exceeded',
    }));
    expect(output).toContain('Strategy: failed');
    expect(output).toContain('Error: Rate limit exceeded');
  });
});
