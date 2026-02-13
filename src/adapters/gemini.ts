/**
 * Google Gemini API adapter
 * Handles consensus reviews and arbitration
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ConsensusResult, ArbitrationResult } from '../types/consensus.js';
import { getGeminiToken } from '../auth/index.js';

/**
 * Gemini model type - flexible string to support new models
 */
export type GeminiModel = string;

/**
 * Default Gemini configuration
 */
export const DEFAULT_GEMINI_CONFIG = {
  model: 'gemini-2.0-flash' as GeminiModel,
  temperature: 0.3,
  maxTokens: 4096,
};

/**
 * Create a Gemini client with stored credentials
 */
export async function createClient(): Promise<GoogleGenerativeAI> {
  const apiKey = await getGeminiToken();

  if (!apiKey) {
    throw new Error('Gemini API key not found. Run: popeye auth gemini');
  }

  return new GoogleGenerativeAI(apiKey);
}

/**
 * Request consensus review from Gemini
 *
 * @param plan - The development plan to review
 * @param context - Project context
 * @param config - Configuration options
 * @returns Consensus result
 */
export async function requestConsensus(
  plan: string,
  context: string,
  config: { model?: GeminiModel; temperature?: number; maxTokens?: number; reviewerPersona?: string } = {}
): Promise<ConsensusResult> {
  const {
    model = DEFAULT_GEMINI_CONFIG.model,
    temperature = DEFAULT_GEMINI_CONFIG.temperature,
    maxTokens = DEFAULT_GEMINI_CONFIG.maxTokens,
    reviewerPersona,
  } = config;

  const client = await createClient();
  const generativeModel = client.getGenerativeModel({ model });

  const prompt = buildConsensusPrompt(plan, context, reviewerPersona);

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });

    const response = result.response.text();
    return parseConsensusResponse(response);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Gemini API error: ${errorMsg}`);
  }
}

/**
 * Request arbitration from Gemini when consensus is stuck
 *
 * @param plan - The best plan achieved
 * @param reviewerFeedback - Feedback from the reviewer
 * @param claudeFeedback - Claude's perspective on the plan
 * @param iterations - Number of iterations attempted
 * @param scores - Score history
 * @returns Arbitration decision
 */
export async function requestArbitration(
  plan: string,
  reviewerFeedback: string,
  claudeFeedback: string,
  iterations: number,
  scores: number[]
): Promise<ArbitrationResult> {
  const client = await createClient();
  const generativeModel = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = buildArbitrationPrompt(plan, reviewerFeedback, claudeFeedback, iterations, scores);

  try {
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response.text();
    return parseArbitrationResponse(response);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Gemini arbitration error: ${errorMsg}`);
  }
}

/**
 * Build the consensus review prompt
 *
 * @param plan - The plan to review
 * @param context - Project context
 * @param persona - Optional custom reviewer persona
 */
function buildConsensusPrompt(plan: string, context: string, persona?: string): string {
  const reviewerRole = persona || 'a senior software architect';
  return `You are ${reviewerRole} reviewing a development plan.
Analyze the following plan for completeness, correctness, and feasibility.

PROJECT CONTEXT:
${context}

PROPOSED PLAN:
${plan}

Please provide your response in EXACTLY this format (use these exact headers):

ANALYSIS:
[Your detailed analysis here]

STRENGTHS:
- [Strength 1]
- [Strength 2]
- [etc.]

CONCERNS:
- [Concern 1]
- [Concern 2]
- [etc.]

RECOMMENDATIONS:
- [Recommendation 1]
- [Recommendation 2]
- [etc.]

CONSENSUS: [X]%

Scoring guide:
- 95-100%: Ready for execution, no changes needed
- 85-94%: Minor revisions needed, mostly good
- 70-84%: Significant revisions needed
- Below 70%: Major rework required

Be thorough but constructive. Focus on actionable feedback.`;
}

/**
 * Build the arbitration prompt
 */
function buildArbitrationPrompt(
  plan: string,
  reviewerFeedback: string,
  claudeFeedback: string,
  iterations: number,
  scores: number[]
): string {
  const scoreHistory = scores.map((s, i) => `Iteration ${i + 1}: ${s}%`).join(', ');

  return `You are an impartial arbitrator resolving a disagreement between two AI systems about a development plan.

SITUATION:
- Claude (code generator) created a plan
- A reviewer (OpenAI/Gemini) has been reviewing and providing feedback
- They have gone through ${iterations} iterations without reaching 95% consensus
- Score history: ${scoreHistory}

THE PLAN:
${plan}

REVIEWER'S LATEST FEEDBACK:
${reviewerFeedback}

CLAUDE'S PERSPECTIVE:
${claudeFeedback}

As the arbitrator, you must:
1. Analyze both perspectives objectively
2. Determine if the remaining concerns are:
   - CRITICAL: Must be addressed before proceeding
   - MINOR: Can be addressed during implementation
   - SUBJECTIVE: Matters of preference, not correctness
3. Make a final decision

Respond in EXACTLY this format:

ANALYSIS:
[Your analysis of the disagreement]

CRITICAL_CONCERNS:
- [List any truly critical issues, or "None" if none exist]

MINOR_CONCERNS:
- [List minor issues that can be addressed during implementation]

SUBJECTIVE_CONCERNS:
- [List preference-based concerns that don't affect correctness]

DECISION: [APPROVE or REVISE]

FINAL_SCORE: [X]%

REASONING:
[Explain your decision]

SUGGESTED_CHANGES:
- [If REVISE, list specific changes needed]
- [If APPROVE, write "None - plan is acceptable"]`;
}

