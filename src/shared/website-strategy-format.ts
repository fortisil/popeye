/**
 * Shared website strategy formatter.
 * Formats a WebsiteStrategyDocument as structured text for prompt injection.
 * Used by both workflow (plan-mode consensus) and pipeline (role planning/execution).
 */

import type { WebsiteStrategyDocument } from '../types/website-strategy.js';

/**
 * Format a WebsiteStrategyDocument as structured text for prompt injection.
 *
 * Args:
 *   strategy: The validated strategy document to format.
 *
 * Returns:
 *   string: Multi-line formatted text with ICP, Positioning, Messaging,
 *           SEO Keywords, Site Architecture, and Conversion Strategy sections.
 */
export function formatWebsiteStrategy(strategy: WebsiteStrategyDocument): string {
  const lines: string[] = [];

  lines.push(`### Target Customer`);
  lines.push(`- Persona: ${strategy.icp.primaryPersona}`);
  lines.push(`- Pain points: ${strategy.icp.painPoints.join(', ')}`);
  lines.push('');

  lines.push(`### Positioning`);
  lines.push(`- Category: ${strategy.positioning.category}`);
  lines.push(`- Value proposition: ${strategy.positioning.valueProposition}`);
  lines.push(`- Differentiators: ${strategy.positioning.differentiators.join(', ')}`);
  lines.push('');

  lines.push(`### Messaging`);
  lines.push(`- Headline: ${strategy.messaging.headline}`);
  lines.push(`- Subheadline: ${strategy.messaging.subheadline}`);
  lines.push('');

  lines.push(`### SEO Keywords`);
  lines.push(`- Primary: ${strategy.seoStrategy.primaryKeywords.join(', ')}`);
  lines.push(`- Secondary: ${strategy.seoStrategy.secondaryKeywords.join(', ')}`);
  lines.push('');

  lines.push(`### Site Architecture`);
  for (const page of strategy.siteArchitecture.pages) {
    lines.push(`- ${page.path} (${page.pageType}): ${page.purpose}`);
  }
  lines.push('');

  lines.push(`### Conversion Strategy`);
  lines.push(`- Primary CTA: "${strategy.conversionStrategy.primaryCta.text}" -> ${strategy.conversionStrategy.primaryCta.href}`);
  lines.push(`- Secondary CTA: "${strategy.conversionStrategy.secondaryCta.text}" -> ${strategy.conversionStrategy.secondaryCta.href}`);
  lines.push(`- Trust signals: ${strategy.conversionStrategy.trustSignals.join(', ')}`);
  lines.push(`- Lead capture: ${strategy.conversionStrategy.leadCapture}`);

  return lines.join('\n');
}
