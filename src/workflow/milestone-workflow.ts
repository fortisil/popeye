/**
 * Milestone-level workflow
 * Handles: Milestone Plan → Consensus → Execute Tasks → Milestone Review → Consensus
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectState, Milestone, Task } from '../types/workflow.js';
import type { ConsensusConfig } from '../types/consensus.js';
import { createPlan as claudeCreatePlan, analyzeCodebase } from '../adapters/claude.js';
import {
  loadProject,
  updateState,
} from '../state/index.js';
import { iterateUntilConsensus, type ConsensusProcessResult } from './consensus.js';
import { runTaskWorkflow, type TaskWorkflowResult } from './task-workflow.js';
import { parsePlanMilestones } from './plan-mode.js';

/**
 * Options for milestone workflow
 */
export interface MilestoneWorkflowOptions {
  projectDir: string;
  consensusConfig?: Partial<ConsensusConfig>;
  onProgress?: (phase: string, message: string) => void;
  onTaskStart?: (task: Task) => void;
  onTaskComplete?: (task: Task, success: boolean) => void;
}

/**
 * Result of milestone workflow
 */
export interface MilestoneWorkflowResult {
  success: boolean;
  milestone: Milestone;
  planConsensus?: ConsensusProcessResult;
  completionConsensus?: ConsensusProcessResult;
  taskResults: TaskWorkflowResult[];
  error?: string;
}

/**
 * Update milestone in state
 */
async function updateMilestoneInState(
  projectDir: string,
  milestoneId: string,
  updates: Partial<Milestone>
): Promise<ProjectState> {
  const state = await loadProject(projectDir);

  const updatedMilestones = state.milestones.map(m =>
    m.id === milestoneId ? { ...m, ...updates } : m
  );

  return updateState(projectDir, { milestones: updatedMilestones });
}

/**
 * Create a detailed plan for a milestone
 */
async function createMilestonePlan(
  milestone: Milestone,
  state: ProjectState,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Creating detailed milestone plan...');

  const context = `
## Project Context
Project: ${state.name}
Language: ${state.language}

## Project Specification
${state.specification?.slice(0, 2000) || 'No specification available'}

## Overall Project Plan
${state.plan?.slice(0, 2000) || 'No overall plan available'}

## Completed Milestones
${state.milestones
  .filter(m => m.status === 'complete')
  .map(m => `- ${m.name}`)
  .join('\n') || 'None yet'}
`.trim();

  const prompt = `
Create a detailed implementation plan for the following milestone:

## Milestone: ${milestone.name}
${milestone.description}

## Tasks in This Milestone
${milestone.tasks.map((t, i) => `${i + 1}. ${t.name}: ${t.description}`).join('\n')}

Please provide a comprehensive plan that includes:

1. **Milestone Overview**: Summary of what will be accomplished
2. **Prerequisites**: What must be in place before starting
3. **Implementation Order**: Optimal sequence for tasks
4. **Integration Points**: How tasks connect to each other
5. **Risk Assessment**: Potential issues and mitigations
6. **Success Criteria**: How to verify milestone completion
7. **Test Strategy**: Overall testing approach for the milestone

For each task, provide:
- Detailed implementation steps
- Files to create/modify
- Dependencies
- Acceptance criteria

This plan will be reviewed for consensus before any implementation begins.
`.trim();

  const result = await claudeCreatePlan(prompt, context, onProgress);

  if (!result.success) {
    throw new Error(`Failed to create milestone plan: ${result.error}`);
  }

  return result.response;
}

/**
 * Document milestone plan
 */
async function documentMilestonePlan(
  projectDir: string,
  milestone: Milestone,
  plan: string,
  consensusResult: ConsensusProcessResult
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const filename = `milestone_${milestoneNum}_plan.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# Milestone Plan: ${milestone.name}

## Metadata
- **Milestone ID**: ${milestone.id}
- **Consensus Score**: ${consensusResult.finalScore}%
- **Iterations**: ${consensusResult.totalIterations}
- **Status**: ${consensusResult.approved ? 'APPROVED' : 'NOT APPROVED'}
${consensusResult.arbitrated ? '- **Arbitrated**: Yes' : ''}
- **Generated**: ${new Date().toISOString()}

## Milestone Description
${milestone.description}

## Tasks
${milestone.tasks.map((t, i) => `${i + 1}. **${t.name}**: ${t.description}`).join('\n')}

## Implementation Plan
${plan}

## Consensus History
| Iteration | Score | Key Feedback |
|-----------|-------|--------------|
${consensusResult.iterations.map(it =>
  `| ${it.iteration} | ${it.result.score}% | ${it.result.concerns?.slice(0, 2).join('; ') || 'None'} |`
).join('\n')}

${consensusResult.finalConcerns.length > 0 ? `
## Remaining Notes
${consensusResult.finalConcerns.map(c => `- ${c}`).join('\n')}
` : ''}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/${filename}`;
}

