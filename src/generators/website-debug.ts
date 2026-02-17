/**
 * Debug tracing for website generation pipeline
 * Enabled via POPEYE_DEBUG_WEBSITE=1 environment variable
 * Shows exactly which value came from where during website generation
 */

/**
 * Structured trace of website generation pipeline decisions
 */
export interface WebsiteDebugTrace {
  workspaceRoot: string;
  docsFound: Array<{ path: string; size: number }>;
  brandAssets: { logoPath?: string; logoOutputPath: string };
  productName: { value: string; source: 'docs' | 'spec' | 'package.json' | 'directory' };
  primaryColor: { value?: string; source: 'brand-docs' | 'frontend' | 'defaults' };
  strategyStatus: 'success' | 'failed' | 'skipped';
  strategyError?: string;
  feDesignAnalysis?: { componentLib?: string; darkMode: boolean; primaryColor?: string };
  templateValues: { headline?: string; features: number; pricingTiers: number };
  /** Sections rendered with their data sources */
  sectionsRendered: Array<{
    name: string;
    dataSource: 'strategy' | 'docs' | 'defaults' | 'skipped';
    itemCount: number;
  }>;
  /** Validation result from quality gate */
  validationPassed: boolean;
  validationIssues: string[];
}

/**
 * Check if debug tracing is enabled
 *
 * @returns True if POPEYE_DEBUG_WEBSITE=1 is set
 */
export function isDebugEnabled(): boolean {
  return process.env.POPEYE_DEBUG_WEBSITE === '1';
}

/**
 * Format a debug trace for terminal output
 *
 * @param trace - The debug trace to format
 * @returns Formatted string for terminal output
 */
export function formatDebugTrace(trace: WebsiteDebugTrace): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('=== WEBSITE GENERATION DEBUG TRACE ===');
  lines.push('');

  lines.push(`Workspace Root: ${trace.workspaceRoot}`);
  lines.push('');

  lines.push(`Docs Found (${trace.docsFound.length}):`);
  if (trace.docsFound.length === 0) {
    lines.push('  (none)');
  } else {
    for (const doc of trace.docsFound) {
      lines.push(`  - ${doc.path} (${doc.size} chars)`);
    }
  }
  lines.push('');

  lines.push(`Brand Assets:`);
  lines.push(`  Logo Source: ${trace.brandAssets.logoPath || '(none)'}`);
  lines.push(`  Logo Output: ${trace.brandAssets.logoOutputPath}`);
  lines.push('');

  lines.push(`Product Name: "${trace.productName.value}" (from: ${trace.productName.source})`);
  lines.push('');

  lines.push(`Primary Color: ${trace.primaryColor.value || '(default)'} (from: ${trace.primaryColor.source})`);
  lines.push('');

  lines.push(`Strategy: ${trace.strategyStatus}`);
  if (trace.strategyError) {
    lines.push(`  Error: ${trace.strategyError}`);
  }
  lines.push('');

  if (trace.feDesignAnalysis) {
    lines.push('Frontend Design Analysis:');
    lines.push(`  Component Library: ${trace.feDesignAnalysis.componentLib || '(unknown)'}`);
    lines.push(`  Dark Mode: ${trace.feDesignAnalysis.darkMode}`);
    lines.push(`  Primary Color: ${trace.feDesignAnalysis.primaryColor || '(none)'}`);
    lines.push('');
  }

  lines.push('Template Values:');
  lines.push(`  Headline: ${trace.templateValues.headline || '(default)'}`);
  lines.push(`  Features: ${trace.templateValues.features}`);
  lines.push(`  Pricing Tiers: ${trace.templateValues.pricingTiers}`);
  lines.push('');

  lines.push(`Sections Rendered (${trace.sectionsRendered.length}):`);
  if (trace.sectionsRendered.length === 0) {
    lines.push('  (none)');
  } else {
    for (const section of trace.sectionsRendered) {
      lines.push(`  - ${section.name}: ${section.dataSource} (${section.itemCount} items)`);
    }
  }
  lines.push('');

  lines.push(`Validation: ${trace.validationPassed ? 'PASSED' : 'FAILED'}`);
  if (trace.validationIssues.length > 0) {
    for (const issue of trace.validationIssues) {
      lines.push(`  - ${issue}`);
    }
  }

  lines.push('');
  lines.push('=== END DEBUG TRACE ===');
  lines.push('');

  return lines.join('\n');
}

/**
 * Print debug trace to console if debug mode is enabled
 *
 * @param trace - The debug trace to print
 */
export function printDebugTrace(trace: WebsiteDebugTrace): void {
  if (isDebugEnabled()) {
    console.log(formatDebugTrace(trace));
  }
}
