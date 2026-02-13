/**
 * Website content templates for Next.js marketing sites
 * Generates SEO-ready content pages with optional project context
 * and strategy-driven marketing content
 */

import type { WebsiteContentContext } from '../website-context.js';
// Strategy data is accessed via context.strategy (WebsiteContentContext includes it)

/**
 * Generate root layout.tsx with metadata
 */
export function generateWebsiteLayout(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const strategy = context?.strategy;
  const displayName = context?.productName || title;
  const desc = strategy?.messaging.longDescription
    || context?.description
    || `${displayName} - Your modern web application`;

  // SEO keywords from strategy or defaults
  const keywords = strategy?.seoStrategy.primaryKeywords
    ? strategy.seoStrategy.primaryKeywords.map(k => `'${escapeJsx(k)}'`).join(', ')
    : `'${projectName}', 'web app', 'nextjs'`;

  return `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: '${escapeJsx(displayName)}',
    template: '%s | ${escapeJsx(displayName)}',
  },
  description: '${escapeJsx(desc)}',
  keywords: [${keywords}],
  authors: [{ name: '${escapeJsx(displayName)} Team' }],
  creator: '${escapeJsx(displayName)}',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: '${escapeJsx(displayName)}',
    title: '${escapeJsx(displayName)}',
    description: '${escapeJsx(desc)}',
  },
  twitter: {
    card: 'summary_large_image',
    title: '${escapeJsx(displayName)}',
    description: '${escapeJsx(desc)}',
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
 * Generate globals.css with optional brand colors
 */
export function generateWebsiteGlobalsCss(
  context?: WebsiteContentContext
): string {
  // Convert hex to HSL for CSS custom properties if brand color provided
  const primaryHsl = context?.brand?.primaryColor
    ? hexToHslString(context.brand.primaryColor)
    : '199 89% 48%';

  return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: ${primaryHsl};
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
 * Generate landing page.tsx with optional context-driven content
 * When strategy is available, uses strategy messaging, trust signals, and CTAs
 */
export function generateWebsiteLandingPage(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const strategy = context?.strategy;
  const displayName = context?.productName || title;

  // Strategy-driven or context-driven hero
  const headline = strategy?.messaging.headline || displayName;
  const subheadline = strategy?.messaging.subheadline || '';
  const heroText = strategy?.messaging.longDescription
    ? escapeJsx(strategy.messaging.longDescription)
    : context?.description
    ? escapeJsx(context.description)
    : null;

  const features = context?.features && context.features.length > 0
    ? context.features.slice(0, 6)
    : null;

  // CTAs from strategy or defaults
  const primaryCtaText = strategy?.conversionStrategy.primaryCta.text || 'Get started';
  const primaryCtaHref = strategy?.conversionStrategy.primaryCta.href || '/pricing';
  const secondaryCtaText = strategy?.conversionStrategy.secondaryCta.text || 'Learn more';
  const secondaryCtaHref = strategy?.conversionStrategy.secondaryCta.href || '/docs';

  // Build hero paragraph
  const heroParagraph = heroText
    ? `              ${heroText}`
    : `              {/* TODO: populate from project specification */}`;

  // Build features array
  const featuresBlock = features
    ? features.map((f) =>
        `                {\n                  title: '${escapeJsx(f.title)}',\n                  description: '${escapeJsx(f.description)}',\n                }`
      ).join(',\n')
    : `                {\n                  title: 'Feature 1',\n                  description: '/* TODO: populate from project specification */',\n                },\n                {\n                  title: 'Feature 2',\n                  description: '/* TODO: populate from project specification */',\n                },\n                {\n                  title: 'Feature 3',\n                  description: '/* TODO: populate from project specification */',\n                }`;

  // Trust signals from strategy
  const trustSignals = strategy?.conversionStrategy.trustSignals || [];
  const trustSignalsBlock = trustSignals.length > 0
    ? trustSignals.map(s => `        '${escapeJsx(s)}'`).join(',\n')
    : '';

  // Social proof from strategy
  const socialProof = strategy?.conversionStrategy.socialProof || [];
  const socialProofBlock = socialProof.length > 0
    ? socialProof.map(s => `        '${escapeJsx(s)}'`).join(',\n')
    : '';

  // Build optional sections
  const trustSection = trustSignals.length > 0 ? `
      {/* Trust Signals */}
      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="container">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {[
${trustSignalsBlock}
            ].map((signal) => (
              <p key={signal} className="text-sm font-medium text-gray-600">{signal}</p>
            ))}
          </div>
        </div>
      </section>
` : '';

  const socialProofSection = socialProof.length > 0 ? `
      {/* Social Proof */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Trusted by teams everywhere
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            {[
${socialProofBlock}
            ].map((quote, i) => (
              <blockquote key={i} className="rounded-2xl border border-gray-200 p-6">
                <p className="text-gray-700">&ldquo;{quote}&rdquo;</p>
              </blockquote>
            ))}
          </div>
        </div>
      </section>
` : '';

  // Metadata: strategy-driven or default
  const metaTitle = strategy?.seoStrategy.titleTemplates?.home || 'Welcome';
  const metaDesc = strategy?.seoStrategy.metaDescriptions?.home || `Welcome to ${displayName}`;

  return `import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';

export const metadata: Metadata = {
  title: '${escapeJsx(metaTitle)}',
  description: '${escapeJsx(metaDesc)}',
};

const ORG_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '${escapeJsx(displayName)}',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com',
};

const PRODUCT_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: '${escapeJsx(displayName)}',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
};

