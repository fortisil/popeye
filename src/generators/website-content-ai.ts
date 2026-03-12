/**
 * AI Website Content Generator — fills missing website content
 * when doc parser fails to extract tagline/description/features/pricing.
 *
 * Uses OpenAI gpt-4.1 with Zod-validated JSON response.
 * Includes pricing hallucination guard to prevent inventing prices
 * without evidence in source docs.
 */

import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────

export interface AIContentResult {
  tagline?: string;
  description?: string;
  features?: Array<{ title: string; description: string; icon?: string }>;
  pricing?: Array<{
    name: string;
    price: string;
    period?: string;
    description: string;
    features: string[];
    cta: string;
    featured?: boolean;
  }>;
}

// ─── Response Schema ─────────────────────────────────────

const AIContentResponseSchema = z.object({
  tagline: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string().optional(),
  })).optional(),
  pricing: z.array(z.object({
    name: z.string(),
    price: z.string(),
    period: z.string().optional(),
    description: z.string(),
    features: z.array(z.string()),
    cta: z.string().default('Get Started'),
    featured: z.boolean().optional(),
  })).optional(),
});

// ─── Pricing Hallucination Guard ─────────────────────────

/** Broad pricing evidence detection */
const PRICING_EVIDENCE = /\$\d|€\d|£\d|USD\s*\d|\d+\s*\/\s*mo|per\s*month|monthly|yearly|\/yr|per\s*year|pricing\s*(?:plan|tier|model)|subscription|free\s*(?:plan|tier)/i;

/** Pattern that detects numeric pricing in AI output */
const NUMERIC_PRICING_PATTERN = /[\$€£]\d|USD\s*\d|\d+\s*\/\s*mo/;

/**
 * Check if source docs contain evidence of pricing information.
 *
 * Args:
 *   rawDocs: Combined documentation content.
 *   specification: Expanded specification text.
 *
 * Returns:
 *   true if pricing evidence is found in either source.
 */
export function hasPricingEvidence(rawDocs: string, specification: string): boolean {
  return PRICING_EVIDENCE.test(rawDocs) || PRICING_EVIDENCE.test(specification);
}

/**
 * Post-validate AI-generated pricing to prevent hallucinated prices.
 * If no pricing evidence exists in source docs, reject any numeric prices.
 * "Free" is always allowed (low risk).
 *
 * Args:
 *   pricing: AI-generated pricing array.
 *   hasEvidence: Whether pricing evidence was found in source docs.
 *
 * Returns:
 *   Sanitized pricing array (empty if hallucinated prices detected).
 */
function sanitizePricing(
  pricing: NonNullable<AIContentResult['pricing']>,
  hasEvidence: boolean,
): AIContentResult['pricing'] {
  if (hasEvidence) return pricing;

  // No evidence — check if AI invented numeric prices
  const hasNumericPrices = pricing.some(
    (tier) => NUMERIC_PRICING_PATTERN.test(tier.price),
  );

  if (hasNumericPrices) {
    // Reject entire pricing array — AI hallucinated prices
    return undefined;
  }

  // Allow "Free", "TBD", "Contact us" etc.
  return pricing;
}

// ─── AI Content Generation ──────────────────────────────

/**
 * Generate missing website content using AI.
 * Single OpenAI gpt-4.1 call with Zod-validated JSON response.
 * Non-blocking: returns empty {} on any failure.
 *
 * Args:
 *   productName: The product name.
 *   specification: Expanded specification text.
 *   rawDocs: Combined documentation content.
 *
 * Returns:
 *   AIContentResult with any fields the AI could generate.
 */
export async function generateMissingWebsiteContent(
  productName: string,
  specification: string,
  rawDocs: string,
): Promise<AIContentResult> {
  try {
    const hasEvidence = hasPricingEvidence(rawDocs, specification);

    const pricingInstruction = hasEvidence
      ? 'Infer pricing tiers from the documentation. Use exact prices if mentioned.'
      : 'Set all prices to "Contact us" or "TBD". Do not invent numeric pricing.';

    const systemPrompt = [
      'You are a marketing content expert. Generate website content for a software product.',
      'Return a JSON object with these fields (all optional):',
      '- tagline: short marketing tagline (max 80 chars)',
      '- description: product description (max 200 chars)',
      '- features: array of {title, description, icon?} (3-6 features, icon is a lucide icon name)',
      '- pricing: array of {name, price, period?, description, features[], cta, featured?} (2-4 tiers, cta is the button text like "Get Started")',
      '',
      `PRICING RULES: ${pricingInstruction}`,
      '',
      'Base all content on the product documentation provided. Do not invent facts.',
      'Return ONLY valid JSON, no markdown or explanation.',
    ].join('\n');

    const userPrompt = [
      `Product: ${productName}`,
      '',
      specification ? `Specification:\n${specification.slice(0, 3000)}` : '',
      '',
      rawDocs ? `Documentation:\n${rawDocs.slice(0, 5000)}` : '',
    ].filter(Boolean).join('\n');

    const { createClient } = await import('../adapters/openai.js');
    const client = await createClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
    const response = completion.choices[0]?.message?.content ?? '{}';

    // Parse and validate response
    const parsed = JSON.parse(response);
    const validated = AIContentResponseSchema.safeParse(parsed);

    if (!validated.success) {
      return {};
    }

    const result: AIContentResult = { ...validated.data };

    // Apply pricing hallucination guard
    if (result.pricing && result.pricing.length > 0) {
      result.pricing = sanitizePricing(result.pricing, hasEvidence);
    }

    return result;
  } catch {
    // Non-blocking: return empty on any failure
    return {};
  }
}
