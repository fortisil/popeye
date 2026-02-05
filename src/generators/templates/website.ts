/**
 * Website templates for Next.js marketing sites
 * Generates SEO-ready Next.js App Router projects
 */

/**
 * Generate Next.js package.json
 */
export function generateWebsitePackageJson(projectName: string): string {
  return `{
  "name": "${projectName}-website",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.312.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "@testing-library/react": "^14.1.2",
    "@vitejs/plugin-react": "^4.2.1",
    "vitest": "^1.2.0",
    "jsdom": "^24.0.0"
  }
}
`;
}

/**
 * Generate Next.js config
 */
export function generateNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Strict Mode for better development
  reactStrictMode: true,

  // Image optimization
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },

  // Disable x-powered-by header
  poweredByHeader: false,

  // Trailing slash config
  trailingSlash: false,

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
`;
}

/**
 * Generate website tsconfig.json
 */
export function generateWebsiteTsconfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;
}

/**
 * Generate Tailwind config for website
 */
export function generateWebsiteTailwindConfig(): string {
  return `import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
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
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

/**
 * Generate PostCSS config for website
 */
export function generateWebsitePostcssConfig(): string {
  return `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
}

/**
 * Generate root layout.tsx with metadata
 */
export function generateWebsiteLayout(projectName: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: '${title}',
    template: '%s | ${title}',
  },
  description: '${title} - Your modern web application',
  keywords: ['${projectName}', 'web app', 'nextjs'],
  authors: [{ name: '${title} Team' }],
  creator: '${title}',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://${projectName}.com',
    siteName: '${title}',
    title: '${title}',
    description: '${title} - Your modern web application',
  },
  twitter: {
    card: 'summary_large_image',
    title: '${title}',
    description: '${title} - Your modern web application',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white antialiased">
        {children}
      </body>
    </html>
  );
}
`;
}

/**
 * Generate globals.css
 */
export function generateWebsiteGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 199 89% 48%;
    --primary-foreground: 210 40% 98%;
  }

  body {
    @apply bg-background text-foreground;
  }
}

@layer components {
  .container {
    @apply mx-auto max-w-7xl px-4 sm:px-6 lg:px-8;
  }
}
`;
}

/**
 * Generate landing page.tsx
 */
export function generateWebsiteLandingPage(projectName: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Welcome',
  description: 'Welcome to ${title} - Your modern web application',
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 to-white py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              ${title}
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Build something amazing with our modern, scalable platform.
              Get started today and see the difference.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                href="/pricing"
                className="rounded-md bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                Get started
              </Link>
              <Link
                href="/docs"
                className="text-sm font-semibold leading-6 text-gray-900 hover:text-primary-600"
              >
                Learn more <span aria-hidden="true">-&gt;</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              All the features you need to build amazing products.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-5xl">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: 'Fast',
                  description: 'Optimized for speed and performance.',
                },
                {
                  title: 'Secure',
                  description: 'Built with security best practices.',
                },
                {
                  title: 'Scalable',
                  description: 'Grows with your business needs.',
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-gray-200 p-8"
                >
                  <h3 className="text-lg font-semibold text-gray-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-gray-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12">
        <div className="container">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} ${title}. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
`;
}

/**
 * Generate pricing page
 */
export function generateWebsitePricingPage(projectName: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Choose the perfect plan for your needs - ${title}',
};

const tiers = [
  {
    name: 'Free',
    price: '$0',
    description: 'Perfect for getting started',
    features: ['Up to 3 projects', 'Basic support', 'Community access'],
    cta: 'Get started',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$29',
    description: 'For growing teams',
    features: [
      'Unlimited projects',
      'Priority support',
      'Advanced analytics',
      'Custom integrations',
    ],
    cta: 'Start free trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations',
    features: [
      'Everything in Pro',
      'Dedicated support',
      'SLA guarantee',
      'Custom contracts',
    ],
    cta: 'Contact sales',
    featured: false,
  },
];

