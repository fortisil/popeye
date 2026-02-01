/**
 * UI/UX Verification Module
 * Verifies visual design, responsiveness, and accessibility
 *
 * FUTURE IMPLEMENTATION - Requires:
 * - Puppeteer/Playwright for screenshots
 * - Visual regression testing
 * - Accessibility testing (axe-core)
 */

/**
 * UI Design Specification
 * User should provide this before project generation
 */
export interface UIDesignSpec {
  /** Design system to use */
  designSystem: 'tailwind' | 'shadcn' | 'mui' | 'chakra' | 'custom';

  /** Color palette */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    error: string;
    success: string;
    warning: string;
  };

  /** Typography */
  typography: {
    fontFamily: string;
    headingFont?: string;
    baseSize: string;
  };

  /** Spacing scale */
  spacing: 'compact' | 'comfortable' | 'spacious';

  /** Border radius */
  borderRadius: 'none' | 'small' | 'medium' | 'large' | 'full';

  /** Dark mode support */
  darkMode: boolean;

  /** Responsive breakpoints to test */
  breakpoints: ('mobile' | 'tablet' | 'desktop' | 'wide')[];

  /** Accessibility level */
  accessibilityLevel: 'A' | 'AA' | 'AAA';
}

/**
 * Default design spec for when user doesn't provide one
 */
export const DEFAULT_DESIGN_SPEC: UIDesignSpec = {
  designSystem: 'shadcn',
  colors: {
    primary: '#3b82f6',    // Blue 500
    secondary: '#6b7280',  // Gray 500
    accent: '#8b5cf6',     // Violet 500
    background: '#ffffff',
    text: '#111827',       // Gray 900
    error: '#ef4444',      // Red 500
    success: '#22c55e',    // Green 500
    warning: '#f59e0b',    // Amber 500
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    baseSize: '16px',
  },
  spacing: 'comfortable',
  borderRadius: 'medium',
  darkMode: true,
  breakpoints: ['mobile', 'tablet', 'desktop'],
  accessibilityLevel: 'AA',
};

/**
 * UI Verification Result
 */
export interface UIVerificationResult {
  passed: boolean;
  category: string;
  check: string;
  message: string;
  screenshot?: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Generate Tailwind config from design spec
 */
export function generateTailwindConfig(spec: UIDesignSpec): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ${spec.darkMode ? "'class'" : 'false'},
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '${spec.colors.primary}',
          50: '${lighten(spec.colors.primary, 0.9)}',
          100: '${lighten(spec.colors.primary, 0.8)}',
          200: '${lighten(spec.colors.primary, 0.6)}',
          300: '${lighten(spec.colors.primary, 0.4)}',
          400: '${lighten(spec.colors.primary, 0.2)}',
          500: '${spec.colors.primary}',
          600: '${darken(spec.colors.primary, 0.1)}',
          700: '${darken(spec.colors.primary, 0.2)}',
          800: '${darken(spec.colors.primary, 0.3)}',
          900: '${darken(spec.colors.primary, 0.4)}',
        },
        secondary: {
          DEFAULT: '${spec.colors.secondary}',
        },
        accent: {
          DEFAULT: '${spec.colors.accent}',
        },
      },
      fontFamily: {
        sans: ['${spec.typography.fontFamily}'],
        ${spec.typography.headingFont ? `heading: ['${spec.typography.headingFont}'],` : ''}
      },
      borderRadius: {
        DEFAULT: '${getBorderRadius(spec.borderRadius)}',
      },
    },
  },
  plugins: [],
}
`;
}

/**
 * Generate CSS variables from design spec
 */
export function generateCSSVariables(spec: UIDesignSpec): string {
  return `:root {
  /* Colors */
  --color-primary: ${spec.colors.primary};
  --color-secondary: ${spec.colors.secondary};
  --color-accent: ${spec.colors.accent};
  --color-background: ${spec.colors.background};
  --color-text: ${spec.colors.text};
  --color-error: ${spec.colors.error};
  --color-success: ${spec.colors.success};
  --color-warning: ${spec.colors.warning};

  /* Typography */
  --font-family: ${spec.typography.fontFamily};
  --font-size-base: ${spec.typography.baseSize};

  /* Spacing */
  --spacing-unit: ${getSpacingUnit(spec.spacing)};

  /* Border Radius */
  --border-radius: ${getBorderRadius(spec.borderRadius)};
}

