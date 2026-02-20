/**
 * Website strategy generator
 * AI-powered marketing strategy creation from product context,
 * with caching via input hash and file-based storage
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  WebsiteStrategyDocument,
  StrategyMetadata,
  BrandAssetsContract,
} from '../types/website-strategy.js';
import { WebsiteStrategySchema } from '../types/website-strategy.js';
import { createClient } from '../adapters/openai.js';

/** File name for persisted strategy */
const STRATEGY_FILE = 'website-strategy.json';

/**
 * Input for strategy generation
 * Market research is user-assisted, not hallucinated
 */
export interface StrategyInput {
  /** Combined userDocs + specification */
  productContext: string;
  /** Project name */
  projectName: string;
  /** Resolved brand assets */
  brandAssets: BrandAssetsContract;
  /** User-supplied competitors (from --competitors flag or docs) */
  competitors?: string[];
  /** User-supplied keywords (from --keywords flag or docs) */
  keywords?: string[];
  /** Optional market notes from user */
  marketNotes?: string;
}

/**
 * Generate a website marketing strategy from product context
 *
 * @param input - Strategy generation inputs
 * @param onProgress - Optional progress callback
 * @returns Strategy document with metadata
 */
export async function generateWebsiteStrategy(
  input: StrategyInput,
  onProgress?: (msg: string) => void
): Promise<{ strategy: WebsiteStrategyDocument; metadata: StrategyMetadata }> {
  onProgress?.('Analyzing product context for strategy...');

  const client = await createClient();

  const competitorsBlock = input.competitors && input.competitors.length > 0
    ? `\n\nKNOWN COMPETITORS (user-supplied):\n${input.competitors.map(c => `- ${c}`).join('\n')}`
    : '';

  const keywordsBlock = input.keywords && input.keywords.length > 0
    ? `\n\nTARGET KEYWORDS (user-supplied):\n${input.keywords.map(k => `- ${k}`).join('\n')}`
    : '';

  const marketNotesBlock = input.marketNotes
    ? `\n\nMARKET NOTES FROM USER:\n${input.marketNotes}`
    : '';

  const prompt = `You are a Senior Product Marketing Strategist and SEO expert.
Analyze the following product documentation and generate a complete website marketing strategy.

PRODUCT NAME: ${input.projectName}

PRODUCT DOCUMENTATION:
${packProductContext(input.productContext)}
${competitorsBlock}${keywordsBlock}${marketNotesBlock}

Generate a JSON response matching this exact structure:
{
  "icp": {
    "primaryPersona": "string - describe the ideal customer",
    "painPoints": ["array of pain points this product solves"],
    "goals": ["array of goals the customer has"],
    "objections": ["array of common objections/concerns"]
  },
  "positioning": {
    "category": "product category",
    "differentiators": ["what makes this unique"],
    "valueProposition": "one-sentence value prop",
    "proofPoints": ["evidence that supports the value prop"]
  },
  "messaging": {
    "headline": "primary H1 headline for landing page",
    "subheadline": "supporting subheadline",
    "elevatorPitch": "30-second pitch",
    "longDescription": "2-3 sentence detailed description"
  },
  "seoStrategy": {
    "primaryKeywords": ["3-5 primary keywords"],
    "secondaryKeywords": ["5-8 secondary keywords"],
    "longTailKeywords": ["5-10 long-tail keyword phrases"],
    "titleTemplates": {"home": "title", "pricing": "title", ...},
    "metaDescriptions": {"home": "description", "pricing": "description", ...}
  },
  "siteArchitecture": {
    "pages": [
      {
        "path": "/",
        "title": "Home",
        "purpose": "primary landing and conversion",
        "pageType": "landing",
        "sections": ["hero", "features", "social-proof", "cta"],
        "seoKeywords": ["keyword1"],
        "conversionGoal": "sign up for trial"
      }
    ],
    "navigation": [{"label": "Home", "href": "/"}],
    "footerSections": [{"title": "Product", "links": [{"label": "Features", "href": "/#features"}]}]
  },
  "conversionStrategy": {
    "primaryCta": {"text": "Get Started", "href": "/pricing"},
    "secondaryCta": {"text": "Learn More", "href": "/docs"},
    "trustSignals": ["signal 1"],
    "socialProof": ["proof point 1"],
    "leadCapture": "webhook"
  },
  "competitiveContext": {
    "category": "product category",
    "competitors": ["only competitors from user input or clearly mentioned in docs"],
    "differentiators": ["competitive advantages"]
  }
}

IMPORTANT RULES:
1. For competitors: ONLY use competitors provided in the input or clearly mentioned in the product docs. Do NOT invent competitors you are unsure about.
2. For keywords: If keywords are provided, use them. Otherwise, infer from product capabilities.
3. Every page must have a clear conversion goal.
4. Headlines must be specific to the product, not generic marketing copy.
5. Always include at minimum: landing, pricing pages.
6. Site architecture should have realistic navigation and footer sections.

Respond with ONLY valid JSON, no markdown code fences or explanation.`;

  onProgress?.('Generating website strategy via AI...');

  const completion = await client.chat.completions.create({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const rawResponse = completion.choices[0]?.message?.content || '{}';

  onProgress?.('Validating strategy schema...');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    throw new Error('Strategy generation returned invalid JSON');
  }

  const result = WebsiteStrategySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Strategy validation failed: ${issues}`);
  }

  const strategy = result.data as WebsiteStrategyDocument;
  const inputHash = computeInputHash(input);
  const metadata: StrategyMetadata = {
    inputHash,
    generatedAt: new Date().toISOString(),
    version: 1,
  };

  return { strategy, metadata };
}

/**
 * Format strategy for injection into plan context
 * Returns a structured text block, NOT appended to specification
 *
 * @param strategy - The strategy document
 * @returns Formatted context string
 */
export function formatStrategyForPlanContext(
  strategy: WebsiteStrategyDocument
): string {
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

/**
 * Store website strategy to .popeye/ directory
 *
 * @param projectDir - Project directory (contains .popeye/)
 * @param strategy - Strategy document
 * @param metadata - Strategy metadata
 */
export async function storeWebsiteStrategy(
  projectDir: string,
  strategy: WebsiteStrategyDocument,
  metadata: StrategyMetadata
): Promise<void> {
  const popeyeDir = path.join(projectDir, '.popeye');
  await fs.mkdir(popeyeDir, { recursive: true });

  const filePath = path.join(popeyeDir, STRATEGY_FILE);
  const content = JSON.stringify({ strategy, metadata }, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Load website strategy from .popeye/ directory
 *
 * @param projectDir - Project directory
 * @returns Strategy and metadata, or null if not found
 */
export async function loadWebsiteStrategy(
  projectDir: string
): Promise<{ strategy: WebsiteStrategyDocument; metadata: StrategyMetadata } | null> {
  const filePath = path.join(projectDir, '.popeye', STRATEGY_FILE);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    const strategyResult = WebsiteStrategySchema.safeParse(parsed.strategy);
    if (!strategyResult.success) return null;

    return {
      strategy: strategyResult.data as WebsiteStrategyDocument,
      metadata: parsed.metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a stored strategy is stale by comparing input hashes
 *
 * @param projectDir - Project directory
 * @param currentInput - Current strategy input
 * @returns True if strategy is stale or missing
 */
export async function isStrategyStale(
  projectDir: string,
  currentInput: StrategyInput
): Promise<boolean> {
  const stored = await loadWebsiteStrategy(projectDir);
  if (!stored) return true;

  const currentHash = computeInputHash(currentInput);
  return stored.metadata.inputHash !== currentHash;
}

/**
 * Pack product context into a budget with priority-based ordering
 * Ensures high-priority docs (spec, pricing, brand) are included first
 *
 * @param productContext - Raw concatenated docs with "--- filename ---" headers
 * @param budget - Maximum character budget (default 16000)
 * @returns Packed context string within budget
 */
export function packProductContext(productContext: string, budget: number = 16000): string {
  // Split by doc headers (--- filename ---)
  const headerPattern = /^---\s+(.+?)\s+---$/gm;
  const sections: Array<{ header: string; content: string; priority: number }> = [];
  let lastIndex = 0;
  let lastHeader = '';
  let match;

  while ((match = headerPattern.exec(productContext)) !== null) {
    if (lastIndex > 0) {
      sections.push({
        header: lastHeader,
        content: productContext.slice(lastIndex, match.index).trim(),
        priority: getDocSortPriority(lastHeader),
      });
    }
    lastHeader = match[0];
    lastIndex = match.index + match[0].length;
  }
  // Push the last section
  if (lastIndex > 0 && lastIndex < productContext.length) {
    sections.push({
      header: lastHeader,
      content: productContext.slice(lastIndex).trim(),
      priority: getDocSortPriority(lastHeader),
    });
  }

  // If no headers found, return the raw context trimmed to budget
  if (sections.length === 0) {
    return productContext.slice(0, budget);
  }

  // Sort by priority (lower = more important)
  sections.sort((a, b) => a.priority - b.priority);

  // Pack into budget
  let packed = '';
  for (const section of sections) {
    const block = `${section.header}\n${section.content}\n\n`;
    if (packed.length + block.length <= budget) {
      packed += block;
    } else {
      const remaining = budget - packed.length;
      if (remaining > 200) {
        packed += `${section.header}\n${section.content.slice(0, remaining - section.header.length - 10)}...\n`;
      }
      break;
    }
  }

  return packed.trim();
}

/**
 * Get sort priority for a doc section header (lower = higher priority)
 */
function getDocSortPriority(header: string): number {
  const lower = header.toLowerCase();
  if (/spec/i.test(lower)) return 1;
  if (/pricing/i.test(lower)) return 2;
  if (/color|brand/i.test(lower)) return 3;
  if (/feature/i.test(lower)) return 4;
  return 5;
}

/**
 * Compute SHA-256 hash of strategy inputs for staleness detection
 */
function computeInputHash(input: StrategyInput): string {
  const data = [
    input.productContext,
    input.projectName,
    (input.competitors || []).sort().join(','),
    (input.keywords || []).sort().join(','),
  ].join('|');

  return createHash('sha256').update(data).digest('hex');
}
