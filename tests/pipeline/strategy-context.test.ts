/**
 * Strategy context loader tests — loadStrategyForRole, STRATEGY_ROLES.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STRATEGY_ROLES, loadStrategyForRole } from '../../src/pipeline/strategy-context.js';

const TEST_DIR = join(process.cwd(), 'tmp-strategy-context-test');

function makeValidStrategy() {
  return {
    icp: { primaryPersona: 'developers', painPoints: ['slow builds'], goals: ['fast CI'], objections: ['cost'] },
    positioning: { category: 'DevTools', differentiators: ['speed'], valueProposition: 'Build faster', proofPoints: ['10x'] },
    messaging: { headline: 'Build Faster', subheadline: 'CI that works', elevatorPitch: 'Fast CI', longDescription: 'A fast CI platform' },
    seoStrategy: { primaryKeywords: ['CI'], secondaryKeywords: ['build'], longTailKeywords: ['fast CI'], titleTemplates: {}, metaDescriptions: {} },
    siteArchitecture: {
      pages: [{ path: '/', title: 'Home', purpose: 'Landing', pageType: 'landing', sections: ['hero'], seoKeywords: ['CI'], conversionGoal: 'signup' }],
      navigation: [{ label: 'Home', href: '/' }],
      footerSections: [{ title: 'Links', links: [{ label: 'Home', href: '/' }] }],
    },
    conversionStrategy: {
      primaryCta: { text: 'Get Started', href: '/signup' },
      secondaryCta: { text: 'Learn More', href: '/docs' },
      trustSignals: ['SOC2'],
      socialProof: ['1000+ teams'],
      leadCapture: 'webhook',
    },
    competitiveContext: { category: 'CI/CD', competitors: ['CircleCI'], differentiators: ['speed'] },
  };
}

beforeEach(() => {
  mkdirSync(join(TEST_DIR, '.popeye'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('STRATEGY_ROLES', () => {
  it('includes exactly WEBSITE_PROGRAMMER, MARKETING_EXPERT, SOCIAL_EXPERT', () => {
    expect(STRATEGY_ROLES).toContain('WEBSITE_PROGRAMMER');
    expect(STRATEGY_ROLES).toContain('MARKETING_EXPERT');
    expect(STRATEGY_ROLES).toContain('SOCIAL_EXPERT');
    expect(STRATEGY_ROLES).toHaveLength(3);
  });
});

describe('loadStrategyForRole', () => {
  it('returns undefined when no strategy file exists', () => {
    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBeUndefined();
  });

  it('returns formatted string when valid .popeye/website-strategy.json exists', () => {
    const strategy = makeValidStrategy();
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify(strategy),
    );

    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBeDefined();
    expect(result).toContain('Target Customer');
    expect(result).toContain('developers');
    expect(result).toContain('Build Faster');
    expect(result).toContain('SEO Keywords');
    expect(result).toContain('Conversion Strategy');
  });

  it('handles nested strategy field in JSON', () => {
    const strategy = makeValidStrategy();
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify({ strategy, metadata: { inputHash: 'abc', generatedAt: '2025-01-01', version: 1 } }),
    );

    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBeDefined();
    expect(result).toContain('developers');
  });

  it('returns undefined for malformed JSON', () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      '{ invalid json!!!',
    );

    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBeUndefined();
  });

  it('returns undefined for JSON that fails schema validation', () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify({ icp: { primaryPersona: '' } }),
    );

    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBeUndefined();
  });

  it('falls back to .popeye/website-strategy.md when JSON absent', () => {
    const mdContent = '# Strategy\n\nTarget: developers\nKeywords: CI, build';
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.md'),
      mdContent,
    );

    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBe(mdContent);
  });

  it('prefers JSON over MD when both exist', () => {
    const strategy = makeValidStrategy();
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify(strategy),
    );
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.md'),
      '# Fallback MD',
    );

    const result = loadStrategyForRole(TEST_DIR);
    // JSON is checked first, should get formatted strategy not raw MD
    expect(result).toContain('Target Customer');
    expect(result).not.toContain('Fallback MD');
  });

  it('falls back to MD when JSON is malformed', () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      '{ bad json }',
    );
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.md'),
      '# Good MD Strategy',
    );

    const result = loadStrategyForRole(TEST_DIR);
    expect(result).toBe('# Good MD Strategy');
  });
});
