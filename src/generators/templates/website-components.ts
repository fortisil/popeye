/**
 * Shared website component templates
 * Generates Header, Footer, and Navigation components with
 * strategy-driven content, logo support, and mobile responsiveness
 */

import type { WebsiteContentContext } from '../website-context.js';
import type { WebsiteStrategyDocument, NavItem, FooterSection } from '../../types/website-strategy.js';

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
 * Generate website header component with logo, navigation, and CTA
 *
 * @param projectName - Project name for fallback display
 * @param context - Optional content context
 * @param strategy - Optional strategy for navigation and CTA
 * @returns Header component source code
 */
export function generateWebsiteHeader(
  projectName: string,
  context?: WebsiteContentContext,
  strategy?: WebsiteStrategyDocument
): string {
  const displayName = context?.productName || projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const hasLogo = !!(context?.brandAssets?.logoOutputPath || context?.brand?.logoPath);
  // Reason: Next.js serves public/ at root, so public/brand/logo.svg -> /brand/logo.svg
  const logoPath = context?.brandAssets?.logoOutputPath
    ? `/${context.brandAssets.logoOutputPath.replace(/^public\//, '')}`
    : '/brand/logo.svg';

  // Build nav items from strategy or defaults
  const navItems = strategy?.siteArchitecture.navigation || [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Docs', href: '/docs' },
    { label: 'Blog', href: '/blog' },
  ];

  const navItemsStr = navItems
    .map(item => `  { label: '${escapeJsx(item.label)}', href: '${escapeJsx(item.href)}' }`)
    .join(',\n');

  // CTA from strategy or default
  const ctaText = strategy?.conversionStrategy.primaryCta.text || 'Get Started';
  const ctaHref = strategy?.conversionStrategy.primaryCta.href || '/pricing';

  // Logo rendering: Image if available, product initial circle if not
  const initialLetter = displayName.charAt(0).toUpperCase();
  const logoBlock = hasLogo
    ? `<Image src="${logoPath}" alt="${escapeJsx(displayName)}" width={32} height={32} className="h-8 w-auto" />`
    : `<div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">${initialLetter}</div>
            <span className="text-lg font-bold text-foreground">${escapeJsx(displayName)}</span>
          </div>`;

  return `'use client';

import { useState } from 'react';
import Link from 'next/link';
${hasLogo ? "import Image from 'next/image';" : ''}

const NAV_ITEMS = [
${navItemsStr}
];

/**
 * Site header with logo, navigation links, mobile menu, and CTA
 */
export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <nav className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          ${logoBlock}
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="${escapeJsx(ctaHref)}"
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 transition-colors"
          >
            ${escapeJsx(ctaText)}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="md:hidden rounded-md p-2 text-gray-700"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-gray-700 hover:text-primary-600"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="${escapeJsx(ctaHref)}"
              className="rounded-md bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              ${escapeJsx(ctaText)}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
`;
}

/**
 * Generate website footer component with multi-column sections
 *
 * @param projectName - Project name for copyright
 * @param context - Optional content context
 * @param strategy - Optional strategy for footer sections
 * @returns Footer component source code
 */
export function generateWebsiteFooter(
  projectName: string,
  context?: WebsiteContentContext,
  strategy?: WebsiteStrategyDocument
): string {
  const displayName = context?.productName || projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Build footer sections from strategy or defaults
  const sections: FooterSection[] = strategy?.siteArchitecture.footerSections || [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '/#features' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Documentation', href: '/docs' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Blog', href: '/blog' },
        { label: 'Support', href: '/contact' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
      ],
    },
  ];

  const sectionsStr = sections
    .map(section => {
      const linksStr = section.links
        .map(link => `      { label: '${escapeJsx(link.label)}', href: '${escapeJsx(link.href)}' }`)
        .join(',\n');
      return `  {\n    title: '${escapeJsx(section.title)}',\n    links: [\n${linksStr}\n    ],\n  }`;
    })
    .join(',\n');

  return `import Link from 'next/link';

const FOOTER_SECTIONS = [
${sectionsStr}
];

/**
 * Site footer with multi-column link sections and copyright
 */
export default function Footer() {
  return (
    <footer className="border-t border-border bg-muted/50">
      <div className="container py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-${Math.min(sections.length + 1, 4)}">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-lg font-bold text-foreground">
              ${escapeJsx(displayName)}
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              ${context?.tagline ? escapeJsx(context.tagline) : 'Build something amazing.'}
            </p>
            {/* Newsletter */}
            <form className="mt-6" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="newsletter-email" className="text-sm font-medium text-foreground">
                Stay updated
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="newsletter-email"
                  type="email"
                  placeholder="you@example.com"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 transition-colors"
                >
                  Subscribe
                </button>
              </div>
            </form>
          </div>

          {/* Link columns */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="mt-4 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-primary-600 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ${escapeJsx(displayName)}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
`;
}

/**
 * Generate navigation config module
 *
 * @param strategy - Optional strategy for navigation items
 * @returns Navigation config source code
 */
export function generateWebsiteNavigation(
  strategy?: WebsiteStrategyDocument
): string {
  const navItems: NavItem[] = strategy?.siteArchitecture.navigation || [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Docs', href: '/docs' },
    { label: 'Blog', href: '/blog' },
  ];

  const itemsStr = navItems
    .map(item => {
      const childrenStr = item.children && item.children.length > 0
        ? `,\n    children: [\n${item.children.map(c => `      { label: '${escapeJsx(c.label)}', href: '${escapeJsx(c.href)}' }`).join(',\n')}\n    ]`
        : '';
      return `  { label: '${escapeJsx(item.label)}', href: '${escapeJsx(item.href)}'${childrenStr} }`;
    })
    .join(',\n');

  return `/**
 * Navigation configuration
 * Exported for use in Header and mobile navigation components
 */

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
${itemsStr}
];
`;
}
