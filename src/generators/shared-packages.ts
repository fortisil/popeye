/**
 * Shared package generators for monorepo workspaces
 * Generates design-tokens and UI component packages
 * with support for brand-specific color palettes
 */

/**
 * Brand color options for design tokens
 */
export interface BrandColorOptions {
  primaryColor?: string;
}

/**
 * Generate a color scale from a single hex color
 * Converts hex to HSL and varies lightness across 10 stops (50-900)
 *
 * @param hex - Primary hex color (e.g., "#2563EB")
 * @returns Record of color stops (50-900) with hex values
 */
export function generateColorScale(hex: string): Record<string, string> {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    // Fallback to default sky-blue on parse failure
    return getDefaultPrimaryScale();
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const stops = [
    { key: '50', lightness: 0.95 },
    { key: '100', lightness: 0.90 },
    { key: '200', lightness: 0.80 },
    { key: '300', lightness: 0.68 },
    { key: '400', lightness: 0.56 },
    { key: '500', lightness: 0.48 },
    { key: '600', lightness: 0.40 },
    { key: '700', lightness: 0.32 },
    { key: '800', lightness: 0.24 },
    { key: '900', lightness: 0.15 },
  ];

  const scale: Record<string, string> = {};
  for (const stop of stops) {
    scale[stop.key] = hslToHex(hsl.h, hsl.s, stop.lightness);
  }

  return scale;
}

/**
 * Default sky-blue primary color scale (backward compatible)
 */
function getDefaultPrimaryScale(): Record<string, string> {
  return {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  };
}

/**
 * Generate design tokens package with optional brand colors
 *
 * @param projectName - Project name for package naming
 * @param brandColors - Optional brand color configuration
 * @returns Package files array
 */
export function generateDesignTokensPackage(
  projectName: string,
  brandColors?: BrandColorOptions
): {
  files: Array<{ path: string; content: string }>;
} {
  const primaryScale = brandColors?.primaryColor
    ? generateColorScale(brandColors.primaryColor)
    : getDefaultPrimaryScale();

  const colorsContent = generateColorsModule(primaryScale);

  return {
    files: [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: `@${projectName}/design-tokens`,
            version: '1.0.0',
            type: 'module',
            main: './dist/index.js',
            types: './dist/index.d.ts',
            exports: {
              '.': './dist/index.js',
              './tailwind': './dist/tailwind-preset.js',
            },
            scripts: {
              build: 'tsc',
              dev: 'tsc --watch',
            },
            devDependencies: {
              typescript: '^5.3.3',
            },
          },
          null,
          2
        ),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2020',
              module: 'ESNext',
              moduleResolution: 'bundler',
              declaration: true,
              outDir: './dist',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
            },
            include: ['src'],
          },
          null,
          2
        ),
      },
      {
        path: 'src/index.ts',
        content: `/**
 * Design tokens for ${projectName}
 */

export * from './colors.js';
export * from './typography.js';
`,
      },
      {
        path: 'src/colors.ts',
        content: colorsContent,
      },
      {
        path: 'src/typography.ts',
        content: `/**
 * Typography settings
 */

export const typography = {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    '5xl': ['3rem', { lineHeight: '1' }],
    '6xl': ['3.75rem', { lineHeight: '1' }],
  },
} as const;

export type Typography = typeof typography;
`,
      },
      {
        path: 'src/tailwind-preset.ts',
        content: `/**
 * Tailwind CSS preset with design tokens
 */

import { colors } from './colors.js';
import { typography } from './typography.js';

export const preset = {
  theme: {
    extend: {
      colors,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
    },
  },
};

export default preset;
`,
      },
    ],
  };
}

/**
 * Generate the colors.ts module content with given primary scale
 */
function generateColorsModule(primaryScale: Record<string, string>): string {
  const entries = Object.entries(primaryScale)
    .map(([key, value]) => `    ${key}: '${value}',`)
    .join('\n');

  return `/**
 * Color palette
 */

export const colors = {
  primary: {
${entries}
  },
  secondary: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
} as const;

export type ColorScale = typeof colors.primary;
export type Colors = typeof colors;
`;
}

/**
 * Generate UI components package
 *
 * @param projectName - Project name for package naming
 * @returns Package files array
 */
export function generateUiPackage(projectName: string): {
  files: Array<{ path: string; content: string }>;
} {
  return {
    files: [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: `@${projectName}/ui`,
            version: '1.0.0',
            type: 'module',
            main: './dist/index.js',
            types: './dist/index.d.ts',
            exports: {
              '.': './dist/index.js',
              './button': './dist/button.js',
              './card': './dist/card.js',
            },
            scripts: {
              build: 'tsc',
              dev: 'tsc --watch',
            },
            dependencies: {
              clsx: '^2.1.0',
              'tailwind-merge': '^2.2.0',
            },
            peerDependencies: {
              react: '>=18.0.0',
              'react-dom': '>=18.0.0',
            },
            devDependencies: {
              '@types/react': '^18.2.0',
              '@types/react-dom': '^18.2.0',
              typescript: '^5.3.3',
            },
          },
          null,
          2
        ),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2020',
              module: 'ESNext',
              moduleResolution: 'bundler',
              declaration: true,
              outDir: './dist',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              jsx: 'react-jsx',
            },
            include: ['src'],
          },
          null,
          2
        ),
      },
      {
        path: 'src/index.ts',
        content: `/**
 * Shared UI components for ${projectName}
 */

export * from './button.js';
export * from './card.js';
export * from './utils.js';
`,
      },
      {
        path: 'src/utils.ts',
        content: `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
      },
      {
        path: 'src/button.tsx',
        content: `import * as React from 'react';
import { cn } from './utils.js';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          {
            // Variants
            'bg-primary-600 text-white hover:bg-primary-500': variant === 'primary',
            'bg-secondary-100 text-secondary-900 hover:bg-secondary-200': variant === 'secondary',
            'border border-secondary-300 bg-transparent hover:bg-secondary-50': variant === 'outline',
            'bg-transparent hover:bg-secondary-100': variant === 'ghost',
            // Sizes
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
`,
      },
      {
        path: 'src/card.tsx',
        content: `import * as React from 'react';
import { cn } from './utils.js';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-secondary-200 bg-white shadow-sm',
        className
      )}
      {...props}
    />
  )
);

Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));

CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));

CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));

CardContent.displayName = 'CardContent';
`,
      },
    ],
  };
}

// --- Color conversion helpers ---

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace(/^#/, '');
  if (cleaned.length !== 6) return null;

  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }

  return { h, s, l };
}

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