/**
 * Create milestone completion review
 */
async function createMilestoneReview(
  milestone: Milestone,
  state: ProjectState,
  _taskResults: TaskWorkflowResult[],
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Creating milestone completion review...');

  // Analyze the current codebase
  const codebaseAnalysis = await analyzeCodebase(
    state.id, // projectDir stored in state context
    onProgress
  );

  const context = `
## Project Context
Project: ${state.name}
Language: ${state.language}

## Milestone: ${milestone.name}
${milestone.description}

## Codebase Analysis
${codebaseAnalysis.success ? codebaseAnalysis.response?.slice(0, 2000) : 'Analysis not available'}
`.trim();

  const prompt = `
Please perform a completion review for the following milestone:

## Milestone: ${milestone.name}

## Completed Tasks
${milestone.tasks.map((t, i) => {
  return `${i + 1}. **${t.name}**
   - Status: ${t.status}
   - Tests: ${t.testsPassed ? 'Passed' : 'N/A'}
   - Consensus Score: ${t.consensusScore || 'N/A'}%`;
}).join('\n')}

Please provide:

1. **Summary**: What was accomplished in this milestone
2. **Code Review**: Assessment of code quality and architecture
3. **Test Coverage**: Evaluation of test coverage and quality
4. **Integration Check**: How well components work together
5. **Technical Debt**: Any shortcuts or areas needing future attention
6. **Documentation**: Status of documentation
7. **Completion Verification**:
   - Are all acceptance criteria met?
   - Is the milestone truly complete?
   - Any remaining work needed?

Provide a CONSENSUS SCORE (0-100%) indicating confidence that this milestone is complete.
`.trim();

  const result = await claudeCreatePlan(prompt, context, onProgress);

  if (!result.success) {
    throw new Error(`Failed to create milestone review: ${result.error}`);
  }

  return result.response;
}

/**
 * Document milestone completion
 */
async function documentMilestoneCompletion(
  projectDir: string,
  milestone: Milestone,
  review: string,
  consensusResult: ConsensusProcessResult,
  _taskResults: TaskWorkflowResult[]
): Promise<string> {
  const docsDir = path.join(projectDir, 'docs');
  await fs.mkdir(docsDir, { recursive: true });

  const milestoneNum = milestone.id.replace('milestone-', '');
  const filename = `milestone_${milestoneNum}_complete.md`;
  const docPath = path.join(docsDir, filename);

  const content = `# Milestone Completion: ${milestone.name}

## Metadata
- **Milestone ID**: ${milestone.id}
- **Completion Score**: ${consensusResult.finalScore}%
- **Review Iterations**: ${consensusResult.totalIterations}
- **Status**: ${consensusResult.approved ? 'COMPLETE' : 'NEEDS REVIEW'}
- **Completed**: ${new Date().toISOString()}

## Task Summary
| Task | Status | Tests | Consensus |
|------|--------|-------|-----------|
${milestone.tasks.map(t => {
  return `| ${t.name} | ${t.status} | ${t.testsPassed ? 'Passed' : 'N/A'} | ${t.consensusScore || 'N/A'}% |`;
}).join('\n')}

## Completion Review
${review}

## Final Assessment
- **All Tasks Complete**: ${milestone.tasks.every(t => t.status === 'complete') ? 'Yes' : 'No'}
- **All Tests Passing**: ${milestone.tasks.every(t => t.testsPassed !== false) ? 'Yes' : 'No'}
- **Milestone Approved**: ${consensusResult.approved ? 'Yes' : 'No'}
`;

  await fs.writeFile(docPath, content, 'utf-8');
  return `docs/${filename}`;
}

