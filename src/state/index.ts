/**
 * State management module
 * Provides high-level API for managing project state
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectState,
  Task,
  Milestone,
  TaskStatus,
  WorkflowPhase,
} from '../types/workflow.js';
import type { ConsensusIteration } from '../types/consensus.js';
import type { ProjectSpec } from '../types/project.js';
import {
  loadState,
  saveState,
  stateExists,
  deleteState,
  backupState,
} from './persistence.js';
import { registerProject, unregisterProject } from './registry.js';

// Re-export persistence utilities
export * from './persistence.js';
export * from './registry.js';

/**
 * Create a new project state
 *
 * @param spec - The project specification
 * @param projectDir - The project root directory
 * @returns The newly created project state
 */
export async function createProject(
  spec: ProjectSpec,
  projectDir: string
): Promise<ProjectState> {
  // Check if project already exists
  if (await stateExists(projectDir)) {
    throw new Error(`Project already exists at ${projectDir}. Use loadProject() instead.`);
  }

  const now = new Date().toISOString();

  const state: ProjectState = {
    id: uuidv4(),
    name: spec.name || 'untitled-project',
    idea: spec.idea,
    language: spec.language,
    openaiModel: spec.openaiModel,
    phase: 'plan',
    status: 'pending',
    milestones: [],
    currentMilestone: null,
    currentTask: null,
    consensusHistory: [],
    createdAt: now,
    updatedAt: now,
    qaEnabled: true,
  };

  await saveState(projectDir, state);

  // Register project in global registry
  await registerProject(projectDir);

  return state;
}

/**
 * Load an existing project
 *
 * @param projectDir - The project root directory
 * @returns The project state
 * @throws Error if project doesn't exist
 */
export async function loadProject(projectDir: string): Promise<ProjectState> {
  const state = await loadState(projectDir);

  if (!state) {
    throw new Error(`No project found at ${projectDir}. Use createProject() first.`);
  }

  return state;
}

/**
 * Check if a project exists at the given directory
 *
 * @param projectDir - The project root directory
 * @returns True if project exists
 */
export async function projectExists(projectDir: string): Promise<boolean> {
  return stateExists(projectDir);
}

/**
 * Update project state with partial updates
 *
 * @param projectDir - The project root directory
 * @param updates - Partial state updates
 * @returns The updated state
 */
export async function updateState(
  projectDir: string,
  updates: Partial<ProjectState>
): Promise<ProjectState> {
  const current = await loadProject(projectDir);

  const updated: ProjectState = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveState(projectDir, updated);

  // Update registry (async, don't wait)
  registerProject(projectDir).catch(() => {
    // Silently ignore registry update failures
  });

  return updated;
}

/**
 * Set the current workflow phase
 *
 * @param projectDir - The project root directory
 * @param phase - The new phase
 * @returns The updated state
 */
export async function setPhase(
  projectDir: string,
  phase: WorkflowPhase
): Promise<ProjectState> {
  return updateState(projectDir, { phase });
}

/**
 * Add milestones to the project
 *
 * @param projectDir - The project root directory
 * @param milestones - Milestones to add
 * @returns The updated state
 */
export async function addMilestones(
  projectDir: string,
  milestones: Omit<Milestone, 'id'>[]
): Promise<ProjectState> {
  const current = await loadProject(projectDir);

  const newMilestones: Milestone[] = milestones.map((m, index) => {
    const milestoneId = `milestone-${current.milestones.length + index + 1}`;

    // Ensure all tasks have proper IDs and status
    const tasksWithIds: Task[] = (m.tasks || []).map((t, taskIndex) => ({
      ...t,
      id: t.id || `${milestoneId}-task-${taskIndex + 1}`,
      status: t.status || ('pending' as TaskStatus),
      name: t.name || `Task ${taskIndex + 1}`,
      description: t.description || t.name || `Task ${taskIndex + 1}`,
    }));

    return {
      ...m,
      id: milestoneId,
      tasks: tasksWithIds,
      status: m.status || 'pending',
    };
  });

  return updateState(projectDir, {
    milestones: [...current.milestones, ...newMilestones],
  });
}

/**
 * Add tasks to a milestone
 *
 * @param projectDir - The project root directory
 * @param milestoneId - The milestone ID
 * @param tasks - Tasks to add
 * @returns The updated state
 */
