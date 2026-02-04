/**
 * Plan Storage System
 * Manages plans in markdown files to reduce API calls and maintain tracking
 *
 * Directory Structure for Fullstack Projects:
 * docs/plans/
 * ├── master/
 * │   ├── plan.md
 * │   ├── metadata.json
 * │   ├── unified/
 * │   │   ├── feedback.json
 * │   │   └── feedback.md
 * │   ├── frontend/
 * │   │   ├── feedback.json
 * │   │   └── feedback.md
 * │   └── backend/
 * │       ├── feedback.json
 * │       └── feedback.md
 * ├── milestone-1/
 * │   ├── plan.md
 * │   ├── metadata.json
 * │   ├── unified/
 * │   ├── frontend/
 * │   ├── backend/
 * │   └── tasks/
 * │       └── task-1/
 * │           ├── plan.md
 * │           ├── metadata.json
 * │           ├── unified/
 * │           ├── frontend/
 * │           └── backend/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  ReviewAppTarget,
  TaggedItem,
  AppConsensusScores,
  CorrectionRecord,
} from '../types/consensus.js';

/**
 * App target for feedback storage
 */
export type FeedbackAppTarget = 'frontend' | 'backend' | 'unified';

/**
 * Feedback entry from a reviewer
 */
export interface ReviewerFeedback {
  reviewer: 'openai' | 'gemini' | 'grok' | 'claude';
  score: number;
  timestamp: string;
  concerns: string[];
  recommendations: string[];
  analysis: string;
  /** App target (for fullstack projects) */
  appTarget?: FeedbackAppTarget;
}

/**
 * Fullstack-aware feedback with per-app breakdown
 */
export interface FullstackReviewerFeedback extends ReviewerFeedback {
  /** Per-app scores */
  appScores: AppConsensusScores;
  /** Tagged concerns by app */
  taggedConcerns: TaggedItem[];
  /** Tagged recommendations by app */
  taggedRecommendations: TaggedItem[];
  /** Whether this is fullstack feedback */
  isFullstack: true;
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

  /** Fullstack-specific tracking */
  isFullstack?: boolean;
  frontendScore?: number;
  backendScore?: number;
  unifiedScore?: number;
  frontendApproved?: boolean;
  backendApproved?: boolean;
  unifiedApproved?: boolean;

  /** Total iterations for this plan */
  totalIterations?: number;

  /** Corrections made during consensus */
  corrections?: CorrectionRecord[];
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
 * Fullstack stored plan with per-app feedback
 */
export interface FullstackStoredPlan extends StoredPlan {
  /** Per-app feedback */
  frontendFeedback: ReviewerFeedback[];
  backendFeedback: ReviewerFeedback[];
  unifiedFeedback: ReviewerFeedback[];

  /** Per-app revision history */
  appRevisionHistory: {
    frontend: Array<{ version: number; timestamp: string; changes: string; score?: number }>;
    backend: Array<{ version: number; timestamp: string; changes: string; score?: number }>;
    unified: Array<{ version: number; timestamp: string; changes: string; score?: number }>;
  };
}

/**
 * Plan Storage Manager
 */
export class PlanStorage {
  private projectDir: string;
  private plansDir: string;
  private isFullstack: boolean;

  constructor(projectDir: string, isFullstack: boolean = false) {
    this.projectDir = projectDir;
    this.plansDir = path.join(projectDir, 'docs', 'plans');
    this.isFullstack = isFullstack;
  }

  /**
   * Set fullstack mode
   */
  setFullstack(isFullstack: boolean): void {
    this.isFullstack = isFullstack;
  }

  /**
   * Initialize the plans directory structure
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.plansDir, { recursive: true });

    // Create master directory with app subdirectories for fullstack
    if (this.isFullstack) {
      await this.initializeAppDirectories(path.join(this.plansDir, 'master'));
    }
  }

  /**
   * Initialize app subdirectories (frontend/backend/unified)
   */
  private async initializeAppDirectories(baseDir: string): Promise<void> {
    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(path.join(baseDir, 'unified'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'frontend'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'backend'), { recursive: true });
  }

