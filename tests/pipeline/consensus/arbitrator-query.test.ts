/**
 * Tests for arbitrator-query.ts — generic provider query with timeout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all adapter modules before importing the module under test
vi.mock('../../../src/adapters/openai.js', () => ({
  requestRawReview: vi.fn(),
}));
vi.mock('../../../src/adapters/gemini.js', () => ({
  requestRawReview: vi.fn(),
}));
vi.mock('../../../src/adapters/grok.js', () => ({
  requestRawReview: vi.fn(),
}));

import { queryProvider } from '../../../src/pipeline/consensus/arbitrator-query.js';
import type { ProviderConfig } from '../../../src/pipeline/consensus/arbitrator-query.js';

describe('queryProvider', () => {
  const openaiConfig: ProviderConfig = { provider: 'openai', model: 'gpt-4.1', temperature: 0.3 };
  const geminiConfig: ProviderConfig = { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.3 };
  const grokConfig: ProviderConfig = { provider: 'grok', model: 'grok-3', temperature: 0.3 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return raw text from openai adapter', async () => {
    const { requestRawReview } = await import('../../../src/adapters/openai.js');
    vi.mocked(requestRawReview).mockResolvedValue('Strategic guidance response');

    const result = await queryProvider('test prompt', openaiConfig);

    expect(result).toBe('Strategic guidance response');
    expect(requestRawReview).toHaveBeenCalledOnce();
  });

  it('should return raw text from gemini adapter', async () => {
    const { requestRawReview } = await import('../../../src/adapters/gemini.js');
    vi.mocked(requestRawReview).mockResolvedValue('Gemini response');

    const result = await queryProvider('test prompt', geminiConfig);

    expect(result).toBe('Gemini response');
    expect(requestRawReview).toHaveBeenCalledOnce();
  });

  it('should return raw text from grok adapter', async () => {
    const { requestRawReview } = await import('../../../src/adapters/grok.js');
    vi.mocked(requestRawReview).mockResolvedValue('Grok response');

    const result = await queryProvider('test prompt', grokConfig);

    expect(result).toBe('Grok response');
    expect(requestRawReview).toHaveBeenCalledOnce();
  });

  it('should return null on timeout', async () => {
    const { requestRawReview } = await import('../../../src/adapters/openai.js');
    // Simulate slow promise that never resolves within timeout
    vi.mocked(requestRawReview).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('too late'), 5000)),
    );

    const result = await queryProvider('test prompt', openaiConfig, 50);

    expect(result).toBeNull();
  });

  it('should return null on error', async () => {
    const { requestRawReview } = await import('../../../src/adapters/openai.js');
    vi.mocked(requestRawReview).mockRejectedValue(new Error('API key invalid'));

    const result = await queryProvider('test prompt', openaiConfig);

    expect(result).toBeNull();
  });

  it('should return null on empty response', async () => {
    const { requestRawReview } = await import('../../../src/adapters/openai.js');
    vi.mocked(requestRawReview).mockResolvedValue('');

    const result = await queryProvider('test prompt', openaiConfig);

    expect(result).toBeNull();
  });

  it('should return null on whitespace-only response', async () => {
    const { requestRawReview } = await import('../../../src/adapters/openai.js');
    vi.mocked(requestRawReview).mockResolvedValue('   \n  ');

    const result = await queryProvider('test prompt', openaiConfig);

    expect(result).toBeNull();
  });

  it('should throw for unknown provider', async () => {
    const unknownConfig: ProviderConfig = { provider: 'anthropic', model: 'claude', temperature: 0.3 };

    // queryProvider catches errors and returns null
    const result = await queryProvider('test prompt', unknownConfig);

    expect(result).toBeNull();
  });
});
