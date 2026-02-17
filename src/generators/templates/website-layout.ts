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
    .replace(/\$/g, '\\$');
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
        <h1 className="text-4xl font-bold text-foreground">Documentation</h1>
        <p className="mt-4 text-lg text-muted-foreground">
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
        <h1 className="text-4xl font-bold text-foreground">Blog</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Blog posts coming soon...
        </p>
      </div>
    </main>
  );
}
`;
}
