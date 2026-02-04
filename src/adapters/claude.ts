/**
 * Claude Agent SDK adapter
 * Wraps the Claude Agent SDK for code execution and generation
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { homedir } from 'os';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Options for executing a prompt through Claude
 */
export interface ClaudeExecuteOptions {
  cwd?: string;
  allowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  systemPrompt?: string;
  timeout?: number;
  onMessage?: (message: SDKMessage) => void;
  onProgress?: (message: string) => void;
  /**
   * Rate limit handling configuration
   * Set to false to disable rate limit retries
   */
  rateLimitConfig?: {
    maxRetries?: number;
    baseWaitMs?: number;
    maxWaitMs?: number;
  } | false;
}

/**
 * Log directory for debug information
 */
const LOG_DIR = path.join(homedir(), '.popeye', 'logs');

/**
 * Rate limit handling configuration
 */
interface RateLimitConfig {
  maxRetries: number;
  baseWaitMs: number;
  maxWaitMs: number;
}

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseWaitMs: 60_000, // 1 minute
  maxWaitMs: 10 * 60_000, // 10 minutes max - don't wait longer than this
};

/**
 * Parse rate limit reset time from error message
 * Messages like: "You've hit your limit · resets 3pm (Asia/Jerusalem)"
 */
function parseRateLimitResetTime(message: string): Date | null {
  // Try to parse time like "3pm", "3:30pm", "15:00"
  const timePatterns = [
    /resets?\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
    /until\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
    /wait\s+until\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
  ];

  for (const pattern of timePatterns) {
    const match = message.match(pattern);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const ampm = match[3]?.toLowerCase();

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      const resetTime = new Date();
      resetTime.setHours(hours, minutes, 0, 0);

      // If the time has passed today, assume tomorrow
      if (resetTime.getTime() <= Date.now()) {
        resetTime.setDate(resetTime.getDate() + 1);
      }

      return resetTime;
    }
  }

  // Try to parse duration like "30 minutes", "1 hour"
  const durationPatterns = [
    /(\d+)\s*minutes?/i,
    /(\d+)\s*hours?/i,
  ];

  for (let i = 0; i < durationPatterns.length; i++) {
    const match = message.match(durationPatterns[i]);
    if (match) {
      const value = parseInt(match[1], 10);
      const multiplier = i === 0 ? 60_000 : 60 * 60_000; // minutes or hours
      return new Date(Date.now() + value * multiplier);
    }
  }

  return null;
}

/**
 * Format wait time for display
 */