export async function addTasks(
  projectDir: string,
  milestoneId: string,
  tasks: Omit<Task, 'id' | 'status' | 'testsPassed'>[]
): Promise<ProjectState> {
  const current = await loadProject(projectDir);

  const milestoneIndex = current.milestones.findIndex((m) => m.id === milestoneId);
  if (milestoneIndex === -1) {
    throw new Error(`Milestone ${milestoneId} not found`);
  }

  const milestone = current.milestones[milestoneIndex];
  const newTasks: Task[] = tasks.map((t, index) => ({
    ...t,
    id: `${milestoneId}-task-${milestone.tasks.length + index + 1}`,
    status: 'pending' as TaskStatus,
  }));

  const updatedMilestones = [...current.milestones];
  updatedMilestones[milestoneIndex] = {
    ...milestone,
    tasks: [...milestone.tasks, ...newTasks],
  };

  return updateState(projectDir, { milestones: updatedMilestones });
}

/**
 * Update a task's status
 *
 * @param projectDir - The project root directory
 * @param taskId - The task ID
 * @param status - The new status
 * @param additionalUpdates - Additional task updates
 * @returns The updated state
 */
export async function updateTaskStatus(
  projectDir: string,
  taskId: string,
  status: TaskStatus,
  additionalUpdates: Partial<Task> = {}
): Promise<ProjectState> {
  const current = await loadProject(projectDir);

  const updatedMilestones = current.milestones.map((milestone) => ({
    ...milestone,
    tasks: milestone.tasks.map((task) =>
      task.id === taskId ? { ...task, status, ...additionalUpdates } : task
    ),
  }));

  // Update milestone status if all tasks are complete
  const updatedMilestonesWithStatus = updatedMilestones.map((milestone) => {
    const allComplete = milestone.tasks.every((t) => t.status === 'complete');
    const anyInProgress = milestone.tasks.some((t) => t.status === 'in-progress');

    let milestoneStatus: TaskStatus = 'pending';
    if (allComplete) {
      milestoneStatus = 'complete';
    } else if (anyInProgress || milestone.tasks.some((t) => t.status === 'complete')) {
      milestoneStatus = 'in-progress';
    }

    return { ...milestone, status: milestoneStatus };
  });

  return updateState(projectDir, { milestones: updatedMilestonesWithStatus });
}

/**
 * Set the current milestone being worked on
 *
 * @param projectDir - The project root directory
 * @param milestoneId - The milestone ID (or null)
 * @returns The updated state
 */
export async function setCurrentMilestone(
  projectDir: string,
  milestoneId: string | null
): Promise<ProjectState> {
  if (milestoneId) {
    const current = await loadProject(projectDir);
    const milestone = current.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }
  }

  return updateState(projectDir, { currentMilestone: milestoneId });
}

/**
 * Set the current task being worked on
 *
 * @param projectDir - The project root directory
 * @param taskId - The task ID (or null)
 * @returns The updated state
 */
export async function setCurrentTask(
  projectDir: string,
  taskId: string | null
): Promise<ProjectState> {
  return updateState(projectDir, { currentTask: taskId });
}

/**
 * Record a consensus iteration
 *
 * @param projectDir - The project root directory
 * @param iteration - The consensus iteration to record
 * @returns The updated state
 */
export async function recordConsensusIteration(
  projectDir: string,
  iteration: ConsensusIteration
): Promise<ProjectState> {
  const current = await loadProject(projectDir);

  return updateState(projectDir, {
    consensusHistory: [...current.consensusHistory, iteration],
  });
}

/**
 * Store the approved plan
 *
 * @param projectDir - The project root directory
 * @param plan - The approved plan content
 * @returns The updated state
 */
export async function storePlan(
  projectDir: string,
  plan: string
): Promise<ProjectState> {
  return updateState(projectDir, { plan });
}

/**
 * Store the expanded specification
 *
 * @param projectDir - The project root directory
 * @param specification - The expanded specification
 * @returns The updated state
 */
export async function storeSpecification(
  projectDir: string,
  specification: string
): Promise<ProjectState> {
  return updateState(projectDir, { specification });
}

/**
 * Store discovered user documentation in project state
 *
 * @param projectDir - The project root directory
 * @param userDocs - Combined user documentation content
 * @returns The updated state
 */
export async function storeUserDocs(
  projectDir: string,
  userDocs: string
): Promise<ProjectState> {
  return updateState(projectDir, { userDocs });
}

