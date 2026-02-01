/**
 * UI Setup Module
 * Automatically sets up component libraries, design systems, and styling
 * for a polished, professional UI without manual configuration
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Design theme configuration
 */
export interface DesignTheme {
  name: string;
  colors: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    accent: string;
    accentForeground: string;
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    muted: string;
    mutedForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
  };
  borderRadius: string;
  fontFamily: string;
}

/**
 * Pre-defined professional themes
 */
export const THEMES: Record<string, DesignTheme> = {
  modern: {
    name: 'Modern Blue',
    colors: {
      primary: '221.2 83.2% 53.3%',
      primaryForeground: '210 40% 98%',
      secondary: '210 40% 96.1%',
      secondaryForeground: '222.2 47.4% 11.2%',
      accent: '210 40% 96.1%',
      accentForeground: '222.2 47.4% 11.2%',
      background: '0 0% 100%',
      foreground: '222.2 84% 4.9%',
      card: '0 0% 100%',
      cardForeground: '222.2 84% 4.9%',
      muted: '210 40% 96.1%',
      mutedForeground: '215.4 16.3% 46.9%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 40% 98%',
      border: '214.3 31.8% 91.4%',
      input: '214.3 31.8% 91.4%',
      ring: '221.2 83.2% 53.3%',
    },
    borderRadius: '0.5rem',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elegant: {
    name: 'Elegant Dark',
    colors: {
      primary: '262.1 83.3% 57.8%',
      primaryForeground: '210 20% 98%',
      secondary: '220 14.3% 95.9%',
      secondaryForeground: '220.9 39.3% 11%',
      accent: '220 14.3% 95.9%',
      accentForeground: '220.9 39.3% 11%',
      background: '0 0% 100%',
      foreground: '224 71.4% 4.1%',
      card: '0 0% 100%',
      cardForeground: '224 71.4% 4.1%',
      muted: '220 14.3% 95.9%',
      mutedForeground: '220 8.9% 46.1%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 20% 98%',
      border: '220 13% 91%',
      input: '220 13% 91%',
      ring: '262.1 83.3% 57.8%',
    },
    borderRadius: '0.75rem',
    fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
  },
  minimal: {
    name: 'Minimal Clean',
    colors: {
      primary: '240 5.9% 10%',
      primaryForeground: '0 0% 98%',
      secondary: '240 4.8% 95.9%',
      secondaryForeground: '240 5.9% 10%',
      accent: '240 4.8% 95.9%',
      accentForeground: '240 5.9% 10%',
      background: '0 0% 100%',
      foreground: '240 10% 3.9%',
      card: '0 0% 100%',
      cardForeground: '240 10% 3.9%',
      muted: '240 4.8% 95.9%',
      mutedForeground: '240 3.8% 46.1%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '0 0% 98%',
      border: '240 5.9% 90%',
      input: '240 5.9% 90%',
      ring: '240 5.9% 10%',
    },
    borderRadius: '0.375rem',
    fontFamily: 'system-ui, sans-serif',
  },
  vibrant: {
    name: 'Vibrant Gradient',
    colors: {
      primary: '339 89.6% 51%',
      primaryForeground: '0 0% 100%',
      secondary: '217.2 91.2% 59.8%',
      secondaryForeground: '0 0% 100%',
      accent: '47.9 95.8% 53.1%',
      accentForeground: '0 0% 9%',
      background: '0 0% 100%',
      foreground: '222.2 84% 4.9%',
      card: '0 0% 100%',
      cardForeground: '222.2 84% 4.9%',
      muted: '210 40% 96.1%',
      mutedForeground: '215.4 16.3% 46.9%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '0 0% 100%',
      border: '214.3 31.8% 91.4%',
      input: '214.3 31.8% 91.4%',
      ring: '339 89.6% 51%',
    },
    borderRadius: '1rem',
    fontFamily: 'Poppins, system-ui, sans-serif',
  },
};

/**
 * UI Setup result
 */
export interface UISetupResult {
  success: boolean;
  theme: string;
  componentsInstalled: string[];
  error?: string;
}

/**
 * Generate globals.css with theme
 */
function generateGlobalsCss(theme: DesignTheme): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: ${theme.colors.background};
    --foreground: ${theme.colors.foreground};
    --card: ${theme.colors.card};
    --card-foreground: ${theme.colors.cardForeground};
    --popover: ${theme.colors.card};
    --popover-foreground: ${theme.colors.cardForeground};
    --primary: ${theme.colors.primary};
    --primary-foreground: ${theme.colors.primaryForeground};
    --secondary: ${theme.colors.secondary};
    --secondary-foreground: ${theme.colors.secondaryForeground};
    --muted: ${theme.colors.muted};
    --muted-foreground: ${theme.colors.mutedForeground};
    --accent: ${theme.colors.accent};
    --accent-foreground: ${theme.colors.accentForeground};
    --destructive: ${theme.colors.destructive};
    --destructive-foreground: ${theme.colors.destructiveForeground};
    --border: ${theme.colors.border};
    --input: ${theme.colors.input};
    --ring: ${theme.colors.ring};
    --radius: ${theme.borderRadius};
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: ${theme.colors.primary};
    --primary-foreground: ${theme.colors.primaryForeground};
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: ${theme.colors.ring};
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: ${theme.fontFamily};
  }
}