function formatWaitTime(ms: number): string {
  if (ms < 60_000) {
    return `${Math.ceil(ms / 1000)} seconds`;
  } else if (ms < 60 * 60_000) {
    const minutes = Math.ceil(ms / 60_000);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(ms / (60 * 60_000));
    const minutes = Math.ceil((ms % (60 * 60_000)) / 60_000);
    return `${hours} hour${hours > 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minute${minutes > 1 ? 's' : ''}` : ''}`;
  }
}

/**
 * Sleep for a specified duration with progress updates
 */
async function sleepWithProgress(
  ms: number,
  onProgress?: (message: string) => void
): Promise<void> {
  const startTime = Date.now();
  const endTime = startTime + ms;
  const updateInterval = Math.min(ms / 10, 60_000); // Update every 10% or minute, whichever is smaller

  while (Date.now() < endTime) {
    const remaining = endTime - Date.now();
    if (remaining <= 0) break;

    onProgress?.(`Rate limit: waiting ${formatWaitTime(remaining)} before retry...`);

    const sleepTime = Math.min(updateInterval, remaining);
    await new Promise(resolve => setTimeout(resolve, sleepTime));
  }
}

/**
 * Extract just the rate limit message from a larger string
 * e.g., "Some content... You've hit your limit · resets 3pm (Asia/Jerusalem)" -> "You've hit your limit · resets 3pm (Asia/Jerusalem)"
 */
function extractRateLimitMessage(content: string): string {
  // Look for specific rate limit error message patterns
  // These patterns are designed to match actual error messages, not plan content
  const patterns = [
    // "You've hit your limit" patterns - common Claude error
    /You['']ve hit your limit[^.\n]*(?:\.[\s]*(?:resets?|try again)[^.\n]*)?/i,
    // "Rate limit exceeded" - explicit error message
    /rate limit exceeded[^.\n]*/i,
    // "rate limited" as verb - "you have been rate limited"
    /(?:you\s+(?:have\s+)?(?:been\s+)?)?rate\s+limited[^.\n]*/i,
    // "too many requests" - HTTP 429 style
    /too many requests[^.\n]*/i,
    // "quota exceeded" - usage limit
    /quota exceeded[^.\n]*/i,
    // "API rate limit" - specific to API errors
    /api\s+rate\s+limit[^.\n]*/i,
    // "request limit" patterns
    /request\s+limit[^.\n]*(?:reached|exceeded|hit)[^.\n]*/i,
    // "usage limit" patterns
    /usage\s+limit[^.\n]*(?:reached|exceeded|hit)[^.\n]*/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      // Limit matched content to 200 chars to prevent capturing run-on text
      const matched = match[0].trim();
      return matched.length > 200 ? matched.slice(0, 197) + '...' : matched;
    }
  }

  // If no pattern matches, try to find the first line that looks like an error
  const lines = content.split('\n').filter(line => line.trim());
  for (const line of lines.slice(0, 5)) {
    const trimmedLine = line.trim();
    // Look for lines that start with error indicators
    if (/^(error|failed|limit|exceeded|denied)/i.test(trimmedLine)) {
      return trimmedLine.length > 200 ? trimmedLine.slice(0, 197) + '...' : trimmedLine;
    }
  }

  // If content is short, return it (but cap at 200 chars)
  if (content.length < 200) {
    return content;
  }

  // Otherwise return a generic message - don't include potentially huge content
  return 'Rate limit detected (details unavailable)';
}

/**
 * Check if an error indicates a rate limit
 * Uses specific patterns to avoid false positives from plan content mentioning rate limiting
 */
function isRateLimitError(error: unknown, message?: string): boolean {
  // Patterns that indicate actual rate limit errors (not just mentions of rate limiting)
  // These are more specific than just "rate limit" to avoid matching plan content
  const rateLimitPatterns = [
    /you['']ve hit your limit/i,
    /rate_limit_exceeded/i,
    /rate limit exceeded/i,
    /you have been rate limited/i,
    /too many requests/i,
    /quota exceeded/i,
    /\b429\b/,  // HTTP 429 status code
    /rate limited/i,  // "rate limited" as a verb phrase
    /api rate limit/i,
    /request limit reached/i,
    /usage limit exceeded/i,
    /limit reached.*try again/i,
    /exceeded.*limit.*retry/i,
  ];

  const checkString = (str: string): boolean => {
    return rateLimitPatterns.some(pattern => pattern.test(str));
  };

  if (message && checkString(message)) return true;

  if (error instanceof Error) {
    if (checkString(error.message)) return true;
    if ('code' in error && typeof error.code === 'string' && checkString(error.code)) return true;
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.error === 'string' && checkString(obj.error)) return true;
    if (typeof obj.code === 'string' && checkString(obj.code)) return true;
    if (typeof obj.message === 'string' && checkString(obj.message)) return true;
  }

  return false;
}

/**
 * Write error details to a log file for debugging
 */
async function logErrorDetails(
  error: unknown,
  context: {
    prompt?: string;
    lastMessages?: SDKMessage[];
    response?: string;
  }
): Promise<string> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(LOG_DIR, `claude-error-${timestamp}.log`);

    const errorDetails = [
      '='.repeat(80),
      `CLAUDE ERROR LOG - ${new Date().toISOString()}`,
      '='.repeat(80),
      '',
      '## Error Details',
      `Type: ${error instanceof Error ? error.constructor.name : typeof error}`,
      `Message: ${error instanceof Error ? error.message : String(error)}`,
      '',
    ];

    if (error instanceof Error && error.stack) {
      errorDetails.push('## Stack Trace', error.stack, '');
    }

    if (context.prompt) {
      errorDetails.push(
        '## Prompt (truncated)',
        context.prompt.slice(0, 2000),
        ''
      );
    }

    if (context.response) {
      errorDetails.push(
        '## Response Before Error (truncated)',
        context.response.slice(-2000),
        ''
      );
    }

    if (context.lastMessages && context.lastMessages.length > 0) {
      errorDetails.push(
        '## Last Messages',
        JSON.stringify(context.lastMessages.slice(-5), null, 2),
        ''
      );
    }

    await fs.writeFile(logFile, errorDetails.join('\n'), 'utf-8');
    return logFile;
  } catch {
    return '';
  }
}

/**
 * Result from Claude execution
 */
export interface ClaudeExecuteResult {
  success: boolean;
  response: string;
  toolCalls: ToolCallRecord[];
  error?: string;
}

/**
 * Record of a tool call made by Claude
 */
export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output?: string;
}

/**
 * Default allowed tools for autonomous operation
 */
export const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Bash',
  'Grep',
  'Glob',
  'LS',
  'TodoRead',
  'TodoWrite',
];

/**
 * Execute a prompt through the Claude Agent SDK (internal implementation)
 */
async function executePromptInternal(
  prompt: string,
  options: ClaudeExecuteOptions = {}
): Promise<ClaudeExecuteResult & { rateLimitInfo?: { isRateLimit: boolean; resetTime?: Date; message?: string } }> {
  const {
    cwd,
    allowedTools = DEFAULT_ALLOWED_TOOLS,
    permissionMode = 'bypassPermissions',
    systemPrompt,
    onMessage,
    onProgress,
  } = options;

  const toolCalls: ToolCallRecord[] = [];
  const recentMessages: SDKMessage[] = [];
  let response = '';
  let error: string | undefined;
  let rateLimitInfo: { isRateLimit: boolean; resetTime?: Date; message?: string } | undefined;
  let lastProgressTime = Date.now();

  try {
    onProgress?.('Connecting to Claude...');

    const result = query({
      prompt,
      options: {
        cwd,
        allowedTools,
        permissionMode,
        systemPrompt: systemPrompt || { type: 'preset', preset: 'claude_code' },
      },
    });

    onProgress?.('Claude is thinking...');

    for await (const message of result) {
      // Keep track of recent messages for error logging
      recentMessages.push(message);
      if (recentMessages.length > 10) {
        recentMessages.shift();
      }

      // Call the message handler if provided
      if (onMessage) {
        onMessage(message);
      }

      // Report progress based on message type
      const now = Date.now();
      if (now - lastProgressTime > 2000) {
        // Report progress every 2 seconds
        lastProgressTime = now;
      }

      // Check for rate limit in message error field
      const messageWithError = message as { error?: string | { message?: string; code?: string }; message?: { content?: Array<{ text?: string }> } };
      if (messageWithError.error) {
        const errorStr = typeof messageWithError.error === 'string'
          ? messageWithError.error
          : messageWithError.error.message || '';

        if (isRateLimitError(null, errorStr)) {
          // Extract rate limit message from response content
          let rateLimitMessage = errorStr;
          if (messageWithError.message?.content) {
            const textContent = messageWithError.message.content.find(c => c.text);
            if (textContent?.text) {
              rateLimitMessage = textContent.text;
            }
          }

          const extractedMessage = extractRateLimitMessage(rateLimitMessage);
          rateLimitInfo = {
            isRateLimit: true,
            resetTime: parseRateLimitResetTime(rateLimitMessage) ?? undefined,
            message: extractedMessage,
          };
          error = `Rate limit exceeded: ${extractedMessage}`;
          onProgress?.(`Rate limit hit: ${rateLimitMessage}`);
          continue;
        }
      }

      // Process different message types
      if (message.type === 'assistant') {
        const assistantMessage = message as { type: 'assistant'; message: { content: string | Array<{ type: string; text?: string }> } };
        if (typeof assistantMessage.message.content === 'string') {
          response += assistantMessage.message.content;

          // Check for rate limit in text response
          if (isRateLimitError(null, assistantMessage.message.content)) {
            const extractedMsg = extractRateLimitMessage(assistantMessage.message.content);
            rateLimitInfo = {
              isRateLimit: true,
              resetTime: parseRateLimitResetTime(assistantMessage.message.content) ?? undefined,
              message: extractedMsg,
            };
            error = `Rate limit exceeded: ${extractedMsg}`;
            onProgress?.(`Rate limit hit: ${assistantMessage.message.content}`);
          } else {
            onProgress?.('Claude is writing...');
          }
        } else if (Array.isArray(assistantMessage.message.content)) {
          for (const block of assistantMessage.message.content) {
            if (block.type === 'text' && block.text) {
              response += block.text;

              // Check for rate limit in text block
              if (isRateLimitError(null, block.text)) {
                const extractedBlockMsg = extractRateLimitMessage(block.text);
                rateLimitInfo = {
                  isRateLimit: true,
                  resetTime: parseRateLimitResetTime(block.text) ?? undefined,
                  message: extractedBlockMsg,
                };
                error = `Rate limit exceeded: ${extractedBlockMsg}`;
                onProgress?.(`Rate limit hit: ${block.text}`);
              }
            }
            if (block.type === 'tool_use') {
              const toolBlock = block as { type: 'tool_use'; name?: string };
              onProgress?.(`Using tool: ${toolBlock.name || 'unknown'}...`);
            }
          }
        }
      } else if (message.type === 'result') {
        // Handle result messages which may contain tool information or errors
        const resultMessage = message as {
          type: 'result';
          result?: string;
          error?: { message?: string; code?: string };
          subtype?: string;
        };
        if (resultMessage.error && !rateLimitInfo) {
          const errMsg = resultMessage.error.message || 'Unknown error';
          const errCode = resultMessage.error.code || 'ERROR';
          error = `${errCode}: ${errMsg}`;
          onProgress?.(`Claude returned error: ${error}`);
        }
      }

      // Check for any error property on the message (handles various error formats)
      if (messageWithError.error && !error && !rateLimitInfo) {
        const errMsg = typeof messageWithError.error === 'string'
          ? messageWithError.error
          : messageWithError.error.message || 'Unknown error';
        const errCode = typeof messageWithError.error === 'object'
          ? messageWithError.error.code || 'ERROR'
          : 'ERROR';
        error = `${errCode}: ${errMsg}`;
        onProgress?.(`Error detected: ${error}`);
      }
    }

    onProgress?.('Claude finished');

    return {
      success: !error,
      response: response.trim(),
      toolCalls,
      error,
      rateLimitInfo,
    };
  } catch (err) {
    // First, check if we already detected a rate limit during message processing
    // This happens when rate limit is detected in the stream but process still exits with code 1
    if (rateLimitInfo?.isRateLimit) {
      onProgress?.(`Rate limit detected (process exited): ${rateLimitInfo.message || 'Unknown'}`);
      return {
        success: false,
        response: response.trim(),
        toolCalls,
        error: `Rate limit exceeded: ${rateLimitInfo.message || 'Rate limit hit'}`,
        rateLimitInfo,
      };
    }

    // Check if the exception itself indicates a rate limit
    const errMsg = err instanceof Error ? err.message : String(err);

    if (isRateLimitError(err, errMsg) || isRateLimitError(null, response)) {
      const combinedMessage = response || errMsg;
      const extractedRateLimitMsg = extractRateLimitMessage(combinedMessage);
      return {
        success: false,
        response: response.trim(),
        toolCalls,
        error: `Rate limit exceeded: ${extractedRateLimitMsg}`,
        rateLimitInfo: {
          isRateLimit: true,
          resetTime: parseRateLimitResetTime(combinedMessage) ?? undefined,
          message: extractedRateLimitMsg,
        },
      };
    }

    // Log detailed error information for debugging
    const logFile = await logErrorDetails(err, {
      prompt: prompt.slice(0, 5000),
      lastMessages: recentMessages,
      response: response.slice(-3000),
    });

    // Build a detailed error message
    let errorMsg = err instanceof Error ? err.message : 'Unknown error executing prompt';

    // Check for common error patterns and provide helpful messages
    if (errorMsg.includes('exited with code 1')) {
      errorMsg = `Claude Code process failed (exit code 1). `;
      if (response) {
        // Try to extract any error indicators from the response
        const lastLines = response.split('\n').slice(-10).join('\n');
        if (lastLines.includes('error') || lastLines.includes('Error') || lastLines.includes('failed')) {
          errorMsg += `Last output: ${lastLines.slice(0, 500)}`;
        }
      }
      if (logFile) {
        errorMsg += ` Debug log: ${logFile}`;
      }
    } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
      errorMsg = 'Cannot connect to Claude Code CLI. Is it installed and running?';
    } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      errorMsg = 'Claude Code request timed out. The task may be too complex.';
    } else if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
      errorMsg = `Permission error: ${errorMsg}. Check tool permissions.`;
    }

    onProgress?.(`Error: ${errorMsg}`);

    return {
      success: false,
      response: response.trim(),
      toolCalls,
      error: errorMsg,
    };
  }
}

/**
 * Execute a prompt through the Claude Agent SDK with rate limit retry handling
 *
 * @param prompt - The prompt to execute
 * @param options - Execution options
 * @returns The execution result
 */
export async function executePrompt(
  prompt: string,
  options: ClaudeExecuteOptions = {}
): Promise<ClaudeExecuteResult> {
  const { onProgress, rateLimitConfig: userRateLimitConfig } = options;

  // If rate limit handling is disabled, run once without retry
  if (userRateLimitConfig === false) {
    const result = await executePromptInternal(prompt, options);
    return {
      success: result.success,
      response: result.response,
      toolCalls: result.toolCalls,
      error: result.error,
    };
  }

  // Merge user config with defaults
  const rateLimitConfig: RateLimitConfig = {
    ...DEFAULT_RATE_LIMIT_CONFIG,
    ...userRateLimitConfig,
  };

  let attempt = 0;

  while (attempt < rateLimitConfig.maxRetries) {
    const result = await executePromptInternal(prompt, options);

    // If no rate limit, return the result
    if (!result.rateLimitInfo?.isRateLimit) {
      return {
        success: result.success,
        response: result.response,
        toolCalls: result.toolCalls,
        error: result.error,
      };
    }

    // Rate limit detected - calculate wait time
    attempt++;

    if (attempt >= rateLimitConfig.maxRetries) {
      onProgress?.(`Rate limit: max retries (${rateLimitConfig.maxRetries}) exceeded`);
      return {
        success: false,
        response: result.response,
        toolCalls: result.toolCalls,
        error: `Rate limit exceeded after ${attempt} retries. ${result.rateLimitInfo.message || ''}`,
      };
    }

    // Calculate wait time
    let waitMs: number;

    if (result.rateLimitInfo.resetTime) {
      // Use parsed reset time
      waitMs = result.rateLimitInfo.resetTime.getTime() - Date.now();
      // Add a small buffer
      waitMs += 30_000;
    } else {
      // Use exponential backoff
      waitMs = Math.min(
        rateLimitConfig.baseWaitMs * Math.pow(2, attempt - 1),
        rateLimitConfig.maxWaitMs
      );
    }

    // Ensure minimum wait time
    waitMs = Math.max(waitMs, 30_000);

    // IMPORTANT: Cap wait time to maxWaitMs - don't wait hours for rate limits
    if (waitMs > rateLimitConfig.maxWaitMs) {
      onProgress?.(`Rate limit reset time is too far in the future (${formatWaitTime(waitMs)})`);
      onProgress?.(`Maximum wait time is ${formatWaitTime(rateLimitConfig.maxWaitMs)}. Please try again later.`);
      return {
        success: false,
        response: result.response,
        toolCalls: result.toolCalls,
        error: `Rate limit exceeded. Reset time is ${formatWaitTime(waitMs)} away - too long to wait. Please try again later.`,
      };
    }

    onProgress?.(`Rate limit hit (attempt ${attempt}/${rateLimitConfig.maxRetries}). ${result.rateLimitInfo.message || ''}`);
    onProgress?.(`Waiting ${formatWaitTime(waitMs)} before retry...`);

    // Wait with progress updates
    await sleepWithProgress(waitMs, onProgress);

    onProgress?.(`Retrying after rate limit (attempt ${attempt + 1}/${rateLimitConfig.maxRetries})...`);
  }

  // Should not reach here, but just in case
  return {
    success: false,
    response: '',
    toolCalls: [],
    error: 'Rate limit handling failed unexpectedly',
  };
}

/**
 * Execute code generation for a specific task
 *
 * @param task - The task description
 * @param context - Additional context about the project
 * @param options - Execution options
 */
export async function generateCode(
  task: string,
  context: string,
  options: ClaudeExecuteOptions = {}
): Promise<ClaudeExecuteResult> {
  const prompt = `
## Task
${task}

## Project Context
${context}

## Instructions
1. Implement the task following best practices
2. Write clean, well-documented code
3. Include appropriate error handling
4. Follow the project's existing patterns and style

Please implement this task now.
`.trim();

  return executePrompt(prompt, {
    ...options,
    allowedTools: options.allowedTools || [
      ...DEFAULT_ALLOWED_TOOLS,
      'WebSearch',
      'WebFetch',
    ],
  });
}

/**
 * Run tests and capture results
 *
 * @param testCommand - The test command to run
 * @param cwd - Working directory
 */
export async function runTests(
  testCommand: string,
  cwd?: string
): Promise<ClaudeExecuteResult> {
  const prompt = `
Run the following test command and report the results:

\`\`\`bash
${testCommand}
\`\`\`

After running the tests:
1. Report the total number of tests
2. Report how many passed and failed
3. If there are failures, summarize what failed
4. Provide any relevant error messages
`.trim();

  return executePrompt(prompt, {
    cwd,
    allowedTools: ['Bash', 'Read'],
    permissionMode: 'bypassPermissions',
  });
}

