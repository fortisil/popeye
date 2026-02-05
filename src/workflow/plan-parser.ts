/**
 * Plan parsing utilities for task tagging and validation
 * Parses [FE], [BE], [WEB], [INT] tags from plan content
 */

import type { OutputLanguage } from '../types/project.js';

/**
 * Task app tags for workspace projects
 */
export type TaskAppTag = 'FE' | 'BE' | 'WEB' | 'INT';

/**
 * App target derived from task tag
 */
export type AppTarget = 'frontend' | 'backend' | 'website' | 'unified';

/**
 * Parsed task with app context
 */
export interface ParsedTask {
  name: string;
  description?: string;
  appTag?: TaskAppTag;
  appTarget?: AppTarget;
  files?: string[];
  dependencies?: string[];
  acceptanceCriteria?: string[];
}

/**
 * Parse task tag from task name
 *
 * @param taskName - Task name potentially containing [FE], [BE], [WEB], [INT]
 * @returns The parsed tag or undefined
 */
export function parseTaskTag(taskName: string): TaskAppTag | undefined {
  const tagMatch = taskName.match(/\[(FE|BE|WEB|INT)\]/i);
  if (tagMatch) {
    return tagMatch[1].toUpperCase() as TaskAppTag;
  }
  return undefined;
}

/**
 * Convert task tag to app target
 *
 * @param tag - The task tag
 * @returns The app target
 */
export function tagToAppTarget(tag: TaskAppTag): AppTarget {
  const mapping: Record<TaskAppTag, AppTarget> = {
    FE: 'frontend',
    BE: 'backend',
    WEB: 'website',
    INT: 'unified',
  };
  return mapping[tag];
}

/**
 * Validation issues for a task
 */
export interface TaskValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Validate a task has proper app targeting for workspace projects
 *
 * @param task - The parsed task
 * @param hasWebsite - Whether the project includes a website app
 * @returns Validation result with issues
 */
