/**
 * Plan Mode workflow
 * Handles idea expansion, plan creation, and consensus building
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isWorkspace } from '../types/project.js';
import type { ProjectSpec, OutputLanguage } from '../types/project.js';
import type { ProjectState, Milestone, Task } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { expandIdea as openaiExpandIdea } from '../adapters/openai.js';
import { createPlan as claudeCreatePlan, analyzeCodebase } from '../adapters/claude.js';
import {
  createProject,
  loadProject,
  setPhase,
  storePlan,
  storeSpecification,
  addMilestones,
} from '../state/index.js';
import { iterateUntilConsensus, type ConsensusProcessResult } from './consensus.js';
import { getWorkflowLogger } from './workflow-logger.js';
import { designUI, saveUISpecification } from './ui-designer.js';

/**
 * Options for plan mode
 */
export interface PlanModeOptions {
  projectDir: string;
  consensusConfig?: Partial<ConsensusConfig>;
  additionalContext?: string;
  onProgress?: (phase: string, message: string) => void;
}

/**
 * Result of plan mode
 */
export interface PlanModeResult {
  success: boolean;
  state: ProjectState;
  consensusResult?: ConsensusProcessResult;
  error?: string;
}

/**
 * Expand a brief idea into a detailed specification
 *
 * @param idea - The brief project idea
 * @param language - Target programming language
 * @param onProgress - Progress callback
 * @returns Expanded specification
 */
export async function expandIdea(
  idea: string,
  language: OutputLanguage,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Expanding idea into specification...');

  const specification = await openaiExpandIdea(idea, language);

  onProgress?.('Specification created');
  return specification;
}

/**
 * Create a development plan from a specification
 *
 * @param specification - The project specification
 * @param context - Additional context
 * @param language - Target programming language
 * @param onProgress - Progress callback
 * @returns Development plan
 */
export async function createPlan(
  specification: string,
  context: string = '',
  language: OutputLanguage = 'python',
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Creating development plan...');

  const result = await claudeCreatePlan(specification, context, language, onProgress);

  if (!result.success) {
    throw new Error(`Failed to create plan: ${result.error}`);
  }

  onProgress?.('Development plan created');
  return result.response;
}

/**
 * Get existing project context by analyzing the codebase
 *
 * @param projectDir - The project directory
 * @param onProgress - Progress callback
 * @returns Context string
 */
export async function getProjectContext(
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Analyzing existing codebase...');

  // Check if directory has any code - check root AND apps/ subdirectories
  try {
    const codeExtensions = ['.py', '.ts', '.js', '.tsx', '.jsx'];
    const hasCodeInDir = async (dir: string): Promise<boolean> => {
      try {
        const files = await fs.readdir(dir);
        return files.some((f) => codeExtensions.some((ext) => f.endsWith(ext)));
      } catch {
        return false;
      }
    };

    let hasCode = await hasCodeInDir(projectDir);

    // Also check apps/ subdirectories for monorepo/workspace projects
    if (!hasCode) {
      const appsDir = path.join(projectDir, 'apps');
      try {
        const appEntries = await fs.readdir(appsDir, { withFileTypes: true });
        for (const entry of appEntries) {
          if (entry.isDirectory()) {
            const appHasCode = await hasCodeInDir(path.join(appsDir, entry.name));
            if (appHasCode) {
              hasCode = true;
              break;
            }
            // Check one level deeper (apps/frontend/src/)
            const srcDir = path.join(appsDir, entry.name, 'src');
            const srcHasCode = await hasCodeInDir(srcDir);
            if (srcHasCode) {
              hasCode = true;
              break;
            }
          }
        }
      } catch {
        // No apps/ directory
      }
    }

    if (!hasCode) {
      onProgress?.('No existing code found');
      return 'New project - no existing codebase';
    }

    const result = await analyzeCodebase(projectDir, onProgress);

    if (result.success) {
      onProgress?.('Codebase analysis complete');
      return result.response;
    }

    return 'Unable to analyze codebase';
  } catch {
    return 'New project - no existing codebase';
  }
}

/**
 * Save the plan to a markdown file in docs folder
 *
 * @param projectDir - The project directory
 * @param plan - The plan content
 * @param filename - The filename (default: PLAN.md)
 */