${spec.darkMode ? `
.dark {
  --color-background: #111827;
  --color-text: #f9fafb;
}
` : ''}
`;
}

/**
 * Helper to lighten a hex color
 */
function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * amount));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Helper to darken a hex color
 */
function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor((num >> 16) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Get spacing unit based on preference
 */
function getSpacingUnit(spacing: 'compact' | 'comfortable' | 'spacious'): string {
  switch (spacing) {
    case 'compact': return '0.25rem';
    case 'comfortable': return '0.5rem';
    case 'spacious': return '0.75rem';
  }
}

/**
 * Get border radius based on preference
 */
function getBorderRadius(radius: 'none' | 'small' | 'medium' | 'large' | 'full'): string {
  switch (radius) {
    case 'none': return '0';
    case 'small': return '0.25rem';
    case 'medium': return '0.5rem';
    case 'large': return '1rem';
    case 'full': return '9999px';
  }
}

/**
 * Component library setup instructions
 */
export const COMPONENT_LIBRARY_SETUP: Record<string, { install: string; setup: string }> = {
  shadcn: {
    install: 'npx shadcn@latest init',
    setup: `
# After init, add components as needed:
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add dialog
# etc.
`,
  },
  mui: {
    install: 'npm install @mui/material @emotion/react @emotion/styled',
    setup: `
// Wrap app in ThemeProvider
import { ThemeProvider, createTheme } from '@mui/material/styles';
const theme = createTheme({ /* your theme */ });
`,
  },
  chakra: {
    install: 'npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion',
    setup: `
// Wrap app in ChakraProvider
import { ChakraProvider } from '@chakra-ui/react';
`,
  },
};

/**
 * Visual regression test configuration
 * TODO: Implement with Playwright
 */
export interface VisualTestConfig {
  /** Pages to test */
  pages: Array<{
    path: string;
    name: string;
    waitForSelector?: string;
  }>;

  /** Viewports to test */
  viewports: Array<{
    name: string;
    width: number;
    height: number;
  }>;

  /** Screenshot comparison threshold */
  threshold: number;
}

/**
 * Default visual test configuration
 */
export const DEFAULT_VISUAL_TEST_CONFIG: VisualTestConfig = {
  pages: [
    { path: '/', name: 'home' },
    { path: '/dashboard', name: 'dashboard' },
    { path: '/board', name: 'board', waitForSelector: '[data-testid="kanban-board"]' },
  ],
  viewports: [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
  ],
  threshold: 0.1, // 10% difference allowed
};

/**
 * Accessibility checks to perform
 * TODO: Implement with axe-core
 */
export const ACCESSIBILITY_CHECKS = [
  'color-contrast',
  'aria-roles',
  'keyboard-navigation',
  'focus-indicators',
  'alt-text',
  'form-labels',
  'heading-order',
  'link-purpose',
];

/**
 * FUTURE: Run visual regression tests
 * Requires Playwright installation
 */
export async function runVisualTests(
  _projectDir: string,
  _config: VisualTestConfig = DEFAULT_VISUAL_TEST_CONFIG
): Promise<UIVerificationResult[]> {
  // TODO: Implement with Playwright
  // 1. Start dev server
  // 2. Navigate to each page
  // 3. Take screenshots at each viewport
  // 4. Compare with baseline (if exists)
  // 5. Report differences

  console.warn('[UI Verification] Visual testing not yet implemented - requires Playwright');

  return [{
    passed: true,
    category: 'Visual',
    check: 'Visual regression tests',
    message: 'Visual testing not yet implemented',
    severity: 'warning',
  }];
}

/**
 * FUTURE: Run accessibility tests
 * Requires axe-core installation
 */
export async function runAccessibilityTests(
  _projectDir: string,
  _level: 'A' | 'AA' | 'AAA' = 'AA'
): Promise<UIVerificationResult[]> {
  // TODO: Implement with axe-core
  // 1. Start dev server
  // 2. Navigate to each page
  // 3. Run axe-core analysis
  // 4. Report violations

  console.warn('[UI Verification] Accessibility testing not yet implemented - requires axe-core');

  return [{
    passed: true,
    category: 'Accessibility',
    check: 'WCAG compliance',
    message: 'Accessibility testing not yet implemented',
    severity: 'warning',
  }];
}
