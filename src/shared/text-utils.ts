/**
 * Text utilities for normalizing LLM-generated issue lists.
 * Detects false-positive "no issues" responses that LLMs produce in
 * BLOCKING_ISSUES fields (e.g. "No blocking issues found", "N/A", "None identified").
 */

/** Exact-match tokens that mean "nothing" after trim+lowercase */
const NONE_EXACT = new Set(['none', 'n/a', 'na', 'nil', 'nothing']);

/**
 * Anchored phrase patterns that indicate "no issues".
 * Tested against the cleaned text (bullet-stripped, trimmed, lowercased,
 * trailing punctuation removed).
 */
const NONE_PHRASES: RegExp[] = [
  /^no\s+(?:(?:blocking|critical|significant|major)\s+)*(?:issues?|concerns?|problems?|blockers?|showstoppers?)\b/,
  /^none\s+(?:identified|found|detected|noted|observed|reported|applicable|at this time)\b/,
  /^there\s+are\s+no\s+(?:(?:significant|major|critical|blocking)\s+)*(?:issues|concerns|problems|blockers)\b/,
];

/**
 * Determine whether a text string is a "none-variant" — an LLM's way of
 * saying "no blocking issues" rather than an actual issue description.
 *
 * @param text - Raw text from a blocking_issues list item
 * @returns true if the text is a none-variant (should be filtered out)
 */
export function isNoneVariant(text: string): boolean {
  // Empty / whitespace-only
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // Strip leading bullet prefixes: "- ", "* ", "+ ", "1) ", "1. ", etc.
  const stripped = trimmed.replace(/^[-*+\d.)\s]+/, '').trim();
  if (stripped.length === 0) return true;

  // Strip trailing punctuation
  const cleaned = stripped.replace(/[.,;!]+$/, '').trim();
  if (cleaned.length === 0) return true;

  const lower = cleaned.toLowerCase();

  // Exact match check
  if (NONE_EXACT.has(lower)) return true;

  // Anchored phrase check
  for (const pattern of NONE_PHRASES) {
    if (pattern.test(lower)) return true;
  }

  // Length guard: >80 chars and no phrase match means it is likely a real issue
  if (cleaned.length > 80) return false;

  return false;
}

/**
 * Normalize an issue list by filtering out empty strings and none-variants.
 * Intended as a drop-in replacement for the weak `.filter(i => i.toLowerCase() !== 'none')`
 * used across adapters.
 *
 * @param items - Raw list items from parseList()
 * @returns Filtered list with only genuine issues
 */
export function normalizeIssueList(items: string[]): string[] {
  return items
    .map((i) => i.trim())
    .filter((i) => i.length > 0)
    .filter((i) => !isNoneVariant(i));
}
