/**
 * Tests for shared-packages module
 * Verifies color scale generation and brand color passthrough
 */

import { describe, it, expect } from 'vitest';
import {
  generateColorScale,
  generateDesignTokensPackage,
} from '../../src/generators/shared-packages.js';

describe('generateColorScale', () => {
  it('generates 10-stop color scale from valid hex', () => {
    const scale = generateColorScale('#2563EB');

    expect(Object.keys(scale)).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']);
    // Lightest stop should be light, darkest should be dark
    expect(scale['50']).toMatch(/^#[0-9a-f]{6}$/);
    expect(scale['900']).toMatch(/^#[0-9a-f]{6}$/);
    // The stops should vary (not all the same)
    const uniqueColors = new Set(Object.values(scale));
    expect(uniqueColors.size).toBeGreaterThan(5);
  });

  it('falls back to default sky-blue on invalid hex', () => {
    const scale = generateColorScale('not-a-color');

    // Should return the default sky-blue palette
    expect(scale['500']).toBe('#0ea5e9');
    expect(scale['600']).toBe('#0284c7');
  });

  it('handles hex with # prefix correctly', () => {
    const withHash = generateColorScale('#FF0000');
    const withoutHash = generateColorScale('#FF0000');

    expect(withHash).toEqual(withoutHash);
  });
});

describe('generateDesignTokensPackage', () => {
  it('uses brand color when provided', () => {
    const result = generateDesignTokensPackage('test-project', {
      primaryColor: '#2563EB',
    });

    // Find the colors.ts file
    const colorsFile = result.files.find((f) => f.path === 'src/colors.ts');
    expect(colorsFile).toBeDefined();
    // Should NOT contain the default sky-blue
    expect(colorsFile!.content).not.toContain('#0ea5e9');
  });

  it('uses default sky-blue when no brand color provided', () => {
    const result = generateDesignTokensPackage('test-project');

    const colorsFile = result.files.find((f) => f.path === 'src/colors.ts');
    expect(colorsFile).toBeDefined();
    // Should contain default sky-blue values
    expect(colorsFile!.content).toContain('#0ea5e9');
  });

  it('generates correct package structure', () => {
    const result = generateDesignTokensPackage('my-project');

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/colors.ts');
    expect(paths).toContain('src/typography.ts');
    expect(paths).toContain('src/tailwind-preset.ts');
  });

  it('package.json contains correct name with scope', () => {
    const result = generateDesignTokensPackage('gateco');

    const pkgFile = result.files.find((f) => f.path === 'package.json');
    expect(pkgFile).toBeDefined();
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.name).toBe('@gateco/design-tokens');
  });
});
