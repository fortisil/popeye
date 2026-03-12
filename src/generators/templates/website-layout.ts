/**
 * Website layout and utility page generators
 * Layout, globals CSS, sitemap, robots, docs, blog, readme, spec, test
 */

import type { WebsiteContentContext } from '../website-context.js';

/**
 * Escape a string for safe use inside JSX template literals
 */
function escapeJsx(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$(?=\{)/g, '\\$');
}

/**
 * Convert hex color to HSL string for CSS custom properties
 * Returns format: "H S% L%"
 */
function hexToHslString(hex: string): string {
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
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
`;
}

/**
 * Generate globals.css with full CSS variable set
 */
export function generateWebsiteGlobalsCss(
  context?: WebsiteContentContext
): string {
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
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214 32% 91%;
    --ring: ${primaryHsl};
    --radius: 0.5rem;
  }

  body {
    @apply bg-background text-foreground;
  }
}

html {
  scroll-behavior: smooth;
}

@layer components {
  .container {
    @apply mx-auto max-w-7xl px-4 sm:px-6 lg:px-8;
  }
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
    {
      url: \`\${baseUrl}/contact\`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: \`\${baseUrl}/privacy\`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: \`\${baseUrl}/terms\`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
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
- Structured data support (Organization + SoftwareApplication + FAQ)

## Project Structure

\`\`\`
src/
  app/
    layout.tsx      # Root layout with metadata
    page.tsx        # Landing page (10 sections)
    pricing/        # Pricing page with comparison
    docs/           # Documentation
    blog/           # Blog
    sitemap.ts      # Auto-generated sitemap
    robots.ts       # robots.txt config
  components/       # UI components (Header, Footer, JsonLd)
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
 * Generate documentation landing page with real content sections
 *
 * @param projectName - Project name for context
 * @param context - Optional content context for product-aware copy
 * @returns Documentation page source code
 */
export function generateWebsiteDocsPage(
  projectName?: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    ?.split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'our platform';

  const desc = context?.description || `Learn how to integrate ${displayName} into your projects`;

  return `import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Documentation',
  description: '${escapeJsx(desc)}.',
};

