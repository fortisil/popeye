/**
 * Landing page generator with 10 data-driven sections
 * Each section: strategy data -> fallback -> graceful skip
 */

import type { WebsiteContentContext } from '../website-context.js';
import {
  mapFeatureIcon,
  generatePainPointsSection,
  generateDifferentiatorsSection,
  generateHowItWorksSection,
  generateStatsSection,
  generateSocialProofSection,
  generatePricingTeaserSection,
  generateFaqSection,
  buildFaqItemsDeclaration,
  buildFaqSchema,
  type SectionRenderInfo,
} from './website-sections.js';

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
 * Result of landing page generation with section metadata for tracing
 */
export interface LandingPageResult {
  code: string;
  sections: SectionRenderInfo[];
}

/**
 * Generate landing page.tsx with 10 data-driven sections
 * Sections: Hero, PainPoints, Differentiators, Features, HowItWorks,
 *           Stats, SocialProof, PricingTeaser, FAQ, FinalCTA
 */
export function generateWebsiteLandingPage(
  projectName: string,
  context?: WebsiteContentContext
): string {
  const result = generateWebsiteLandingPageWithInfo(projectName, context);
  return result.code;
}

/**
 * Generate landing page with section render info for debug tracing
 */
export function generateWebsiteLandingPageWithInfo(
  projectName: string,
  context?: WebsiteContentContext
): LandingPageResult {
  const title = projectName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const strategy = context?.strategy;
  const displayName = context?.productName || title;
  const sections: SectionRenderInfo[] = [];

  // --- Hero data ---
  const headline = strategy?.messaging.headline || displayName;
  const subheadline = strategy?.messaging.subheadline || '';
  const eyebrow = strategy?.positioning.category || '';
  const heroText = strategy?.messaging.longDescription
    ? escapeJsx(strategy.messaging.longDescription)
    : context?.description
    ? escapeJsx(context.description)
    : null;

  const primaryCtaText = strategy?.conversionStrategy.primaryCta.text || 'Get started';
  const primaryCtaHref = strategy?.conversionStrategy.primaryCta.href || '/pricing';
  const secondaryCtaText = strategy?.conversionStrategy.secondaryCta.text || 'Learn more';
  const secondaryCtaHref = strategy?.conversionStrategy.secondaryCta.href || '/docs';

  sections.push({
    name: 'Hero',
    dataSource: strategy?.messaging ? 'strategy' : heroText ? 'docs' : 'defaults',
    itemCount: 1,
  });

  // --- Features data ---
  const features = context?.features && context.features.length > 0
    ? context.features.slice(0, 6)
    : null;

  const featuresHeading = strategy?.positioning.valueProposition || 'Everything you need';
  const featuresSubtitle = context?.description
    ? escapeJsx(context.description).slice(0, 120)
    : '';

  sections.push({
    name: 'Features',
    dataSource: features ? 'docs' : 'defaults',
    itemCount: features?.length || 0,
  });

  // --- Build features block ---
  const featuresBlock = features
    ? features.map((f) => {
        const icon = mapFeatureIcon(f.title);
        return `                {
                  title: '${escapeJsx(f.title)}',
                  description: '${escapeJsx(f.description)}',
                  icon: '${icon}',
                }`;
      }).join(',\n')
    : '';

  // --- Trust signals ---
  const trustSignals = strategy?.conversionStrategy.trustSignals || [];

  // --- Generate conditional sections ---
  const painPoints = generatePainPointsSection(strategy);
  sections.push(painPoints.info);

  const differentiators = generateDifferentiatorsSection(strategy);
  sections.push(differentiators.info);

  const howItWorks = generateHowItWorksSection(strategy);
  sections.push(howItWorks.info);

  const stats = generateStatsSection(strategy);
  sections.push(stats.info);

  const socialProof = generateSocialProofSection(strategy);
  sections.push(socialProof.info);

  const pricingTeaser = generatePricingTeaserSection(context);
  sections.push(pricingTeaser.info);

  const faq = generateFaqSection(strategy);
  sections.push(faq.info);

  // Final CTA section
  sections.push({
    name: 'FinalCTA',
    dataSource: strategy?.messaging ? 'strategy' : 'defaults',
    itemCount: 1,
  });

  // Determine which lucide icons are needed
  const iconSet = new Set<string>();
  if (features) {
    features.forEach((f) => iconSet.add(mapFeatureIcon(f.title)));
  }
  // Pain points icons
  if (painPoints.jsx) {
    iconSet.add('AlertTriangle');
    iconSet.add('XCircle');
    iconSet.add('AlertOctagon');
  }
  // Differentiators
  if (differentiators.jsx) {
    iconSet.add('CheckCircle');
  }
  // Stats
  if (stats.jsx) {
    iconSet.add('CheckCircle');
  }
  // FAQ — ChevronDown is now in FaqSection.tsx client component
  // Always useful
  iconSet.add('ArrowRight');

  const iconImports = Array.from(iconSet).sort().join(', ');

  // SEO metadata
  const metaTitle = strategy?.seoStrategy.titleTemplates?.home || 'Welcome';
  const metaDesc = strategy?.seoStrategy.metaDescriptions?.home || `Welcome to ${displayName}`;

  // FAQ data declarations
  const faqItemsDecl = buildFaqItemsDeclaration(strategy);
  const faqSchemaDecl = buildFaqSchema(strategy);

  // Build icon mapping for features
  const iconComponentMap = features
    ? `const ICON_MAP: Record<string, React.ElementType> = {\n${Array.from(new Set(features.map(f => mapFeatureIcon(f.title)))).map(icon => `  ${icon},`).join('\n')}\n};\n`
    : '';

  const code = `import type { Metadata } from 'next';
import Link from 'next/link';
import { ${iconImports} } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
${faq.needsClientDirective ? "import FaqSection from '@/components/FaqSection';" : ''}

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

${faqSchemaDecl ? faqSchemaDecl + '\n' : ''}${faqItemsDecl ? '\n' + faqItemsDecl : ''}${iconComponentMap ? '\n' + iconComponentMap : ''}${features ? `\nconst features = [\n${featuresBlock}\n];\n` : ''}
export default function HomePage() {
  return (
    <>
      <Header />
      <JsonLd schema={ORG_SCHEMA} />
      <JsonLd schema={PRODUCT_SCHEMA} />
${faqSchemaDecl ? '      <JsonLd schema={FAQ_SCHEMA} />\n' : ''}      <main className="flex min-h-screen flex-col">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-primary-50/30 py-24 sm:py-36">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
${eyebrow ? `              <p className="mb-4 inline-block rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700">\n                ${escapeJsx(eyebrow)}\n              </p>\n` : ''}              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                ${escapeJsx(headline)}
              </h1>
${subheadline ? `              <p className="mt-4 text-xl font-medium text-primary-600">\n                ${escapeJsx(subheadline)}\n              </p>` : ''}
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                ${heroText || ''}
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-4">
                <Link
                  href="${escapeJsx(primaryCtaHref)}"
                  className="rounded-lg bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 hover:bg-primary-500 transition-all hover:shadow-primary-600/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  ${escapeJsx(primaryCtaText)}
                </Link>
                <Link
                  href="${escapeJsx(secondaryCtaHref)}"
                  className="group flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary-600 transition-colors"
                >
                  ${escapeJsx(secondaryCtaText)}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
${trustSignals.length > 0 ? `              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
${trustSignals.map(s => `                <p className="text-sm font-medium text-muted-foreground">${escapeJsx(s)}</p>`).join('\n')}
              </div>` : ''}
            </div>
          </div>
        </section>
${painPoints.jsx}${differentiators.jsx}
        {/* Features Section */}
${features ? `        <section id="features" className="py-20 sm:py-28">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                ${escapeJsx(featuresHeading)}
              </h2>
${featuresSubtitle ? `              <p className="mt-4 text-lg text-muted-foreground">\n                ${featuresSubtitle}\n              </p>` : ''}
            </div>
            <div className="mx-auto mt-16 max-w-5xl">
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => {
                  const Icon = ICON_MAP[feature.icon] || Star;
                  return (
                    <div
                      key={feature.title}
                      className="group rounded-2xl border border-border bg-card p-8 transition-all hover:shadow-lg hover:-translate-y-1"
                    >
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                        <Icon className="h-5 w-5 text-primary-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-muted-foreground">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>` : ''}
${howItWorks.jsx}${stats.jsx}${socialProof.jsx}${pricingTeaser.jsx}${faq.jsx}
        {/* Final CTA Section */}
        <section className="bg-gradient-to-br from-primary-600 to-primary-700 py-20 sm:py-28">
          <div className="container text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              ${strategy?.messaging.elevatorPitch ? escapeJsx(strategy.messaging.elevatorPitch) : 'Ready to get started?'}
            </h2>
            <p className="mt-4 text-lg text-primary-100">
              ${strategy?.messaging.subheadline ? escapeJsx(strategy.messaging.subheadline) : 'Start building today.'}
            </p>
            <div className="mt-8 flex items-center justify-center gap-x-4">
              <Link
                href="${escapeJsx(primaryCtaHref)}"
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-primary-600 shadow-lg hover:bg-primary-50 transition-colors"
              >
                ${escapeJsx(primaryCtaText)}
              </Link>
              <Link
                href="${escapeJsx(secondaryCtaHref)}"
                className="rounded-lg border border-primary-300 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-500 transition-colors"
              >
                ${escapeJsx(secondaryCtaText)}
              </Link>
            </div>
${trustSignals.length > 0 ? `            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
${trustSignals.map(s => `              <p className="text-sm text-primary-200">${escapeJsx(s)}</p>`).join('\n')}
            </div>` : ''}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
`;

  return { code, sections };
}
