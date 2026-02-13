/**
 * Project overview generator
 * Provides a comprehensive view of project state, plan, and progress
 * with analysis of issues and ability to fix them
 */

import path from 'node:path';
import { loadProject, getProgress, storeUserDocs, storeBrandContext } from '../state/index.js';
import type { ProjectState } from '../types/workflow.js';
import {
  discoverProjectDocs,
  readProjectDocs,
  findBrandAssets,
} from '../generators/website-context.js';
import { updateWebsiteContent } from './website-updater.js';

/**
 * Detected issue in project analysis
 */
export interface OverviewIssue {
  severity: 'warning' | 'error';
  category: string;
  message: string;
  fix?: string;
}

/**
 * Structured project overview
 */
export interface ProjectOverview {
  name: string;
  idea: string;
  language: string;
  phase: string;
  status: string;
  specification: {
    summary: string;
    keyFeatures: string[];
  };
  plan: {
    totalMilestones: number;
    totalTasks: number;
    milestones: Array<{
      name: string;
      status: string;
      taskCount: number;
      completedTasks: number;
      tasks: Array<{ name: string; status: string }>;
    }>;
  };
  progress: {
    completedMilestones: number;
    completedTasks: number;
    percentComplete: number;
  };
  userDocs?: string[];
  brandContext?: { logoPath?: string; primaryColor?: string };
  /** Detected issues and recommendations */
  issues: OverviewIssue[];
  /** Available docs in CWD that are not yet discovered */
  availableDocs: string[];
}

/**
 * Result of an overview fix operation
 */
export interface OverviewFixResult {
  docsDiscovered: number;
  docsStored: boolean;
  brandFound: boolean;
  websiteUpdated: boolean;
  messages: string[];
}

/**
 * Generate a complete project overview from state
 *
 * @param projectDir - The project directory
 * @returns Structured project overview with analysis
 */
export async function generateOverview(
  projectDir: string
): Promise<ProjectOverview> {
  const state = await loadProject(projectDir);
  const progress = await getProgress(projectDir);

  // Extract specification summary
  const specSummary = extractSpecSummary(state);
  const keyFeatures = extractKeyFeatures(state);

  // Build milestone details
  const milestones = state.milestones.map((m) => ({
    name: m.name,
    status: m.status,
    taskCount: m.tasks.length,
    completedTasks: m.tasks.filter((t) => t.status === 'complete').length,
    tasks: m.tasks.map((t) => ({
      name: t.name,
      status: t.status,
    })),
  }));

  // Extract user doc file names if available
  const userDocs = state.userDocs
    ? extractDocNames(state.userDocs)
    : undefined;

  // Check for available docs in CWD that haven't been discovered
  const parentDir = path.dirname(projectDir);
  const availableDocPaths = await discoverProjectDocs(parentDir);
  const availableDocs = availableDocPaths.map((p) => path.basename(p));

  // Run analysis to detect issues
  const issues = analyzeProject(state, availableDocs, progress);

  return {
    name: state.name,
    idea: state.idea,
    language: state.language,
    phase: state.phase,
    status: state.status,
    specification: {
      summary: specSummary,
      keyFeatures,
    },
    plan: {
      totalMilestones: state.milestones.length,
      totalTasks: state.milestones.reduce((sum, m) => sum + m.tasks.length, 0),
      milestones,
    },
    progress: {
      completedMilestones: progress.completedMilestones,
      completedTasks: progress.completedTasks,
      percentComplete: progress.percentComplete,
    },
    userDocs,
    brandContext: state.brandContext,
    issues,
    availableDocs,
  };
}

/**
 * Fix detected issues by re-discovering docs and updating website content
 *
 * @param projectDir - The project directory
 * @param onProgress - Optional progress callback
 * @returns Fix result with summary of actions taken
 */
