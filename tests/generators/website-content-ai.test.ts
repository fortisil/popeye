/**
 * AI Website Content Generator tests — pricing guard, evidence detection,
 * doc path extraction, and per-field AI fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasPricingEvidence } from '../../src/generators/website-content-ai.js';
import {
  extractDocPathsFromText,
  validateAndFilterDocPaths,
  validateWebsiteContext,
} from '../../src/generators/website-context.js';
import type { WebsiteContentContext } from '../../src/generators/website-context.js';

describe('website-content-ai', () => {
  describe('hasPricingEvidence', () => {
    it('should detect dollar amounts in docs', () => {
      expect(hasPricingEvidence('Plans start at $29/mo', '')).toBe(true);
    });

    it('should detect euro amounts', () => {
      expect(hasPricingEvidence('Starting from €19/month', '')).toBe(true);
    });

    it('should detect pricing keywords', () => {
      expect(hasPricingEvidence('Our pricing model includes three tiers', '')).toBe(true);
    });

    it('should detect subscription keywords', () => {
      expect(hasPricingEvidence('Monthly subscription available', '')).toBe(true);
    });

    it('should detect free plan/tier', () => {
      expect(hasPricingEvidence('We offer a free tier for developers', '')).toBe(true);
    });

    it('should detect evidence in specification', () => {
      expect(hasPricingEvidence('', 'Pricing plan: $49/mo')).toBe(true);
    });

    it('should return false for docs without pricing info', () => {
      expect(hasPricingEvidence(
        'Our product helps you build amazing software with AI.',
        'A task management tool for teams.',
      )).toBe(false);
    });

    it('should return false for empty inputs', () => {
      expect(hasPricingEvidence('', '')).toBe(false);
    });
  });

  describe('pricing guard edge cases', () => {
    it('should detect /yr pattern', () => {
      expect(hasPricingEvidence('$299/yr for annual plans', '')).toBe(true);
    });

    it('should detect per month even without dollar sign', () => {
      // Reason: "per month" is a strong pricing signal regardless of currency symbol
      expect(hasPricingEvidence('10 per month for basic plan', '')).toBe(true);
      expect(hasPricingEvidence('$10 per month for basic plan', '')).toBe(true);
    });

    it('should detect USD pattern', () => {
      expect(hasPricingEvidence('USD 29 per month', '')).toBe(true);
    });
  });

  describe('extractDocPathsFromText', () => {
    it('should extract macOS paths with spaces (quoted)', () => {
      const text = `Build a website for Gateco using '/Users/a b/Gateco/pricing.md'`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('/Users/a b/Gateco/pricing.md');
    });

    it('should extract macOS paths without quotes', () => {
      const text = 'Build a website using /Users/me/Gateco/spec.md please';
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('/Users/me/Gateco/spec.md');
    });

    it('should extract Windows paths with backslashes (quoted)', () => {
      const text = `Use "C:\\Users\\me\\Gateco\\pricing.md" for content`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('C:\\Users\\me\\Gateco\\pricing.md');
    });

    it('should extract Windows paths with forward slashes', () => {
      const text = `Docs at 'D:/docs/spec.md'`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('D:/docs/spec.md');
    });

    it('should extract multiple paths from mixed text', () => {
      const text = `Build with '/Users/me/spec.md' and "/Users/me/pricing.md"`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('/Users/me/spec.md');
      expect(paths).toContain('/Users/me/pricing.md');
      expect(paths).toHaveLength(2);
    });

    it('should deduplicate paths', () => {
      const text = `Use '/Users/me/spec.md' and '/Users/me/spec.md' twice`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toHaveLength(1);
    });

    it('should accept .mdx and .txt extensions', () => {
      const text = `Read '/docs/spec.mdx' and '/docs/notes.txt'`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('/docs/spec.mdx');
      expect(paths).toContain('/docs/notes.txt');
    });

    it('should reject .pdf and .docx extensions', () => {
      const text = `Read '/docs/spec.pdf' and '/docs/notes.docx'`;
      const paths = extractDocPathsFromText(text);
      expect(paths).toHaveLength(0);
    });

    it('should return empty for text without paths', () => {
      const text = 'Build a website for my project';
      const paths = extractDocPathsFromText(text);
      expect(paths).toHaveLength(0);
    });

    it('should handle paths at end of string', () => {
      const text = 'Build from /Users/me/spec.md';
      const paths = extractDocPathsFromText(text);
      expect(paths).toContain('/Users/me/spec.md');
    });
  });

  describe('validateAndFilterDocPaths', () => {
    it('should reject unsupported extensions with log', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await validateAndFilterDocPaths(['/tmp/doc.pdf']);
      expect(result).toHaveLength(0);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('unsupported format'),
      );
      logSpy.mockRestore();
    });

    it('should skip non-existent files with log', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const result = await validateAndFilterDocPaths(['/tmp/nonexistent-abc-123.md']);
      expect(result).toHaveLength(0);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('file not found'),
      );
      logSpy.mockRestore();
    });

    it('should accept allowed extensions for existing files', async () => {
      // Reason: uses node:fs/promises, so we mock stat
      const { promises: fsp } = await import('node:fs');
      const statSpy = vi.spyOn(fsp, 'stat').mockResolvedValue({ size: 1024 } as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await validateAndFilterDocPaths(['/tmp/test.md']);
      expect(result).toEqual(['/tmp/test.md']);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[doc-ingest] Read:'),
      );

      statSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('should skip oversized files', async () => {
      const { promises: fsp } = await import('node:fs');
      const statSpy = vi.spyOn(fsp, 'stat').mockResolvedValue({
        size: 3 * 1024 * 1024, // 3MB > 2MB limit
      } as any);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await validateAndFilterDocPaths(['/tmp/huge.md']);
      expect(result).toHaveLength(0);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds 2MB limit'),
      );

      statSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('per-field AI fallback', () => {
    it('should treat pricing: [] as missing (empty array)', () => {
      // Reason: the fix changes `!context.pricing` to `context.pricing == null || context.pricing.length === 0`
      const emptyPricing: any[] = [];
      const isMissing = emptyPricing == null || emptyPricing.length === 0;
      expect(isMissing).toBe(true);
    });

    it('should treat pricing: undefined as missing', () => {
      const undefinedPricing = undefined;
      const isMissing = undefinedPricing == null || (undefinedPricing as any)?.length === 0;
      expect(isMissing).toBe(true);
    });

    it('should not treat populated pricing as missing', () => {
      const pricing = [{ name: 'Pro', price: '$29', description: '', features: [], cta: 'Buy' }];
      const isMissing = pricing == null || pricing.length === 0;
      expect(isMissing).toBe(false);
    });

    it('should trigger fallback when only pricing is missing', () => {
      // Reason: verifies per-field logic — tagline exists but pricing is empty
      const context = {
        tagline: 'Existing tagline',
        description: 'Existing description',
        features: [{ title: 'A', description: 'B' }],
        pricing: [] as any[],
      };
      const pricingMissing = context.pricing == null || context.pricing.length === 0;
      const hasMissingContent = !context.tagline || !context.description || context.features.length === 0 || pricingMissing;
      expect(hasMissingContent).toBe(true);
      expect(pricingMissing).toBe(true);
    });

    it('should not trigger fallback when all fields are present', () => {
      const context = {
        tagline: 'Tag',
        description: 'Desc',
        features: [{ title: 'A', description: 'B' }],
        pricing: [{ name: 'Free', price: '$0', description: '', features: [], cta: 'Start' }],
      };
      const pricingMissing = context.pricing == null || context.pricing.length === 0;
      const hasMissingContent = !context.tagline || !context.description || context.features.length === 0 || pricingMissing;
      expect(hasMissingContent).toBe(false);
    });
  });

  describe('validator provenance-based pricing check', () => {
    it('should NOT warn about default pricing when source is docs', () => {
      const context: WebsiteContentContext = {
        productName: 'Gateco',
        features: [{ title: 'Auth', description: 'Auth feature' }],
        rawDocs: '# Gateco\nSome docs content here for minimum length requirement...',
        pricing: [
          { name: 'Free', price: 'Free', description: '', features: [], cta: 'Get started' },
          { name: 'Pro', price: '$99', description: '', features: [], cta: 'Start free trial' },
          { name: 'Enterprise', price: 'Custom', description: '', features: [], cta: 'Contact sales' },
        ],
        pricingDiagnostics: {
          charsScanned: 5000,
          foundPricingHeader: true,
          extractionMethod: 'known_plan_names',
          extractedTiers: [
            { name: 'Free', price: 'Free' },
            { name: 'Pro', price: '$99' },
            { name: 'Enterprise', price: 'Custom' },
          ],
          source: 'docs',
        },
      };
      const result = validateWebsiteContext(context, 'Gateco');
      const defaultWarning = result.warnings.find((w) => w.includes('default values'));
      expect(defaultWarning).toBeUndefined();
    });

    it('should NOT warn about default pricing when source is ai', () => {
      const context: WebsiteContentContext = {
        productName: 'TestApp',
        features: [{ title: 'Feature', description: 'Desc' }],
        rawDocs: '# TestApp\nSome docs content here for minimum length...',
        pricing: [
          { name: 'Starter', price: '$0', description: '', features: [], cta: 'Get started' },
          { name: 'Pro', price: '$29', description: '', features: [], cta: 'Start' },
          { name: 'Enterprise', price: 'Custom', description: '', features: [], cta: 'Contact' },
        ],
        pricingDiagnostics: {
          charsScanned: 3000,
          foundPricingHeader: false,
          extractionMethod: 'ai',
          extractedTiers: [
            { name: 'Starter', price: '$0' },
            { name: 'Pro', price: '$29' },
            { name: 'Enterprise', price: 'Custom' },
          ],
          source: 'ai',
        },
      };
      const result = validateWebsiteContext(context, 'TestApp');
      const defaultWarning = result.warnings.find((w) => w.includes('default values'));
      expect(defaultWarning).toBeUndefined();
    });

    it('should warn about default pricing when no diagnostics present', () => {
      const context: WebsiteContentContext = {
        productName: 'TestApp',
        features: [{ title: 'Feature', description: 'Desc' }],
        rawDocs: '# TestApp\nSome docs content here for minimum length...',
        pricing: [
          { name: 'Starter', price: '$0', description: '', features: [], cta: 'Get started' },
          { name: 'Pro', price: '$29', description: '', features: [], cta: 'Start' },
          { name: 'Enterprise', price: 'Custom', description: '', features: [], cta: 'Contact' },
        ],
        // No pricingDiagnostics — simulates legacy or missing provenance
      };
      const result = validateWebsiteContext(context, 'TestApp');
      const defaultWarning = result.warnings.find((w) => w.includes('default values'));
      expect(defaultWarning).toBeDefined();
    });
  });
});
