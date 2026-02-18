/**
 * Reusable website section generators
 * Pain Points, Value Proposition, How It Works, Stats/Proof Points, FAQ
 * Each section is data-driven with graceful skip when data is missing
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
 * Section render metadata for debug tracing
 */
export interface SectionRenderInfo {
  name: string;
  dataSource: 'strategy' | 'docs' | 'defaults' | 'skipped';
  itemCount: number;
}

/**
 * Map a feature title to a lucide-react icon name by keyword matching
 */
export function mapFeatureIcon(title: string): string {
  const lower = title.toLowerCase();
  const iconMap: Array<[RegExp, string]> = [
    [/secur|auth|permission|access|lock|encrypt/, 'Shield'],
    [/speed|fast|perform|optim/, 'Zap'],
    [/api|integrat|connect|plugin/, 'Plug'],
    [/search|find|discover|retriev/, 'Search'],
    [/analyt|metric|monitor|dashboard/, 'BarChart3'],
    [/data|database|storage|vector/, 'Database'],
    [/team|collaborat|share|user/, 'Users'],
    [/automat|workflow|pipeline/, 'GitBranch'],
    [/cloud|deploy|server|host/, 'Cloud'],
    [/scale|grow|expand/, 'TrendingUp'],
    [/custom|config|setting/, 'Settings'],
    [/document|doc|file|content/, 'FileText'],
    [/test|quality|check|verify/, 'CheckCircle'],
    [/ai|machine|learn|model|neural/, 'Brain'],
    [/code|develop|build|engineer/, 'Code'],
    [/email|message|notif|alert/, 'Bell'],
    [/time|schedule|calendar|clock/, 'Clock'],
    [/money|pay|bill|cost|pric/, 'CreditCard'],
    [/global|world|international/, 'Globe'],
    [/support|help|service/, 'Headphones'],
  ];
  for (const [pattern, icon] of iconMap) {
    if (pattern.test(lower)) return icon;
  }
  return 'Star';
}

/**
 * Check if a proof point string contains a numeric metric
 * Numeric metrics are safe to display as stats; qualitative ones become badges
 */
export function isNumericMetric(point: string): boolean {
  return /\d+[%+KMB]|\d{2,}/.test(point);
}

/**
 * Generate Pain Points section
 * Data: strategy.icp.painPoints
 * Skip: if painPoints is empty
 */
export function generatePainPointsSection(
  strategy?: WebsiteStrategyDocument
): { jsx: string; info: SectionRenderInfo } {
  const painPoints = strategy?.icp.painPoints || [];
  if (painPoints.length === 0) {
    return {
      jsx: '',
      info: { name: 'PainPoints', dataSource: 'skipped', itemCount: 0 },
    };
  }

  const items = painPoints.slice(0, 3);
  const icons = ['AlertTriangle', 'XCircle', 'AlertOctagon'];
  const itemsStr = items
    .map(
      (point, i) =>
        `              <div key="${i}" className="rounded-2xl bg-card p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <${icons[i % icons.length]} className="h-6 w-6 text-red-600" />
                </div>
                <p className="text-foreground font-medium">${escapeJsx(point)}</p>
              </div>`
    )
    .join('\n');

  const jsx = `
      {/* Pain Points */}
      <section className="bg-muted/50 py-20 sm:py-28">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Sound familiar?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
            Common challenges that hold teams back
          </p>
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3">
${itemsStr}
          </div>
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'PainPoints', dataSource: 'strategy', itemCount: items.length },
  };
}

/**
 * Generate Value Proposition / Differentiators section
 * Data: strategy.positioning.differentiators + valueProposition
 * Skip: if no differentiators
 */
export function generateDifferentiatorsSection(
  strategy?: WebsiteStrategyDocument
): { jsx: string; info: SectionRenderInfo } {
  const differentiators = strategy?.positioning.differentiators || [];
  const valueProp = strategy?.positioning.valueProposition;
  if (differentiators.length === 0 && !valueProp) {
    return {
      jsx: '',
      info: { name: 'Differentiators', dataSource: 'skipped', itemCount: 0 },
    };
  }

  const heading = valueProp
    ? escapeJsx(valueProp)
    : 'Why choose us';

  const itemsStr = differentiators
    .slice(0, 6)
    .map(
      (diff) =>
        `              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600" />
                <p className="text-foreground">${escapeJsx(diff)}</p>
              </div>`
    )
    .join('\n');

  const jsx = `
      {/* Value Proposition */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              ${heading}
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
${itemsStr}
          </div>
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'Differentiators', dataSource: 'strategy', itemCount: differentiators.length },
  };
}

/**
 * Generate How It Works section
 * Data: strategy siteArchitecture.pages[0].sections or defaults
 * Always rendered (with defaults if no strategy)
 */