/**
 * Store discovered source document paths in project state
 *
 * @param projectDir - The project root directory
 * @param sourceDocPaths - Array of absolute paths to doc files
 * @returns The updated state
 */
export async function storeSourceDocPaths(
  projectDir: string,
  sourceDocPaths: string[]
): Promise<ProjectState> {
  return updateState(projectDir, { sourceDocPaths });
}

/**
 * Store brand context in project state
 *
 * @param projectDir - The project root directory
 * @param brandContext - Brand context with logo path and primary color
 * @returns The updated state
 */
export async function storeBrandContext(
  projectDir: string,
  brandContext: { logoPath?: string; primaryColor?: string }
): Promise<ProjectState> {
  return updateState(projectDir, { brandContext });
}

/**
 * Store website strategy path in project state
 *
 * @param projectDir - The project root directory
 * @param strategyPath - Relative path to strategy JSON file
 * @returns The updated state
 */
export async function storeWebsiteStrategyPath(
  projectDir: string,
  strategyPath: string
): Promise<ProjectState> {
  return updateState(projectDir, { websiteStrategy: strategyPath });
}

/**
 * Mark the project as complete
 *
 * @param projectDir - The project root directory
 * @returns The updated state
 */
export async function completeProject(projectDir: string): Promise<ProjectState> {
  return updateState(projectDir, {
    status: 'complete',
    phase: 'complete',
  });
}

/**
 * Mark the project as failed
 *
 * @param projectDir - The project root directory
 * @param error - The error message
 * @returns The updated state
 */
export async function failProject(
  projectDir: string,
  error: string
): Promise<ProjectState> {
  return updateState(projectDir, {
    status: 'failed',
    error,
  });
}

/**
 * Get project progress summary
 *
 * @param projectDir - The project root directory
 * @returns Progress summary
 */
export async function getProgress(projectDir: string): Promise<{
  totalMilestones: number;
  completedMilestones: number;
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
}> {
  const state = await loadProject(projectDir);

  const totalMilestones = state.milestones.length;
  const completedMilestones = state.milestones.filter((m) => m.status === 'complete').length;

  const allTasks = state.milestones.flatMap((m) => m.tasks);
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.status === 'complete').length;

  const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalMilestones,
    completedMilestones,
    totalTasks,
    completedTasks,
    percentComplete,
  };
}

/**
 * Get the next pending task
 *
 * @param projectDir - The project root directory
 * @returns The next task to work on, or null if none
 */
export async function getNextTask(projectDir: string): Promise<{
  milestone: Milestone;
  task: Task;
} | null> {
  const state = await loadProject(projectDir);

  for (const milestone of state.milestones) {
    if (milestone.status === 'complete') continue;

    const pendingTask = milestone.tasks.find((t) => t.status === 'pending');
    if (pendingTask) {
      return { milestone, task: pendingTask };
    }
  }

  return null;
}

/**
 * Reset project to a specific phase
 *
 * @param projectDir - The project root directory
 * @param phase - The phase to reset to
 * @returns The updated state
 */
export async function resetToPhase(
  projectDir: string,
  phase: WorkflowPhase
): Promise<ProjectState> {
  // Create backup before reset
  await backupState(projectDir);

  const current = await loadProject(projectDir);

  const updates: Partial<ProjectState> = {
    phase,
    status: 'pending',
    error: undefined,
  };

  if (phase === 'plan') {
    // Reset everything
    updates.milestones = [];
    updates.currentMilestone = null;
    updates.currentTask = null;
    updates.plan = undefined;
  } else if (phase === 'execution') {
    // Reset task progress but keep milestones
    updates.milestones = current.milestones.map((m) => ({
      ...m,
      status: 'pending' as TaskStatus,
      tasks: m.tasks.map((t) => ({
        ...t,
        status: 'pending' as TaskStatus,
        testsPassed: undefined,
        error: undefined,
      })),
    }));
    updates.currentMilestone = null;
    updates.currentTask = null;
  }

  return updateState(projectDir, updates);
}

/**
 * Delete a project
 *
 * @param projectDir - The project root directory
 * @returns True if project was deleted
 */
export async function deleteProject(projectDir: string): Promise<boolean> {
  // Unregister from global registry
  await unregisterProject(projectDir);
  return deleteState(projectDir);
}

/**
 * Detailed progress analysis comparing plan vs actual status
 */
