/**
 * Generic AI provider query — shared between consensus arbitration
 * and auto-recovery guidance (v2.6.0).
 *
 * Single source of truth for adapter wiring + timeout logic.
 */

import logging from 'node:console';

import type { ConsensusConfig } from '../../types/consensus.js';

const logger = logging;

// ─── Types ───────────────────────────────────────────────

export interface ProviderConfig {
  provider: string;     // 'openai' | 'gemini' | 'grok'
  model: string;
  temperature: number;
}

// ─── Provider Query ──────────────────────────────────────

/**
 * Call any configured AI provider with an arbitrary prompt.
 * Returns raw text response or null on timeout/error.
 *
 * @param prompt - The full prompt to send to the provider
 * @param config - Provider configuration (provider name, model, temperature)
 * @param timeoutMs - Maximum time to wait for a response (default: 120s)
 * @returns Raw text response or null on timeout/error/empty
 */
export async function queryProvider(
  prompt: string,
  config: ProviderConfig,
  timeoutMs = 120_000,
): Promise<string | null> {
  try {
    const resultPromise = callProviderAdapter(prompt, config);

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });

    const raw = await Promise.race([resultPromise, timeoutPromise]);

    if (!raw || raw.trim().length === 0) {
      logger.warn(`[arbitrator-query] Empty response from ${config.provider}/${config.model}`);
      return null;
    }

    logger.log(
      `[arbitrator-query] ${config.provider}/${config.model}: ${raw.length} chars`,
    );
    return raw;
  } catch (err) {
    logger.warn(
      `[arbitrator-query] ${config.provider}/${config.model} failed: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    );
    return null;
  }
}

// ─── Adapter Wiring ──────────────────────────────────────

/**
 * Route to the correct adapter based on provider name.
 * Uses dynamic imports to avoid loading unused adapters.
 */
async function callProviderAdapter(
  prompt: string,
  config: ProviderConfig,
): Promise<string> {
  switch (config.provider) {
    case 'openai': {
      const { requestRawReview } = await import('../../adapters/openai.js');
      return requestRawReview(prompt, {
        openaiModel: config.model,
        temperature: config.temperature,
      } as Partial<ConsensusConfig>);
    }
    case 'gemini': {
      const { requestRawReview } = await import('../../adapters/gemini.js');
      return requestRawReview(prompt, {
        model: config.model,
        temperature: config.temperature,
      });
    }
    case 'grok': {
      const { requestRawReview } = await import('../../adapters/grok.js');
      return requestRawReview(prompt, {
        model: config.model,
        temperature: config.temperature,
      });
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
