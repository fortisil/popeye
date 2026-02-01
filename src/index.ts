#!/usr/bin/env node
/**
 * Popeye CLI
 * Fully autonomous code generation powered by Claude CLI and OpenAI consensus
 */

import { runCLI } from './cli/index.js';

// Run the CLI
runCLI().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