export interface ProjectProgressAnalysis {
  // Overall status
  isActuallyComplete: boolean;
  statusMismatch: boolean;  // true if status='complete' but work is incomplete
  planMismatch: boolean;    // true if plan file has more tasks than state

  // Milestone breakdown (from state)
  totalMilestones: number;
  completedMilestones: number;
  inProgressMilestones: number;
  pendingMilestones: number;

  // Task breakdown (from state)
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  failedTasks: number;

  // Plan file analysis
  planTaskCount: number;          // Tasks parsed from PLAN.md
  planMilestoneCount: number;     // Milestones parsed from PLAN.md
  planParseError?: string;        // Error if plan couldn't be read/parsed
  missingFromState: string[];     // Task names in plan but not in state

  // Percentage (based on plan task count if available, otherwise state)
  percentComplete: number;

  // Next items to work on
  nextMilestone?: { id: string; name: string };
  nextTask?: { id: string; name: string; milestone: string };

  // Summary for display
  progressSummary: string;

  // Incomplete items for detailed view
  incompleteMilestones: Array<{ id: string; name: string; tasksRemaining: number }>;
  incompleteTasks: Array<{ id: string; name: string; milestone: string; status: string }>;
}

/**
 * Parse plan file to count expected tasks and milestones
 * Uses multiple strategies to identify actionable tasks
 *
 * @param planContent - The plan markdown content
 * @returns Parsed task and milestone counts with task names
 */
function parsePlanForTaskCount(planContent: string): {
  milestoneCount: number;
  taskCount: number;
  taskNames: string[];
} {
  const taskNames: string[] = [];

  // Strategy 1: Look for explicit "Task N:" or "### Task" patterns
  const explicitTaskPattern = /^#{2,4}\s*Task\s+(?:[\d.]+)?[:\s]+(.+)$/gim;
  let match;
  while ((match = explicitTaskPattern.exec(planContent)) !== null) {
    const name = match[1].trim().replace(/^\*\*(.+)\*\*$/, '$1').slice(0, 100);
    if (name.length >= 5 && !taskNames.includes(name)) {
      taskNames.push(name);
    }
  }

  // Strategy 2: Look for actionable bullet points (Implement, Create, Build, etc.)
  const actionVerbs = [
    'implement', 'create', 'build', 'develop', 'write', 'add', 'set up', 'setup',
    'configure', 'install', 'integrate', 'design', 'define', 'establish',
    'generate', 'construct', 'deploy', 'test', 'validate', 'fix', 'update',
    'refactor', 'optimize', 'extend', 'enhance', 'modify', 'initialize',
  ];

  const bulletPattern = /^[-*+]\s+(.+)$/gm;
  while ((match = bulletPattern.exec(planContent)) !== null) {
    const text = match[1].trim().replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ');
    const textLower = text.toLowerCase();
    const startsWithAction = actionVerbs.some(verb =>
      textLower.startsWith(verb + ' ') || textLower.startsWith(verb + ':')
    );
    if (startsWithAction && text.length >= 10 && text.length <= 200 && !taskNames.includes(text)) {
      taskNames.push(text.slice(0, 100));
    }
  }

  // Strategy 3: Look for numbered items with actionable verbs
  const numberedPattern = /^\d+[.)]\s+(.+)$/gm;
  while ((match = numberedPattern.exec(planContent)) !== null) {
    const text = match[1].trim().replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ');
    const textLower = text.toLowerCase();
    const startsWithAction = actionVerbs.some(verb =>
      textLower.startsWith(verb + ' ') || textLower.startsWith(verb + ':')
    );
    if (startsWithAction && text.length >= 10 && text.length <= 200 && !taskNames.includes(text)) {
      taskNames.push(text.slice(0, 100));
    }
  }

  // Count milestones
  const milestonePattern = /^#{1,3}\s*(?:Milestone|Phase|Sprint|Stage)\s*[\d.]*[:\s]+/gim;
  const milestoneMatches = planContent.match(milestonePattern) || [];
  const milestoneCount = milestoneMatches.length || 1;

  return {
    milestoneCount,
    taskCount: taskNames.length,
    taskNames,
  };
}

/**
 * Read and parse the plan file from docs/PLAN.md
 *
 * @param projectDir - The project root directory
 * @returns Plan analysis or error
 */