const sections = [
  {
    title: 'Quick Start',
    description:
      'Get ${escapeJsx(displayName)} running in your project in under five minutes. Install the SDK, configure your credentials, and make your first API call.',
    code: \`npm install @${projectName ? escapeJsx(projectName) : 'my-project'}/sdk

import { createClient } from '@${projectName ? escapeJsx(projectName) : 'my-project'}/sdk';

const client = createClient({
  apiKey: process.env.API_KEY,
});

const result = await client.run({ input: 'Hello' });
console.log(result);\`,
  },
  {
    title: 'Core Concepts',
    description:
      '${escapeJsx(displayName)} is built around a small set of primitives that compose into powerful workflows. This section covers the data model, authentication, and the request lifecycle so you can design integrations with confidence.',
  },
  {
    title: 'API Reference',
    description:
      'The ${escapeJsx(displayName)} REST API provides endpoints for all platform operations. All endpoints require authentication via API key. Requests and responses use JSON. Rate limits and quotas depend on your subscription plan.',
  },
  {
    title: 'SDK Integration',
    description:
      'Official SDKs are available for popular languages and frameworks. Each SDK provides typed helpers, automatic retries, and idiomatic error handling so you can integrate ${escapeJsx(displayName)} without boilerplate.',
  },
  {
    title: 'Deployment Guide',
    description:
      '${escapeJsx(displayName)} can be consumed as a managed cloud service or self-hosted in your own infrastructure. This guide covers both options including high-availability configurations, environment variables, and monitoring recommendations.',
  },
];

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className="py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Documentation
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything you need to integrate ${escapeJsx(displayName)} into your projects.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-3xl space-y-10">
            {sections.map((section) => (
              <div
                key={section.title}
                className="rounded-lg border border-border bg-card p-8"
              >
                <h2 className="text-2xl font-semibold text-foreground">
                  {section.title}
                </h2>
                <p className="mt-3 text-muted-foreground leading-7">
                  {section.description}
                </p>
                {section.code && (
                  <pre className="mt-6 overflow-x-auto rounded-md bg-foreground/5 p-4 text-sm leading-6">
                    <code>{section.code}</code>
                  </pre>
                )}
              </div>
            ))}
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
 * Generate blog listing page with starter posts
 *
 * @param projectName - Project name for context
 * @param context - Optional content context for product-aware copy
 * @returns Blog page source code
 */
export function generateWebsiteBlogPage(
  projectName?: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    ?.split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Our Platform';

  const tagline = context?.tagline || context?.description || `the ${displayName} platform`;

  return `import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Latest news, updates, and insights from the ${escapeJsx(displayName)} team.',
};

const posts = [
  {
    title: 'Introducing ${escapeJsx(displayName)}',
    date: 'January 15, 2025',
    author: '${escapeJsx(displayName)} Team',
    excerpt:
      'We are excited to announce ${escapeJsx(displayName)}. We built this platform to address a real gap we saw in the market: ${escapeJsx(tagline)}. In this post we share the motivation behind the project, the core design decisions we made, and our roadmap for the months ahead.',
  },
  {
    title: 'How ${escapeJsx(displayName)} Works Under the Hood',
    date: 'February 5, 2025',
    author: '${escapeJsx(displayName)} Team',
    excerpt:
      'A deep dive into the architecture of ${escapeJsx(displayName)}. We cover the request lifecycle, how data flows through the system, the performance optimizations that keep latency low, and the security model that keeps your data safe. Whether you are evaluating the platform or already using it, this post will help you understand what happens behind the API.',
  },
  {
    title: 'Getting Started with ${escapeJsx(displayName)}: A Practical Guide',
    date: 'February 20, 2025',
    author: '${escapeJsx(displayName)} Team',
    excerpt:
      'A step-by-step walkthrough for new users. We cover account setup, creating your first project, integrating the SDK into your application, and deploying to production. By the end of this guide you will have a working integration and a solid understanding of the core workflows.',
  },
];

export default function BlogPage() {
  return (
    <>
      <Header />
      <main className="py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Blog
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              News, insights, and technical deep dives from the ${escapeJsx(displayName)} team.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-3xl space-y-12">
            {posts.map((post) => (
              <article
                key={post.title}
                className="rounded-lg border border-border bg-card p-8"
              >
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <time>{post.date}</time>
                  <span aria-hidden="true">&middot;</span>
                  <span>{post.author}</span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-foreground">
                  {post.title}
                </h2>
                <p className="mt-4 text-muted-foreground leading-7">
                  {post.excerpt}
                </p>
              </article>
            ))}
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
 * Generate contact page with ContactForm component
 *
 * @param projectName - Project name for context
 * @param context - Optional content context for product-aware copy
 * @returns Contact page source code
 */
export function generateWebsiteContactPage(
  projectName?: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    ?.split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Our Platform';

  return `import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with the ${escapeJsx(displayName)} team. We are here to help with questions, feedback, and enterprise inquiries.',
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Contact Us
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Have questions about ${escapeJsx(displayName)}? Our team is here to help.
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Send us a message</h2>
              <p className="mt-2 text-muted-foreground">
                Fill out the form and we will get back to you within 24 hours.
              </p>
              <div className="mt-8">
                <ContactForm />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Other ways to reach us</h2>
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Email</h3>
                  <p className="mt-1 text-muted-foreground">support@${projectName || 'example'}.com</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Response Time</h3>
                  <p className="mt-1 text-muted-foreground">
                    We typically respond within one business day. Enterprise customers receive priority support.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Enterprise Inquiries</h3>
                  <p className="mt-1 text-muted-foreground">
                    For custom deployments, dedicated support, and volume licensing, reach out to our enterprise team.
                  </p>
                </div>
              </div>
            </div>
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
 * Generate privacy policy page
 *
 * @param projectName - Project name for context
 * @param context - Optional content context for product-aware copy
 * @returns Privacy policy page source code
 */
export function generateWebsitePrivacyPage(
  projectName?: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    ?.split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Our Platform';

  return `import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: '${escapeJsx(displayName)} privacy policy. Learn how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Last updated: January 1, 2025
            </p>

            <div className="mt-12 space-y-10 text-muted-foreground leading-7">
              <section>
                <h2 className="text-xl font-semibold text-foreground">1. Information We Collect</h2>
                <p className="mt-3">
                  ${escapeJsx(displayName)} collects information you provide directly when you create an account, use the platform, or contact our support team. This includes your name, email address, organization name, and billing information. We also collect usage data such as API call logs and system performance metrics to improve our services.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">2. How We Use Your Information</h2>
                <p className="mt-3">
                  We use collected information to provide and maintain the ${escapeJsx(displayName)} platform, process transactions, send service-related communications, improve our features, and comply with legal obligations. We do not sell your personal information to third parties.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">3. Data Sharing</h2>
                <p className="mt-3">
                  ${escapeJsx(displayName)} shares your information only with service providers who assist in operating our platform, when required by law, or with your explicit consent. All third-party providers are bound by data processing agreements that ensure the protection of your information.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">4. Data Security</h2>
                <p className="mt-3">
                  We implement industry-standard security measures including encryption at rest and in transit, regular security audits, access controls, and monitoring to protect your information.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">5. Cookies and Tracking</h2>
                <p className="mt-3">
                  ${escapeJsx(displayName)} uses essential cookies to maintain your session and preferences. We use analytics cookies to understand how our website and platform are used. You can manage cookie preferences through your browser settings.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">6. Your Rights</h2>
                <p className="mt-3">
                  You have the right to access, correct, or delete your personal data. You can export your data at any time through your account settings. To exercise these rights, contact us at privacy@${projectName || 'example'}.com. We will respond within 30 days.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">7. Changes to This Policy</h2>
                <p className="mt-3">
                  We may update this privacy policy from time to time. We will notify you of material changes by posting the updated policy on our website and updating the last-updated date. Continued use of ${escapeJsx(displayName)} after changes constitutes acceptance of the revised policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">8. Contact</h2>
                <p className="mt-3">
                  For questions about this privacy policy or our data practices, contact us at privacy@${projectName || 'example'}.com.
                </p>
              </section>
            </div>
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
 * Generate terms of service page
 *
 * @param projectName - Project name for context
 * @param context - Optional content context for product-aware copy
 * @returns Terms of service page source code
 */
export function generateWebsiteTermsPage(
  projectName?: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    ?.split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Our Platform';

  return `import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: '${escapeJsx(displayName)} terms of service. Read the terms governing use of our platform.',
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="py-20 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Last updated: January 1, 2025
            </p>

            <div className="mt-12 space-y-10 text-muted-foreground leading-7">
              <section>
                <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
                <p className="mt-3">
                  By accessing or using the ${escapeJsx(displayName)} platform, you agree to be bound by these Terms of Service. If you are using ${escapeJsx(displayName)} on behalf of an organization, you represent that you have authority to bind that organization to these terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">2. Service Description</h2>
                <p className="mt-3">
                  ${escapeJsx(displayName)} provides a software platform accessible via APIs, SDKs, and a web dashboard. Service features and availability may vary by subscription plan.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">3. Accounts and Access</h2>
                <p className="mt-3">
                  You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. You must provide accurate registration information and promptly update it if it changes.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">4. Acceptable Use</h2>
                <p className="mt-3">
                  You agree not to use ${escapeJsx(displayName)} to violate any applicable law, infringe on intellectual property rights, transmit malicious code, attempt to gain unauthorized access to our systems, or interfere with the platform operation. We reserve the right to suspend accounts that violate these terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">5. Intellectual Property</h2>
                <p className="mt-3">
                  ${escapeJsx(displayName)} and its licensors retain all rights to the platform, including software, documentation, and branding. Your subscription grants a limited, non-exclusive, non-transferable license to use the platform. You retain all rights to the data and configurations you create.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">6. Limitation of Liability</h2>
                <p className="mt-3">
                  To the maximum extent permitted by law, ${escapeJsx(displayName)} shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform. Our total liability shall not exceed the fees paid by you in the twelve months preceding the claim.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">7. Termination</h2>
                <p className="mt-3">
                  Either party may terminate the agreement at any time. You may cancel your subscription through your account settings. We may suspend or terminate access for violation of these terms. Upon termination, you may export your data within 30 days, after which it will be deleted.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">8. Governing Law</h2>
                <p className="mt-3">
                  These terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to conflict of law principles.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-foreground">9. Contact</h2>
                <p className="mt-3">
                  For questions about these terms, contact us at legal@${projectName || 'example'}.com.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
`;
}