/**
 * Parse the consensus response from Gemini
 */
export function parseConsensusResponse(response: string): ConsensusResult {
  // Extract consensus score - look for various formats
  let score = 0;
  const scorePatterns = [
    /CONSENSUS:\s*(\d+)%/i,
    /CONSENSUS\s*SCORE:\s*(\d+)%/i,
    /(\d+)%\s*consensus/i,
    /score[:\s]+(\d+)%/i,
  ];

  for (const pattern of scorePatterns) {
    const match = response.match(pattern);
    if (match) {
      score = parseInt(match[1], 10);
      break;
    }
  }

  // Extract sections with better handling of markdown headers
  const analysis = extractSection(response, ['ANALYSIS', '## Analysis', '### Analysis']);
  const strengthsText = extractSection(response, ['STRENGTHS', '## Strengths', '### Strengths']);
  const concernsText = extractSection(response, ['CONCERNS', '## Concerns', '### Concerns']);
  const recommendationsText = extractSection(response, ['RECOMMENDATIONS', '## Recommendations', '### Recommendations']);

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
 * Parse the arbitration response
 */
function parseArbitrationResponse(response: string): ArbitrationResult {
  // Extract score
  const scoreMatch = response.match(/FINAL_SCORE:\s*(\d+)%/i);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  // Extract decision
  const decisionMatch = response.match(/DECISION:\s*(APPROVE|REVISE)/i);
  const approved = decisionMatch ? decisionMatch[1].toUpperCase() === 'APPROVE' : score >= 90;

  // Extract sections
  const analysis = extractSection(response, ['ANALYSIS']);
  const criticalConcerns = parseList(extractSection(response, ['CRITICAL_CONCERNS']));
  const minorConcerns = parseList(extractSection(response, ['MINOR_CONCERNS']));
  const subjectiveConcerns = parseList(extractSection(response, ['SUBJECTIVE_CONCERNS']));
  const reasoning = extractSection(response, ['REASONING']);
  const suggestedChanges = parseList(extractSection(response, ['SUGGESTED_CHANGES']));

  return {
    approved,
    score,
    analysis,
    criticalConcerns: criticalConcerns.filter(c => c.toLowerCase() !== 'none'),
    minorConcerns: minorConcerns.filter(c => c.toLowerCase() !== 'none'),
    subjectiveConcerns: subjectiveConcerns.filter(c => c.toLowerCase() !== 'none'),
    reasoning,
    suggestedChanges: suggestedChanges.filter(c => !c.toLowerCase().includes('none')),
    rawResponse: response,
  };
}

/**
 * Extract a section from the response with multiple possible headers
 */
function extractSection(response: string, headers: string[]): string {
  // Build pattern to match any of the headers
  const headerPattern = headers.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const startPattern = new RegExp(`(${headerPattern})[:\\s]*\\n?`, 'i');

  const startMatch = response.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return '';

  const startIndex = startMatch.index + startMatch[0].length;

  // Find the next section header (any capitalized word followed by colon or markdown header)
  const endPattern = /\n(?:#{1,3}\s+)?[A-Z][A-Z_]+[:\s]/;
  const remaining = response.slice(startIndex);
  const endMatch = remaining.match(endPattern);

  if (!endMatch || endMatch.index === undefined) {
    return remaining.trim();
  }

  return remaining.slice(0, endMatch.index).trim();
}

/**
 * Parse a bulleted or numbered list from text
 */
function parseList(text: string): string[] {
  if (!text) return [];

  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and section headers
    if (!trimmed) continue;
    if (trimmed.match(/^#{1,3}\s/)) continue; // Skip markdown headers
    if (trimmed.match(/^[A-Z][A-Z_]+:/)) continue; // Skip section headers

    // Match bullets (-, *, +) or numbers (1., 2., etc.)
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const numberMatch = trimmed.match(/^\d+\.\s+(.+)$/);

    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
    } else if (numberMatch) {
      items.push(numberMatch[1].trim());
    } else if (trimmed && !trimmed.match(/^[A-Z]+:/i)) {
      // Only add non-header lines that have substantial content
      if (trimmed.length > 10 && !trimmed.startsWith('**') && !trimmed.endsWith(':')) {
        items.push(trimmed);
      }
    }
  }

  return items;
}

/**
 * Validate that the Gemini API key is working
 */
export async function validateApiKey(): Promise<boolean> {
  try {
    const client = await createClient();
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    await model.generateContent('Say "OK" if you can hear me.');
    return true;
  } catch {
    return false;
  }
}
