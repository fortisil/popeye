/**
 * Frontend design language analyzer
 * Extracts design tokens (colors, fonts, component library) from an existing
 * frontend app to use as fallback for website generation
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Analyzed design context from a frontend application
 */
export interface FrontendDesignContext {
  colors?: Record<string, string>;
  primaryColor?: string;
  fonts?: { heading?: string; body?: string; mono?: string };
  borderRadius?: string;
  componentLibrary?: 'shadcn' | 'radix' | 'mui' | 'chakra' | 'unknown';
  darkMode?: boolean;
  source: 'tailwind-config' | 'css-variables' | 'defaults';
}

/**
 * Analyze the frontend app design language
 * Extracts colors, fonts, and component library from the project
 *
 * @param projectDir - Root project directory
 * @returns Design context or null if no frontend app found
 */
export async function analyzeFrontendDesign(
  projectDir: string
): Promise<FrontendDesignContext | null> {
  const frontendDir = path.join(projectDir, 'apps', 'frontend');

  // Check if frontend app exists
  try {
    await fs.access(frontendDir);
  } catch {
    return null;
  }

  const context: FrontendDesignContext = {
    source: 'defaults',
  };

  // Detect component library from package.json
  context.componentLibrary = await detectComponentLibrary(frontendDir);

  // Try CSS custom properties first (shadcn/ui convention)
  const cssResult = await extractCssVariables(frontendDir);
  if (cssResult) {
    if (cssResult.primaryColor) context.primaryColor = cssResult.primaryColor;
    if (cssResult.colors) context.colors = cssResult.colors;
    if (cssResult.borderRadius) context.borderRadius = cssResult.borderRadius;
    context.darkMode = cssResult.darkMode;
    context.source = 'css-variables';
  }

  // Try tailwind config (regex-based since we can't import user's config)
  const tailwindResult = await extractTailwindConfig(frontendDir);
  if (tailwindResult) {
    // Only override if CSS vars didn't provide the value
    if (!context.primaryColor && tailwindResult.primaryColor) {
      context.primaryColor = tailwindResult.primaryColor;
    }
    if (!context.colors && tailwindResult.colors) {
      context.colors = tailwindResult.colors;
    }
    if (tailwindResult.fonts) context.fonts = tailwindResult.fonts;
    if (tailwindResult.darkMode !== undefined && !cssResult) {
      context.darkMode = tailwindResult.darkMode;
    }
    if (context.source === 'defaults') context.source = 'tailwind-config';
  }

  // Return null if nothing meaningful was found
  if (!context.primaryColor && !context.colors && !context.componentLibrary) {
    return null;
  }

  return context;
}

/**
 * Detect component library from package.json dependencies
 */
async function detectComponentLibrary(
  frontendDir: string
): Promise<FrontendDesignContext['componentLibrary']> {
  try {
    const pkgContent = await fs.readFile(
      path.join(frontendDir, 'package.json'),
      'utf-8'
    );
    const pkg = JSON.parse(pkgContent);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    if (allDeps['@shadcn/ui'] || allDeps['shadcn-ui']) return 'shadcn';
    if (allDeps['@radix-ui/react-dialog'] || allDeps['@radix-ui/themes']) return 'radix';
    if (allDeps['@mui/material']) return 'mui';
    if (allDeps['@chakra-ui/react']) return 'chakra';
  } catch {
    // Package.json not readable
  }

  return undefined;
}

/**
 * Extract design tokens from CSS custom properties (index.css or globals.css)
 */
async function extractCssVariables(
  frontendDir: string
): Promise<{
  primaryColor?: string;
  colors?: Record<string, string>;
  borderRadius?: string;
  darkMode?: boolean;
} | null> {
  const cssFiles = [
    path.join(frontendDir, 'src', 'index.css'),
    path.join(frontendDir, 'src', 'globals.css'),
    path.join(frontendDir, 'src', 'app', 'globals.css'),
  ];

  let cssContent = '';
  for (const cssFile of cssFiles) {
    try {
      cssContent = await fs.readFile(cssFile, 'utf-8');
      break;
    } catch {
      continue;
    }
  }

  if (!cssContent) return null;

  const result: {
    primaryColor?: string;
    colors?: Record<string, string>;
    borderRadius?: string;
    darkMode?: boolean;
  } = {};

  // Detect shadcn/ui convention: HSL values like --primary: 222.2 47.4% 11.2%
  const primaryHsl = cssContent.match(/--primary:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (primaryHsl) {
    const h = parseFloat(primaryHsl[1]);
    const s = parseFloat(primaryHsl[2]) / 100;
    const l = parseFloat(primaryHsl[3]) / 100;
    result.primaryColor = hslToHex(h / 360, s, l);
  }

  // Detect hex-based CSS variables
  if (!result.primaryColor) {
    const primaryHex = cssContent.match(/--primary(?:-color)?:\s*(#[0-9a-fA-F]{6})/);
    if (primaryHex) result.primaryColor = primaryHex[1];
  }

  // Extract border radius
  const radiusMatch = cssContent.match(/--radius:\s*([\d.]+rem)/);
  if (radiusMatch) result.borderRadius = radiusMatch[1];

  // Detect dark mode blocks
  result.darkMode = /\.dark\s*\{/.test(cssContent) || /@media\s*\(prefers-color-scheme:\s*dark\)/.test(cssContent);

  return result;
}

/**
 * Extract design tokens from tailwind config (regex-based)
 */
async function extractTailwindConfig(
  frontendDir: string
): Promise<{
  primaryColor?: string;
  colors?: Record<string, string>;
  fonts?: { heading?: string; body?: string; mono?: string };
  darkMode?: boolean;
} | null> {
  const configFiles = [
    path.join(frontendDir, 'tailwind.config.ts'),
    path.join(frontendDir, 'tailwind.config.js'),
    path.join(frontendDir, 'tailwind.config.mjs'),
  ];

  let configContent = '';
  for (const configFile of configFiles) {
    try {
      configContent = await fs.readFile(configFile, 'utf-8');
      break;
    } catch {
      continue;
    }
  }

  if (!configContent) return null;

  const result: {
    primaryColor?: string;
    colors?: Record<string, string>;
    fonts?: { heading?: string; body?: string; mono?: string };
    darkMode?: boolean;
  } = {};

  // Extract primary color: primary: { 500: '#...' } or primary: '#...'
  const primary500 = configContent.match(/primary[^}]*?500:\s*['"]?(#[0-9a-fA-F]{6})/);
  if (primary500) {
    result.primaryColor = primary500[1];
  } else {
    const primaryDirect = configContent.match(/primary:\s*['"]?(#[0-9a-fA-F]{6})/);
    if (primaryDirect) result.primaryColor = primaryDirect[1];
  }

  // Extract font family
  const sansFont = configContent.match(/sans:\s*\[['"]([^'"]+)['"]/);
  if (sansFont) {
    result.fonts = { body: sansFont[1] };
  }

  // Detect dark mode configuration
  result.darkMode = /darkMode:\s*['"]class['"]/.test(configContent);

  return result;
}

// --- Color conversion helper ---

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (n: number): string => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