/**
 * Run the complete milestone workflow
 */
export async function runMilestoneWorkflow(
  milestone: Milestone,
  options: MilestoneWorkflowOptions
): Promise<MilestoneWorkflowResult> {
  const {
    projectDir,
    consensusConfig,
    onProgress,
    onTaskStart,
    onTaskComplete,
  } = options;

  const taskResults: TaskWorkflowResult[] = [];

  try {
    let state = await loadProject(projectDir);

    // Reload milestone from state to get latest data (including any saved plan)
    const currentMilestone = state.milestones.find(m => m.id === milestone.id);
    if (currentMilestone) {
      milestone = currentMilestone;
    }

    // Check if milestone plan was already approved (resuming scenario)
    let planConsensus: ConsensusProcessResult | undefined;

    if (milestone.consensusApproved && milestone.plan) {
      // Milestone plan already approved, skip planning phase
      onProgress?.('milestone-plan', `Using existing approved plan for: ${milestone.name} (Score: ${milestone.consensusScore}%)`);

      // Create a mock consensus result from saved data
      planConsensus = {
        approved: true,
        finalPlan: milestone.plan,
        finalScore: milestone.consensusScore || 95,
        bestPlan: milestone.plan,
        bestScore: milestone.consensusScore || 95,
        bestIteration: milestone.consensusIterations || 1,
        totalIterations: milestone.consensusIterations || 1,
        iterations: [],
        finalConcerns: [],
        finalRecommendations: [],
        arbitrated: false,
      };
    } else {
      // Mark milestone as in-progress
      state = await updateMilestoneInState(projectDir, milestone.id, {
        status: 'in-progress',
      });

      // ============================================
      // PHASE 1: Create Milestone Plan
      // ============================================
      onProgress?.('milestone-plan', `Planning milestone: ${milestone.name}`);

      const milestonePlan = await createMilestonePlan(
        milestone,
        state,
        (msg) => onProgress?.('milestone-plan', msg)
      );

      // ============================================
      // PHASE 2: Get Consensus on Milestone Plan
      // ============================================
      onProgress?.('milestone-consensus', `Getting consensus for milestone: ${milestone.name}`);

      const context = `
Project: ${state.name}
Language: ${state.language}
Milestone: ${milestone.name}
Tasks: ${milestone.tasks.length}
`.trim();

      planConsensus = await iterateUntilConsensus(
        milestonePlan,
        context,
        {
          projectDir,
          config: consensusConfig,
          onIteration: (iteration, result) => {
            onProgress?.('milestone-consensus', `Iteration ${iteration}: ${result.score}%`);
          },
          onProgress,
        }
      );

      // Document the milestone plan
      const planDocPath = await documentMilestonePlan(
        projectDir,
        milestone,
        planConsensus.bestPlan,
        planConsensus
      );

      // Update milestone with plan consensus
      state = await updateMilestoneInState(projectDir, milestone.id, {
        plan: planConsensus.bestPlan,
        consensusScore: planConsensus.finalScore,
        consensusIterations: planConsensus.totalIterations,
        consensusApproved: planConsensus.approved,
        planDoc: planDocPath,
      });

      // Check if consensus was achieved
      if (!planConsensus.approved) {
        onProgress?.('milestone-consensus', `Milestone plan not approved: ${planConsensus.finalScore}%`);

        state = await updateMilestoneInState(projectDir, milestone.id, {
          status: 'failed',
        });

        return {
          success: false,
          milestone: { ...milestone, status: 'failed' },
          planConsensus,
          taskResults: [],
          error: `Milestone plan not approved. Score: ${planConsensus.finalScore}%`,
        };
      }

      onProgress?.('milestone-consensus', `Milestone plan approved with ${planConsensus.finalScore}%`);

      // Parse tasks from the approved plan (may have refined tasks)
      const parsedMilestones = parsePlanMilestones(planConsensus.bestPlan);
      if (parsedMilestones.length > 0 && parsedMilestones[0].tasks.length > 0) {
        // Update tasks with more details from the approved plan
        // Keep original task IDs but update descriptions
        const updatedTasks = milestone.tasks.map((origTask, idx) => {
          const parsedTask = parsedMilestones[0].tasks[idx];
          if (parsedTask) {
            return {
              ...origTask,
              description: parsedTask.description || origTask.description,
              testPlan: parsedTask.testPlan || origTask.testPlan,
            };
          }
          return origTask;
        });

        state = await updateMilestoneInState(projectDir, milestone.id, {
          tasks: updatedTasks,
        });

        // Reload milestone with updated tasks
        state = await loadProject(projectDir);
        milestone = state.milestones.find(m => m.id === milestone.id) || milestone;
      }
    }

    // ============================================
    // PHASE 3: Execute Each Task (with per-task consensus)
    // ============================================
    onProgress?.('milestone-tasks', `Executing ${milestone.tasks.length} tasks...`);

    for (const task of milestone.tasks) {
      if (task.status === 'complete') {
        onProgress?.('milestone-tasks', `Skipping completed task: ${task.name}`);
        continue;
      }

      onTaskStart?.(task);

      onProgress?.('milestone-tasks', `Starting task: ${task.name}`);

      const taskResult = await runTaskWorkflow(milestone, task, {
        projectDir,
        consensusConfig,
        onProgress,
      });

      taskResults.push(taskResult);
      onTaskComplete?.(task, taskResult.success);

      if (!taskResult.success) {
        onProgress?.('milestone-tasks', `Task failed: ${task.name}`);

        // Update milestone status
        state = await updateMilestoneInState(projectDir, milestone.id, {
          status: 'failed',
        });

        return {
          success: false,
          milestone: { ...milestone, status: 'failed' },
          planConsensus,
          taskResults,
          error: `Task "${task.name}" failed: ${taskResult.error}`,
        };
      }

      onProgress?.('milestone-tasks', `Task complete: ${task.name}`);
    }

    // ============================================
    // PHASE 4: Milestone Completion Review
    // ============================================
    onProgress?.('milestone-review', `Reviewing milestone completion: ${milestone.name}`);

    // Reload state to get latest task statuses
    state = await loadProject(projectDir);
    milestone = state.milestones.find(m => m.id === milestone.id) || milestone;

    const completionReview = await createMilestoneReview(
      milestone,
      state,
      taskResults,
      (msg) => onProgress?.('milestone-review', msg)
    );

    // ============================================
    // PHASE 5: Get Consensus on Completion
    // ============================================
    onProgress?.('milestone-completion', `Getting completion consensus for: ${milestone.name}`);

    const completionConsensus = await iterateUntilConsensus(
      completionReview,
      `Milestone completion review for: ${milestone.name}`,
      {
        projectDir,
        config: consensusConfig,
        onIteration: (iteration, result) => {
          onProgress?.('milestone-completion', `Completion review iteration ${iteration}: ${result.score}%`);
        },
        onProgress,
      }
    );

    // Document milestone completion
    const completionDocPath = await documentMilestoneCompletion(
      projectDir,
      milestone,
      completionConsensus.bestPlan,
      completionConsensus,
      taskResults
    );

    // Update milestone with completion consensus
    const finalStatus = completionConsensus.approved ? 'complete' : 'in-progress';
    state = await updateMilestoneInState(projectDir, milestone.id, {
      status: finalStatus,
      completionReview: completionConsensus.bestPlan,
      completionScore: completionConsensus.finalScore,
      completionApproved: completionConsensus.approved,
      completionDoc: completionDocPath,
    });

    if (!completionConsensus.approved) {
      onProgress?.('milestone-completion', `Milestone completion not approved: ${completionConsensus.finalScore}%`);

      return {
        success: false,
        milestone: { ...milestone, status: 'in-progress' },
        planConsensus,
        completionConsensus,
        taskResults,
        error: `Milestone completion not approved. Score: ${completionConsensus.finalScore}%`,
      };
    }

    onProgress?.('milestone-complete', `Milestone complete: ${milestone.name}`);

    return {
      success: true,
      milestone: { ...milestone, status: 'complete' },
      planConsensus,
      completionConsensus,
      taskResults,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onProgress?.('milestone-error', errorMessage);

    await updateMilestoneInState(projectDir, milestone.id, {
      status: 'failed',
    });

    return {
      success: false,
      milestone: { ...milestone, status: 'failed' },
      taskResults,
      error: errorMessage,
    };
  }
}