async function readPlanFile(projectDir: string): Promise<{
  success: boolean;
  milestoneCount: number;
  taskCount: number;
  taskNames: string[];
  error?: string;
}> {
  const planPaths = [
    path.join(projectDir, 'docs', 'PLAN.md'),
    path.join(projectDir, 'docs', 'PLAN-DRAFT.md'),
  ];

  for (const planPath of planPaths) {
    try {
      const content = await fs.readFile(planPath, 'utf-8');
      const parsed = parsePlanForTaskCount(content);
      return {
        success: true,
        ...parsed,
      };
    } catch {
      // Try next path
    }
  }

  return {
    success: false,
    milestoneCount: 0,
    taskCount: 0,
    taskNames: [],
    error: 'No plan file found in docs/',
  };
}

/**
 * Analyze project progress in detail
 * Compares actual task/milestone completion against the plan file
 *
 * @param projectDir - The project root directory
 * @returns Detailed progress analysis
 */
export async function analyzeProjectProgress(projectDir: string): Promise<ProjectProgressAnalysis> {
  const state = await loadProject(projectDir);

  // Count milestone statuses from state
  const totalMilestones = state.milestones.length;
  const completedMilestones = state.milestones.filter(m => m.status === 'complete').length;
  const inProgressMilestones = state.milestones.filter(m => m.status === 'in-progress').length;
  const pendingMilestones = state.milestones.filter(m => m.status === 'pending').length;

  // Collect all tasks from state and count statuses
  const allTasks = state.milestones.flatMap(m =>
    m.tasks.map(t => ({ ...t, milestoneName: m.name, milestoneId: m.id }))
  );
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === 'complete').length;
  const inProgressTasks = allTasks.filter(t => t.status === 'in-progress').length;
  const pendingTasks = allTasks.filter(t => t.status === 'pending').length;
  const failedTasks = allTasks.filter(t => t.status === 'failed').length;

  // Read and parse the plan file for comparison
  const planAnalysis = await readPlanFile(projectDir);
  const planTaskCount = planAnalysis.taskCount;
  const planMilestoneCount = planAnalysis.milestoneCount;
  const planParseError = planAnalysis.error;

  // Find tasks in plan that are not in state
  const stateTaskNames = allTasks.map(t => t.name.toLowerCase());
  const missingFromState = planAnalysis.taskNames.filter(planTask => {
    const planTaskLower = planTask.toLowerCase();
    // Check if any state task is similar (contains or is contained)
    return !stateTaskNames.some(stateTask =>
      stateTask.includes(planTaskLower.slice(0, 20)) ||
      planTaskLower.includes(stateTask.slice(0, 20))
    );
  });

  // Check for plan mismatch - plan has significantly more tasks than state.
  // However, after an upgrade the plan file may contain stale tasks from the
  // previous project scope. If all current state tasks are already complete,
  // the plan file is outdated and should not block completion.
  const allStateTasksComplete = totalTasks > 0 && completedTasks === totalTasks;
  const planMismatch = planTaskCount > 0 &&
    planTaskCount > totalTasks * 1.5 &&
    !allStateTasksComplete; // Reason: post-upgrade plan file may contain old tasks

  // Calculate percentage - use plan task count if we have more tasks in plan
  const effectiveTotal = planMismatch ? planTaskCount : totalTasks;
  const percentComplete = effectiveTotal > 0
    ? Math.round((completedTasks / effectiveTotal) * 100)
    : 0;

  // Determine if actually complete - must match plan if plan has more tasks
  const isActuallyComplete = totalMilestones > 0 &&
    completedMilestones === totalMilestones &&
    completedTasks === totalTasks &&
    !planMismatch; // Can't be complete if plan has more tasks

  // Check for status mismatch
  const statusMismatch = (state.status === 'complete' || state.phase === 'complete') &&
    (!isActuallyComplete || planMismatch);

  // Find next items to work on
  let nextMilestone: { id: string; name: string } | undefined;
  let nextTask: { id: string; name: string; milestone: string } | undefined;

  for (const milestone of state.milestones) {
    if (milestone.status === 'complete') continue;

    if (!nextMilestone) {
      nextMilestone = { id: milestone.id, name: milestone.name };
    }

    for (const task of milestone.tasks) {
      if (task.status === 'pending' || task.status === 'in-progress' || task.status === 'failed') {
        if (!nextTask) {
          nextTask = { id: task.id, name: task.name, milestone: milestone.name };
        }
        break;
      }
    }

    if (nextTask) break;
  }

  // Collect incomplete items
  const incompleteMilestones = state.milestones
    .filter(m => m.status !== 'complete')
    .map(m => ({
      id: m.id,
      name: m.name,
      tasksRemaining: m.tasks.filter(t => t.status !== 'complete').length,
    }));

  const incompleteTasks = allTasks
    .filter(t => t.status !== 'complete')
    .slice(0, 20)
    .map(t => ({
      id: t.id,
      name: t.name,
      milestone: t.milestoneName,
      status: t.status,
    }));

  // Build progress summary
  let progressSummary: string;
  if (planMismatch) {
    progressSummary = `PLAN MISMATCH: State has ${completedTasks}/${totalTasks} tasks but plan has ${planTaskCount} tasks. ` +
      `Only ${percentComplete}% of plan completed.`;
  } else if (isActuallyComplete) {
    progressSummary = `All ${totalTasks} tasks complete across ${totalMilestones} milestones`;
  } else if (statusMismatch) {
    progressSummary = `WARNING: Status shows 'complete' but only ${completedTasks}/${effectiveTotal} tasks done (${percentComplete}%)`;
  } else {
    progressSummary = `${completedTasks}/${effectiveTotal} tasks complete (${percentComplete}%), ${completedMilestones}/${totalMilestones} milestones`;
  }

  return {
    isActuallyComplete,
    statusMismatch,
    planMismatch,
    totalMilestones,
    completedMilestones,
    inProgressMilestones,
    pendingMilestones,
    totalTasks,
    completedTasks,
    inProgressTasks,
    pendingTasks,
    failedTasks,
    planTaskCount,
    planMilestoneCount,
    planParseError,
    missingFromState,
    percentComplete,
    nextMilestone,
    nextTask,
    progressSummary,
    incompleteMilestones,
    incompleteTasks,
  };
}