export default function HomePage() {
  return (
    <>
      <Header />
      <JsonLd schema={ORG_SCHEMA} />
      <JsonLd schema={PRODUCT_SCHEMA} />
      <main className="flex min-h-screen flex-col">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 to-white py-20 sm:py-32">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                ${escapeJsx(headline)}
              </h1>
${subheadline ? `              <p className="mt-4 text-xl font-medium text-primary-600">\n                ${escapeJsx(subheadline)}\n              </p>` : ''}
              <p className="mt-6 text-lg leading-8 text-gray-600">
${heroParagraph}
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="${escapeJsx(primaryCtaHref)}"
                  className="rounded-md bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  ${escapeJsx(primaryCtaText)}
                </Link>
                <Link
                  href="${escapeJsx(secondaryCtaHref)}"
                  className="text-sm font-semibold leading-6 text-gray-900 hover:text-primary-600"
                >
                  ${escapeJsx(secondaryCtaText)} <span aria-hidden="true">-&gt;</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
${trustSection}
        {/* Features Section */}
        <section id="features" className="py-20 sm:py-32">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Everything you need
              </h2>
              <p className="mt-4 text-lg text-gray-600">
                {/* TODO: populate section subtitle from project specification */}
              </p>
            </div>
            <div className="mx-auto mt-16 max-w-5xl">
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {[
${featuresBlock}
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
${socialProofSection}
        {/* CTA Section */}
        <section className="bg-primary-600 py-16 sm:py-24">
          <div className="container text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to get started?
            </h2>
            <p className="mt-4 text-lg text-primary-100">
              ${strategy?.messaging.elevatorPitch ? escapeJsx(strategy.messaging.elevatorPitch) : 'Start building today.'}
            </p>
            <div className="mt-8">
              <Link
                href="${escapeJsx(primaryCtaHref)}"
                className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-primary-600 shadow-sm hover:bg-primary-50"
              >
                ${escapeJsx(primaryCtaText)}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
`;
}

/**
 * Generate pricing page with optional context-driven tiers and FAQ
 */
export function generateWebsitePricingPage(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const strategy = context?.strategy;
  const displayName = context?.productName || title;
  const tiers = context?.pricing && context.pricing.length > 0
    ? context.pricing
    : null;

  // Build tiers array
  const tiersBlock = tiers
    ? tiers.map((t) => {
        const featuresStr = t.features.map((f) => `      '${escapeJsx(f)}'`).join(',\n');
        return `  {
    name: '${escapeJsx(t.name)}',
    price: '${escapeJsx(t.price)}',
    description: '${escapeJsx(t.description)}',
    features: [
${featuresStr}
    ],
    cta: '${escapeJsx(t.cta)}',
    featured: ${t.featured ? 'true' : 'false'},
  }`;
      }).join(',\n')
    : `  {
    name: '/* TODO: tier name */',
    price: '/* TODO */',
    description: '/* TODO: populate from project specification */',
    features: ['/* TODO: populate from project specification */'],
    cta: 'Get started',
    featured: false,
  },
  {
    name: '/* TODO: tier name */',
    price: '/* TODO */',
    description: '/* TODO: populate from project specification */',
    features: ['/* TODO: populate from project specification */'],
    cta: 'Start free trial',
    featured: true,
  },
  {
    name: '/* TODO: tier name */',
    price: '/* TODO */',
    description: '/* TODO: populate from project specification */',
    features: ['/* TODO: populate from project specification */'],
    cta: 'Contact sales',
    featured: false,
  }`;

  // Pricing metadata from strategy or defaults
  const metaTitle = strategy?.seoStrategy.titleTemplates?.pricing || 'Pricing';
  const metaDesc = strategy?.seoStrategy.metaDescriptions?.pricing || `Choose the perfect plan for your needs - ${displayName}`;

  // Enterprise CTA from strategy
  const enterpriseCtaText = strategy?.conversionStrategy.primaryCta.text || 'Contact Sales';

  return `import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: '${escapeJsx(metaTitle)}',
  description: '${escapeJsx(metaDesc)}',
};

const tiers = [
${tiersBlock}
];

export default function PricingPage() {
  return (
    <>
      <Header />
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

          {/* Enterprise CTA */}
          <div className="mx-auto mt-16 max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Need a custom plan?
            </h2>
            <p className="mt-4 text-gray-600">
              Contact our sales team for enterprise pricing and custom solutions.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-block rounded-md border border-primary-600 px-6 py-3 text-sm font-semibold text-primary-600 hover:bg-primary-50"
            >
              ${escapeJsx(enterpriseCtaText)}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
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
 * Generate website spec JSON with optional context
 */
export function generateWebsiteSpec(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const displayName = context?.productName || title;
  const tagline = context?.tagline || context?.description || 'Build something amazing';
  const primaryColor = context?.brand?.primaryColor || '#0ea5e9';

  return JSON.stringify(
    {
      version: '1.0',
      brand: {
        name: displayName,
        tagline,
        colors: {
          primary: primaryColor,
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
        title: displayName,
        description: context?.description || `${displayName} - Your modern web application`,
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
 * Escape a string for safe use inside JSX template literals
 */
function escapeJsx(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

/**
 * Convert hex color to HSL string for CSS custom properties
 * Returns format: "H S% L%"
 */
function hexToHslString(hex: string): string {
  // Remove # prefix
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return `0 0% ${Math.round(l * 100)}%`;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    hue = ((b - r) / d + 2) / 6;
  } else {
    hue = ((r - g) / d + 4) / 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