  /**
   * Get the path for a plan file
   *
   * New structure for fullstack:
   * - master: docs/plans/master/plan.md
   * - milestone: docs/plans/milestone-N/plan.md
   * - task: docs/plans/milestone-N/tasks/task-N/plan.md
   */
  private getPlanPath(
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): string {
    if (type === 'master') {
      if (this.isFullstack) {
        return path.join(this.plansDir, 'master', 'plan.md');
      }
      return path.join(this.projectDir, 'docs', 'PLAN.md');
    }

    if (type === 'milestone' && milestoneId) {
      const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
      return path.join(milestoneDir, 'plan.md');
    }

    if (type === 'task' && milestoneId && taskId) {
      const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
      if (this.isFullstack) {
        return path.join(milestoneDir, 'tasks', `task-${taskId}`, 'plan.md');
      }
      return path.join(milestoneDir, `task-${taskId}-plan.md`);
    }

    throw new Error(`Invalid plan type or missing IDs: ${type}`);
  }

  /**
   * Get the base directory for a plan level
   */
  private getPlanBaseDir(
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): string {
    if (type === 'master') {
      return path.join(this.plansDir, 'master');
    }

    if (type === 'milestone' && milestoneId) {
      return path.join(this.plansDir, `milestone-${milestoneId}`);
    }

    if (type === 'task' && milestoneId && taskId) {
      return path.join(this.plansDir, `milestone-${milestoneId}`, 'tasks', `task-${taskId}`);
    }

    throw new Error(`Invalid plan type or missing IDs: ${type}`);
  }

  /**
   * Get the path for feedback file
   *
   * For fullstack projects, feedback is stored per-app:
   * - unified/feedback.md, frontend/feedback.md, backend/feedback.md
   */
  private getFeedbackPath(
    milestoneId: string,
    taskId?: string,
    appTarget?: FeedbackAppTarget
  ): string {
    const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);

    if (this.isFullstack && appTarget) {
      if (taskId) {
        return path.join(milestoneDir, 'tasks', `task-${taskId}`, appTarget, 'feedback.md');
      }
      return path.join(milestoneDir, appTarget, 'feedback.md');
    }

    // Legacy non-fullstack path
    if (taskId) {
      return path.join(milestoneDir, `task-${taskId}-feedback.md`);
    }
    return path.join(milestoneDir, 'feedback.md');
  }

  /**
   * Get feedback path for master plan
   */
  private getMasterFeedbackPath(appTarget?: FeedbackAppTarget): string {
    if (this.isFullstack && appTarget) {
      return path.join(this.plansDir, 'master', appTarget, 'feedback.md');
    }
    return path.join(this.plansDir, 'master', 'feedback.md');
  }