/**
 * Verify if a project is actually complete
 * Returns true only if ALL milestones and ALL tasks are marked complete,
 * AND the plan file doesn't have more tasks than the state
 *
 * @param projectDir - The project root directory
 * @returns True if project is genuinely complete
 */
export async function verifyProjectCompletion(projectDir: string): Promise<{
  isComplete: boolean;
  reason?: string;
  progress: ProjectProgressAnalysis;
}> {
  const progress = await analyzeProjectProgress(projectDir);

  // Not complete if plan has more tasks than state
  if (progress.planMismatch) {
    return {
      isComplete: false,
      reason: `Plan mismatch: plan has ${progress.planTaskCount} tasks but state only has ${progress.totalTasks}. ` +
        `${progress.missingFromState.length} tasks from plan are missing.`,
      progress,
    };
  }

  if (progress.isActuallyComplete) {
    return {
      isComplete: true,
      progress,
    };
  }

  // Build reason for incompleteness
  let reason: string;
  if (progress.totalTasks === 0) {
    reason = 'No tasks defined in the project';
  } else if (progress.statusMismatch) {
    reason = `Status mismatch: ${progress.completedTasks}/${progress.totalTasks} tasks actually complete`;
  } else {
    reason = `${progress.pendingTasks + progress.inProgressTasks + progress.failedTasks} tasks remaining`;
  }

  return {
    isComplete: false,
    reason,
    progress,
  };
}

/**
 * Reset a falsely-completed project to allow resume
 * Used when status='complete' but work is incomplete
 *
 * @param projectDir - The project root directory
 * @returns Updated state
 */
export async function resetIncompleteProject(projectDir: string): Promise<ProjectState> {
  const verification = await verifyProjectCompletion(projectDir);

  if (verification.isComplete) {
    // Actually complete, no reset needed
    return loadProject(projectDir);
  }

  const progress = verification.progress;

  // Determine the correct phase
  let newPhase: 'plan' | 'execution' | 'complete' = 'execution';
  let newStatus: 'pending' | 'in-progress' | 'complete' | 'failed' = 'in-progress';

  if (progress.totalTasks === 0) {
    // No tasks - go back to plan phase
    newPhase = 'plan';
    newStatus = 'pending';
  } else if (progress.completedTasks > 0) {
    // Some work done - continue execution
    newPhase = 'execution';
    newStatus = 'in-progress';
  } else {
    // No work done yet
    newPhase = 'execution';
    newStatus = 'pending';
  }

  // Reset any failed tasks to pending for retry
  const current = await loadProject(projectDir);
  const updatedMilestones = current.milestones.map(m => ({
    ...m,
    // Reset milestone status if it was incorrectly marked complete
    status: m.tasks.every(t => t.status === 'complete')
      ? 'complete' as const
      : m.tasks.some(t => t.status === 'complete' || t.status === 'in-progress')
        ? 'in-progress' as const
        : 'pending' as const,
    tasks: m.tasks.map(t =>
      t.status === 'failed'
        ? { ...t, status: 'pending' as const, error: undefined }
        : t
    ),
  }));

  return updateState(projectDir, {
    phase: newPhase,
    status: newStatus,
    milestones: updatedMilestones,
    error: undefined,
  });
}

