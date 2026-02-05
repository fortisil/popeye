/**
 * SEO acceptance tests for website projects
 * Validates sitemap, robots.txt, metadata, and OG images
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * SEO check result
 */
export interface SeoCheckResult {
  check: string;
  passed: boolean;
  error?: string;
  details?: string;
}

/**
 * Full SEO test result
 */
export interface SeoTestResult {
  passed: boolean;
  results: SeoCheckResult[];
  summary: string;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read file content safely
 */
async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Find files matching a pattern recursively
 */
async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const matches: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and .next
        if (entry.name === 'node_modules' || entry.name === '.next') {
          continue;
        }
        const subMatches = await findFiles(fullPath, pattern);
        matches.push(...subMatches);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        matches.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }

  return matches;
}

/**
 * Check if content exports metadata
 */
function hasMetadataExport(content: string): boolean {
  // Check for metadata export (const or function)
  return (
    /export\s+(const|async\s+function)\s+metadata/i.test(content) ||
    /export\s+(const|async\s+function)\s+generateMetadata/i.test(content)
  );
}

/**
 * Run SEO acceptance tests on a website project
 *
 * @param websiteDir - Path to the website directory (apps/website or standalone)
 * @returns Test results
 */
export async function runSeoAcceptanceTests(websiteDir: string): Promise<SeoTestResult> {
  const results: SeoCheckResult[] = [];

  // 1. Check sitemap.ts exists
  const sitemapPath = path.join(websiteDir, 'src', 'app', 'sitemap.ts');
  const sitemapExists = await fileExists(sitemapPath);
  results.push({
    check: 'sitemap.ts exists',
    passed: sitemapExists,
    error: sitemapExists ? undefined : 'Missing src/app/sitemap.ts',
    details: sitemapExists ? sitemapPath : undefined,
  });

  // 2. Check robots.ts exists
  const robotsPath = path.join(websiteDir, 'src', 'app', 'robots.ts');
  const robotsExists = await fileExists(robotsPath);
  results.push({
    check: 'robots.ts exists',
    passed: robotsExists,
    error: robotsExists ? undefined : 'Missing src/app/robots.ts',
    details: robotsExists ? robotsPath : undefined,
  });

  // 3. Check root layout has metadata export
  const layoutPath = path.join(websiteDir, 'src', 'app', 'layout.tsx');
  const layoutContent = await readFile(layoutPath);
  const layoutHasMetadata = layoutContent ? hasMetadataExport(layoutContent) : false;
  results.push({
    check: 'Root layout exports metadata',
    passed: layoutHasMetadata,
    error: layoutHasMetadata ? undefined : 'layout.tsx missing metadata export',
    details: layoutHasMetadata ? 'Found metadata export in layout.tsx' : undefined,
  });

  // 4. Check OG image exists
  const ogImagePaths = [
    path.join(websiteDir, 'public', 'og-image.png'),
    path.join(websiteDir, 'public', 'og-image.jpg'),
    path.join(websiteDir, 'src', 'app', 'opengraph-image.png'),
    path.join(websiteDir, 'src', 'app', 'opengraph-image.jpg'),
  ];

  let ogImageFound = false;
  let ogImagePath = '';
  for (const p of ogImagePaths) {
    if (await fileExists(p)) {
      ogImageFound = true;
      ogImagePath = p;
      break;
    }
  }

  results.push({
    check: 'OG image exists',
    passed: ogImageFound,
    error: ogImageFound
      ? undefined
      : 'Missing OG image (public/og-image.png or opengraph-image.png)',
    details: ogImageFound ? ogImagePath : undefined,
  });

  // 5. Check page files have individual metadata
  const pageFiles = await findFiles(
    path.join(websiteDir, 'src', 'app'),
    /page\.tsx$/
  );

  // Check first 5 pages (skip root layout)
  const pagesToCheck = pageFiles.slice(0, 5);
  for (const pageFile of pagesToCheck) {
    const content = await readFile(pageFile);
    const relativePath = path.relative(websiteDir, pageFile);
    const hasPageMetadata = content ? hasMetadataExport(content) : false;

    results.push({
      check: `${relativePath} has metadata`,
      passed: hasPageMetadata,
      error: hasPageMetadata ? undefined : `${relativePath} missing metadata export`,
      details: hasPageMetadata ? 'Found metadata export' : undefined,
    });
  }

  // 6. Check for next.config with proper settings
  const nextConfigPath = path.join(websiteDir, 'next.config.mjs');
  const nextConfigAltPath = path.join(websiteDir, 'next.config.js');
  const hasNextConfig =
    (await fileExists(nextConfigPath)) || (await fileExists(nextConfigAltPath));

  results.push({
    check: 'next.config exists',
    passed: hasNextConfig,
    error: hasNextConfig ? undefined : 'Missing next.config.mjs or next.config.js',
  });

  // Calculate overall result
  const passed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  const summary = passed
    ? `All ${totalCount} SEO checks passed!`
    : `${passedCount}/${totalCount} SEO checks passed. ${totalCount - passedCount} issue(s) found.`;

  return {
    passed,
    results,
    summary,
  };
}

/**
 * Format SEO test results for display
 *
 * @param result - The test result
 * @returns Formatted string
 */
export function formatSeoResults(result: SeoTestResult): string {
  const lines = ['SEO Acceptance Tests:', ''];

  for (const check of result.results) {
    const icon = check.passed ? '[PASS]' : '[FAIL]';
    lines.push(`  ${icon} ${check.check}`);
    if (!check.passed && check.error) {
      lines.push(`       ${check.error}`);
    }
  }

  lines.push('');
  lines.push(result.summary);

  return lines.join('\n');
}

/**
 * Quick check if a website has basic SEO setup
 *
 * @param websiteDir - Path to the website directory
 * @returns True if basic SEO files exist
 */
export async function hasBasicSeoSetup(websiteDir: string): Promise<boolean> {
  const sitemapExists = await fileExists(
    path.join(websiteDir, 'src', 'app', 'sitemap.ts')
  );
  const robotsExists = await fileExists(
    path.join(websiteDir, 'src', 'app', 'robots.ts')
  );

  return sitemapExists && robotsExists;
}
