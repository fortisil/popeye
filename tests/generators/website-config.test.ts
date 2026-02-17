/**
 * Tests for website-config tailwind generation with brand colors
 * Extended to verify full color token set, animations, and CSS vars
 */

import { describe, it, expect } from 'vitest';
import { generateWebsiteTailwindConfig } from '../../src/generators/templates/website-config.js';

describe('generateWebsiteTailwindConfig', () => {
  it('generates config with brand primary color', () => {
    const config = generateWebsiteTailwindConfig({
      primaryColor: '#2563EB',
    });

    // Should contain generated color scale, NOT default sky-blue
    expect(config).not.toContain('#0ea5e9');
    expect(config).not.toContain('#0284c7');
    // Should be valid TypeScript with Config type
    expect(config).toContain("import type { Config } from 'tailwindcss'");
    expect(config).toContain('primary:');
  });

  it('includes workspace design-tokens preset import', () => {
    const config = generateWebsiteTailwindConfig({
      workspaceMode: true,
      projectName: 'gateco',
    });

    expect(config).toContain("import designPreset from '@gateco/design-tokens/tailwind'");
    expect(config).toContain('presets: [designPreset]');
  });

  it('uses default sky-blue when no options provided', () => {
    const config = generateWebsiteTailwindConfig();

    // Should contain default sky-blue palette
    expect(config).toContain('#0ea5e9');
    expect(config).toContain('#0284c7');
    // Should NOT have preset import
    expect(config).not.toContain('designPreset');
  });

  it('includes full shadcn-compatible color token set', () => {
    const config = generateWebsiteTailwindConfig();

    // Background/foreground
    expect(config).toContain("background: 'hsl(var(--background))'");
    expect(config).toContain("foreground: 'hsl(var(--foreground))'");

    // Muted with sub-tokens
    expect(config).toContain("muted:");
    expect(config).toContain("hsl(var(--muted))");
    expect(config).toContain("hsl(var(--muted-foreground))");

    // Accent
    expect(config).toContain("accent:");
    expect(config).toContain("hsl(var(--accent))");

    // Card
    expect(config).toContain("card:");
    expect(config).toContain("hsl(var(--card))");

    // Border and ring
    expect(config).toContain("border: 'hsl(var(--border))'");
    expect(config).toContain("ring: 'hsl(var(--ring))'");
  });

  it('includes animation utilities', () => {
    const config = generateWebsiteTailwindConfig();

    expect(config).toContain('keyframes:');
    expect(config).toContain('fadeIn:');
    expect(config).toContain('slideUp:');
    expect(config).toContain('animation:');
  });

  it('includes borderColor and borderRadius extensions', () => {
    const config = generateWebsiteTailwindConfig();

    expect(config).toContain('borderColor:');
    expect(config).toContain('borderRadius:');
    expect(config).toContain('var(--radius)');
  });
});