/**
 * Code quality check result
 */
export interface CodeQualityCheckResult {
  passed: boolean;
  totalSourceFiles: number;
  totalLinesOfCode: number;
  hasMainEntryPoint: boolean;
  mainEntryPointLines: number;
  hasTests: boolean;
  testFileCount: number;
  hasSubstantiveCode: boolean;
  warnings: string[];
  issues: string[];
}

/**
 * Verify that a project has actual, substantive code implementation
 * Not just scaffolding or "Hello World"
 *
 * @param projectDir - The project root directory
 * @returns Code quality verification result
 */
export async function verifyCodeImplementation(projectDir: string): Promise<CodeQualityCheckResult> {
  const warnings: string[] = [];
  const issues: string[] = [];

  let totalSourceFiles = 0;
  let totalLinesOfCode = 0;
  let hasMainEntryPoint = false;
  let mainEntryPointLines = 0;
  let hasTests = false;
  let testFileCount = 0;
  let hasSubstantiveCode = false;

  // Load project to get language
  const state = await loadProject(projectDir);
  const language = state.language;

  // Define file extensions for the language
  const sourceExtensions = language === 'python'
    ? ['.py']
    : ['.ts', '.tsx', '.js', '.jsx'];

  const testPatterns = language === 'python'
    ? ['test_', '_test.py', 'tests.py']
    : ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.test.jsx'];

  // Main entry point names
  const mainEntryNames = language === 'python'
    ? ['main.py', '__main__.py', 'app.py', 'index.py']
    : ['index.ts', 'index.tsx', 'main.ts', 'app.ts', 'index.js', 'main.js'];

  // Directories to check for source code
  const srcDirs = ['src', 'lib', 'app', '.'];

  try {
    // Count source files and lines
    for (const srcDir of srcDirs) {
      const dirPath = path.join(projectDir, srcDir);

      try {
        await fs.access(dirPath);
      } catch {
        continue; // Directory doesn't exist
      }

      // Recursively find source files
      const files = await findSourceFiles(dirPath, sourceExtensions);

      for (const file of files) {
        const relativePath = path.relative(projectDir, file);

        // Skip test files when counting source code
        const isTestFile = testPatterns.some(pattern =>
          path.basename(file).includes(pattern) ||
          relativePath.includes('/test/') ||
          relativePath.includes('/tests/')
        );

        if (isTestFile) {
          testFileCount++;
          hasTests = true;
          continue;
        }

        totalSourceFiles++;

        // Read file and count lines
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').filter(line =>
          line.trim() && !line.trim().startsWith('#') && !line.trim().startsWith('//')
        );
        totalLinesOfCode += lines.length;

        // Check if this is a main entry point (only flag the first one found,
        // not every index.ts barrel file in a monorepo)
        const basename = path.basename(file);
        if (!hasMainEntryPoint && mainEntryNames.includes(basename)) {
          hasMainEntryPoint = true;
          mainEntryPointLines = lines.length;

          // Check if main entry point has substantive code
          if (lines.length < 10) {
            issues.push(`Main entry point (${basename}) has only ${lines.length} lines - too minimal`);
          } else if (lines.length < 30) {
            warnings.push(`Main entry point (${basename}) has only ${lines.length} lines - may be incomplete`);
          }

          // Check for "hello world" only implementations
          const contentLower = content.toLowerCase();
          if (contentLower.includes('hello') &&
              (contentLower.includes('world') || contentLower.includes('from')) &&
              lines.length < 20) {
            issues.push(`Main entry point appears to be just a "Hello World" placeholder`);
          }
        }
      }
    }

    // Determine if code is substantive
    hasSubstantiveCode = totalLinesOfCode >= 50 && totalSourceFiles >= 2;

    // Add warnings/issues based on findings
    if (totalSourceFiles === 0) {
      issues.push('No source files found');
    } else if (totalSourceFiles === 1) {
      warnings.push('Only 1 source file found - project may be incomplete');
    }

    if (totalLinesOfCode < 30) {
      issues.push(`Only ${totalLinesOfCode} lines of code - project appears to be scaffolding only`);
    } else if (totalLinesOfCode < 100) {
      warnings.push(`Only ${totalLinesOfCode} lines of code - project may be minimal`);
    }

    if (!hasMainEntryPoint) {
      warnings.push('No main entry point file found');
    }

    if (!hasTests) {
      warnings.push('No test files found');
    }

    // Check if project has expected structure based on plan
    if (state.plan) {
      // Look for expected files mentioned in plan
      const planLower = state.plan.toLowerCase();
      const expectedPatterns = [
        { pattern: /api|endpoint|route/i, type: 'API endpoints' },
        { pattern: /database|model|schema/i, type: 'database models' },
        { pattern: /component|view|template/i, type: 'UI components' },
        { pattern: /service|controller|handler/i, type: 'business logic' },
      ];

      for (const { pattern, type } of expectedPatterns) {
        if (pattern.test(planLower) && totalSourceFiles < 3) {
          warnings.push(`Plan mentions ${type} but only ${totalSourceFiles} source files found`);
        }
      }
    }

    const passed = issues.length === 0 && hasSubstantiveCode;

    return {
      passed,
      totalSourceFiles,
      totalLinesOfCode,
      hasMainEntryPoint,
      mainEntryPointLines,
      hasTests,
      testFileCount,
      hasSubstantiveCode,
      warnings,
      issues,
    };
  } catch (error) {
    return {
      passed: false,
      totalSourceFiles: 0,
      totalLinesOfCode: 0,
      hasMainEntryPoint: false,
      mainEntryPointLines: 0,
      hasTests: false,
      testFileCount: 0,
      hasSubstantiveCode: false,
      warnings,
      issues: [`Error verifying code: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Recursively find source files with given extensions
 */
async function findSourceFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, __pycache__, .git, etc.
      if (entry.isDirectory()) {
        if (['node_modules', '__pycache__', '.git', '.venv', 'venv', 'dist', 'build'].includes(entry.name)) {
          continue;
        }
        const subFiles = await findSourceFiles(fullPath, extensions);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory access error - ignore
  }

  return files;
}

/**
 * Comprehensive project verification that checks both task completion AND code quality
 *
 * @param projectDir - The project root directory
 * @returns Full verification result
 */
export async function comprehensiveProjectVerification(projectDir: string): Promise<{
  isGenuinelyComplete: boolean;
  taskVerification: Awaited<ReturnType<typeof verifyProjectCompletion>>;
  codeVerification: CodeQualityCheckResult;
  summary: string;
}> {
  const taskVerification = await verifyProjectCompletion(projectDir);
  const codeVerification = await verifyCodeImplementation(projectDir);

  const isGenuinelyComplete = taskVerification.isComplete && codeVerification.passed;

  // Build summary
  const summaryLines: string[] = [];

  summaryLines.push(`Task Status: ${taskVerification.isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
  summaryLines.push(`  - ${taskVerification.progress.completedTasks}/${taskVerification.progress.totalTasks} tasks complete`);

  summaryLines.push(`Code Quality: ${codeVerification.passed ? 'PASSED' : 'FAILED'}`);
  summaryLines.push(`  - ${codeVerification.totalSourceFiles} source files, ${codeVerification.totalLinesOfCode} lines of code`);
  summaryLines.push(`  - Tests: ${codeVerification.hasTests ? `${codeVerification.testFileCount} test files` : 'None'}`);

  if (codeVerification.issues.length > 0) {
    summaryLines.push('Issues:');
    for (const issue of codeVerification.issues) {
      summaryLines.push(`  - ${issue}`);
    }
  }

  if (codeVerification.warnings.length > 0) {
    summaryLines.push('Warnings:');
    for (const warning of codeVerification.warnings) {
      summaryLines.push(`  - ${warning}`);
    }
  }

  summaryLines.push(`Overall: ${isGenuinelyComplete ? 'PROJECT GENUINELY COMPLETE' : 'PROJECT INCOMPLETE'}`);

  return {
    isGenuinelyComplete,
    taskVerification,
    codeVerification,
    summary: summaryLines.join('\n'),
  };
}