export function generateHowItWorksSection(
  strategy?: WebsiteStrategyDocument
): { jsx: string; info: SectionRenderInfo } {
  const defaultSteps = [
    { title: 'Sign Up', description: 'Create your account in seconds' },
    { title: 'Configure', description: 'Set up your workspace to match your needs' },
    { title: 'Deploy', description: 'Go live and start seeing results' },
  ];

  const hasSections = strategy?.siteArchitecture.pages[0]?.sections;
  const steps = hasSections && hasSections.length >= 3
    ? hasSections.slice(0, 3).map((s, i) => ({
        title: s.replace(/^(hero|features|cta|pricing|faq|testimonials)/i, '').trim() || defaultSteps[i].title,
        description: defaultSteps[i].description,
      }))
    : defaultSteps;

  const dataSource = hasSections ? 'strategy' : 'defaults';

  const stepsStr = steps
    .map(
      (step, i) =>
        `              <div className="relative text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white">
                  ${i + 1}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">${escapeJsx(step.title)}</h3>
                <p className="mt-2 text-muted-foreground">${escapeJsx(step.description)}</p>
              </div>`
    )
    .join('\n');

  const jsx = `
      {/* How It Works */}
      <section className="bg-muted/50 py-20 sm:py-28">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How it works
          </h2>
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-12 md:grid-cols-3">
${stepsStr}
          </div>
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'HowItWorks', dataSource: dataSource as 'strategy' | 'defaults', itemCount: steps.length },
  };
}

/**
 * Generate Stats / Proof Points section
 * CRITICAL: Only show numeric metrics if they appear literally in docs/strategy.
 * Qualitative points render as badges, NOT fake numbers.
 */
export function generateStatsSection(
  strategy?: WebsiteStrategyDocument
): { jsx: string; info: SectionRenderInfo } {
  const proofPoints = strategy?.positioning.proofPoints || [];
  if (proofPoints.length === 0) {
    return {
      jsx: '',
      info: { name: 'Stats', dataSource: 'skipped', itemCount: 0 },
    };
  }

  const numericPoints = proofPoints.filter(isNumericMetric);
  const qualitativePoints = proofPoints.filter((p) => !isNumericMetric(p));

  let statsContent = '';

  if (numericPoints.length > 0) {
    const statsStr = numericPoints
      .slice(0, 4)
      .map(
        (point) =>
          `              <div className="text-center">
                <p className="text-4xl font-bold text-primary-600">${escapeJsx(point)}</p>
              </div>`
      )
      .join('\n');

    statsContent += `          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-8 md:grid-cols-${Math.min(numericPoints.length, 4)}">
${statsStr}
          </div>\n`;
  }

  if (qualitativePoints.length > 0) {
    const badgesStr = qualitativePoints
      .slice(0, 6)
      .map(
        (point) =>
          `              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700">
                <CheckCircle className="h-4 w-4" />
                ${escapeJsx(point)}
              </span>`
      )
      .join('\n');

    statsContent += `          <div className="mx-auto mt-8 flex max-w-4xl flex-wrap items-center justify-center gap-3">
${badgesStr}
          </div>\n`;
  }

  const jsx = `
      {/* Proof Points */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for production
          </h2>
${statsContent}
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'Stats', dataSource: 'strategy', itemCount: proofPoints.length },
  };
}

/**
 * Generate Social Proof section
 * Data: strategy.conversionStrategy.socialProof
 * Skip: if empty
 */
export function generateSocialProofSection(
  strategy?: WebsiteStrategyDocument
): { jsx: string; info: SectionRenderInfo } {
  const socialProof = strategy?.conversionStrategy.socialProof || [];
  if (socialProof.length === 0) {
    return {
      jsx: '',
      info: { name: 'SocialProof', dataSource: 'skipped', itemCount: 0 },
    };
  }

  const quotesStr = socialProof
    .slice(0, 4)
    .map(
      (quote, i) =>
        `              <blockquote key={${i}} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 text-4xl text-primary-300">&ldquo;</div>
                <p className="text-foreground">${escapeJsx(quote)}</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="text-sm text-muted-foreground">Verified User</div>
                </div>
              </blockquote>`
    )
    .join('\n');

  const jsx = `
      {/* Social Proof */}
      <section className="py-20 sm:py-28">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Trusted by teams everywhere
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
${quotesStr}
          </div>
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'SocialProof', dataSource: 'strategy', itemCount: socialProof.length },
  };
}

/**
 * Generate Pricing Teaser section for landing page
 * Data: context.pricing (tier names + starting prices)
 * Skip: if no pricing tiers
 */
export function generatePricingTeaserSection(
  context?: WebsiteContentContext
): { jsx: string; info: SectionRenderInfo } {
  const tiers = context?.pricing;
  if (!tiers || tiers.length === 0) {
    return {
      jsx: '',
      info: { name: 'PricingTeaser', dataSource: 'skipped', itemCount: 0 },
    };
  }

  const tiersStr = tiers
    .slice(0, 3)
    .map(
      (tier) =>
        `              <div className="rounded-2xl border ${tier.featured ? 'border-primary-600 ring-2 ring-primary-600' : 'border-border'} bg-card p-6 text-center">
                <h3 className="text-lg font-semibold text-foreground">${escapeJsx(tier.name)}</h3>
                <p className="mt-2 text-3xl font-bold text-foreground">${escapeJsx(tier.price)}</p>
                ${tier.period ? `<p className="text-sm text-muted-foreground">${escapeJsx(tier.period)}</p>` : ''}
                <p className="mt-2 text-sm text-muted-foreground">${escapeJsx(tier.description)}</p>
              </div>`
    )
    .join('\n');

  const jsx = `
      {/* Pricing Teaser */}
      <section className="bg-muted/50 py-20 sm:py-28">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
${tiersStr}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="text-sm font-semibold text-primary-600 hover:text-primary-500"
            >
              View full pricing <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'PricingTeaser', dataSource: 'docs', itemCount: tiers.length },
  };
}