export async function documentPlan(
  projectDir: string,
  plan: string,
  filename: string = 'PLAN.md'
): Promise<string> {
  // Create docs directory if it doesn't exist
  const docsDir = path.join(projectDir, 'docs');
  try {
    await fs.mkdir(docsDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  const planPath = path.join(docsDir, filename);

  const content = `# Development Plan

Generated: ${new Date().toISOString()}

${plan}
`;

  await fs.writeFile(planPath, content, 'utf-8');

  // Also save a timestamped version for history
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const historyFilename = `PLAN-${timestamp}.md`;
  const historyPath = path.join(docsDir, historyFilename);
  await fs.writeFile(historyPath, content, 'utf-8');

  return planPath;
}

/**
 * Check if a task name represents an actionable implementation task
 * Tasks should start with verbs like: Implement, Create, Build, Set up, Add, etc.
 *
 * @param name - The potential task name
 * @returns True if this looks like an implementation task
 */
function isActionableTask(name: string): boolean {
  const nameLower = name.toLowerCase().trim();

  // Actionable verb prefixes that indicate real implementation tasks
  const actionableVerbs = [
    'implement', 'create', 'build', 'develop', 'write', 'add', 'set up', 'setup',
    'configure', 'install', 'integrate', 'design', 'define', 'establish',
    'generate', 'construct', 'deploy', 'test', 'validate', 'fix', 'update',
    'refactor', 'optimize', 'extend', 'enhance', 'modify', 'initialize',
    'bootstrap', 'scaffold', 'connect', 'wire', 'hook', 'enable', 'disable',
  ];

  // Check if starts with an actionable verb
  const startsWithAction = actionableVerbs.some((verb) =>
    nameLower.startsWith(verb + ' ') || nameLower.startsWith(verb + ':')
  );

  // Non-actionable patterns to exclude (plan metadata, not tasks)
  const nonActionablePatterns = [
    /^(background|context|overview|introduction|summary)/i,
    /^(goal|objective|requirement|constraint|assumption|risk)/i,
    /^(timeline|schedule|estimate|duration|deadline)/i,
    /^(note|example|reference|appendix|glossary)/i,
    /^(file structure|project structure|directory)/i,
    /^(showing|displays?|contains?|includes?|describes?)/i,
    /^(the |this |a |an )/i,  // Descriptions, not actions
    /^\d+[-.]?\s*(week|day|hour|month)/i,  // Time estimates
    /^([\w\s]+):$/,  // Labels ending with colon
  ];

  const isNonActionable = nonActionablePatterns.some((pattern) => pattern.test(nameLower));

  return startsWithAction && !isNonActionable;
}

/**
 * Task app tag for fullstack projects
 */
export type TaskAppTag = 'FE' | 'BE' | 'INT';

/**
 * Task with app targeting information for fullstack projects
 */
export interface ParsedFullstackTask {
  name: string;
  description: string;
  appTag?: TaskAppTag;
  appTarget?: 'frontend' | 'backend' | 'unified';
  files?: string[];
  dependencies?: string[];
  acceptanceCriteria?: string[];
  testPlan?: string;
}

/**
 * Parse task tag from task name
 * e.g., "Task 1.1 [FE]: Create Button component" -> 'FE'
 *
 * @param taskName - The task name to parse
 * @returns The parsed app tag or undefined
 */
export function parseTaskTag(taskName: string): TaskAppTag | undefined {
  const tagMatch = taskName.match(/\[(FE|BE|INT)\]/i);
  if (tagMatch) {
    return tagMatch[1].toUpperCase() as TaskAppTag;
  }
  return undefined;
}

/**
 * Derive app target from tag
 *
 * @param tag - The task tag
 * @returns The app target
 */
export function tagToAppTarget(tag: TaskAppTag): 'frontend' | 'backend' | 'unified' {
  switch (tag) {
    case 'FE': return 'frontend';
    case 'BE': return 'backend';
    case 'INT': return 'unified';
  }
}

/**
 * Validation result for fullstack task
 */
export interface FullstackTaskValidation {
  valid: boolean;
  issues: string[];
}

/**
 * Validate task has proper app targeting for fullstack projects
 *
 * @param task - The parsed task to validate
 * @returns Validation result with issues
 */
export function validateFullstackTask(task: ParsedFullstackTask): FullstackTaskValidation {
  const issues: string[] = [];

  if (!task.appTag) {
    issues.push(`Task "${task.name.slice(0, 50)}" missing [FE], [BE], or [INT] tag`);
  }

  if (!task.appTarget) {
    issues.push(`Task "${task.name.slice(0, 50)}" missing App: field (frontend/backend/unified)`);
  }

  // Validate consistency between tag and target
  if (task.appTag && task.appTarget) {
    const expectedTarget = tagToAppTarget(task.appTag);
    if (task.appTarget !== expectedTarget) {
      issues.push(`Task "${task.name.slice(0, 50)}" has [${task.appTag}] tag but App: is "${task.appTarget}" (expected "${expectedTarget}")`);
    }
  }

  // Validate file paths match app
  if (task.files && task.appTag === 'FE') {
    const invalidFiles = task.files.filter(f => !f.includes('frontend'));
    if (invalidFiles.length > 0) {
      issues.push(`[FE] task has files outside apps/frontend: ${invalidFiles.slice(0, 2).join(', ')}`);
    }
  }
  if (task.files && task.appTag === 'BE') {
    const invalidFiles = task.files.filter(f => !f.includes('backend'));
    if (invalidFiles.length > 0) {
      issues.push(`[BE] task has files outside apps/backend: ${invalidFiles.slice(0, 2).join(', ')}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Validate all tasks in a fullstack plan
 *
 * @param plan - The plan content
 * @returns Validation result with all issues
 */
export function validateFullstackPlan(plan: string): {
  valid: boolean;
  issues: string[];
  stats: {
    totalTasks: number;
    feTasks: number;
    beTasks: number;
    intTasks: number;
    untaggedTasks: number;
  };
} {
  const issues: string[] = [];
  let totalTasks = 0;
  let feTasks = 0;
  let beTasks = 0;
  let intTasks = 0;
  let untaggedTasks = 0;

  // Find all task headers
  const taskPattern = /^#{2,4}\s*Task\s+(?:[\d.]+[:\s]+)?(.+)$/gim;
  let match;

  while ((match = taskPattern.exec(plan)) !== null) {
    totalTasks++;
    const taskName = match[1].trim();
    const tag = parseTaskTag(taskName);

    if (tag) {
      switch (tag) {
        case 'FE': feTasks++; break;
        case 'BE': beTasks++; break;
        case 'INT': intTasks++; break;
      }
    } else {
      untaggedTasks++;
      // Only report first few untagged tasks
      if (untaggedTasks <= 3) {
        issues.push(`Task missing tag: "${taskName.slice(0, 50)}..."`);
      }
    }
  }

  // Report summary if many untagged
  if (untaggedTasks > 3) {
    issues.push(`... and ${untaggedTasks - 3} more tasks missing tags`);
  }

  // Check for balance
  if (totalTasks > 0 && feTasks === 0) {
    issues.push('No frontend [FE] tasks found in fullstack plan');
  }
  if (totalTasks > 0 && beTasks === 0) {
    issues.push('No backend [BE] tasks found in fullstack plan');
  }
  if (totalTasks > 0 && intTasks === 0) {
    issues.push('No integration [INT] tasks found - consider adding integration tests');
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      totalTasks,
      feTasks,
      beTasks,
      intTasks,
      untaggedTasks,
    },
  };
}

/**
 * Extract task description from content following a task header
 *
 * @param content - Content following the task header
 * @returns Extracted description
 */
function extractTaskDescription(content: string): string {
  // Look for Description field or first paragraph
  const descMatch = content.match(/\*\*Description\*\*:\s*(.+?)(?=\n\*\*|\n###|\n##|$)/is);
  if (descMatch) {
    return descMatch[1].trim().slice(0, 500);
  }

  // Use first non-empty line
  const lines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('-'));
  if (lines.length > 0) {
    return lines[0].trim().slice(0, 500);
  }

  return '';
}

/**
 * Extract acceptance criteria from task content
 *
 * @param content - Task content
 * @returns Array of acceptance criteria
 */
function extractAcceptanceCriteria(content: string): string[] {
  const criteria: string[] = [];

  // Look for Acceptance Criteria section
  const acMatch = content.match(/\*\*Acceptance Criteria\*\*:?\s*([\s\S]+?)(?=\n\*\*|\n###|\n##|$)/i);
  if (acMatch) {
    const acContent = acMatch[1];
    const bulletMatch = acContent.match(/^[-*]\s+(.+)$/gm);
    if (bulletMatch) {
      for (const bullet of bulletMatch) {
        const cleaned = bullet.replace(/^[-*]\s+/, '').trim();
        if (cleaned.length > 5) {
          criteria.push(cleaned);
        }
      }
    }
  }

  return criteria;
}

/**
 * Detect if a plan is actually Claude's thinking/conversation instead of a real plan
 * This happens when Claude outputs its reasoning instead of the plan content
 *
 * @param plan - The plan content
 * @returns Object indicating if garbage and why
 */
export function detectGarbagePlan(plan: string): { isGarbage: boolean; reason?: string } {
  const planLower = plan.toLowerCase();

  // Get just the first ~500 chars to check for intro meta-commentary
  // This is where Claude's "thinking" typically appears
  const planStart = planLower.slice(0, 500);

  // Phrases that indicate Claude's thinking when at the START of output
  // These are problematic only in the intro, not in plan content
  const introGarbagePhrases = [
    'let me ',
    'i will ',
    'i\'ll ',
    'now i have',
    'i now have',
    'let me launch',
    'let me create',
    'let me write',
    'let me analyze',
    'based on my analysis',
    'before i proceed',
    'i\'ve created',
    'i\'ve analyzed',
    'i should ',
    'i need to',
    'first, i',
  ];

  // Check only the intro for thinking phrases
  for (const phrase of introGarbagePhrases) {
    if (planStart.includes(phrase)) {
      return {
        isGarbage: true,
        reason: `Plan starts with Claude's thinking ("${phrase}") instead of actual plan content`,
      };
    }
  }

  // These phrases indicate the plan was saved elsewhere, not output directly
  // Check the entire plan for these since they're unambiguous meta-commentary
  const metaCommentaryPhrases = [
    'the plan is saved',
    'the plan has been saved',
    'i\'ve saved the plan',
    'plan saved to',
    'saved the plan to',
    'created the plan at',
    'plan is now available at',
    '.claude/plans/',  // Reference to Claude's internal plan storage
  ];

  for (const phrase of metaCommentaryPhrases) {
    if (planLower.includes(phrase)) {
      return {
        isGarbage: true,
        reason: `Plan contains meta-commentary ("${phrase}") instead of actual plan content`,
      };
    }
  }

  // Check if plan has actual structure
  const hasTaskHeaders = /^#{2,4}\s*Task\s+[\d.]+/im.test(plan);
  const hasMilestoneHeaders = /^#{1,3}\s*Milestone\s+\d/im.test(plan);
  const hasActionableBullets = /^[-*]\s+(implement|create|build|add|set up|configure|design|write)/im.test(plan);

  if (!hasTaskHeaders && !hasMilestoneHeaders && !hasActionableBullets) {
    // Check if it at least has some structure
    const hasAnyHeaders = /^#{1,4}\s+.+$/m.test(plan);
    const hasBulletPoints = /^[-*+]\s+.+$/m.test(plan);

    if (!hasAnyHeaders && !hasBulletPoints) {
      return {
        isGarbage: true,
        reason: 'Plan has no recognizable structure (no headers, no bullet points)',
      };
    }
  }

  return { isGarbage: false };
}

/**
 * Parse milestones and tasks from a plan
 * Extracts only actionable implementation tasks, not plan metadata
 *
 * @param plan - The plan content
 * @returns Parsed milestones with tasks
 */
export function parsePlanMilestones(plan: string): Omit<Milestone, 'id'>[] {
  const milestones: Omit<Milestone, 'id'>[] = [];

  // First pass: Look for explicit task markers per the spec format
  // Format: "### Task [M].N: [Title]" or "Task N: [Title]"
  const explicitTaskPattern = /^#{2,4}\s*Task\s+(?:[\d.]+[:\s]+)?(.+)$/gim;
  const explicitTasks: Array<{ name: string; description: string; testPlan?: string }> = [];

  let taskMatch;
  const taskPositions: Array<{ name: string; index: number; endIndex: number }> = [];

  // Find all task headers
  while ((taskMatch = explicitTaskPattern.exec(plan)) !== null) {
    const name = taskMatch[1].trim()
      .replace(/^\*\*(.+)\*\*$/, '$1')  // Remove bold
      .replace(/^:/, '')                 // Remove leading colon
      .trim();

    if (name.length > 3 && isActionableTask(name)) {
      taskPositions.push({
        name,
        index: taskMatch.index + taskMatch[0].length,
        endIndex: plan.length,  // Will be updated
      });
    }
  }

  // Update end indices
  for (let i = 0; i < taskPositions.length - 1; i++) {
    taskPositions[i].endIndex = taskPositions[i + 1].index - 50;  // Approximate
  }

  // Extract task details
  for (const pos of taskPositions) {
    const content = plan.slice(pos.index, pos.endIndex);
    const description = extractTaskDescription(content);
    const criteria = extractAcceptanceCriteria(content);

    explicitTasks.push({
      name: pos.name,
      description: description || pos.name,
      testPlan: criteria.length > 0 ? criteria.join('\n') : undefined,
    });
  }

  // Second pass: Look for milestone sections containing implementation tasks
  const milestoneSectionPattern = /^#{1,3}\s*(?:Milestone|Phase|Sprint|Stage)\s*[\d.]*[:\s]+(.+)$/gim;
  const milestoneMatches: Array<{ name: string; index: number }> = [];

  let msMatch;
  while ((msMatch = milestoneSectionPattern.exec(plan)) !== null) {
    milestoneMatches.push({
      name: msMatch[1].trim().replace(/^\*\*(.+)\*\*$/, '$1'),
      index: msMatch.index,
    });
  }

  // Third pass: If no explicit tasks found, look for actionable bullet points
  if (explicitTasks.length === 0) {
    // Look for bullet points that start with actionable verbs
    const bulletPattern = /^[-*+]\s+(.+)$/gm;
    let bulletMatch;

    while ((bulletMatch = bulletPattern.exec(plan)) !== null) {
      const taskName = bulletMatch[1].trim()
        .replace(/^\*\*(.+)\*\*:?\s*/, '$1: ')
        .replace(/\*\*(.+)\*\*/g, '$1')
        .slice(0, 200);

      if (taskName.length >= 10 && isActionableTask(taskName)) {
        explicitTasks.push({
          name: taskName,
          description: taskName,
        });
      }
    }
  }

  // Fourth pass: If still no tasks, look for numbered implementation items
  if (explicitTasks.length === 0) {
    const numberedPattern = /^\d+[.)]\s+(.+)$/gm;
    let numMatch;

    while ((numMatch = numberedPattern.exec(plan)) !== null) {
      const taskName = numMatch[1].trim()
        .replace(/^\*\*(.+)\*\*:?\s*/, '$1: ')
        .replace(/\*\*(.+)\*\*/g, '$1')
        .slice(0, 200);

      if (taskName.length >= 10 && isActionableTask(taskName)) {
        explicitTasks.push({
          name: taskName,
          description: taskName,
        });
      }
    }
  }

  // Build milestones from collected data
  if (milestoneMatches.length > 0 && explicitTasks.length > 0) {
    // Distribute tasks to milestones based on position
    const tasksPerMilestone = Math.ceil(explicitTasks.length / milestoneMatches.length);

    for (let i = 0; i < milestoneMatches.length; i++) {
      const startIdx = i * tasksPerMilestone;
      const endIdx = Math.min(startIdx + tasksPerMilestone, explicitTasks.length);
      const milestoneTasks = explicitTasks.slice(startIdx, endIdx);

      if (milestoneTasks.length > 0) {
        milestones.push({
          name: milestoneMatches[i].name,
          description: `Implementation phase ${i + 1}`,
          tasks: milestoneTasks as Task[],
          status: 'pending',
        });
      }
    }
  } else if (explicitTasks.length > 0) {
    // No milestone headers found, group tasks into phases
    const tasksPerMilestone = 5;
    for (let i = 0; i < explicitTasks.length; i += tasksPerMilestone) {
      const milestoneTasks = explicitTasks.slice(i, i + tasksPerMilestone);
      const milestoneNum = Math.floor(i / tasksPerMilestone) + 1;

      milestones.push({
        name: `Implementation Phase ${milestoneNum}`,
        description: `Tasks ${i + 1} to ${Math.min(i + tasksPerMilestone, explicitTasks.length)}`,
        tasks: milestoneTasks as Task[],
        status: 'pending',
      });
    }
  } else {
    // Fifth pass: Look for any headers that might be tasks (less strict matching)
    const anyHeaderPattern = /^#{2,4}\s+(.+)$/gm;
    const headerTasks: Array<{ name: string; description: string }> = [];
    let headerMatch;

    while ((headerMatch = anyHeaderPattern.exec(plan)) !== null) {
      const name = headerMatch[1].trim()
        .replace(/^\*\*(.+)\*\*$/, '$1')
        .replace(/^[:*-]\s*/, '');

      // Skip obvious non-task headers
      const skipPatterns = [
        /^(background|context|overview|introduction|summary)/i,
        /^(goal|objective|requirement|risk|assumption)/i,
        /^(timeline|schedule|test plan|acceptance)/i,
        /^(table of contents|toc|appendix|reference)/i,
        /^(project|specification|design|architecture)$/i,
      ];

      const shouldSkip = skipPatterns.some(p => p.test(name));

      if (!shouldSkip && name.length >= 5 && name.length <= 200) {
        headerTasks.push({
          name: name.slice(0, 100),
          description: name,
        });
      }
    }

    if (headerTasks.length >= 2) {
      // Use headers as tasks, grouped into milestones
      const tasksPerMilestone = 5;
      for (let i = 0; i < headerTasks.length; i += tasksPerMilestone) {
        const milestoneTasks = headerTasks.slice(i, i + tasksPerMilestone);
        const milestoneNum = Math.floor(i / tasksPerMilestone) + 1;

        milestones.push({
          name: `Implementation Phase ${milestoneNum}`,
          description: `Tasks ${i + 1} to ${Math.min(i + tasksPerMilestone, headerTasks.length)}`,
          tasks: milestoneTasks as Task[],
          status: 'pending',
        });
      }
    } else {
      // Sixth pass: Parse any section with implementation keywords
      const implKeywords = [
        'implement', 'create', 'build', 'add', 'develop', 'write',
        'set up', 'configure', 'design', 'test', 'api', 'component',
        'service', 'module', 'function', 'class', 'feature',
        'database', 'model', 'controller', 'view', 'route', 'endpoint',
      ];

      const lines = plan.split('\n');
      const implTasks: Array<{ name: string; description: string }> = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 10 || trimmed.length > 200) continue;

        const hasKeyword = implKeywords.some(kw =>
          trimmed.toLowerCase().includes(kw)
        );

        // Check if it looks like an item (starts with bullet, number, or header)
        const isItem = /^[-*+#\d.]/.test(trimmed) ||
                      /^(Task|Step|Item|Feature|Component)/i.test(trimmed);

        if (hasKeyword && isItem) {
          const name = trimmed
            .replace(/^[-*+#]+\s*/, '')
            .replace(/^\d+[.)]\s*/, '')
            .replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ')
            .slice(0, 100);

          if (name.length >= 10 && !implTasks.some(t => t.name === name)) {
            implTasks.push({
              name,
              description: name,
            });
          }
        }
      }

      if (implTasks.length > 0) {
        // Group implementation tasks
        const tasksPerMilestone = 5;
        for (let i = 0; i < implTasks.length; i += tasksPerMilestone) {
          const milestoneTasks = implTasks.slice(i, i + tasksPerMilestone);
          const milestoneNum = Math.floor(i / tasksPerMilestone) + 1;

          milestones.push({
            name: `Implementation Phase ${milestoneNum}`,
            description: `Tasks ${i + 1} to ${Math.min(i + tasksPerMilestone, implTasks.length)}`,
            tasks: milestoneTasks as Task[],
            status: 'pending',
          });
        }
      } else {
        // Final fallback: Create structured tasks based on common project phases
        // This should rarely happen if the plan is well-structured
        console.warn('[plan-parser] Warning: Could not parse tasks from plan. Using default structure.');

        milestones.push({
          name: 'Core Implementation',
          description: 'Implement core functionality based on the plan',
          tasks: [
            {
              name: 'Set up project structure and dependencies',
              description: 'Initialize project with required structure, dependencies, and configuration',
            },
            {
              name: 'Implement core features',
              description: 'Build the main features as described in the development plan',
            },
            {
              name: 'Add data models and storage',
              description: 'Create data models, database schema, and storage layer',
            },
          ] as Task[],
          status: 'pending',
        });

        milestones.push({
          name: 'Integration and Testing',
          description: 'Connect components and verify functionality',
          tasks: [
            {
              name: 'Integrate components',
              description: 'Connect all components and ensure they work together',
            },
            {
              name: 'Write and run tests',
              description: 'Create unit tests, integration tests, and verify all tests pass',
            },
            {
              name: 'Final verification and documentation',
              description: 'Run final verification, update documentation, ensure project works correctly',
            },
          ] as Task[],
          status: 'pending',
        });
      }
    }
  }

  return milestones;
}

/**
 * Run the complete plan mode workflow
 *
 * @param spec - The project specification
 * @param options - Plan mode options
 * @returns Plan mode result
 */
export async function runPlanMode(
  spec: ProjectSpec,
  options: PlanModeOptions
): Promise<PlanModeResult> {
  const { projectDir, consensusConfig, additionalContext, onProgress } = options;

  // Initialize workflow logger
  const logger = getWorkflowLogger(projectDir);

  try {
    // Create or load project
    onProgress?.('plan-init', 'Initializing project...');
    await logger.stageStart('init', 'Plan Mode initialization', {
      projectName: spec.name,
      language: spec.language,
      idea: spec.idea.slice(0, 200),
    });

    let state: ProjectState;
    try {
      state = await loadProject(projectDir);
      onProgress?.('plan-init', 'Loaded existing project');
      await logger.info('init', 'project_loaded', 'Loaded existing project', {
        projectName: state.name,
        phase: state.phase,
        hasPlan: !!state.plan,
        hasSpecification: !!state.specification,
      });
    } catch {
      state = await createProject(spec, projectDir);
      onProgress?.('plan-init', 'Created new project');
      await logger.success('init', 'project_created', 'Created new project', {
        projectName: state.name,
        language: state.language,
      });
    }

    // Expand idea if we don't have a specification
    if (!state.specification) {
      onProgress?.('expand-idea', 'Expanding idea into specification...');
      await logger.stageStart('plan-generation', 'Expanding idea into specification');

      const specification = await expandIdea(
        spec.idea,
        spec.language,
        (msg) => onProgress?.('expand-idea', msg)
      );

      state = await storeSpecification(projectDir, specification);
      onProgress?.('expand-idea', 'Specification complete');
      await logger.stageComplete('plan-generation', 'Specification created', {
        specificationLength: specification.length,
        specificationPreview: specification.slice(0, 300),
      });
    }

    // Design UI early in the process
    onProgress?.('ui-design', 'Designing UI from project idea...');
    try {
      const uiSpec = await designUI(spec.idea, (msg) => onProgress?.('ui-design', msg));
      await saveUISpecification(projectDir, uiSpec);
      onProgress?.('ui-design', `UI design complete: ${uiSpec.themeName} theme, ${uiSpec.recommendedComponents.length} components`);
      await logger.success('ui-design', 'ui_design_complete', 'UI design specification created', {
        theme: uiSpec.themeName,
        projectType: uiSpec.projectType,
        components: uiSpec.recommendedComponents.length,
      });
    } catch (uiError) {
      // Non-blocking - UI design failures shouldn't stop the workflow
      onProgress?.('ui-design', `UI design skipped: ${uiError instanceof Error ? uiError.message : 'Unknown error'}`);
      await logger.warn('ui-design', 'ui_design_skipped', 'UI design was skipped', {
        error: uiError instanceof Error ? uiError.message : 'Unknown error',
      });
    }

    // Get project context
    onProgress?.('get-context', 'Gathering project context...');
    let context = await getProjectContext(
      projectDir,
      (msg) => onProgress?.('get-context', msg)
    );

    // Append additional context if provided (e.g., when resuming with guidance)
    if (additionalContext) {
      onProgress?.('get-context', 'Incorporating additional guidance...');
      context = `${context}\n\nADDITIONAL GUIDANCE FROM USER:\n${additionalContext}`;
    }

    // Create initial plan if we don't have one
    if (!state.plan) {
      onProgress?.('create-plan', 'Creating development plan...');
      await logger.stageStart('plan-generation', 'Creating development plan');

      const plan = await createPlan(
        state.specification!,
        context,
        spec.language,
        (msg) => onProgress?.('create-plan', msg)
      );

      state = await storePlan(projectDir, plan);
      onProgress?.('create-plan', 'Initial plan created');
      await logger.stageComplete('plan-generation', 'Development plan created', {
        planLength: plan.length,
        planPreview: plan.slice(0, 500),
      });

      // Validate fullstack plan structure
      if (isWorkspace(spec.language)) {
        onProgress?.('create-plan', 'Validating fullstack plan structure...');
        const validation = validateFullstackPlan(plan);

        await logger.info('plan-generation', 'fullstack_validation', 'Fullstack plan validation', {
          valid: validation.valid,
          stats: validation.stats,
          issueCount: validation.issues.length,
        });

        if (!validation.valid) {
          onProgress?.('create-plan', `Fullstack plan validation warnings: ${validation.issues.length} issues`);
          for (const issue of validation.issues.slice(0, 3)) {
            onProgress?.('create-plan', `  - ${issue}`);
          }
        } else {
          onProgress?.('create-plan', `Fullstack plan validated: ${validation.stats.feTasks} FE, ${validation.stats.beTasks} BE, ${validation.stats.intTasks} INT tasks`);
        }
      }
    }

    // Run consensus loop
    onProgress?.('consensus', 'Starting consensus review...');
    await logger.stageStart('consensus', 'Starting consensus review process');

    const consensusResult = await iterateUntilConsensus(
      state.plan!,
      context,
      {
        projectDir,
        config: consensusConfig,
        isFullstack: isWorkspace(spec.language),
        language: spec.language,
        onIteration: (iteration, result) => {
          onProgress?.(
            'consensus',
            `Iteration ${iteration}: Score ${result.score}%`
          );
        },
        onRevision: (iteration, _plan) => {
          onProgress?.('consensus', `Revising plan (iteration ${iteration})...`);
        },
        onConcerns: (concerns, recommendations) => {
          if (concerns.length > 0) {
            onProgress?.('concerns', `Concerns: ${concerns.slice(0, 2).join('; ')}`);
          }
          if (recommendations.length > 0) {
            onProgress?.('recommendations', `Suggestions: ${recommendations.slice(0, 2).join('; ')}`);
          }
        },
        onArbitration: (result) => {
          onProgress?.('arbitration', `Arbitrator decision: ${result.approved ? 'APPROVED' : 'REVISE'} (${result.score}%)`);
          if (!result.approved && result.suggestedChanges.length > 0) {
            onProgress?.('arbitration', `Changes: ${result.suggestedChanges.slice(0, 2).join('; ')}`);
          }
        },
        onProgress,
      }
    );

    // Log consensus result
    await logger.info('consensus', 'consensus_complete', 'Consensus process completed', {
      approved: consensusResult.approved,
      finalScore: consensusResult.finalScore,
      bestScore: consensusResult.bestScore,
      totalIterations: consensusResult.totalIterations,
      arbitrated: consensusResult.arbitrated,
    });

    // Check if the plan is garbage (Claude's thinking instead of actual content)
    const garbageCheck = detectGarbagePlan(consensusResult.bestPlan);
    if (garbageCheck.isGarbage) {
      onProgress?.(
        'error',
        `PLAN VALIDATION FAILED: ${garbageCheck.reason}`
      );
      onProgress?.(
        'error',
        'The plan contains Claude\'s thinking/conversation instead of actual plan content.'
      );
      onProgress?.(
        'info',
        'This typically happens when Claude describes what it will do instead of outputting the plan.'
      );
      onProgress?.(
        'info',
        'Saving garbage plan for debugging. Try running again or provide more specific requirements.'
      );

      // Still save the plan for debugging
      await documentPlan(projectDir, consensusResult.bestPlan, 'PLAN-FAILED.md');

      await logger.stageFailed('plan-parsing', 'Plan validation', garbageCheck.reason!, {
        planLength: consensusResult.bestPlan.length,
        reason: garbageCheck.reason,
      });

      return {
        success: false,
        state,
        consensusResult,
        error: `Plan generation failed: ${garbageCheck.reason}`,
      };
    }

    // Always store the best plan (even if consensus failed)
    state = await storePlan(projectDir, consensusResult.bestPlan);

    // Parse and add milestones from best plan
    await logger.stageStart('plan-parsing', 'Parsing plan into milestones and tasks');
    const milestones = parsePlanMilestones(consensusResult.bestPlan);

    // Log parsed milestones for debugging
    const totalTasks = milestones.reduce((sum, m) => sum + m.tasks.length, 0);
    onProgress?.(
      'plan-structure',
      `Parsed plan: ${milestones.length} milestones, ${totalTasks} tasks`
    );

    // Log detailed parsing results
    const parsedMilestones = milestones.map(m => ({
      name: m.name,
      taskCount: m.tasks.length,
      taskNames: m.tasks.map(t => t.name),
    }));
    await logger.info('plan-parsing', 'plan_parsed', 'Parsed plan structure', {
      milestonesCount: milestones.length,
      totalTasks: totalTasks,
      milestones: parsedMilestones,
    });

    // VALIDATION: Fail if too few milestones/tasks for a real project
    if (milestones.length <= 1 && totalTasks <= 2) {
      onProgress?.(
        'error',
        `PLAN VALIDATION FAILED: Only ${milestones.length} milestone(s) and ${totalTasks} task(s) extracted.`
      );
      onProgress?.(
        'error',
        'A valid plan should have at least 2 milestones with 3+ tasks each.'
      );
      onProgress?.(
        'info',
        'Expected format: "## Milestone N: Name" and "### Task N.N: Name"'
      );

      // Save the problematic plan for debugging
      await documentPlan(projectDir, consensusResult.bestPlan, 'PLAN-INSUFFICIENT.md');

      // Show what was found in the plan
      onProgress?.('debug', 'Tasks extracted from plan:');
      for (const m of milestones) {
        for (const t of m.tasks) {
          onProgress?.('debug', `  - ${t.name}`);
        }
      }

      await logger.stageFailed('plan-parsing', 'Plan validation', 'Insufficient tasks extracted', {
        milestonesCount: milestones.length,
        totalTasks: totalTasks,
        expectedMinTasks: 3,
        extractedTasks: milestones.flatMap(m => m.tasks.map(t => t.name)),
      });

      return {
        success: false,
        state,
        consensusResult,
        error: `Plan parsing failed: only ${totalTasks} task(s) extracted. Plan needs more structure.`,
      };
    }

    // Warn if suspiciously few tasks (but don't block)
    if (milestones.length <= 2 || totalTasks <= 5) {
      onProgress?.(
        'warning',
        `Warning: Only ${milestones.length} milestone(s) and ${totalTasks} task(s) parsed. ` +
        `This seems low for a complete project. Consider reviewing the plan.`
      );
    }

    // Log each milestone and its tasks
    for (const milestone of milestones) {
      onProgress?.(
        'plan-detail',
        `  Milestone: ${milestone.name} (${milestone.tasks.length} tasks)`
      );
      for (const task of milestone.tasks.slice(0, 3)) {
        onProgress?.('plan-detail', `    - ${task.name}`);
      }
      if (milestone.tasks.length > 3) {
        onProgress?.('plan-detail', `    ... and ${milestone.tasks.length - 3} more tasks`);
      }
    }

    state = await addMilestones(projectDir, milestones);

    // Always document the plan (so user can see what was achieved)
    const planFilename = consensusResult.approved ? 'PLAN.md' : 'PLAN-DRAFT.md';
    await documentPlan(projectDir, consensusResult.bestPlan, planFilename);

    if (consensusResult.approved) {
      // Transition to execution phase
      state = await setPhase(projectDir, 'execution');

      if (consensusResult.arbitrated) {
        onProgress?.('complete', `Plan approved via arbitration with ${consensusResult.finalScore}% confidence`);
      } else {
        onProgress?.('complete', `Plan approved with ${consensusResult.finalScore}% consensus`);
      }
      onProgress?.('info', `Plan saved to docs/PLAN.md`);

      await logger.stageComplete('plan-generation', 'Plan Mode completed successfully', {
        consensusScore: consensusResult.finalScore,
        arbitrated: consensusResult.arbitrated,
        milestonesCount: milestones.length,
        totalTasks: totalTasks,
        nextPhase: 'execution',
      });
    } else {
      // Show why consensus failed
      onProgress?.(
        'failed',
        `Consensus not reached after ${consensusResult.totalIterations} iterations (best: ${consensusResult.bestScore}% at iteration ${consensusResult.bestIteration})`
      );

      // Show remaining concerns
      if (consensusResult.finalConcerns.length > 0) {
        onProgress?.('concerns', `Remaining concerns:`);
        for (const concern of consensusResult.finalConcerns.slice(0, 3)) {
          onProgress?.('concerns', `  - ${concern}`);
        }
      }

      // Show recommendations
      if (consensusResult.finalRecommendations.length > 0) {
        onProgress?.('recommendations', `Recommendations:`);
        for (const rec of consensusResult.finalRecommendations.slice(0, 3)) {
          onProgress?.('recommendations', `  - ${rec}`);
        }
      }

      onProgress?.('info', `Draft plan saved to docs/${planFilename}`);

      await logger.warn('plan-generation', 'consensus_failed', 'Plan Mode incomplete - consensus not reached', {
        bestScore: consensusResult.bestScore,
        totalIterations: consensusResult.totalIterations,
        finalConcerns: consensusResult.finalConcerns,
        finalRecommendations: consensusResult.finalRecommendations,
      });
    }

    return {
      success: consensusResult.approved,
      state,
      consensusResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.('error', errorMessage);

    // Log the error
    await logger.stageFailed('plan-generation', 'Plan Mode execution', errorMessage, {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      state: await loadProject(projectDir).catch(() => ({} as ProjectState)),
      error: errorMessage,
    };
  }
}

/**
 * Resume plan mode from where it left off
 *
 * @param projectDir - The project directory
 * @param options - Plan mode options
 * @returns Plan mode result
 */
export async function resumePlanMode(
  projectDir: string,
  options: Omit<PlanModeOptions, 'projectDir'>
): Promise<PlanModeResult> {
  const state = await loadProject(projectDir);

  return runPlanMode(
    {
      idea: state.idea,
      name: state.name,
      language: state.language,
      openaiModel: state.openaiModel,
    },
    {
      ...options,
      projectDir,
    }
  );
}
