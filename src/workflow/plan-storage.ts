/**
 * Plan Storage System
 * Manages plans in markdown files to reduce API calls and maintain tracking
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Feedback entry from a reviewer
 */
export interface ReviewerFeedback {
  reviewer: 'openai' | 'gemini' | 'claude';
  score: number;
  timestamp: string;
  concerns: string[];
  recommendations: string[];
  analysis: string;
}

/**
 * Plan metadata for tracking
 */
export interface PlanMetadata {
  id: string;
  type: 'master' | 'milestone' | 'task';
  milestoneId?: string;
  milestoneName?: string;
  taskId?: string;
  taskName?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  consensusScore?: number;
  status: 'draft' | 'reviewing' | 'approved' | 'implemented';
}

/**
 * Stored plan with metadata
 */
export interface StoredPlan {
  metadata: PlanMetadata;
  content: string;
  feedback: ReviewerFeedback[];
  revisionHistory: Array<{
    version: number;
    timestamp: string;
    changes: string;
    score?: number;
  }>;
}

/**
 * Plan Storage Manager
 */
export class PlanStorage {
  private projectDir: string;
  private plansDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.plansDir = path.join(projectDir, 'docs', 'plans');
  }

  /**
   * Initialize the plans directory structure
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.plansDir, { recursive: true });
  }

  /**
   * Get the path for a plan file
   */
  private getPlanPath(
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): string {
    if (type === 'master') {
      return path.join(this.projectDir, 'docs', 'PLAN.md');
    }

    if (type === 'milestone' && milestoneId) {
      const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
      return path.join(milestoneDir, 'plan.md');
    }

    if (type === 'task' && milestoneId && taskId) {
      const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
      return path.join(milestoneDir, `task-${taskId}-plan.md`);
    }

    throw new Error(`Invalid plan type or missing IDs: ${type}`);
  }

  /**
   * Get the path for feedback file
   */
  private getFeedbackPath(milestoneId: string, taskId?: string): string {
    const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
    if (taskId) {
      return path.join(milestoneDir, `task-${taskId}-feedback.md`);
    }
    return path.join(milestoneDir, 'feedback.md');
  }

  /**
   * Get the path for metadata file
   */
  private getMetadataPath(milestoneId: string, taskId?: string): string {
    const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
    if (taskId) {
      return path.join(milestoneDir, `task-${taskId}-metadata.json`);
    }
    return path.join(milestoneDir, 'metadata.json');
  }

  /**
   * Save a plan to file
   */
  async savePlan(
    content: string,
    type: 'master' | 'milestone' | 'task',
    options: {
      milestoneId?: string;
      milestoneName?: string;
      taskId?: string;
      taskName?: string;
      score?: number;
    } = {}
  ): Promise<string> {
    const planPath = this.getPlanPath(type, options.milestoneId, options.taskId);

    // Ensure directory exists
    await fs.mkdir(path.dirname(planPath), { recursive: true });

    // Add header with metadata
    const header = this.generatePlanHeader(type, options);
    const fullContent = `${header}\n\n${content}`;

    await fs.writeFile(planPath, fullContent, 'utf-8');

    // Save metadata separately for easy parsing
    if (options.milestoneId) {
      await this.saveMetadata(type, options);
    }

    return planPath;
  }

  /**
   * Generate plan header with tracking info
   */
  private generatePlanHeader(
    type: 'master' | 'milestone' | 'task',
    options: {
      milestoneId?: string;
      milestoneName?: string;
      taskId?: string;
      taskName?: string;
      score?: number;
    }
  ): string {
    const lines: string[] = [];
    lines.push('---');
    lines.push(`type: ${type}`);
    if (options.milestoneId) lines.push(`milestone_id: ${options.milestoneId}`);
    if (options.milestoneName) lines.push(`milestone_name: ${options.milestoneName}`);
    if (options.taskId) lines.push(`task_id: ${options.taskId}`);
    if (options.taskName) lines.push(`task_name: ${options.taskName}`);
    if (options.score !== undefined) lines.push(`consensus_score: ${options.score}`);
    lines.push(`updated_at: ${new Date().toISOString()}`);
    lines.push('---');
    return lines.join('\n');
  }

  /**
   * Save metadata to JSON file
   */
  private async saveMetadata(
    type: 'master' | 'milestone' | 'task',
    options: {
      milestoneId?: string;
      milestoneName?: string;
      taskId?: string;
      taskName?: string;
      score?: number;
    }
  ): Promise<void> {
    if (!options.milestoneId) return;

    const metadataPath = this.getMetadataPath(options.milestoneId, options.taskId);

    let metadata: PlanMetadata;
    try {
      const existing = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(existing);
      metadata.version += 1;
      metadata.updatedAt = new Date().toISOString();
      if (options.score !== undefined) metadata.consensusScore = options.score;
    } catch {
      metadata = {
        id: options.taskId || options.milestoneId,
        type,
        milestoneId: options.milestoneId,
        milestoneName: options.milestoneName,
        taskId: options.taskId,
        taskName: options.taskName,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        consensusScore: options.score,
        status: 'draft',
      };
    }

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * Load a plan from file
   */
  async loadPlan(
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): Promise<string | null> {
    try {
      const planPath = this.getPlanPath(type, milestoneId, taskId);
      const content = await fs.readFile(planPath, 'utf-8');

      // Strip the header if present
      const headerMatch = content.match(/^---[\s\S]*?---\n\n/);
      if (headerMatch) {
        return content.slice(headerMatch[0].length);
      }
      return content;
    } catch {
      return null;
    }
  }

  /**
   * Save feedback from a reviewer
   */
  async saveFeedback(
    feedback: ReviewerFeedback,
    milestoneId: string,
    taskId?: string
  ): Promise<void> {
    const feedbackPath = this.getFeedbackPath(milestoneId, taskId);

    // Ensure directory exists
    await fs.mkdir(path.dirname(feedbackPath), { recursive: true });

    // Load existing feedback
    let existingFeedback: ReviewerFeedback[] = [];
    try {
      const content = await fs.readFile(feedbackPath.replace('.md', '.json'), 'utf-8');
      existingFeedback = JSON.parse(content);
    } catch {
      // No existing feedback
    }

    // Add new feedback
    existingFeedback.push(feedback);

    // Save JSON for programmatic access
    await fs.writeFile(
      feedbackPath.replace('.md', '.json'),
      JSON.stringify(existingFeedback, null, 2),
      'utf-8'
    );

    // Also save human-readable markdown
    const mdContent = this.formatFeedbackAsMarkdown(existingFeedback);
    await fs.writeFile(feedbackPath, mdContent, 'utf-8');
  }

  /**
   * Load all feedback for a plan
   */
  async loadFeedback(milestoneId: string, taskId?: string): Promise<ReviewerFeedback[]> {
    try {
      const feedbackPath = this.getFeedbackPath(milestoneId, taskId).replace('.md', '.json');
      const content = await fs.readFile(feedbackPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Clear feedback for a new consensus round
   */
  async clearFeedback(milestoneId: string, taskId?: string): Promise<void> {
    const feedbackPath = this.getFeedbackPath(milestoneId, taskId);
    try {
      await fs.unlink(feedbackPath);
      await fs.unlink(feedbackPath.replace('.md', '.json'));
    } catch {
      // Files don't exist, that's fine
    }
  }

  /**
   * Format feedback as readable markdown
   */
  private formatFeedbackAsMarkdown(feedback: ReviewerFeedback[]): string {
    const lines: string[] = [];
    lines.push('# Reviewer Feedback\n');

    for (const fb of feedback) {
      lines.push(`## ${fb.reviewer.toUpperCase()} Review`);
      lines.push(`- **Score:** ${fb.score}%`);
      lines.push(`- **Timestamp:** ${fb.timestamp}`);
      lines.push('');

      if (fb.concerns.length > 0) {
        lines.push('### Concerns');
        for (const concern of fb.concerns) {
          lines.push(`- ${concern}`);
        }
        lines.push('');
      }

      if (fb.recommendations.length > 0) {
        lines.push('### Recommendations');
        for (const rec of fb.recommendations) {
          lines.push(`- ${rec}`);
        }
        lines.push('');
      }

      if (fb.analysis) {
        lines.push('### Analysis');
        lines.push(fb.analysis);
        lines.push('');
      }

      lines.push('---\n');
    }

    return lines.join('\n');
  }

  /**
   * Get combined feedback summary for revision
   */
  async getCombinedFeedbackForRevision(
    milestoneId: string,
    taskId?: string
  ): Promise<{
    averageScore: number;
    allConcerns: string[];
    allRecommendations: string[];
    combinedAnalysis: string;
  }> {
    const feedback = await this.loadFeedback(milestoneId, taskId);

    if (feedback.length === 0) {
      return {
        averageScore: 0,
        allConcerns: [],
        allRecommendations: [],
        combinedAnalysis: '',
      };
    }

    const averageScore = feedback.reduce((sum, f) => sum + f.score, 0) / feedback.length;

    // Deduplicate concerns and recommendations
    const allConcerns = [...new Set(feedback.flatMap(f => f.concerns))];
    const allRecommendations = [...new Set(feedback.flatMap(f => f.recommendations))];

    // Combine analysis
    const combinedAnalysis = feedback
      .map(f => `### ${f.reviewer.toUpperCase()} (${f.score}%)\n${f.analysis}`)
      .join('\n\n');

    return {
      averageScore,
      allConcerns,
      allRecommendations,
      combinedAnalysis,
    };
  }

  /**
   * Update plan status
   */
  async updateStatus(
    status: 'draft' | 'reviewing' | 'approved' | 'implemented',
    milestoneId: string,
    taskId?: string
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(milestoneId, taskId);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: PlanMetadata = JSON.parse(content);
      metadata.status = status;
      metadata.updatedAt = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {
      // Metadata doesn't exist yet
    }
  }

  /**
   * Get plan tracking summary for a milestone
   */
  async getMilestoneTrackingSummary(milestoneId: string): Promise<{
    milestonePlan: { exists: boolean; score?: number; status?: string };
    taskPlans: Array<{
      taskId: string;
      taskName?: string;
      exists: boolean;
      score?: number;
      status?: string;
    }>;
  }> {
    const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);

    // Check milestone plan
    let milestonePlan: { exists: boolean; score?: number; status?: string } = { exists: false };
    try {
      const metadataPath = path.join(milestoneDir, 'metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: PlanMetadata = JSON.parse(content);
      milestonePlan = {
        exists: true,
        score: metadata.consensusScore,
        status: metadata.status,
      };
    } catch {
      // No milestone plan
    }

    // Find task plans
    const taskPlans: Array<{
      taskId: string;
      taskName?: string;
      exists: boolean;
      score?: number;
      status?: string;
    }> = [];

    try {
      const files = await fs.readdir(milestoneDir);
      const taskMetadataFiles = files.filter(f => f.startsWith('task-') && f.endsWith('-metadata.json'));

      for (const file of taskMetadataFiles) {
        try {
          const content = await fs.readFile(path.join(milestoneDir, file), 'utf-8');
          const metadata: PlanMetadata = JSON.parse(content);
          taskPlans.push({
            taskId: metadata.taskId || '',
            taskName: metadata.taskName,
            exists: true,
            score: metadata.consensusScore,
            status: metadata.status,
          });
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return { milestonePlan, taskPlans };
  }
}

/**
 * Create a plan storage instance for a project
 */
export function createPlanStorage(projectDir: string): PlanStorage {
  return new PlanStorage(projectDir);
}
