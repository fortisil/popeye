/**
 * OpenAI API adapter
 * Handles consensus reviews and plan validation
 */

import OpenAI from 'openai';
import type { ConsensusResult, ConsensusConfig, OpenAIModel, OutputLanguage } from '../types/index.js';
import { getOpenAIToken } from '../auth/index.js';
import { DEFAULT_CONSENSUS_CONFIG } from '../types/consensus.js';

/**
 * Create an OpenAI client with stored credentials
 */
export async function createClient(): Promise<OpenAI> {
  const apiKey = await getOpenAIToken();

  if (!apiKey) {
    throw new Error('OpenAI API key not found. Run: popeye-cli auth openai');
  }

  return new OpenAI({ apiKey });
}

/**
 * Request consensus review from OpenAI
 *
 * @param plan - The development plan to review
 * @param context - Project context
 * @param config - Consensus configuration
 * @returns Consensus result
 */
export async function requestConsensus(
  plan: string,
  context: string,
  config: Partial<ConsensusConfig> = {}
): Promise<ConsensusResult> {
  const {
    openaiModel = DEFAULT_CONSENSUS_CONFIG.openaiModel,
    temperature = DEFAULT_CONSENSUS_CONFIG.temperature,
    maxTokens = DEFAULT_CONSENSUS_CONFIG.maxTokens,
  } = config;

  const client = await createClient();

  // Build the consensus review prompt (matches spec section 11.1)
  const prompt = buildConsensusPrompt(plan, context);

  try {
    const completion = await client.chat.completions.create({
      model: openaiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    });

    const response = completion.choices[0]?.message?.content || '';
    return parseConsensusResponse(response);
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      // Implement exponential backoff retry
      await sleep(5000);
      return requestConsensus(plan, context, config);
    }
    throw error;
  }
}

/**
 * Build the consensus review prompt
 * Follows spec section 11.1 format
 */
function buildConsensusPrompt(plan: string, context: string): string {
  return `You are a senior software architect reviewing a development plan.
Analyze the following plan for completeness, correctness, and feasibility.

PROJECT CONTEXT:
${context}

PROPOSED PLAN:
${plan}

Please provide:
1. ANALYSIS: Detailed review of the plan
2. STRENGTHS: What works well
3. CONCERNS: Issues or gaps identified
4. RECOMMENDATIONS: Specific improvements
5. CONSENSUS SCORE: A percentage (0-100%) indicating your agreement
   - 95-100%: Ready for execution
   - 80-94%: Minor revisions needed
   - 60-79%: Significant revisions needed
   - Below 60%: Major rework required

Format your consensus score as: CONSENSUS: [X]%

Be thorough but constructive in your feedback.`;
}

/**
 * Parse the consensus response from OpenAI
 * Extracts score, analysis, concerns, etc.
 */
export function parseConsensusResponse(response: string): ConsensusResult {
  // Extract consensus score
  const scoreMatch = response.match(/CONSENSUS:\s*(\d+)%/i);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  // Extract sections
  const analysis = extractSection(response, 'ANALYSIS', 'STRENGTHS');
  const strengthsText = extractSection(response, 'STRENGTHS', 'CONCERNS');
  const concernsText = extractSection(response, 'CONCERNS', 'RECOMMENDATIONS');
  const recommendationsText = extractSection(response, 'RECOMMENDATIONS', 'CONSENSUS');

  // Parse lists from sections
  const strengths = parseList(strengthsText);
  const concerns = parseList(concernsText);
  const recommendations = parseList(recommendationsText);

  return {
    score,
    analysis: analysis.trim(),
    strengths,
    concerns,
    recommendations,
    approved: score >= 95,
    rawResponse: response,
  };
}

/**
 * Extract a section from the response between two headers
 */
function extractSection(response: string, startHeader: string, endHeader: string): string {
  const startPattern = new RegExp(`${startHeader}[:\\s]*`, 'i');
  const endPattern = new RegExp(`${endHeader}[:\\s]*`, 'i');

  const startMatch = response.match(startPattern);
  if (!startMatch) return '';

  const startIndex = startMatch.index! + startMatch[0].length;
  const endMatch = response.slice(startIndex).match(endPattern);

  if (!endMatch) {
    return response.slice(startIndex).trim();
  }

  return response.slice(startIndex, startIndex + endMatch.index!).trim();
}

/**
 * Parse a bulleted or numbered list from text
 * Filters out markdown headers and section markers
 */
