/**
 * SEO infrastructure templates for Next.js marketing websites
 * Generates JSON-LD components, enhanced sitemap, robots.txt,
 * error pages, web manifest, and meta helpers
 */

import type { WebsiteContentContext } from '../website-context.js';
import type { WebsiteStrategyDocument } from '../../types/website-strategy.js';

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
 * Generate reusable JSON-LD component
 *
 * @returns JsonLd component source code
 */
export function generateJsonLdComponent(): string {
  return `/**
 * Reusable JSON-LD structured data component
 * Renders schema.org structured data as a script tag
 */

interface JsonLdProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: Record<string, any>;
}

export default function JsonLd({ schema }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
`;
}

/**
 * Generate Organization JSON-LD schema data
 *
 * @param projectName - Product name
 * @param context - Optional content context
 * @returns Organization schema as string constant
 */
export function generateOrganizationJsonLd(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName;
  const description = context?.description || `${displayName} - Modern web application`;

  return `{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${escapeJsx(displayName)}",
  "description": "${escapeJsx(description)}",
  "url": process.env.NEXT_PUBLIC_SITE_URL || "https://${projectName}.com"
}`;
}

/**
 * Generate SoftwareApplication JSON-LD schema data
 *
 * @param projectName - Product name
 * @param context - Optional content context
 * @returns Software application schema as string constant
 */
export function generateProductJsonLd(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName;
  const description = context?.description || `${displayName} - Modern web application`;

  return `{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "${escapeJsx(displayName)}",
  "description": "${escapeJsx(description)}",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "url": process.env.NEXT_PUBLIC_SITE_URL || "https://${projectName}.com"
}`;
}

/**
 * Generate enhanced sitemap with all strategy pages
 *
 * @param projectName - Project name for base URL fallback
 * @param strategy - Optional strategy for page list
 * @returns Enhanced sitemap.ts source code
 */
export function generateEnhancedSitemap(
  projectName: string,
  strategy?: WebsiteStrategyDocument
): string {
  // Build page entries from strategy or defaults
  const pages = strategy?.siteArchitecture.pages || [
    { path: '/', pageType: 'landing' },
    { path: '/pricing', pageType: 'pricing' },
    { path: '/docs', pageType: 'docs' },
    { path: '/blog', pageType: 'blog' },
  ];

  const priorityMap: Record<string, number> = {
    landing: 1.0,
    pricing: 0.9,
    solution: 0.8,
    'use-cases': 0.8,
    docs: 0.7,
    blog: 0.7,
    about: 0.6,
    contact: 0.6,
    legal: 0.3,
  };

  const frequencyMap: Record<string, string> = {
    landing: 'weekly',
    pricing: 'monthly',
    solution: 'monthly',
    'use-cases': 'monthly',
    docs: 'weekly',
    blog: 'daily',
    about: 'monthly',
    contact: 'monthly',
    legal: 'yearly',
  };

  const entries = pages.map(page => {
    const priority = priorityMap[page.pageType] || 0.5;
    const frequency = frequencyMap[page.pageType] || 'monthly';
    const urlPath = page.path === '/' ? '' : page.path;
    return `    {
      url: \`\${baseUrl}${urlPath}\`,
      lastModified: new Date(),
      changeFrequency: '${frequency}' as const,
      priority: ${priority},
    }`;
  });

  return `import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com';

  return [
${entries.join(',\n')}
  ];
}
`;
}

/**
 * Generate enhanced robots.txt
 *
 * @param projectName - Project name for base URL fallback
 * @returns robots.ts source code
 */
export function generateEnhancedRobots(projectName: string): string {
  return `import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/'],
      },
    ],
    sitemap: \`\${baseUrl}/sitemap.xml\`,
  };
}
`;
}

/**
 * Generate branded 404 Not Found page
 *
 * @param projectName - Product name for branding
 * @param context - Optional content context
 * @returns not-found.tsx source code
 */
export function generate404Page(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="text-center">
        <p className="text-7xl font-bold text-primary-600">404</p>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-4 text-lg text-gray-600">
          Sorry, we couldn&apos;t find the page you&apos;re looking for.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="rounded-md bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-500"
          >
            Back to ${escapeJsx(displayName)}
          </Link>
        </div>
      </div>
    </main>
  );
}
`;
}

/**
 * Generate error boundary page (500)
 *
 * @param projectName - Product name for branding
 * @returns error.tsx source code
 */
export function generate500Page(_projectName: string): string {
  return `'use client';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="text-center">
        <p className="text-7xl font-bold text-red-600">500</p>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-4 text-lg text-gray-600">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-8">
          <button
            onClick={() => reset()}
            className="rounded-md bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-500"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
`;
}

/**
 * Generate PWA web manifest
 *
 * @param projectName - Product name
 * @param context - Optional content context
 * @returns manifest.webmanifest JSON content
 */
export function generateWebManifest(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const displayName = context?.productName || projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const primaryColor = context?.brand?.primaryColor || '#0ea5e9';
  const description = context?.description || `${displayName} - Modern web application`;

  return JSON.stringify(
    {
      name: displayName,
      short_name: displayName,
      description,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: primaryColor,
      icons: [
        { src: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2
  );
}

/**
 * Generate shared metadata helper utility
 *
 * @param projectName - Product name
 * @param strategy - Optional strategy for SEO data
 * @returns Metadata helper source code
 */
export function generateMetaHelper(
  projectName: string,
  strategy?: WebsiteStrategyDocument
): string {
  const primaryKeywords = strategy?.seoStrategy.primaryKeywords || [projectName, 'web app'];
  const keywordsStr = primaryKeywords.map(k => `'${escapeJsx(k)}'`).join(', ');

  return `import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://${projectName}.com';

/**
 * Build page-level metadata with site-wide defaults
 *
 * @param title - Page title (combined with site name via template)
 * @param description - Page meta description
 * @param keywords - Additional page-specific keywords
 * @param path - Page path for canonical URL
 * @returns Next.js Metadata object
 */
export function buildMetadata({
  title,
  description,
  keywords = [],
  path = '/',
}: {
  title: string;
  description: string;
  keywords?: string[];
  path?: string;
}): Metadata {
  const url = \`\${BASE_URL}\${path}\`;
  const allKeywords = [...new Set([${keywordsStr}, ...keywords])];

  return {
    title,
    description,
    keywords: allKeywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
`;
}