/**
 * Analyze codebase to understand structure and patterns
 *
 * @param cwd - Working directory of the project
 * @param onProgress - Progress callback
 */
export async function analyzeCodebase(
  cwd: string,
  onProgress?: (message: string) => void
): Promise<ClaudeExecuteResult> {
  const prompt = `
Analyze this codebase and provide:

1. **Project Structure**: Overview of directories and their purposes
2. **Key Technologies**: Languages, frameworks, and major dependencies
3. **Architecture Patterns**: Design patterns and architectural decisions observed
4. **Code Style**: Naming conventions, formatting, and documentation style
5. **Test Setup**: Testing framework and test organization
6. **Build/Deploy**: Build tools and deployment configuration

Be concise but thorough in your analysis.
`.trim();

  return executePrompt(prompt, {
    cwd,
    allowedTools: ['Read', 'Glob', 'Grep', 'LS'],
    permissionMode: 'default', // Read-only analysis
    onProgress,
  });
}

/**
 * Extract plan file path from Claude's response
 * Claude sometimes saves the plan to a file and responds with a summary
 */
function extractPlanFilePath(response: string): string | null {
  // Look for plan file paths like /Users/.../.claude/plans/...
  const patterns = [
    /`([^`]*\.claude\/plans\/[^`]+\.md)`/i,
    /saved to\s+`?([^\s`]+\.claude\/plans\/[^\s`]+\.md)`?/i,
    /created at\s+`?([^\s`]+\.claude\/plans\/[^\s`]+\.md)`?/i,
    /plan.*at\s+`?([^\s`]+\.claude\/plans\/[^\s`]+\.md)`?/i,
    /(\/[^\s]+\.claude\/plans\/[^\s]+\.md)/i,
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if response is Claude's thinking/conversation instead of actual plan
 */
function isConversationalResponse(response: string): boolean {
  const conversationalPhrases = [
    'let me ',
    'i will ',
    'i\'ll ',
    'now i have',
    'i now have',
    'let me launch',
    'let me create',
    'i\'ve created',
    'i\'ve analyzed',
    'has been created',
    'has been saved',
    'the plan is structured',
  ];

  const responseLower = response.toLowerCase();
  return conversationalPhrases.some(phrase => responseLower.includes(phrase));
}

/**
 * Build the appropriate prompt for plan creation based on project language
 *
 * @param specification - The project specification
 * @param context - Additional context
 * @param language - Target programming language
 * @returns The prompt string
 */
function buildPlanPrompt(
  specification: string,
  context: string,
  language: 'python' | 'typescript' | 'fullstack'
): string {
  // Base instructions that apply to all projects
  const baseInstructions = `
You are a software architect. Create a detailed, actionable development plan.

CRITICAL INSTRUCTION: You must output the COMPLETE plan content directly in your response as markdown.
Do NOT use tools to save the plan to a file.
Do NOT just describe what the plan contains - output the ACTUAL plan with all milestones and tasks.
Do NOT say "Let me...", "I will...", "I've created...", or any conversational text.

Start your response with "# Development Plan:" and include the FULL plan content.
`.trim();

  // Fullstack-specific format with app tagging
  if (language === 'fullstack') {
    return `
${baseInstructions}

## Project Type: FULLSTACK MONOREPO
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI (Python) + PostgreSQL
- **Structure**: Monorepo with apps/frontend and apps/backend

## Specification
${specification}

${context ? `## Additional Context\n${context}` : ''}

## Required Plan Format for Fullstack Projects

Your response MUST be the complete plan in this EXACT format:

# Development Plan: [Project Name]

## Overview
[2-3 sentence summary mentioning both frontend and backend]

## Architecture
- **Frontend App**: React SPA at apps/frontend/
- **Backend App**: FastAPI service at apps/backend/
- **Communication**: REST API (OpenAPI contract)

---

## Milestone 1: [Name]
**Description**: [What this milestone achieves]

### Frontend Tasks

#### Task 1.1 [FE]: [Actionable task name]
**App**: frontend
**Files**:
- \`apps/frontend/src/components/...\`
- \`apps/frontend/src/pages/...\`
**Dependencies**: None
**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

### Backend Tasks

#### Task 1.2 [BE]: [Actionable task name]
**App**: backend
**Files**:
- \`apps/backend/src/api/routes/...\`
- \`apps/backend/src/models/...\`
**Dependencies**: None
**Acceptance Criteria**:
- [ ] Criterion 1

### Integration Tasks

#### Task 1.3 [INT]: [Actionable task name]
**App**: unified
**Dependencies**: Task 1.1, Task 1.2
**Acceptance Criteria**:
- [ ] Frontend calls backend API successfully
- [ ] E2E test passes

---

## Milestone 2: [Name]
[Continue same pattern...]

---

## Test Plan

### Frontend Tests (apps/frontend)
- **Unit**: Vitest + Testing Library
- **E2E**: Playwright

### Backend Tests (apps/backend)
- **Unit**: pytest
- **Integration**: pytest + TestClient

### Integration Tests
- API contract validation
- E2E user flows

## Risks & Mitigations
[Include frontend, backend, and integration risks separately]

---

## CRITICAL FULLSTACK REQUIREMENTS:
1. **Tag every task** with [FE], [BE], or [INT]
2. **Specify App field** for each task (frontend, backend, or unified)
3. **List exact file paths** under apps/frontend/ or apps/backend/
4. **Group tasks** under "Frontend Tasks", "Backend Tasks", or "Integration Tasks" headers
5. **Include at least 3 milestones** with tasks distributed across FE/BE/INT
6. Each task MUST start with an action verb: Implement, Create, Build, Add, Configure, Set up, Write, Design, etc.
7. Each task MUST be specific and implementable

IMPORTANT: Output the COMPLETE plan now. Start with "# Development Plan:" on the first line.
`.trim();
  }

  // Python-specific format
  if (language === 'python') {
    return `
${baseInstructions}

## Project Type: PYTHON
- **Language**: Python 3.11+
- **Framework**: FastAPI (if API) or CLI
- **Testing**: pytest

## Specification
${specification}

${context ? `## Additional Context\n${context}` : ''}

## Required Plan Format

Your response MUST be the complete plan in this EXACT format:

# Development Plan: [Project Name]

## Overview
[2-3 sentence summary of what will be built]

## Milestone 1: [Name]
**Description**: [What this milestone achieves]

### Task 1.1: [Actionable task name starting with verb]
**Description**: [What this task accomplishes]
**Files to create/modify**: [List specific Python files in src/]
**Acceptance Criteria**:
- [Specific, testable criterion]
- [Another criterion]

### Task 1.2: [Another actionable task]
...

## Milestone 2: [Name]
...

## Test Plan
- pytest for unit tests in tests/
- httpx for API integration tests

## Risks & Mitigations
[Potential issues and how to address them]

## Requirements for Tasks

1. Each task MUST start with an action verb: Implement, Create, Build, Add, Configure, Set up, Write, Design, etc.
2. Each task MUST be specific and implementable
3. Each milestone MUST have at least 3-5 specific tasks
4. The plan MUST have at least 3 milestones for any non-trivial project
5. Files to create/modify MUST be listed for each task
6. Acceptance criteria MUST be testable

IMPORTANT: Output the COMPLETE plan now. Start with "# Development Plan:" on the first line.
`.trim();
  }

  // TypeScript/default format
  return `
${baseInstructions}

## Project Type: TYPESCRIPT
- **Language**: TypeScript
- **Framework**: React + Vite (if frontend) or Node.js
- **Testing**: Vitest

## Specification
${specification}

${context ? `## Additional Context\n${context}` : ''}

## Required Plan Format

Your response MUST be the complete plan in this EXACT format:

# Development Plan: [Project Name]

## Overview
[2-3 sentence summary of what will be built]

## Milestone 1: [Name]
**Description**: [What this milestone achieves]

### Task 1.1: [Actionable task name starting with verb]
**Description**: [What this task accomplishes]
**Files to create/modify**: [List specific TypeScript files in src/]
**Acceptance Criteria**:
- [Specific, testable criterion]
- [Another criterion]

### Task 1.2: [Another actionable task]
...

## Milestone 2: [Name]
...

## Test Plan
- Vitest for unit tests
- Playwright for E2E tests

## Risks & Mitigations
[Potential issues and how to address them]

## Requirements for Tasks

1. Each task MUST start with an action verb: Implement, Create, Build, Add, Configure, Set up, Write, Design, etc.
2. Each task MUST be specific and implementable
3. Each milestone MUST have at least 3-5 specific tasks
4. The plan MUST have at least 3 milestones for any non-trivial project
5. Files to create/modify MUST be listed for each task
6. Acceptance criteria MUST be testable

IMPORTANT: Output the COMPLETE plan now. Start with "# Development Plan:" on the first line.
`.trim();
}

/**
 * Create a development plan from a specification
 *
 * @param specification - The project specification
 * @param context - Additional context (existing code, etc.)
 * @param language - Target programming language (default: 'python')
 * @param onProgress - Progress callback
 */
export async function createPlan(
  specification: string,
  context: string = '',
  language: 'python' | 'typescript' | 'fullstack' = 'python',
  onProgress?: (message: string) => void
): Promise<ClaudeExecuteResult> {
  const prompt = buildPlanPrompt(specification, context, language);

  const result = await executePrompt(prompt, {
    allowedTools: ['Read', 'Glob'],
    permissionMode: 'plan',
    onProgress,
  });

  // If Claude's response is conversational (describes the plan but doesn't contain it),
  // try to extract the plan from the file it may have created
  if (result.success && isConversationalResponse(result.response)) {
    onProgress?.('Detected conversational response, looking for plan file...');

    // Try to find and read the plan file
    const planFilePath = extractPlanFilePath(result.response);

    if (planFilePath) {
      try {
        onProgress?.(`Found plan file reference: ${planFilePath}`);
        const planContent = await fs.readFile(planFilePath, 'utf-8');

        // Verify the plan content is actually a plan
        if (planContent.includes('# Development Plan') ||
            planContent.includes('## Milestone') ||
            planContent.includes('### Task')) {
          onProgress?.('Successfully extracted plan from file');
          return {
            ...result,
            response: planContent,
          };
        }
      } catch (readError) {
        onProgress?.(`Could not read plan file: ${readError instanceof Error ? readError.message : 'Unknown error'}`);
      }
    }

    // Also try to find any recent .claude/plans files
    try {
      const claudePlansDir = path.join(homedir(), '.claude', 'plans');
      const files = await fs.readdir(claudePlansDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length > 0) {
        // Sort by modification time (most recent first)
        const fileStats = await Promise.all(
          mdFiles.map(async f => {
            const filePath = path.join(claudePlansDir, f);
            const stat = await fs.stat(filePath);
            return { name: f, path: filePath, mtime: stat.mtime };
          })
        );

        fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        // Check the most recent file (created in the last 5 minutes)
        const recentFile = fileStats[0];
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        if (recentFile.mtime.getTime() > fiveMinutesAgo) {
          onProgress?.(`Found recent plan file: ${recentFile.name}`);
          const planContent = await fs.readFile(recentFile.path, 'utf-8');

          if (planContent.includes('# Development Plan') ||
              planContent.includes('## Milestone') ||
              planContent.includes('### Task')) {
            onProgress?.('Successfully extracted plan from recent file');
            return {
              ...result,
              response: planContent,
            };
          }
        }
      }
    } catch {
      // Could not access .claude/plans directory
    }

    // Log warning that we couldn't extract the plan
    onProgress?.('WARNING: Could not extract actual plan content from file');
  }

  return result;
}

/**
 * Build revision prompt with language-specific instructions
 */
function buildRevisionPrompt(
  originalPlan: string,
  feedback: string,
  concerns: string[],
  language: 'python' | 'typescript' | 'fullstack'
): string {
  const basePrompt = `
CRITICAL: You must output the COMPLETE revised plan in your response.
Do NOT describe what you changed - output the FULL plan with all changes incorporated.
Do NOT say "Let me...", "I will...", "I've revised...", or any conversational text.
Start your response directly with "# Development Plan:" and include the ENTIRE revised plan.

## Original Plan to Revise
${originalPlan}

## Feedback to Address
${feedback}

## Specific Concerns to Address
${concerns.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Instructions
1. Address each concern by incorporating changes into the plan
2. Maintain the same plan structure (Overview, Milestones, Tasks, Test Plan, Risks)
3. Output the COMPLETE revised plan - not just the changes
4. Start with "# Development Plan:" and include ALL milestones and tasks
`.trim();

  if (language === 'fullstack') {
    return `
${basePrompt}

## FULLSTACK-SPECIFIC REQUIREMENTS:
- Maintain [FE], [BE], [INT] tags on all tasks
- Keep App: field (frontend/backend/unified) for each task
- Group tasks under "Frontend Tasks", "Backend Tasks", "Integration Tasks" headers
- Ensure file paths use apps/frontend/ or apps/backend/ prefixes
- If adding new tasks, tag them appropriately

OUTPUT THE COMPLETE REVISED PLAN NOW:
`.trim();
  }

  return `${basePrompt}

OUTPUT THE COMPLETE REVISED PLAN NOW:
`.trim();
}

/**
 * Revise a plan based on feedback
 *
 * @param originalPlan - The original plan
 * @param feedback - Feedback to incorporate
 * @param concerns - Specific concerns to address
 * @param language - Target programming language (default: 'python')
 * @param onProgress - Progress callback
 */
export async function revisePlan(
  originalPlan: string,
  feedback: string,
  concerns: string[],
  language: 'python' | 'typescript' | 'fullstack' = 'python',
  onProgress?: (message: string) => void
): Promise<ClaudeExecuteResult> {
  const prompt = buildRevisionPrompt(originalPlan, feedback, concerns, language);

  onProgress?.('Claude is revising the plan...');

  const result = await executePrompt(prompt, {
    allowedTools: [],
    permissionMode: 'plan',
    onProgress,
  });

  // Check if response is conversational and try to extract actual plan
  if (result.success && isConversationalResponse(result.response)) {
    // Try to find the plan file
    const planFilePath = extractPlanFilePath(result.response);

    if (planFilePath) {
      try {
        const planContent = await fs.readFile(planFilePath, 'utf-8');
        if (planContent.includes('# Development Plan') ||
            planContent.includes('## Milestone') ||
            planContent.includes('### Task')) {
          return {
            ...result,
            response: planContent,
          };
        }
      } catch {
        // Could not read file, fall through
      }
    }

    // Try recent .claude/plans files
    try {
      const claudePlansDir = path.join(homedir(), '.claude', 'plans');
      const files = await fs.readdir(claudePlansDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length > 0) {
        const fileStats = await Promise.all(
          mdFiles.map(async f => {
            const filePath = path.join(claudePlansDir, f);
            const stat = await fs.stat(filePath);
            return { name: f, path: filePath, mtime: stat.mtime };
          })
        );

        fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        const recentFile = fileStats[0];
        const twoMinutesAgo = Date.now() - 2 * 60 * 1000;

        if (recentFile.mtime.getTime() > twoMinutesAgo) {
          const planContent = await fs.readFile(recentFile.path, 'utf-8');
          if (planContent.includes('# Development Plan') ||
              planContent.includes('## Milestone') ||
              planContent.includes('### Task')) {
            return {
              ...result,
              response: planContent,
            };
          }
        }
      }
    } catch {
      // Could not access .claude/plans directory
    }
  }

  return result;
}