export async function fixOverviewIssues(
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<OverviewFixResult> {
  const result: OverviewFixResult = {
    docsDiscovered: 0,
    docsStored: false,
    brandFound: false,
    websiteUpdated: false,
    messages: [],
  };

  let state = await loadProject(projectDir);
  const parentDir = path.dirname(projectDir);

  // Step 1: Re-discover project documentation
  onProgress?.('Scanning for project documentation...');
  const docPaths = await discoverProjectDocs(parentDir);

  if (docPaths.length > 0) {
    const userDocs = await readProjectDocs(docPaths);
    state = await storeUserDocs(projectDir, userDocs);
    result.docsDiscovered = docPaths.length;
    result.docsStored = true;
    const docNames = docPaths.map((p) => path.basename(p)).join(', ');
    result.messages.push(`Discovered ${docPaths.length} doc(s): ${docNames}`);
    onProgress?.(`Found ${docPaths.length} doc(s): ${docNames}`);
  } else {
    result.messages.push('No project documentation found in parent directory');
    onProgress?.('No project documentation found in parent directory');
  }

  // Step 2: Find brand assets
  onProgress?.('Scanning for brand assets...');
  const brandAssets = await findBrandAssets(parentDir);

  if (brandAssets.logoPath) {
    state = await storeBrandContext(projectDir, {
      ...state.brandContext,
      logoPath: brandAssets.logoPath,
    });
    result.brandFound = true;
    result.messages.push(`Found logo: ${path.basename(brandAssets.logoPath)}`);
    onProgress?.(`Found logo: ${path.basename(brandAssets.logoPath)}`);
  }

  // Extract primary/accent color from docs if not already set
  // Use smart extraction: look for accent/primary CTA color tokens first,
  // then fall back to brightness-filtered colors (skip very dark/light)
  if (!state.brandContext?.primaryColor && state.userDocs) {
    const accentMatch = state.userDocs.match(/accent[_-]?primary[^#]{0,40}(#[0-9a-fA-F]{6})/i)
      || state.userDocs.match(/(?:primary\s+(?:brand\s+)?(?:accent|color|CTA))[^#]{0,40}(#[0-9a-fA-F]{6})/i);
    const color = accentMatch ? accentMatch[1] : findBrightColor(state.userDocs);
    if (color) {
      state = await storeBrandContext(projectDir, {
        ...state.brandContext,
        primaryColor: color,
      });
      result.messages.push(`Extracted brand color: ${color}`);
      onProgress?.(`Extracted brand color: ${color}`);
    }
  }

  // Step 3: Update website content if applicable
  const language = state.language;
  if (language === 'website' || language === 'all' || language === 'fullstack') {
    onProgress?.('Updating website content with discovered context...');
    try {
      await updateWebsiteContent(projectDir, state, language, onProgress);
      result.websiteUpdated = true;
      result.messages.push('Website content files updated with project context');
    } catch (err) {
      result.messages.push(`Website update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Summary
  if (result.docsDiscovered === 0 && !result.brandFound) {
    result.messages.push(
      'Tip: Place project docs (spec, pricing, color-scheme, etc.) as .md files in the parent directory, then run /overview fix again'
    );
  }

  return result;
}

/** Analyze project state and detect issues */
function analyzeProject(
  state: ProjectState,
  availableDocs: string[],
  progress: { totalTasks: number; completedTasks: number; percentComplete: number }
): OverviewIssue[] {
  const issues: OverviewIssue[] = [];
  const push = (severity: 'warning' | 'error', category: string, message: string, fix?: string) =>
    issues.push({ severity, category, message, fix });

  if (!state.userDocs && availableDocs.length > 0) {
    push('warning', 'docs',
      `Found ${availableDocs.length} doc(s) in CWD (${availableDocs.join(', ')}) but project has no user docs stored`,
      'Run /overview fix to discover and apply project documentation');
  }
  if (!state.userDocs && availableDocs.length === 0) {
    push('warning', 'docs',
      'No project documentation found. Website will use generic placeholder content.',
      'Add .md files (spec, pricing, brand, etc.) to the project parent directory, then run /overview fix');
  }
  if (progress.totalTasks > 0 && progress.totalTasks <= 3) {
    push('warning', 'plan',
      `Project has only ${progress.totalTasks} task(s) - this may indicate an incomplete or oversimplified plan`,
      'Consider resetting to plan phase with richer specification');
  }
  if (!state.brandContext?.primaryColor && !state.brandContext?.logoPath) {
    push('warning', 'brand',
      'No brand context (colors, logo) detected. Website uses default styling.',
      'Add a color-scheme.md or logo file to the project parent directory, then run /overview fix');
  }
  if (state.specification) {
    const specStart = state.specification.trim().slice(0, 200).toLowerCase();
    const genericPats = ["here's a comprehensive", "here is a comprehensive",
      "here's a detailed", "here is a detailed", 'based on your idea', 'based on the idea'];
    if (genericPats.some((p) => specStart.includes(p))) {
      push('warning', 'spec',
        'Specification appears to be generic AI-generated content without project-specific documentation input',
        'Add project docs to CWD and run /overview fix to re-enrich. For a full re-spec, reset to plan phase.');
    }
  }
  const hasWebsite = state.language === 'website' || state.language === 'all' || state.language === 'fullstack';
  if (hasWebsite && !state.userDocs && state.phase === 'complete') {
    push('error', 'website',
      'Project includes a website but was completed without any user documentation. Website likely has placeholder content.',
      'Run /overview fix to discover docs and update website template files');
  }
  return issues;
}

/**
 * Format a project overview for terminal display
 *
 * @param overview - The project overview to format
 * @returns Formatted string for terminal output
 */
export function formatOverview(overview: ProjectOverview): string {
  const l: string[] = [''];
  l.push(`  PROJECT OVERVIEW: ${overview.name}`);
  l.push(`  ${'='.repeat(40 + overview.name.length)}`, '');
  l.push(`  Language:  ${overview.language}`);
  l.push(`  Phase:     ${overview.phase}`);
  l.push(`  Status:    ${overview.status}`, '');

  if (overview.specification.summary) {
    l.push('  SPECIFICATION', `  ${overview.specification.summary}`);
    if (overview.specification.keyFeatures.length > 0) {
      l.push('', '  Key Features:');
      for (const f of overview.specification.keyFeatures.slice(0, 8)) l.push(`    - ${f}`);
    }
    l.push('');
  }

  const barWidth = 30;
  const filled = Math.round((overview.progress.percentComplete / 100) * barWidth);
  const bar = `[${'='.repeat(filled)}${filled < barWidth ? '>' : ''}${' '.repeat(Math.max(0, barWidth - filled - 1))}]`;
  l.push(`  Progress: ${bar} ${overview.progress.percentComplete}% (${overview.progress.completedTasks}/${overview.plan.totalTasks} tasks)`, '');

  if (overview.plan.milestones.length > 0) {
    l.push('  MILESTONES', `  ${'-'.repeat(50)}`);
    for (const m of overview.plan.milestones) {
      l.push(`  ${getStatusIcon(m.status)} ${m.name}  (${m.completedTasks}/${m.taskCount} tasks)`);
      for (const t of m.tasks) l.push(`      ${getStatusIcon(t.status)} ${t.name}`);
      l.push('');
    }
  } else {
    l.push('  No milestones defined yet.', '');
  }

  if (overview.userDocs && overview.userDocs.length > 0) {
    l.push('  DISCOVERED DOCS');
    for (const doc of overview.userDocs) l.push(`    - ${doc}`);
    l.push('');
  }
  if (overview.brandContext) {
    l.push('  BRAND CONTEXT');
    if (overview.brandContext.primaryColor) l.push(`    Primary Color: ${overview.brandContext.primaryColor}`);
    if (overview.brandContext.logoPath) l.push(`    Logo: ${path.basename(overview.brandContext.logoPath)}`);
    l.push('');
  }
  if (overview.issues.length > 0) {
    l.push('  ANALYSIS', `  ${'-'.repeat(50)}`);
    for (const issue of overview.issues) {
      const icon = issue.severity === 'error' ? '[!!]' : '[!]';
      l.push(`  ${icon} ${issue.category.toUpperCase()}: ${issue.message}`);
      if (issue.fix) l.push(`       -> ${issue.fix}`);
    }
    l.push('');
  }
  if (overview.availableDocs.length > 0 && !overview.userDocs) {
    l.push('  AVAILABLE DOCS (not yet imported)');
    for (const doc of overview.availableDocs) l.push(`    - ${doc}`);
    l.push('');
  }
  if (overview.issues.length > 0) {
    l.push('  Run /overview fix to auto-discover docs, detect brand assets, and update website content.', '');
  }
  return l.join('\n');
}

/**
 * Extract a summary from the specification
 */
function extractSpecSummary(state: ProjectState): string {
  if (!state.specification) return '';

  const lines = state.specification.split('\n');
  // Find first non-empty, non-heading line that isn't a generic AI preamble
  const genericPrefixes = [
    "here's a comprehensive",
    "here is a comprehensive",
    "here's a detailed",
    'based on your idea',
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.length > 20) {
      const lower = trimmed.toLowerCase();
      if (!genericPrefixes.some((p) => lower.startsWith(p))) {
        return trimmed.slice(0, 500);
      }
    }
  }

  return state.specification.slice(0, 500);
}

/**
 * Extract key features from specification
 */
function extractKeyFeatures(state: ProjectState): string[] {
  if (!state.specification) return [];

  const features: string[] = [];
  const lines = state.specification.split('\n');
  let inFeatures = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect feature section headers
    if (/^#{1,3}\s*(core\s+)?features/i.test(trimmed)) {
      inFeatures = true;
      continue;
    }

    // Stop at next heading
    if (inFeatures && /^#{1,3}\s/.test(trimmed) && !/feature/i.test(trimmed)) {
      break;
    }

    // Collect bullet points in feature section
    if (inFeatures && /^[-*+]\s+/.test(trimmed)) {
      const feature = trimmed.replace(/^[-*+]\s+/, '').replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ');
      if (feature.length > 5) {
        features.push(feature.slice(0, 100));
      }
    }
  }

  return features.slice(0, 10);
}

/**
 * Extract doc file names from raw docs string
 */
function extractDocNames(rawDocs: string): string[] {
  const names: string[] = [];
  const headerPattern = /^--- (.+) ---$/gm;
  let match;

  while ((match = headerPattern.exec(rawDocs)) !== null) {
    names.push(match[1]);
  }

  return names;
}

/**
 * Get a status icon for terminal display
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'complete':
      return '[x]';
    case 'in-progress':
      return '[~]';
    case 'failed':
      return '[!]';
    case 'paused':
      return '[-]';
    default:
      return '[ ]';
  }
}

/**
 * Find first hex color that isn't very dark or very light
 * Skips background/neutral colors to find a reasonable brand accent
 */
function findBrightColor(text: string): string | undefined {
  const allColors = [...text.matchAll(/#([0-9a-fA-F]{6})/g)];
  for (const match of allColors) {
    const hex = match[1];
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