export default function PricingPage() {
  return (
    <main className="py-20 sm:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-6 text-lg text-gray-600">
            Choose the plan that works best for you.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 gap-8 lg:max-w-5xl lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={\`rounded-2xl p-8 \${
                tier.featured
                  ? 'bg-primary-600 text-white ring-2 ring-primary-600'
                  : 'border border-gray-200 bg-white'
              }\`}
            >
              <h2
                className={\`text-lg font-semibold \${
                  tier.featured ? 'text-white' : 'text-gray-900'
                }\`}
              >
                {tier.name}
              </h2>
              <p
                className={\`mt-2 text-sm \${
                  tier.featured ? 'text-primary-100' : 'text-gray-600'
                }\`}
              >
                {tier.description}
              </p>
              <p className="mt-6">
                <span
                  className={\`text-4xl font-bold \${
                    tier.featured ? 'text-white' : 'text-gray-900'
                  }\`}
                >
                  {tier.price}
                </span>
                {tier.price !== 'Custom' && (
                  <span
                    className={\`text-sm \${
                      tier.featured ? 'text-primary-100' : 'text-gray-600'
                    }\`}
                  >
                    /month
                  </span>
                )}
              </p>
              <ul className="mt-8 space-y-4">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className={\`flex text-sm \${
                      tier.featured ? 'text-primary-100' : 'text-gray-600'
                    }\`}
                  >
                    <svg
                      className={\`h-5 w-5 flex-shrink-0 \${
                        tier.featured ? 'text-white' : 'text-primary-600'
                      }\`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="ml-3">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                className={\`mt-8 w-full rounded-md px-4 py-2 text-sm font-semibold \${
                  tier.featured
                    ? 'bg-white text-primary-600 hover:bg-primary-50'
                    : 'bg-primary-600 text-white hover:bg-primary-500'
                }\`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
`;
}

/**
 * Generate sitemap.ts
 */
export function generateWebsiteSitemap(projectName: string): string {
  return `import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: \`\${baseUrl}/pricing\`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: \`\${baseUrl}/docs\`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: \`\${baseUrl}/blog\`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];
}
`;
}

/**
 * Generate robots.ts
 */
export function generateWebsiteRobots(projectName: string): string {
  return `import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: \`\${baseUrl}/sitemap.xml\`,
  };
}
`;
}

/**
 * Generate website Dockerfile
 */
export function generateWebsiteDockerfile(): string {
  return `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
`;
}

/**
 * Generate website README
 */
export function generateWebsiteReadme(projectName: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `# ${title} Website

Next.js marketing website with SEO optimization.

## Getting Started

\`\`\`bash
# Install dependencies
npm install

# Run development server (port 3001)
npm run dev

# Build for production
npm run build

# Run production server
npm start
\`\`\`

## SEO Features

- Server-side rendering (SSR)
- Auto-generated sitemap
- robots.txt configuration
- OpenGraph and Twitter meta tags
- Structured data support

## Project Structure

\`\`\`
src/
  app/
    layout.tsx      # Root layout with metadata
    page.tsx        # Landing page
    pricing/        # Pricing page
    docs/           # Documentation
    blog/           # Blog
    sitemap.ts      # Auto-generated sitemap
    robots.ts       # robots.txt config
  components/       # UI components
  lib/              # Utilities
content/
  blog/             # MDX blog posts
  docs/             # MDX documentation
\`\`\`

## Development

- Port: 3001 (to avoid conflicts with frontend on 5173)
- API URL: Configure via NEXT_PUBLIC_APP_URL
`;
}

/**
 * Generate website spec JSON
 */
export function generateWebsiteSpec(projectName: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return JSON.stringify(
    {
      version: '1.0',
      brand: {
        name: title,
        tagline: 'Build something amazing',
        colors: {
          primary: '#0ea5e9',
          secondary: '#64748b',
          accent: '#f59e0b',
          background: '#ffffff',
          foreground: '#0f172a',
        },
        typography: {
          headingFont: 'Inter',
          bodyFont: 'Inter',
        },
      },
      seo: {
        title: title,
        description: `${title} - Your modern web application`,
        keywords: [projectName, 'web app', 'nextjs', 'saas'],
        locale: 'en_US',
      },
      pages: [
        { name: 'Home', path: '/', type: 'landing' },
        { name: 'Pricing', path: '/pricing', type: 'pricing' },
        { name: 'Documentation', path: '/docs', type: 'docs' },
        { name: 'Blog', path: '/blog', type: 'blog' },
      ],
      cta: {
        primary: { text: 'Get Started', href: '/pricing' },
        secondary: { text: 'Learn More', href: '/docs' },
      },
      features: {
        analytics: true,
        newsletter: false,
        mdxBlog: true,
        docsSearch: false,
      },
    },
    null,
    2
  );
}

/**
 * Generate vitest config for website
 */
export function generateWebsiteVitestConfig(): string {
  return `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['**/*.test.{ts,tsx}'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`;
}

/**
 * Generate vitest setup for website
 */
export function generateWebsiteVitestSetup(): string {
  return `import '@testing-library/jest-dom';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));
`;
}

/**
 * Generate sample test for website
 */
export function generateWebsiteTest(projectName: string): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the title', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('${title}');
  });

  it('renders the call-to-action buttons', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn more/i })).toBeInTheDocument();
  });

  it('renders feature cards', () => {
    render(<HomePage />);
    expect(screen.getByText('Fast')).toBeInTheDocument();
    expect(screen.getByText('Secure')).toBeInTheDocument();
    expect(screen.getByText('Scalable')).toBeInTheDocument();
  });
});
`;
}

/**
 * Generate docs page placeholder
 */
export function generateWebsiteDocsPage(): string {
  return `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Learn how to use our platform with comprehensive documentation.',
};

export default function DocsPage() {
  return (
    <main className="py-20">
      <div className="container">
        <h1 className="text-4xl font-bold text-gray-900">Documentation</h1>
        <p className="mt-4 text-lg text-gray-600">
          Documentation coming soon...
        </p>
      </div>
    </main>
  );
}
`;
}

/**
 * Generate blog listing page placeholder
 */
export function generateWebsiteBlogPage(): string {
  return `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Latest news, updates, and insights from our team.',
};

export default function BlogPage() {
  return (
    <main className="py-20">
      <div className="container">
        <h1 className="text-4xl font-bold text-gray-900">Blog</h1>
        <p className="mt-4 text-lg text-gray-600">
          Blog posts coming soon...
        </p>
      </div>
    </main>
  );
}
`;
}

/**
 * Generate Next.js environment declaration
 */
export function generateWebsiteNextEnv(): string {
  return `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
`;
}