/**
 * Generate FAQ section from strategy objections
 * Data: strategy.icp.objections rephrased as Q&A
 * Skip: if no objections
 * Note: Renders as client component with useState accordion
 */
export function generateFaqSection(
  strategy?: WebsiteStrategyDocument
): { jsx: string; info: SectionRenderInfo; needsClientDirective: boolean } {
  const objections = strategy?.icp.objections || [];
  if (objections.length === 0) {
    return {
      jsx: '',
      info: { name: 'FAQ', dataSource: 'skipped', itemCount: 0 },
      needsClientDirective: false,
    };
  }

  const faqItems = objections.slice(0, 6).map((obj) => {
    // Convert objection to Q&A format
    const question = obj.endsWith('?') ? obj : `${obj}?`;
    return { question, answer: `We take this seriously. ${obj.replace(/\?$/, '')} is addressed through our robust platform design and industry best practices.` };
  });

  const jsx = `
      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Frequently asked questions
          </h2>
          <FaqSection items={faqItems} />
        </div>
      </section>
`;

  return {
    jsx,
    info: { name: 'FAQ', dataSource: 'strategy', itemCount: faqItems.length },
    needsClientDirective: true,
  };
}

/**
 * Build FAQ items array declaration for the page component
 */
export function buildFaqItemsDeclaration(
  strategy?: WebsiteStrategyDocument
): string {
  const objections = strategy?.icp.objections || [];
  if (objections.length === 0) return '';

  const faqItems = objections.slice(0, 6).map((obj) => {
    const question = obj.endsWith('?') ? obj : `${obj}?`;
    return { question, answer: `We take this seriously. ${obj.replace(/\?$/, '')} is addressed through our robust platform design and industry best practices.` };
  });

  const itemsStr = faqItems
    .map(
      (item) =>
        `  { question: '${escapeJsx(item.question)}', answer: '${escapeJsx(item.answer)}' }`
    )
    .join(',\n');

  return `const faqItems = [\n${itemsStr}\n];\n`;
}

/**
 * Generate the FaqItem client component code
 */
export function generateFaqItemComponent(): string {
  return `function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="py-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-base font-medium text-foreground">{question}</span>
        <ChevronDown className={\`h-5 w-5 text-muted-foreground transition-transform \${open ? 'rotate-180' : ''}\`} />
      </button>
      {open && (
        <p className="mt-3 text-muted-foreground">{answer}</p>
      )}
    </div>
  );
}`;
}

/**
 * Generate a standalone FaqSection client component file.
 * This keeps page.tsx as a Server Component to prevent hydration errors.
 */
export function generateFaqSectionComponent(): string {
  return `'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="py-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-base font-medium text-foreground">{question}</span>
        <ChevronDown className={\`h-5 w-5 text-muted-foreground transition-transform \${open ? 'rotate-180' : ''}\`} />
      </button>
      {open && (
        <p className="mt-3 text-muted-foreground">{answer}</p>
      )}
    </div>
  );
}

export default function FaqSection({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="mx-auto mt-12 max-w-3xl divide-y divide-border">
      {items.map((item, index) => (
        <FaqItem key={index} question={item.question} answer={item.answer} />
      ))}
    </div>
  );
}
`;
}

/**
 * Build JSON-LD FAQ schema for SEO
 */
export function buildFaqSchema(
  strategy?: WebsiteStrategyDocument
): string {
  const objections = strategy?.icp.objections || [];
  if (objections.length === 0) return '';

  const faqItems = objections.slice(0, 6).map((obj) => {
    const question = obj.endsWith('?') ? obj : `${obj}?`;
    const answer = `We take this seriously. ${obj.replace(/\?$/, '')} is addressed through our robust platform design and industry best practices.`;
    return { question, answer };
  });

  return `const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
${faqItems.map(item => `    {
      '@type': 'Question',
      name: '${escapeJsx(item.question)}',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '${escapeJsx(item.answer)}',
      },
    }`).join(',\n')}
  ],
};`;
}