export function validateWorkspaceTask(
  task: ParsedTask,
  hasWebsite: boolean = false
): TaskValidationResult {
  const issues: string[] = [];

  const validTags = hasWebsite
    ? '[FE], [BE], [WEB], or [INT]'
    : '[FE], [BE], or [INT]';

  if (!task.appTag) {
    issues.push(`Task "${task.name}" missing ${validTags} tag`);
  }

  // Validate consistency between tag and appTarget
  if (task.appTag && task.appTarget) {
    const expectedTarget = tagToAppTarget(task.appTag);
    if (task.appTarget !== expectedTarget) {
      issues.push(
        `Task "${task.name}" has [${task.appTag}] tag but App: is "${task.appTarget}" (expected "${expectedTarget}")`
      );
    }
  }

  // Validate file paths match app
  if (task.files && task.appTag) {
    const pathValidation: Record<TaskAppTag, { pattern: RegExp; expected: string }> = {
      FE: { pattern: /\/frontend\//, expected: 'apps/frontend/' },
      BE: { pattern: /\/backend\//, expected: 'apps/backend/' },
      WEB: { pattern: /\/website\//, expected: 'apps/website/' },
      INT: { pattern: /.*/, expected: 'any (unified)' },
    };

    const { pattern, expected } = pathValidation[task.appTag];

    // Only validate FE/BE/WEB, not INT
    if (task.appTag !== 'INT') {
      const invalidFiles = task.files.filter((f) => !pattern.test(f));
      if (invalidFiles.length > 0) {
        issues.push(
          `[${task.appTag}] task has files outside ${expected}: ${invalidFiles.join(', ')}`
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Parse a task block from plan content
 *
 * @param taskBlock - The raw task block text
 * @returns Parsed task
 */
export function parseTaskBlock(taskBlock: string): ParsedTask {
  const lines = taskBlock.split('\n');

  // Extract task name from first line (### Task X.X [TAG]: Name)
  const titleMatch = lines[0].match(/#{1,4}\s*(?:Task\s+\d+(?:\.\d+)?)?[:\s]*(.+)/i);
  const name = titleMatch ? titleMatch[1].trim() : lines[0].trim();

  const task: ParsedTask = {
    name,
    appTag: parseTaskTag(name),
  };

  // Parse App field
  const appMatch = taskBlock.match(/\*\*App\*\*:\s*(\w+)/i);
  if (appMatch) {
    task.appTarget = appMatch[1].toLowerCase() as AppTarget;
  } else if (task.appTag) {
    // Derive from tag if App field not found
    task.appTarget = tagToAppTarget(task.appTag);
  }

  // Parse Files field
  const filesMatch = taskBlock.match(/\*\*Files\*\*:([\s\S]*?)(?=\*\*|$)/i);
  if (filesMatch) {
    const filesContent = filesMatch[1];
    const fileMatches = filesContent.match(/`([^`]+)`/g);
    if (fileMatches) {
      task.files = fileMatches.map((f) => f.replace(/`/g, ''));
    }
  }

  // Parse Dependencies
  const depsMatch = taskBlock.match(/\*\*Dependencies\*\*:\s*(.+)/i);
  if (depsMatch && depsMatch[1].trim().toLowerCase() !== 'none') {
    task.dependencies = depsMatch[1]
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d);
  }

  // Parse Acceptance Criteria
  const criteriaMatch = taskBlock.match(/\*\*Acceptance Criteria\*\*:([\s\S]*?)(?=###|##|$)/i);
  if (criteriaMatch) {
    const criteriaContent = criteriaMatch[1];
    const criteriaItems = criteriaContent.match(/[-*[\]]\s*(.+)/g);
    if (criteriaItems) {
      task.acceptanceCriteria = criteriaItems.map((c) =>
        c.replace(/^[-*[\]x\s]+/i, '').trim()
      );
    }
  }

  return task;
}

/**
 * Extract all tasks from a plan
 *
 * @param planContent - The full plan markdown content
 * @returns Array of parsed tasks
 */
export function extractTasksFromPlan(planContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Match task blocks (### Task X.X or #### Task X.X)
  const taskBlockRegex = /#{3,4}\s*(?:Task\s+)?[\d.]+[^#]*?(?=#{2,4}|$)/gi;
  const matches = planContent.matchAll(taskBlockRegex);

  for (const match of matches) {
    if (match[0].trim()) {
      tasks.push(parseTaskBlock(match[0]));
    }
  }

  return tasks;
}

/**
 * Validate all tasks in a plan for workspace projects
 *
 * @param planContent - The full plan markdown content
 * @param language - The project language
 * @returns Validation results
 */
export function validatePlanTasks(
  planContent: string,
  language: OutputLanguage
): {
  valid: boolean;
  tasks: ParsedTask[];
  issues: string[];
  warnings: string[];
} {
  const isWorkspaceProject = ['fullstack', 'website', 'all'].includes(language);
  const hasWebsite = ['website', 'all'].includes(language);

  const tasks = extractTasksFromPlan(planContent);
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!isWorkspaceProject) {
    // Non-workspace projects don't require tagging
    return {
      valid: true,
      tasks,
      issues: [],
      warnings: [],
    };
  }

  // Validate each task
  for (const task of tasks) {
    const validation = validateWorkspaceTask(task, hasWebsite);
    if (!validation.valid) {
      // For now, treat as warnings rather than hard errors
      warnings.push(...validation.issues);
    }
  }

  // Check for minimum coverage
  if (language === 'fullstack' || language === 'all') {
    const feTasks = tasks.filter((t) => t.appTag === 'FE');
    const beTasks = tasks.filter((t) => t.appTag === 'BE');
    const intTasks = tasks.filter((t) => t.appTag === 'INT');

    if (feTasks.length === 0) {
      warnings.push('No [FE] frontend tasks found in plan');
    }
    if (beTasks.length === 0) {
      warnings.push('No [BE] backend tasks found in plan');
    }
    if (intTasks.length === 0) {
      warnings.push('No [INT] integration tasks found in plan');
    }
  }

  if (language === 'all') {
    const webTasks = tasks.filter((t) => t.appTag === 'WEB');
    if (webTasks.length === 0) {
      warnings.push('No [WEB] website tasks found in plan');
    }
  }

  return {
    valid: issues.length === 0,
    tasks,
    issues,
    warnings,
  };
}

/**
 * Get app-specific tasks from a parsed plan
 *
 * @param tasks - Array of parsed tasks
 * @param appTarget - The app target to filter by
 * @returns Filtered tasks
 */
export function getTasksByApp(tasks: ParsedTask[], appTarget: AppTarget): ParsedTask[] {
  return tasks.filter((t) => t.appTarget === appTarget);
}

/**
 * Get task counts by app from a parsed plan
 *
 * @param tasks - Array of parsed tasks
 * @returns Count of tasks per app
 */
export function getTaskCountsByApp(tasks: ParsedTask[]): Record<AppTarget, number> {
  const counts: Record<AppTarget, number> = {
    frontend: 0,
    backend: 0,
    website: 0,
    unified: 0,
  };

  for (const task of tasks) {
    if (task.appTarget) {
      counts[task.appTarget]++;
    }
  }

  return counts;
}
