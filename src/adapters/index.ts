/**
 * Adapters module - Re-exports all AI provider adapters
 */

// Claude (primary adapter for code execution)
export * from './claude.js';

// OpenAI (for consensus reviews) - namespaced to avoid collisions
export * as openai from './openai.js';

// Gemini (for consensus reviews and arbitration)
export * as gemini from './gemini.js';

// Grok (for consensus reviews and arbitration)
export * as grok from './grok.js';