  /**
   * Get the path for metadata file
   */
  private getMetadataPath(
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): string {
    if (type === 'master') {
      return path.join(this.plansDir, 'master', 'metadata.json');
    }

    const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);
    if (taskId) {
      if (this.isFullstack) {
        return path.join(milestoneDir, 'tasks', `task-${taskId}`, 'metadata.json');
      }
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
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
    } = {}
  ): Promise<string> {
    const planPath = this.getPlanPath(type, options.milestoneId, options.taskId);

    // Ensure directory exists
    await fs.mkdir(path.dirname(planPath), { recursive: true });

    // For fullstack projects, also create app subdirectories
    if (this.isFullstack) {
      const baseDir = this.getPlanBaseDir(type, options.milestoneId, options.taskId);
      await this.initializeAppDirectories(baseDir);
    }

    // Add header with metadata
    const header = this.generatePlanHeader(type, options);
    const fullContent = `${header}\n\n${content}`;

    await fs.writeFile(planPath, fullContent, 'utf-8');

    // Save metadata separately for easy parsing
    await this.saveMetadata(type, options);

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
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
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

    // Fullstack-specific scores
    if (this.isFullstack) {
      lines.push(`is_fullstack: true`);
      if (options.frontendScore !== undefined) lines.push(`frontend_score: ${options.frontendScore}`);
      if (options.backendScore !== undefined) lines.push(`backend_score: ${options.backendScore}`);
      if (options.unifiedScore !== undefined) lines.push(`unified_score: ${options.unifiedScore}`);
    }

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
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
    }
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(type, options.milestoneId, options.taskId);

    // Ensure directory exists
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });

    let metadata: PlanMetadata;
    try {
      const existing = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(existing);
      metadata.version += 1;
      metadata.updatedAt = new Date().toISOString();
      if (options.score !== undefined) metadata.consensusScore = options.score;

      // Update fullstack scores
      if (this.isFullstack) {
        if (options.frontendScore !== undefined) metadata.frontendScore = options.frontendScore;
        if (options.backendScore !== undefined) metadata.backendScore = options.backendScore;
        if (options.unifiedScore !== undefined) metadata.unifiedScore = options.unifiedScore;
      }
    } catch {
      metadata = {
        id: options.taskId || options.milestoneId || 'master',
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
        isFullstack: this.isFullstack,
        frontendScore: options.frontendScore,
        backendScore: options.backendScore,
        unifiedScore: options.unifiedScore,
        totalIterations: 0,
        corrections: [],
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
   *
   * For fullstack projects, appTarget determines which subdirectory:
   * - 'frontend': milestone-N/frontend/feedback.json
   * - 'backend': milestone-N/backend/feedback.json
   * - 'unified': milestone-N/unified/feedback.json
   */
  async saveFeedback(
    feedback: ReviewerFeedback,
    milestoneId: string,
    taskId?: string,
    appTarget?: FeedbackAppTarget
  ): Promise<void> {
    const effectiveAppTarget = this.isFullstack ? (appTarget || 'unified') : undefined;
    const feedbackPath = this.getFeedbackPath(milestoneId, taskId, effectiveAppTarget);

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

    // Tag feedback with app target
    const taggedFeedback: ReviewerFeedback = {
      ...feedback,
      appTarget: effectiveAppTarget,
    };

    // Add new feedback
    existingFeedback.push(taggedFeedback);

    // Save JSON for programmatic access
    await fs.writeFile(
      feedbackPath.replace('.md', '.json'),
      JSON.stringify(existingFeedback, null, 2),
      'utf-8'
    );

    // Also save human-readable markdown
    const mdContent = this.formatFeedbackAsMarkdown(existingFeedback, effectiveAppTarget);
    await fs.writeFile(feedbackPath, mdContent, 'utf-8');
  }

  /**
   * Save fullstack feedback with per-app breakdown
   *
   * Saves feedback to all three directories (unified, frontend, backend)
   */
  async saveFullstackFeedback(
    feedback: FullstackReviewerFeedback,
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): Promise<void> {
    if (!this.isFullstack) {
      // Fall back to unified storage
      await this.saveFeedback(feedback, milestoneId || 'master', taskId);
      return;
    }

    const apps: FeedbackAppTarget[] = ['unified', 'frontend', 'backend'];

    for (const app of apps) {
      // Extract app-specific concerns and recommendations
      const appConcerns = feedback.taggedConcerns
        .filter(c => c.app === app)
        .map(c => c.content);
      const appRecommendations = feedback.taggedRecommendations
        .filter(r => r.app === app)
        .map(r => r.content);

      // Get app-specific score
      const appScore = app === 'frontend'
        ? feedback.appScores.frontend
        : app === 'backend'
        ? feedback.appScores.backend
        : feedback.appScores.unified;

      const appFeedback: ReviewerFeedback = {
        reviewer: feedback.reviewer,
        score: appScore || feedback.score,
        timestamp: feedback.timestamp,
        concerns: appConcerns.length > 0 ? appConcerns : feedback.concerns,
        recommendations: appRecommendations.length > 0 ? appRecommendations : feedback.recommendations,
        analysis: feedback.analysis,
        appTarget: app,
      };

      if (type === 'master') {
        await this.saveMasterFeedback(appFeedback, app);
      } else {
        await this.saveFeedback(appFeedback, milestoneId!, taskId, app);
      }
    }
  }

  /**
   * Save feedback for master plan
   */
  async saveMasterFeedback(
    feedback: ReviewerFeedback,
    appTarget?: FeedbackAppTarget
  ): Promise<void> {
    const effectiveAppTarget = this.isFullstack ? (appTarget || 'unified') : undefined;
    const feedbackPath = this.getMasterFeedbackPath(effectiveAppTarget);

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

    // Tag feedback with app target
    const taggedFeedback: ReviewerFeedback = {
      ...feedback,
      appTarget: effectiveAppTarget,
    };

    existingFeedback.push(taggedFeedback);

    // Save JSON
    await fs.writeFile(
      feedbackPath.replace('.md', '.json'),
      JSON.stringify(existingFeedback, null, 2),
      'utf-8'
    );

    // Save markdown
    const mdContent = this.formatFeedbackAsMarkdown(existingFeedback, effectiveAppTarget);
    await fs.writeFile(feedbackPath, mdContent, 'utf-8');
  }

  /**
   * Load all feedback for a plan
   */
  async loadFeedback(
    milestoneId: string,
    taskId?: string,
    appTarget?: FeedbackAppTarget
  ): Promise<ReviewerFeedback[]> {
    try {
      const effectiveAppTarget = this.isFullstack ? (appTarget || 'unified') : undefined;
      const feedbackPath = this.getFeedbackPath(milestoneId, taskId, effectiveAppTarget).replace('.md', '.json');
      const content = await fs.readFile(feedbackPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Load all feedback for all apps (fullstack)
   */
  async loadAllAppFeedback(
    milestoneId: string,
    taskId?: string
  ): Promise<{
    unified: ReviewerFeedback[];
    frontend: ReviewerFeedback[];
    backend: ReviewerFeedback[];
  }> {
    if (!this.isFullstack) {
      const unified = await this.loadFeedback(milestoneId, taskId);
      return { unified, frontend: [], backend: [] };
    }

    const [unified, frontend, backend] = await Promise.all([
      this.loadFeedback(milestoneId, taskId, 'unified'),
      this.loadFeedback(milestoneId, taskId, 'frontend'),
      this.loadFeedback(milestoneId, taskId, 'backend'),
    ]);

    return { unified, frontend, backend };
  }

  /**
   * Load master plan feedback
   */
  async loadMasterFeedback(appTarget?: FeedbackAppTarget): Promise<ReviewerFeedback[]> {
    try {
      const effectiveAppTarget = this.isFullstack ? (appTarget || 'unified') : undefined;
      const feedbackPath = this.getMasterFeedbackPath(effectiveAppTarget).replace('.md', '.json');
      const content = await fs.readFile(feedbackPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Load all master plan feedback (fullstack)
   */
  async loadAllMasterFeedback(): Promise<{
    unified: ReviewerFeedback[];
    frontend: ReviewerFeedback[];
    backend: ReviewerFeedback[];
  }> {
    if (!this.isFullstack) {
      const unified = await this.loadMasterFeedback();
      return { unified, frontend: [], backend: [] };
    }

    const [unified, frontend, backend] = await Promise.all([
      this.loadMasterFeedback('unified'),
      this.loadMasterFeedback('frontend'),
      this.loadMasterFeedback('backend'),
    ]);

    return { unified, frontend, backend };
  }

  /**
   * Clear feedback for a new consensus round
   */
  async clearFeedback(milestoneId: string, taskId?: string, appTarget?: FeedbackAppTarget): Promise<void> {
    if (this.isFullstack && !appTarget) {
      // Clear all app feedback
      await Promise.all([
        this.clearFeedback(milestoneId, taskId, 'unified'),
        this.clearFeedback(milestoneId, taskId, 'frontend'),
        this.clearFeedback(milestoneId, taskId, 'backend'),
      ]);
      return;
    }

    const feedbackPath = this.getFeedbackPath(milestoneId, taskId, appTarget);
    try {
      await fs.unlink(feedbackPath);
      await fs.unlink(feedbackPath.replace('.md', '.json'));
    } catch {
      // Files don't exist, that's fine
    }
  }

  /**
   * Clear master plan feedback
   */
  async clearMasterFeedback(appTarget?: FeedbackAppTarget): Promise<void> {
    if (this.isFullstack && !appTarget) {
      // Clear all app feedback
      await Promise.all([
        this.clearMasterFeedback('unified'),
        this.clearMasterFeedback('frontend'),
        this.clearMasterFeedback('backend'),
      ]);
      return;
    }

    const feedbackPath = this.getMasterFeedbackPath(appTarget);
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
  private formatFeedbackAsMarkdown(
    feedback: ReviewerFeedback[],
    appTarget?: FeedbackAppTarget
  ): string {
    const lines: string[] = [];

    // Header with app target for fullstack
    if (appTarget && this.isFullstack) {
      const appLabel = appTarget.charAt(0).toUpperCase() + appTarget.slice(1);
      lines.push(`# ${appLabel} Reviewer Feedback\n`);
    } else {
      lines.push('# Reviewer Feedback\n');
    }

    for (const fb of feedback) {
      lines.push(`## ${fb.reviewer.toUpperCase()} Review`);
      lines.push(`- **Score:** ${fb.score}%`);
      lines.push(`- **Timestamp:** ${fb.timestamp}`);
      if (fb.appTarget) {
        lines.push(`- **App Target:** ${fb.appTarget}`);
      }
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
    taskId?: string,
    appTarget?: FeedbackAppTarget
  ): Promise<{
    averageScore: number;
    allConcerns: string[];
    allRecommendations: string[];
    combinedAnalysis: string;
  }> {
    const feedback = await this.loadFeedback(milestoneId, taskId, appTarget);

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
   * Get combined feedback for all apps (fullstack)
   */
  async getFullstackCombinedFeedback(
    milestoneId: string,
    taskId?: string
  ): Promise<{
    unified: { averageScore: number; allConcerns: string[]; allRecommendations: string[]; combinedAnalysis: string };
    frontend: { averageScore: number; allConcerns: string[]; allRecommendations: string[]; combinedAnalysis: string };
    backend: { averageScore: number; allConcerns: string[]; allRecommendations: string[]; combinedAnalysis: string };
    overallScore: number;
    allTaggedConcerns: TaggedItem[];
    allTaggedRecommendations: TaggedItem[];
  }> {
    const [unified, frontend, backend] = await Promise.all([
      this.getCombinedFeedbackForRevision(milestoneId, taskId, 'unified'),
      this.getCombinedFeedbackForRevision(milestoneId, taskId, 'frontend'),
      this.getCombinedFeedbackForRevision(milestoneId, taskId, 'backend'),
    ]);

    // Calculate overall score (weighted average - unified counts more)
    const scores = [unified.averageScore, frontend.averageScore, backend.averageScore].filter(s => s > 0);
    const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Create tagged concerns and recommendations
    const allTaggedConcerns: TaggedItem[] = [
      ...unified.allConcerns.map(c => ({ app: 'unified' as ReviewAppTarget, content: c })),
      ...frontend.allConcerns.map(c => ({ app: 'frontend' as ReviewAppTarget, content: c })),
      ...backend.allConcerns.map(c => ({ app: 'backend' as ReviewAppTarget, content: c })),
    ];

    const allTaggedRecommendations: TaggedItem[] = [
      ...unified.allRecommendations.map(r => ({ app: 'unified' as ReviewAppTarget, content: r })),
      ...frontend.allRecommendations.map(r => ({ app: 'frontend' as ReviewAppTarget, content: r })),
      ...backend.allRecommendations.map(r => ({ app: 'backend' as ReviewAppTarget, content: r })),
    ];

    return {
      unified,
      frontend,
      backend,
      overallScore,
      allTaggedConcerns,
      allTaggedRecommendations,
    };
  }

  /**
   * Update plan status
   */
  async updateStatus(
    status: 'draft' | 'reviewing' | 'approved' | 'implemented',
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(type, milestoneId, taskId);

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
   * Update per-app approval status (fullstack)
   */
  async updateAppApproval(
    type: 'master' | 'milestone' | 'task',
    appTarget: FeedbackAppTarget,
    approved: boolean,
    score: number,
    milestoneId?: string,
    taskId?: string
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(type, milestoneId, taskId);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: PlanMetadata = JSON.parse(content);

      if (appTarget === 'frontend') {
        metadata.frontendApproved = approved;
        metadata.frontendScore = score;
      } else if (appTarget === 'backend') {
        metadata.backendApproved = approved;
        metadata.backendScore = score;
      } else {
        metadata.unifiedApproved = approved;
        metadata.unifiedScore = score;
      }

      metadata.updatedAt = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {
      // Metadata doesn't exist yet
    }
  }

  /**
   * Record a correction/revision
   */
  async recordCorrection(
    type: 'master' | 'milestone' | 'task',
    correction: CorrectionRecord,
    milestoneId?: string,
    taskId?: string
  ): Promise<void> {
    const metadataPath = this.getMetadataPath(type, milestoneId, taskId);

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: PlanMetadata = JSON.parse(content);

      if (!metadata.corrections) {
        metadata.corrections = [];
      }
      metadata.corrections.push(correction);
      metadata.totalIterations = (metadata.totalIterations || 0) + 1;
      metadata.updatedAt = new Date().toISOString();

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch {
      // Metadata doesn't exist yet
    }
  }

  /**
   * Load metadata for a plan
   */
  async loadMetadata(
    type: 'master' | 'milestone' | 'task',
    milestoneId?: string,
    taskId?: string
  ): Promise<PlanMetadata | null> {
    try {
      const metadataPath = this.getMetadataPath(type, milestoneId, taskId);
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get plan tracking summary for a milestone
   */
  async getMilestoneTrackingSummary(milestoneId: string): Promise<{
    milestonePlan: {
      exists: boolean;
      score?: number;
      status?: string;
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
      frontendApproved?: boolean;
      backendApproved?: boolean;
      unifiedApproved?: boolean;
    };
    taskPlans: Array<{
      taskId: string;
      taskName?: string;
      exists: boolean;
      score?: number;
      status?: string;
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
    }>;
  }> {
    const milestoneDir = path.join(this.plansDir, `milestone-${milestoneId}`);

    // Check milestone plan
    let milestonePlan: {
      exists: boolean;
      score?: number;
      status?: string;
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
      frontendApproved?: boolean;
      backendApproved?: boolean;
      unifiedApproved?: boolean;
    } = { exists: false };

    try {
      const metadataPath = path.join(milestoneDir, 'metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: PlanMetadata = JSON.parse(content);
      milestonePlan = {
        exists: true,
        score: metadata.consensusScore,
        status: metadata.status,
        frontendScore: metadata.frontendScore,
        backendScore: metadata.backendScore,
        unifiedScore: metadata.unifiedScore,
        frontendApproved: metadata.frontendApproved,
        backendApproved: metadata.backendApproved,
        unifiedApproved: metadata.unifiedApproved,
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
      frontendScore?: number;
      backendScore?: number;
      unifiedScore?: number;
    }> = [];

    try {
      // Check for new structure (tasks/ subdirectory)
      if (this.isFullstack) {
        const tasksDir = path.join(milestoneDir, 'tasks');
        try {
          const taskDirs = await fs.readdir(tasksDir);
          for (const taskDir of taskDirs) {
            if (taskDir.startsWith('task-')) {
              const metadataPath = path.join(tasksDir, taskDir, 'metadata.json');
              try {
                const content = await fs.readFile(metadataPath, 'utf-8');
                const metadata: PlanMetadata = JSON.parse(content);
                taskPlans.push({
                  taskId: metadata.taskId || taskDir.replace('task-', ''),
                  taskName: metadata.taskName,
                  exists: true,
                  score: metadata.consensusScore,
                  status: metadata.status,
                  frontendScore: metadata.frontendScore,
                  backendScore: metadata.backendScore,
                  unifiedScore: metadata.unifiedScore,
                });
              } catch {
                // Skip invalid files
              }
            }
          }
        } catch {
          // tasks directory doesn't exist
        }
      }

      // Also check legacy structure
      const files = await fs.readdir(milestoneDir);
      const taskMetadataFiles = files.filter(f => f.startsWith('task-') && f.endsWith('-metadata.json'));

      for (const file of taskMetadataFiles) {
        try {
          const content = await fs.readFile(path.join(milestoneDir, file), 'utf-8');
          const metadata: PlanMetadata = JSON.parse(content);
          // Avoid duplicates
          if (!taskPlans.find(t => t.taskId === metadata.taskId)) {
            taskPlans.push({
              taskId: metadata.taskId || '',
              taskName: metadata.taskName,
              exists: true,
              score: metadata.consensusScore,
              status: metadata.status,
              frontendScore: metadata.frontendScore,
              backendScore: metadata.backendScore,
              unifiedScore: metadata.unifiedScore,
            });
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return { milestonePlan, taskPlans };
  }

  /**
   * Get comprehensive tracking record for the entire project
   */
  async getProjectTrackingRecord(): Promise<{
    masterPlan: PlanMetadata | null;
    milestones: Array<{
      metadata: PlanMetadata | null;
      tasks: Array<{ metadata: PlanMetadata | null }>;
    }>;
    totalCorrections: number;
    totalIterations: number;
  }> {
    // Load master plan metadata
    const masterPlan = await this.loadMetadata('master');

    // Find all milestone directories
    const milestones: Array<{
      metadata: PlanMetadata | null;
      tasks: Array<{ metadata: PlanMetadata | null }>;
    }> = [];

    try {
      const entries = await fs.readdir(this.plansDir, { withFileTypes: true });
      const milestoneDirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith('milestone-'))
        .map(e => e.name);

      for (const milestoneDir of milestoneDirs) {
        const milestoneId = milestoneDir.replace('milestone-', '');
        const milestoneMetadata = await this.loadMetadata('milestone', milestoneId);

        // Get tasks for this milestone
        const { taskPlans } = await this.getMilestoneTrackingSummary(milestoneId);
        const tasks = await Promise.all(
          taskPlans.map(async (tp) => ({
            metadata: await this.loadMetadata('task', milestoneId, tp.taskId),
          }))
        );

        milestones.push({ metadata: milestoneMetadata, tasks });
      }
    } catch {
      // Plans directory doesn't exist
    }

    // Calculate totals
    let totalCorrections = 0;
    let totalIterations = 0;

    if (masterPlan) {
      totalCorrections += masterPlan.corrections?.length || 0;
      totalIterations += masterPlan.totalIterations || 0;
    }

    for (const m of milestones) {
      if (m.metadata) {
        totalCorrections += m.metadata.corrections?.length || 0;
        totalIterations += m.metadata.totalIterations || 0;
      }
      for (const t of m.tasks) {
        if (t.metadata) {
          totalCorrections += t.metadata.corrections?.length || 0;
          totalIterations += t.metadata.totalIterations || 0;
        }
      }
    }

    return {
      masterPlan,
      milestones,
      totalCorrections,
      totalIterations,
    };
  }

  /**
   * Get all feedback file paths for the project
   */
  async getAllFeedbackPaths(): Promise<{
    master: { unified?: string; frontend?: string; backend?: string };
    milestones: Array<{
      milestoneId: string;
      paths: { unified?: string; frontend?: string; backend?: string };
      tasks: Array<{
        taskId: string;
        paths: { unified?: string; frontend?: string; backend?: string };
      }>;
    }>;
  }> {
    const result: {
      master: { unified?: string; frontend?: string; backend?: string };
      milestones: Array<{
        milestoneId: string;
        paths: { unified?: string; frontend?: string; backend?: string };
        tasks: Array<{
          taskId: string;
          paths: { unified?: string; frontend?: string; backend?: string };
        }>;
      }>;
    } = {
      master: {},
      milestones: [],
    };

    // Master plan paths
    if (this.isFullstack) {
      result.master = {
        unified: this.getMasterFeedbackPath('unified'),
        frontend: this.getMasterFeedbackPath('frontend'),
        backend: this.getMasterFeedbackPath('backend'),
      };
    } else {
      result.master = {
        unified: this.getMasterFeedbackPath(),
      };
    }

    // Find milestone directories
    try {
      const entries = await fs.readdir(this.plansDir, { withFileTypes: true });
      const milestoneDirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith('milestone-'))
        .map(e => e.name);

      for (const dir of milestoneDirs) {
        const milestoneId = dir.replace('milestone-', '');
        const milestonePaths: { unified?: string; frontend?: string; backend?: string } = {};

        if (this.isFullstack) {
          milestonePaths.unified = this.getFeedbackPath(milestoneId, undefined, 'unified');
          milestonePaths.frontend = this.getFeedbackPath(milestoneId, undefined, 'frontend');
          milestonePaths.backend = this.getFeedbackPath(milestoneId, undefined, 'backend');
        } else {
          milestonePaths.unified = this.getFeedbackPath(milestoneId);
        }

        // Get task paths
        const { taskPlans } = await this.getMilestoneTrackingSummary(milestoneId);
        const tasks = taskPlans.map(tp => {
          const taskPaths: { unified?: string; frontend?: string; backend?: string } = {};

          if (this.isFullstack) {
            taskPaths.unified = this.getFeedbackPath(milestoneId, tp.taskId, 'unified');
            taskPaths.frontend = this.getFeedbackPath(milestoneId, tp.taskId, 'frontend');
            taskPaths.backend = this.getFeedbackPath(milestoneId, tp.taskId, 'backend');
          } else {
            taskPaths.unified = this.getFeedbackPath(milestoneId, tp.taskId);
          }

          return { taskId: tp.taskId, paths: taskPaths };
        });

        result.milestones.push({ milestoneId, paths: milestonePaths, tasks });
      }
    } catch {
      // Plans directory doesn't exist
    }

    return result;
  }
}


/**
 * Create a plan storage instance for a project
 */
export function createPlanStorage(projectDir: string, isFullstack: boolean = false): PlanStorage {
  return new PlanStorage(projectDir, isFullstack);
}
