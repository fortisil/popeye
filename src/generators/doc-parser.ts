/**
 * Document parsing helpers for extracting structured content from user docs
 * Used by website-context.ts to populate website templates with project-specific content
 */

/** Generic AI preamble patterns to skip */
const GENERIC_PREAMBLES = [
  "here's a comprehensive",
  "here is a comprehensive",
  "here's a detailed",
  "here is a detailed",
  "based on your idea",
  "based on the idea",
  "here's a software",
  "here is a software",
];

/**
 * Strip markdown code fences that wrap entire doc files (```md ... ```)
 */
export function stripCodeFences(text: string): string {
  return text.replace(/```(?:md|markdown)?\s*\n/g, '').replace(/```\s*$/gm, '');
}

/**
 * Extract the real product name from docs or specification
 *
 * Priority chain (first match wins):
 * 1. Parsed docs: "# ProductName -- tagline" heading (picks shortest)
 * 2. Specification: "# ProductName" heading
 * 3. Specification: "Product:" / "Name:" / "App:" label
 * 4. package.json "name" field from workspace root (passed via specification context)
 * 5. undefined (caller falls back to directory name)
 */
export function extractProductName(
  docs: string,
  specification?: string,
  packageJsonName?: string
): string | undefined {
  // 1. Collect all "# Name -- tagline" headings, pick the shortest name
  // Reason: sub-documents like "Gateco UI Color System" are longer than "Gateco"
  const headingPattern = /^#\s+([A-Z][a-zA-Z0-9]+(?:[ \t]+[A-Z][a-zA-Z0-9]+)*)(?:[ \t]*(?:--|[—–|:])[ \t])/gm;
  const candidates: string[] = [];
  let match;
  while ((match = headingPattern.exec(docs)) !== null) {
    candidates.push(match[1].trim());
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.length - b.length);
    return candidates[0];
  }

  // 2. "# ProductName" heading in specification (standalone heading, not sub-doc)
  // Reason: Exclude common section headings like "Overview", "Introduction", "Summary"
  if (specification) {
    const commonHeadings = /^(Overview|Introduction|Summary|Features|Architecture|Requirements|Setup|Installation|Configuration|Specification|Appendix|Conclusion|References)$/i;
    const specHeading = specification.match(/^#\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\s*$/m);
    if (specHeading && !commonHeadings.test(specHeading[1].trim())) {
      return specHeading[1].trim();
    }
  }

  // 3. "Product:" / "Name:" / "App:" label in specification
  if (specification) {
    const nameMatch = specification.match(/\*\*Project\s+Name\*\*:\s*(.+)/i);
    if (nameMatch) return nameMatch[1].trim();

    const labelMatch = specification.match(/(?:^|\n)\s*(?:Product|Name|App)\s*:\s*(.+)/i);
    if (labelMatch) {
      const value = labelMatch[1].trim().replace(/\*\*/g, '');
      if (value.length > 0 && value.length < 60) return value;
    }
  }

  // 4. "# ProductName" in spec/product doc sections only
  const sectionHeading = docs.match(/^---\s+\S*(?:spec|product)\S*\s+---\n#\s+([A-Z][a-zA-Z0-9]+)/im);
  if (sectionHeading) return sectionHeading[1].trim();

  // 5. package.json name (strip @scope/ prefix and convert to title case)
  if (packageJsonName) {
    const cleaned = packageJsonName
      .replace(/^@[^/]+\//, '') // Strip scope
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    if (cleaned.length > 0) return cleaned;
  }

  return undefined;
}

/**
 * Check if a product name looks like a directory name rather than a real product name
 * Used by the quality gate to flag suspicious names
 *
 * @param name - The product name to check
 * @returns True if the name looks suspicious (likely a directory name)
 */
export function isSuspiciousProductName(name: string): boolean {
  const suspiciousNames = ['my-app', 'my-project', 'project', 'app', 'website', 'frontend'];
  if (suspiciousNames.includes(name.toLowerCase())) return true;
  // Hyphenated lowercase strings like "read-all-files" are likely directory names
  if (/^[a-z]+-[a-z]+(-[a-z]+)*$/.test(name)) return true;
  return false;
}

/**
 * Extract a tagline from docs (text after em-dash in first heading)
 * When productName is provided, prefer tagline from the heading containing that name
 */
export function extractTagline(docs: string, productName?: string): string | undefined {
  // Collect all "# Name — Tagline" matches
  const taglineMatches = [...docs.matchAll(/^#\s+(.+?)[—\-–]\s*(.{10,80})$/gm)];

  if (taglineMatches.length > 0) {
    // Prefer tagline from the heading that best matches the product name
    // Reason: "Gateco UI Color System — ..." also includes "Gateco", so prefer exact match
    if (productName) {
      const exactMatch = taglineMatches.find((m) => m[1].trim() === productName);
      if (exactMatch) return exactMatch[2].trim();
      // Fall back to shortest heading containing the name (closest to just the product name)
      const nameMatches = taglineMatches.filter((m) => m[1].includes(productName));
      if (nameMatches.length > 0) {
        nameMatches.sort((a, b) => a[1].length - b[1].length);
        return nameMatches[0][2].trim();
      }
    }
    return taglineMatches[0][2].trim();
  }

  // Bold tagline near the top: "**Secure AI Retrieval. Priced by Use.**"
  const boldMatch = docs.match(/\*\*([A-Z].{15,80}?)\*\*/);
  if (boldMatch && !boldMatch[1].includes('Project Name')) return boldMatch[1];

  return undefined;
}

/**
 * Extract a meaningful description, skipping generic AI preambles
 */
export function extractDescription(docs: string, specification?: string): string | undefined {
  // Look for "What is [Product]?" or "About [Product]" sections in docs
  // Collect all matches and prefer the one that looks most like a product description
  // Reason: "What is a Secured Retrieval?" in pricing doc should not beat "What Is Gateco?" in spec
  const descPattern = /##\s+(?:\d+\.\s*)?(?:What\s+Is|About(?!\s+(?:This|the)))\b[^\n]*\n+([\s\S]*?)(?=\n##\s|\n---)/gi;
  const descMatches = [...docs.matchAll(descPattern)];
  // Sort: prefer matches whose heading has just a product name (no articles like "a/an/the")
  descMatches.sort((a, b) => {
    const headingA = a[0].split('\n')[0];
    const headingB = b[0].split('\n')[0];
    const hasArticleA = /what\s+is\s+(?:a|an|the)\s/i.test(headingA) ? 1 : 0;
    const hasArticleB = /what\s+is\s+(?:a|an|the)\s/i.test(headingB) ? 1 : 0;
    return hasArticleA - hasArticleB;
  });
  for (const whatIsMatch of descMatches) {
    const paragraph = whatIsMatch[1].trim().split('\n\n')[0]
      .replace(/\*\*/g, '').replace(/\n/g, ' ').trim();
    if (paragraph.length > 30) return paragraph.slice(0, 300);
  }

  // Look in specification, skipping generic lines
  if (specification) {
    for (const line of specification.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.length < 30) continue;
      const lower = trimmed.toLowerCase();
      if (GENERIC_PREAMBLES.some((p) => lower.startsWith(p))) continue;
      if (lower.startsWith('**project name')) continue;
      return trimmed.replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ').slice(0, 300);
    }
  }

  return undefined;
}

/** Regex to filter out dev-task items that aren't real product features */
const DEV_TASK_VERBS = /^(?:implement|fix|refactor|add tests|upgrade|migrate|configure|setup|install|deploy|debug|create|build|write|update|remove|delete)/i;

/**
 * Extract features from docs and specification
 * Docs-first: extracts from docs only; falls back to specification if empty
 * Filters out dev-task items (implement, fix, refactor, etc.)
 */
export function extractFeatures(
  docs: string,
  specification?: string
): Array<{ title: string; description: string }> {
  // Docs-first: try docs only, then fall back to spec
  // Reason: specification often contains dev tasks, not user-facing features
  const docsFeatures = extractFeaturesFromSource(docs);
  if (docsFeatures.length > 0) return docsFeatures;

  if (specification) {
    return extractFeaturesFromSource(specification);
  }

  return [];
}

/**
 * Extract features from a single text source
 */
function extractFeaturesFromSource(
  source: string
): Array<{ title: string; description: string }> {
  const features: Array<{ title: string; description: string }> = [];

  // Split into sections by heading
  const sectionPattern = /^#{1,3}\s+(.+)$/gm;
  const sections: Array<{ heading: string; content: string }> = [];
  let lastIndex = 0;
  let lastHeading = '';
  let match;

  while ((match = sectionPattern.exec(source)) !== null) {
    if (lastIndex > 0) {
      sections.push({
        heading: lastHeading,
        content: source.slice(lastIndex, match.index),
      });
    }
    lastHeading = match[1];
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex > 0) {
    sections.push({ heading: lastHeading, content: source.slice(lastIndex) });
  }

  // Find sections about product features, principles, capabilities
  // Reason: pattern must be specific to avoid matching design docs ("Feature Gating", "Enforcement Colors")
  // "features" requires plural or "Key/Core Features" prefix to avoid "Feature Gating"
  const featureKeywords = /(?:key|core|main)?\s*features\b|principle|capabilit|what\s+(?:it|we)\s+do|core\s+design/i;

  for (const section of sections) {
    if (!featureKeywords.test(section.heading)) continue;

    // Collect bullet points (- or * or +) and numbered items (1. 2. 3.)
    const items = section.content.match(/^(?:[-*+]|\d+\.)\s+.+/gm);
    if (!items) continue;

    for (const item of items) {
      const text = item.replace(/^(?:[-*+]|\d+\.)\s+/, '');

      // Try "**bold title** - description" pattern
      const boldWithDesc = text.match(/^\*\*(.+?)\*\*\s*[-–:]\s*(.+)/);
      if (boldWithDesc) {
        const title = boldWithDesc[1].trim();
        // Filter out dev-task items
        if (DEV_TASK_VERBS.test(title)) continue;
        features.push({
          title,
          description: boldWithDesc[2].trim().slice(0, 150),
        });
      } else if (/^\*\*.+\*\*/.test(text)) {
        // Bold title with no trailing description: "**Vector DB agnostic**"
        const title = text.replace(/\*\*/g, '').trim();
        if (DEV_TASK_VERBS.test(title)) continue;
        if (title.length > 3 && title.length < 80) {
          features.push({ title, description: title });
        }
      } else {
        const cleaned = text.replace(/\*\*/g, '');
        // Split on sentence-level delimiters only; keep hyphens in compound words
        const titlePart = cleaned.split(/[.,:;—–]/)[0].trim();
        // Filter out dev-task items
        if (DEV_TASK_VERBS.test(titlePart)) continue;
        if (titlePart.length > 3 && titlePart.length < 60) {
          features.push({
            title: titlePart,
            description: cleaned.slice(0, 150),
          });
        }
      }

      if (features.length >= 6) break;
    }

    if (features.length > 0) break;
  }

  return features;
}

/**
 * Extract pricing tiers from docs
 * Parses markdown tables and "Plan Positioning" sections
 */
export function extractPricing(
  docs: string
): Array<{
  name: string; price: string; period?: string;
  description: string; features: string[];
  cta: string; featured?: boolean;
}> | undefined {
  const tiers: Array<{
    name: string; price: string; period?: string;
    description: string; features: string[];
    cta: string; featured?: boolean;
  }> = [];

  // Find the pricing section to avoid matching design token tables
  // Reason: "Plan-Based Color Usage" matches "Plans?" - require "Pricing" keyword
  const pricingSection = docs.match(
    /##\s+(?:[\d.]*\s*)?Pricing\b[^\n]*\n([\s\S]*?)(?=\n##\s(?!.*(?:Plan\s+Positioning|Feature|Comparison))|\n---(?:\s*\n##\s)|$)/i
  );
  const searchArea = pricingSection ? pricingSection[0] : docs;

  // Look for pricing overview table rows with plan names and actual prices
  const priceMap = new Map<string, string>();
  const tableRows = searchArea.match(/^\|[^|]*(?:Free|Pro|Enterprise|Starter|Growth|Team|Business)[^|]*\|.+\|$/gm);
  if (tableRows) {
    for (const row of tableRows) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const planName = cells[0].replace(/[🟢🔵🟣⚪🟡🟠🔴]\s*/g, '').replace(/\*\*/g, '').trim();
        const price = cells[1].replace(/<br>/g, ' / ').replace(/\*\*/g, '').trim();
        // Require the price to look like an actual price (Free, $amount, Custom, Contact)
        // Reason: avoids matching design tokens like `plan-free` from color-scheme docs
        const looksLikePrice = /^free$/i.test(price) || /^\$/.test(price)
          || /^custom/i.test(price) || /^contact/i.test(price);
        if (looksLikePrice && !priceMap.has(planName)) {
          priceMap.set(planName, price);
        }
      }
    }
  }

  if (priceMap.size === 0) return undefined;

  // Look for plan descriptions
  const descMap = new Map<string, string>();
  const positionMatch = docs.match(
    /##\s+(?:Plan\s+Positioning|Plan\s+Descriptions?)[^\n]*\n([\s\S]*?)(?=\n##\s|\n---)/i
  );
  if (positionMatch) {
    const descPattern = /[-*]\s+\*\*(.+?)\*\*\s*\n\s+\*(.+?)\*/g;
    let descMatch;
    while ((descMatch = descPattern.exec(positionMatch[1])) !== null) {
      descMap.set(descMatch[1].trim(), descMatch[2].trim());
    }
  }

  // Build tier objects
  let index = 0;
  for (const [name, price] of priceMap) {
    let displayPrice = price;
    let period: string | undefined;
    if (/free/i.test(price)) {
      displayPrice = 'Free';
    } else if (/custom|contact/i.test(price)) {
      displayPrice = 'Custom';
    } else {
      // If there's a "minimum" monthly amount (e.g. "$0.40/1K ... $99/month minimum"),
      // prefer the minimum amount as the display price
      const minMatch = price.match(/(\$[\d,.]+)\s*\/?\s*month\s*minimum/i);
      if (minMatch) {
        displayPrice = minMatch[1];
        period = '/month';
      } else {
        const dollarMatch = price.match(/\$[\d,.]+/);
        if (dollarMatch) {
          displayPrice = dollarMatch[0];
          if (/month/i.test(price)) period = '/month';
          if (/year|annual/i.test(price)) period = '/year';
        }
      }
    }

    const description = descMap.get(name) || '';
    const cta = /enterprise|custom/i.test(name) ? 'Contact sales'
      : /pro/i.test(name) ? 'Start free trial'
      : 'Get started';
    const featured = index === 1;

    tiers.push({
      name: name.replace(/\(.+?\)/, '').trim(),
      price: displayPrice,
      period,
      description,
      features: [],
      cta,
      featured,
    });
    index++;
  }

  // Extract features per plan from comparison table
  const compTable = docs.match(
    /\|\s*Feature\s*\/\s*Plan\s*\|(.+)\|[\s\S]*?(?=\n\n|\n##\s|\n---)/i
  );
  if (compTable && tiers.length > 0) {
    const rows = compTable[0].split('\n').filter((r) => r.startsWith('|'));
    for (const row of rows.slice(2)) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const featureName = cells[0].replace(/\*\*/g, '').trim();
      if (!featureName || /^[-=]+$/.test(featureName)) continue;

      for (let i = 0; i < tiers.length && i + 1 < cells.length; i++) {
        const val = cells[i + 1].trim();
        if (val && val !== '❌') {
          const display = val === '✅' ? featureName : `${featureName}: ${val}`;
          tiers[i].features.push(display);
        }
      }
    }
  }

  for (const tier of tiers) {
    tier.features = tier.features.slice(0, 6);
  }

  return tiers.length > 0 ? tiers : undefined;
}

/**
 * Extract the primary brand/accent color, not just any hex color
 * Looks for accent/primary/CTA color tokens, avoids dark backgrounds
 */
export function extractPrimaryColor(docs: string): string | undefined {
  // Look for "accent-primary" or "accent_primary" token with nearby hex
  const accentMatch = docs.match(/accent[_-]?primary[^#]{0,40}(#[0-9a-fA-F]{6})/i);
  if (accentMatch) return accentMatch[1];

  // Look for "Primary Brand" or "Primary CTA" color label near a hex value
  const primaryMatch = docs.match(
    /(?:primary\s+(?:brand\s+)?(?:accent|color|CTA))[^#]{0,40}(#[0-9a-fA-F]{6})/i
  );
  if (primaryMatch) return primaryMatch[1];

  // Look for CTA/link color
  const ctaMatch = docs.match(/(?:CTA|primary\s+link)[^#]{0,40}(#[0-9a-fA-F]{6})/i);
  if (ctaMatch) return ctaMatch[1];

  // Fallback: first hex color that isn't very dark or very light
  const allColors = [...docs.matchAll(/#([0-9a-fA-F]{6})/g)];
  for (const colorMatch of allColors) {
    const hex = colorMatch[1];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness > 60 && brightness < 210) {
      return '#' + hex;
    }
  }

  return undefined;
}