function parseList(text: string): string[] {
  if (!text) return [];

  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip markdown headers (### Header, ## Header, etc.)
    if (trimmed.match(/^#{1,6}\s/)) continue;

    // Skip section headers (WORD: or WORD WORD:)
    if (trimmed.match(/^[A-Z][A-Z_\s]+:/)) continue;

    // Skip lines that look like section markers
    if (trimmed.match(/^[A-Z]+$/)) continue;

    // Match bullets (-, *, +) or numbers (1., 2., etc.)
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const numberMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    const boldMatch = trimmed.match(/^\*\*([^*]+)\*\*[:\s]*(.*)$/);

    if (bulletMatch) {
      const item = bulletMatch[1].trim();
      // Skip items that are just headers
      if (item && !item.match(/^[A-Z][A-Z_\s]+$/) && item.length > 3) {
        items.push(item);
      }
    } else if (numberMatch) {
      const item = numberMatch[1].trim();
      if (item && item.length > 3) {
        items.push(item);
      }
    } else if (boldMatch) {
      // Handle "**Title**: description" format
      const title = boldMatch[1].trim();
      const desc = boldMatch[2].trim();
      if (desc) {
        items.push(`${title}: ${desc}`);
      } else if (title && title.length > 10) {
        items.push(title);
      }
    } else if (trimmed.length > 15 && !trimmed.startsWith('**') && !trimmed.endsWith(':')) {
      // Only include plain text lines if they're substantial
      items.push(trimmed);
    }
  }

  return items;
}

/**
 * Helper sleep function for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate that a model is available
 */
export async function validateModel(model: OpenAIModel): Promise<boolean> {
  try {
    const client = await createClient();
    const models = await client.models.list();
    return models.data.some((m) => m.id === model);
  } catch {
    return false;
  }
}

/**
 * List available models
 */
export async function listAvailableModels(): Promise<string[]> {
  try {
    const client = await createClient();
    const models = await client.models.list();

    return models.data
      .filter(
        (m) =>
          m.id.includes('gpt-4') ||
          m.id.includes('gpt-3.5') ||
          m.id.startsWith('o1')
      )
      .map((m) => m.id)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Expand a brief idea into a full specification using OpenAI
 *
 * @param idea - The brief project idea
 * @param language - Target programming language
 * @returns Expanded specification
 */
export async function expandIdea(
  idea: string,
  language: OutputLanguage
): Promise<string> {
  const client = await createClient();

  const languageDesc = language === 'fullstack'
    ? 'React (TypeScript) frontend with FastAPI (Python) backend'
    : language === 'python'
    ? 'Python'
    : 'TypeScript';

  const prompt = `You are a senior software architect. A user wants to build a project with the following idea:

"${idea}"

The project will be implemented in ${languageDesc}.

Expand this into a complete software specification including:

1. **Project Overview**: A clear description of what will be built
2. **Core Features**: List of main features and functionality
3. **Technical Requirements**:
   - Language and framework choices
   - Database requirements (if any)
   - External APIs or services needed
   - Authentication requirements (if any)
4. **Architecture Overview**: High-level system design
5. **API Specification** (if applicable): Key endpoints and their purposes
6. **Data Models**: Key entities and their relationships
7. **Non-Functional Requirements**: Performance, security, scalability considerations
8. **Deployment**: Docker configuration and deployment approach

Be specific and actionable. The specification should be detailed enough that a developer could implement it without further clarification.`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  });

  return completion.choices[0]?.message?.content || idea;
}

/**
 * Get feedback on generated code
 *
 * @param code - The code to review
 * @param context - Context about what the code should do
 */
export async function reviewCode(code: string, context: string): Promise<ConsensusResult> {
  const client = await createClient();

  const prompt = `You are a senior software engineer reviewing code. Review the following code:

CONTEXT:
${context}

CODE:
\`\`\`
${code}
\`\`\`

Provide:
1. ANALYSIS: Overall code quality assessment
2. STRENGTHS: What's done well
3. CONCERNS: Issues, bugs, or improvements needed
4. RECOMMENDATIONS: Specific fixes or enhancements
5. CONSENSUS SCORE: A percentage (0-100%) of how production-ready this code is

Format your score as: CONSENSUS: [X]%`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2048,
  });

  const response = completion.choices[0]?.message?.content || '';
  return parseConsensusResponse(response);
}