/* Custom utility classes */
@layer utilities {
  .text-balance {
    text-wrap: balance;
  }

  .glass {
    @apply bg-white/80 backdrop-blur-lg border border-white/20;
  }

  .glass-dark {
    @apply bg-black/40 backdrop-blur-lg border border-white/10;
  }
}

/* Animation utilities */
@layer utilities {
  .animate-in {
    animation: animateIn 0.3s ease-out;
  }

  .animate-out {
    animation: animateOut 0.2s ease-in;
  }

  @keyframes animateIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes animateOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
}
`;
}

/**
 * Generate Tailwind config for shadcn
 */
function generateTailwindConfig(theme: DesignTheme): string {
  return `import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["${theme.fontFamily.split(',')[0]}", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
`;
}

/**
 * Components to install based on project type
 */
const COMPONENT_SETS: Record<string, string[]> = {
  dashboard: [
    'button', 'card', 'input', 'label', 'select', 'table', 'tabs',
    'dialog', 'dropdown-menu', 'avatar', 'badge', 'skeleton',
    'tooltip', 'separator', 'scroll-area', 'sheet', 'toast',
  ],
  kanban: [
    'button', 'card', 'input', 'label', 'select', 'dialog',
    'dropdown-menu', 'avatar', 'badge', 'skeleton', 'tooltip',
    'separator', 'scroll-area', 'sheet', 'toast', 'popover',
    'context-menu', 'command',
  ],
  ecommerce: [
    'button', 'card', 'input', 'label', 'select', 'dialog',
    'carousel', 'avatar', 'badge', 'skeleton', 'tooltip',
    'separator', 'scroll-area', 'sheet', 'toast', 'accordion',
    'tabs', 'slider',
  ],
  blog: [
    'button', 'card', 'input', 'label', 'textarea', 'dialog',
    'avatar', 'badge', 'skeleton', 'separator', 'scroll-area',
    'toast', 'navigation-menu',
  ],
  default: [
    'button', 'card', 'input', 'label', 'select', 'dialog',
    'dropdown-menu', 'avatar', 'badge', 'skeleton', 'tooltip',
    'separator', 'toast',
  ],
};

/**
 * Detect project type from idea/specification
 */
export function detectProjectType(idea: string): string {
  const lowerIdea = idea.toLowerCase();

  if (lowerIdea.includes('kanban') || lowerIdea.includes('project manage') || lowerIdea.includes('task')) {
    return 'kanban';
  }
  if (lowerIdea.includes('dashboard') || lowerIdea.includes('analytics') || lowerIdea.includes('admin')) {
    return 'dashboard';
  }
  if (lowerIdea.includes('shop') || lowerIdea.includes('store') || lowerIdea.includes('ecommerce') || lowerIdea.includes('product')) {
    return 'ecommerce';
  }
  if (lowerIdea.includes('blog') || lowerIdea.includes('article') || lowerIdea.includes('content')) {
    return 'blog';
  }

  return 'default';
}

/**
 * Setup complete UI system for a project
 */
export async function setupUI(
  projectDir: string,
  options: {
    theme?: string;
    projectType?: string;
    idea?: string;
  } = {},
  onProgress?: (message: string) => void
): Promise<UISetupResult> {
  const frontendDir = path.join(projectDir, 'packages', 'frontend');
  const componentsInstalled: string[] = [];

  try {
    // Determine theme
    const themeName = options.theme || 'modern';
    const theme = THEMES[themeName] || THEMES.modern;
    onProgress?.(`Using theme: ${theme.name}`);

    // Determine project type
    const projectType = options.projectType || (options.idea ? detectProjectType(options.idea) : 'default');
    onProgress?.(`Detected project type: ${projectType}`);

    // Check if frontend exists
    const frontendExists = await fs.access(frontendDir).then(() => true).catch(() => false);
    if (!frontendExists) {
      return {
        success: false,
        theme: themeName,
        componentsInstalled: [],
        error: 'Frontend directory not found',
      };
    }

    // Step 1: Install Tailwind and dependencies
    onProgress?.('Installing Tailwind CSS and dependencies...');
    await execAsync(
      'npm install -D tailwindcss postcss autoprefixer tailwindcss-animate @tailwindcss/postcss',
      { cwd: frontendDir, timeout: 120000 }
    );

    // Step 2: Install shadcn/ui dependencies
    onProgress?.('Installing UI component dependencies...');
    await execAsync(
      'npm install class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-slot',
      { cwd: frontendDir, timeout: 120000 }
    );

    // Step 3: Create lib/utils.ts
    onProgress?.('Creating utility functions...');
    const libDir = path.join(frontendDir, 'src', 'lib');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(
      path.join(libDir, 'utils.ts'),
      `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`
    );

    // Step 4: Create Tailwind config
    onProgress?.('Configuring Tailwind CSS...');
    await fs.writeFile(
      path.join(frontendDir, 'tailwind.config.ts'),
      generateTailwindConfig(theme)
    );

    // Step 5: Create PostCSS config
    await fs.writeFile(
      path.join(frontendDir, 'postcss.config.js'),
      `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
    );

    // Step 6: Create globals.css
    onProgress?.('Setting up theme and styles...');
    await fs.writeFile(
      path.join(frontendDir, 'src', 'index.css'),
      generateGlobalsCss(theme)
    );

    // Step 7: Create components directory structure
    const componentsDir = path.join(frontendDir, 'src', 'components', 'ui');
    await fs.mkdir(componentsDir, { recursive: true });

    // Step 8: Install base components
    const components = COMPONENT_SETS[projectType] || COMPONENT_SETS.default;
    onProgress?.(`Installing ${components.length} UI components...`);

    // Create button component (always needed)
    await fs.writeFile(
      path.join(componentsDir, 'button.tsx'),
      generateButtonComponent()
    );
    componentsInstalled.push('button');

    // Create card component
    await fs.writeFile(
      path.join(componentsDir, 'card.tsx'),
      generateCardComponent()
    );
    componentsInstalled.push('card');

    // Create input component
    await fs.writeFile(
      path.join(componentsDir, 'input.tsx'),
      generateInputComponent()
    );
    componentsInstalled.push('input');

    // Create badge component
    await fs.writeFile(
      path.join(componentsDir, 'badge.tsx'),
      generateBadgeComponent()
    );
    componentsInstalled.push('badge');

    // Create skeleton component
    await fs.writeFile(
      path.join(componentsDir, 'skeleton.tsx'),
      generateSkeletonComponent()
    );
    componentsInstalled.push('skeleton');

    // Step 9: Update main.tsx to import CSS
    onProgress?.('Updating application entry point...');
    const mainTsxPath = path.join(frontendDir, 'src', 'main.tsx');
    let mainTsx = await fs.readFile(mainTsxPath, 'utf-8');

    if (!mainTsx.includes("import './index.css'")) {
      // Add CSS import at the top
      mainTsx = `import './index.css';\n${mainTsx}`;
      await fs.writeFile(mainTsxPath, mainTsx);
    }

    onProgress?.(`UI setup complete! Theme: ${theme.name}, Components: ${componentsInstalled.length}`);

    return {
      success: true,
      theme: themeName,
      componentsInstalled,
    };
  } catch (error) {
    return {
      success: false,
      theme: options.theme || 'modern',
      componentsInstalled,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Component generators
function generateButtonComponent(): string {
  return `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`;
}

function generateCardComponent(): string {
  return `import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
`;
}

function generateInputComponent(): string {
  return `import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
`;
}

function generateBadgeComponent(): string {
  return `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
`;
}

function generateSkeletonComponent(): string {
  return `import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
`;
}
