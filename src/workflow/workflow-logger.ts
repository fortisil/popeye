/**
 * Workflow Logger
 * Provides persistent logging of all workflow stages for transparency and debugging
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  stage: WorkflowStage;
  event: string;
  message: string;
  data?: Record<string, unknown>;
  level: LogLevel;
}

/**
 * Log levels for filtering and display
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

/**
 * Workflow stages for categorization
 */
export type WorkflowStage =
  | 'init'
  | 'plan-generation'
  | 'plan-parsing'
  | 'consensus'
  | 'arbitration'
  | 'execution'
  | 'task'
  | 'milestone'
  | 'testing'
  | 'verification'
  | 'ui-design'
  | 'ui-setup'
  | 'website-strategy'
  | 'test-planning'
  | 'test-review'
  | 'completion';

/**
 * Workflow logger class that persists logs to the project's docs folder
 */
export class WorkflowLogger {
  private projectDir: string;
  private logFile: string;
  private entries: LogEntry[] = [];
  private initialized: boolean = false;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.logFile = path.join(projectDir, 'docs', 'WORKFLOW_LOG.md');
  }

  /**
   * Initialize the logger and load existing entries
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const docsDir = path.join(this.projectDir, 'docs');

    try {
      await fs.mkdir(docsDir, { recursive: true });

      // Check if log file exists
      try {
        const content = await fs.readFile(this.logFile, 'utf-8');
        // Parse existing entries from the file
        this.entries = this.parseExistingLog(content);
      } catch {
        // File doesn't exist yet, start fresh
        this.entries = [];
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize workflow logger:', error);
    }
  }

  /**
   * Parse existing log entries from markdown file
   */
  private parseExistingLog(content: string): LogEntry[] {
    const entries: LogEntry[] = [];

    // Parse entries from the markdown format
    const entryRegex = /### \[(\d{4}-\d{2}-\d{2}T[^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] ([^\n]+)\n([\s\S]*?)(?=### \[|## Session|$)/g;

    let match;
    while ((match = entryRegex.exec(content)) !== null) {
      try {
        const entry: LogEntry = {
          timestamp: match[1],
          level: match[2] as LogLevel,
          stage: match[3] as WorkflowStage,
          event: '',
          message: match[4].trim(),
        };

        // Try to parse data if present
        const dataMatch = match[5]?.match(/```json\n([\s\S]*?)\n```/);
        if (dataMatch) {
          try {
            entry.data = JSON.parse(dataMatch[1]);
          } catch {
            // Ignore JSON parse errors
          }
        }

        entries.push(entry);
      } catch {
        // Skip malformed entries
      }
    }

    return entries;
  }

  /**
   * Log an entry to the workflow log
   */
  async log(
    stage: WorkflowStage,
    event: string,
    message: string,
    data?: Record<string, unknown>,
    level: LogLevel = 'info'
  ): Promise<void> {
    await this.initialize();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      stage,
      event,
      message,
      data,
      level,
    };

    this.entries.push(entry);
    await this.persist();
  }

  /**
   * Log info message
   */
  async info(stage: WorkflowStage, event: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log(stage, event, message, data, 'info');
  }

  /**
   * Log warning message
   */
  async warn(stage: WorkflowStage, event: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log(stage, event, message, data, 'warn');
  }

  /**
   * Log error message
   */
  async error(stage: WorkflowStage, event: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log(stage, event, message, data, 'error');
  }

  /**
   * Log success message
   */
  async success(stage: WorkflowStage, event: string, message: string, data?: Record<string, unknown>): Promise<void> {
    await this.log(stage, event, message, data, 'success');
  }

  /**
   * Log stage start
   */
  async stageStart(stage: WorkflowStage, description: string, data?: Record<string, unknown>): Promise<void> {
    await this.info(stage, 'stage_start', `Starting: ${description}`, data);
  }

  /**
   * Log stage completion
   */
  async stageComplete(stage: WorkflowStage, description: string, data?: Record<string, unknown>): Promise<void> {
    await this.success(stage, 'stage_complete', `Completed: ${description}`, data);
  }

  /**
   * Log stage failure
   */
  async stageFailed(stage: WorkflowStage, description: string, error: string, data?: Record<string, unknown>): Promise<void> {
    await this.error(stage, 'stage_failed', `Failed: ${description} - ${error}`, data);
  }

  /**
   * Persist log entries to file
   */
  private async persist(): Promise<void> {
    try {
      const content = this.formatMarkdown();
      await fs.writeFile(this.logFile, content, 'utf-8');
    } catch (error) {
      console.error('Failed to persist workflow log:', error);
    }
  }

  /**
   * Format log entries as markdown
   */
  private formatMarkdown(): string {
    const lines: string[] = [
      '# Workflow Execution Log',
      '',
      'This file tracks all stages of the Popeye workflow execution for transparency and debugging.',
      '',
      '---',
      '',
    ];

    // Group entries by date
    const entriesByDate = new Map<string, LogEntry[]>();

    for (const entry of this.entries) {
      const date = entry.timestamp.split('T')[0];
      if (!entriesByDate.has(date)) {
        entriesByDate.set(date, []);
      }
      entriesByDate.get(date)!.push(entry);
    }

    // Write entries grouped by date
    for (const [date, dateEntries] of entriesByDate) {
      lines.push(`## Session: ${date}`);
      lines.push('');

      for (const entry of dateEntries) {
        const levelIcon = this.getLevelIcon(entry.level);
        const time = entry.timestamp.split('T')[1].split('.')[0];

        lines.push(`### [${time}] ${levelIcon} **${entry.stage}** - ${entry.message}`);

        if (entry.data && Object.keys(entry.data).length > 0) {
          lines.push('');
          lines.push('<details>');
          lines.push('<summary>Details</summary>');
          lines.push('');
          lines.push('```json');
          lines.push(JSON.stringify(entry.data, null, 2));
          lines.push('```');
          lines.push('</details>');
        }

        lines.push('');
      }
    }

    // Add summary statistics
    lines.push('---');
    lines.push('');
    lines.push('## Summary Statistics');
    lines.push('');
    lines.push(`- **Total Entries:** ${this.entries.length}`);
    lines.push(`- **Errors:** ${this.entries.filter(e => e.level === 'error').length}`);
    lines.push(`- **Warnings:** ${this.entries.filter(e => e.level === 'warn').length}`);
    lines.push(`- **Successful Steps:** ${this.entries.filter(e => e.level === 'success').length}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get icon for log level
   */
  private getLevelIcon(level: LogLevel): string {
    switch (level) {
      case 'error':
        return '[ERROR]';
      case 'warn':
        return '[WARN]';
      case 'success':
        return '[OK]';
      case 'debug':
        return '[DEBUG]';
      default:
        return '[INFO]';
    }
  }

  /**
   * Get all log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries for a specific stage
   */
  getEntriesForStage(stage: WorkflowStage): LogEntry[] {
    return this.entries.filter(e => e.stage === stage);
  }

  /**
   * Get error entries
   */
  getErrors(): LogEntry[] {
    return this.entries.filter(e => e.level === 'error');
  }

  /**
   * Clear the log (for testing or reset)
   */
  async clear(): Promise<void> {
    this.entries = [];
    await this.persist();
  }
}

/**
 * Global logger instances cache
 */
const loggerCache = new Map<string, WorkflowLogger>();

/**
 * Get or create a workflow logger for a project
 */
export function getWorkflowLogger(projectDir: string): WorkflowLogger {
  const normalizedPath = path.resolve(projectDir);

  if (!loggerCache.has(normalizedPath)) {
    loggerCache.set(normalizedPath, new WorkflowLogger(normalizedPath));
  }

  return loggerCache.get(normalizedPath)!;
}

/**
 * Quick logging functions for common use cases
 */
export async function logWorkflowEvent(
  projectDir: string,
  stage: WorkflowStage,
  event: string,
  message: string,
  data?: Record<string, unknown>,
  level: LogLevel = 'info'
): Promise<void> {
  const logger = getWorkflowLogger(projectDir);
  await logger.log(stage, event, message, data, level);
}
