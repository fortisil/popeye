/**
 * Tests for the debug command
 * Tests extractPathsFromError, detectTechFromError, selectRelevantFiles,
 * buildDebugPrompt, and gatherDebugContext.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractPathsFromError,
  detectTechFromError,
  selectRelevantFiles,
  isConfigFile,
  extractImagePaths,
} from '../../../src/cli/commands/debug-context.js';
import type { FileIndexEntry } from '../../../src/cli/commands/debug-context.js';
import {
  getDebugSystemPrompt,
  formatConversationHistory,
} from '../../../src/cli/commands/debug-prompts.js';
import type { DebugMessage } from '../../../src/cli/commands/debug-prompts.js';
import { buildDebugPrompt } from '../../../src/cli/commands/debug.js';
import type { DebugContext } from '../../../src/cli/commands/debug.js';

// ---------------------------------------------------------------------------
// extractPathsFromError
// ---------------------------------------------------------------------------
describe('extractPathsFromError', () => {
  it('should extract paths from Python tracebacks', () => {
    const error = `Traceback (most recent call last):
  File "/app/src/module/service.py", line 42, in process
    result = await db.execute(query)
  File "/app/src/database/connection.py", line 15, in execute
    raise ConnectionError("Connection refused")`;

    const paths = extractPathsFromError(error);
    expect(paths).toContain('src/module/service.py');
    expect(paths).toContain('src/database/connection.py');
  });

  it('should extract paths from TypeScript errors', () => {
    const error = `src/components/App.tsx(15,3): error TS2339: Property 'foo' does not exist.
src/utils/helpers.ts:42:10 - error TS7006: Parameter implicitly has an 'any' type.`;

    const paths = extractPathsFromError(error);
    expect(paths).toContain('src/components/App.tsx');
    expect(paths).toContain('src/utils/helpers.ts');
  });

  it('should return empty array when no paths found', () => {
    const error = 'Error: Something went wrong with no file references';
    const paths = extractPathsFromError(error);
    expect(paths).toEqual([]);
  });

  it('should deduplicate paths', () => {
    const error = `Error in src/main.ts:10:5
Another error in src/main.ts:20:3`;

    const paths = extractPathsFromError(error);
    const mainCount = paths.filter((p) => p === 'src/main.ts').length;
    expect(mainCount).toBe(1);
  });

  it('should extract module-not-found paths', () => {
    const error = `Cannot find module './services/auth' from 'src/routes/login.ts'`;
    const paths = extractPathsFromError(error);
    expect(paths).toContain('services/auth');
  });

  it('should extract Python module-not-found paths', () => {
    const error = `ModuleNotFoundError: No module named 'src.services.auth'`;
    const paths = extractPathsFromError(error);
    expect(paths).toContain('src/services/auth');
  });

  it('should strip /app/ prefix from Docker container paths', () => {
    const error = `File "/app/src/main.py", line 1`;
    const paths = extractPathsFromError(error);
    expect(paths).toContain('src/main.py');
    expect(paths).not.toContain('/app/src/main.py');
  });
});

// ---------------------------------------------------------------------------
// detectTechFromError
// ---------------------------------------------------------------------------
describe('detectTechFromError', () => {
  it('should detect alembic-related tags', () => {
    const error = `alembic.util.exc.CommandError: Can't locate revision identified by '12345'`;
    const { tags } = detectTechFromError(error);
    expect(tags).toContain('alembic');
    expect(tags).toContain('database');
    expect(tags).toContain('migration');
  });

  it('should detect vite/bundler tags', () => {
    const error = `[vite] Internal server error: Module not found: @/components/Button`;
    const { tags } = detectTechFromError(error);
    expect(tags).toContain('vite');
    expect(tags).toContain('bundler');
    expect(tags).toContain('frontend');
  });

  it('should return empty tags for generic errors', () => {
    const error = `TypeError: Cannot read properties of undefined`;
    const { tags } = detectTechFromError(error);
    expect(tags).toEqual([]);
  });

  it('should detect multiple technologies', () => {
    const error = `docker-compose error: postgres service unhealthy, fastapi startup failed`;
    const { tags } = detectTechFromError(error);
    expect(tags).toContain('docker');
    expect(tags).toContain('compose');
    expect(tags).toContain('postgres');
    expect(tags).toContain('fastapi');
    expect(tags).toContain('python');
  });

  it('should detect redis tags', () => {
    const error = `redis.exceptions.ConnectionError: Error 111 connecting to redis:6379`;
    const { tags } = detectTechFromError(error);
    expect(tags).toContain('redis');
    expect(tags).toContain('cache');
  });
});

// ---------------------------------------------------------------------------
// selectRelevantFiles
// ---------------------------------------------------------------------------
describe('selectRelevantFiles', () => {
  const baseIndex: FileIndexEntry[] = [
    { relativePath: 'src/main.py', size: 500, mtime: 1000, isConfig: false },
    { relativePath: 'src/routes/auth.py', size: 300, mtime: 1000, isConfig: false },
    { relativePath: 'src/routes/users.py', size: 400, mtime: 1000, isConfig: false },
    { relativePath: 'src/database/models.py', size: 600, mtime: 1000, isConfig: false },
    { relativePath: 'alembic/versions/001_init.py', size: 200, mtime: 1000, isConfig: false },
    { relativePath: 'docker-compose.yml', size: 150, mtime: 1000, isConfig: true },
    { relativePath: 'package.json', size: 100, mtime: 1000, isConfig: true },
    { relativePath: 'requirements.txt', size: 80, mtime: 1000, isConfig: true },
  ];

  it('should select files mentioned in the error', () => {
    const errorPaths = ['src/routes/auth.py'];
    const result = selectRelevantFiles(baseIndex, errorPaths, []);
    expect(result).toContain('src/routes/auth.py');
  });

  it('should include sibling files from the same directory', () => {
    const errorPaths = ['src/routes/auth.py'];
    const result = selectRelevantFiles(baseIndex, errorPaths, []);
    expect(result).toContain('src/routes/auth.py');
    expect(result).toContain('src/routes/users.py');
  });

  it('should include migration files when database tags detected', () => {
    const result = selectRelevantFiles(baseIndex, [], ['database', 'migration']);
    expect(result).toContain('alembic/versions/001_init.py');
  });

  it('should include docker files when docker tags detected', () => {
    const result = selectRelevantFiles(baseIndex, [], ['docker', 'compose']);
    expect(result).toContain('docker-compose.yml');
  });

  it('should fall back to config files when few matches', () => {
    const result = selectRelevantFiles(baseIndex, ['nonexistent.py'], []);
    const hasConfig = result.some((p) =>
      p === 'package.json' || p === 'docker-compose.yml' || p === 'requirements.txt'
    );
    expect(hasConfig).toBe(true);
  });

  it('should return empty array for empty file index', () => {
    const result = selectRelevantFiles([], ['src/main.py'], ['python']);
    expect(result).toEqual([]);
  });

  it('should limit results to MAX_FILES', () => {
    // Create large index
    const largeIndex: FileIndexEntry[] = Array.from({ length: 100 }, (_, i) => ({
      relativePath: `src/file${i}.py`,
      size: 100,
      mtime: 1000,
      isConfig: false,
    }));
    // All files match by being in src/
    const errorPaths = Array.from({ length: 50 }, (_, i) => `src/file${i}.py`);
    const result = selectRelevantFiles(largeIndex, errorPaths, []);
    expect(result.length).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// isConfigFile
// ---------------------------------------------------------------------------
describe('isConfigFile', () => {
  it('should identify package.json as config', () => {
    expect(isConfigFile('package.json')).toBe(true);
    expect(isConfigFile('apps/backend/package.json')).toBe(true);
  });

  it('should identify docker-compose.yml as config', () => {
    expect(isConfigFile('docker-compose.yml')).toBe(true);
  });

  it('should not identify source files as config', () => {
    expect(isConfigFile('src/main.ts')).toBe(false);
    expect(isConfigFile('src/utils/helpers.py')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractImagePaths
// ---------------------------------------------------------------------------
describe('extractImagePaths', () => {
  it('should extract quoted screenshot paths', () => {
    const input = `'/var/folders/abc/Screenshot 2026-02-19.png' the logo is missing`;
    const paths = extractImagePaths(input);
    expect(paths).toContain('/var/folders/abc/Screenshot 2026-02-19.png');
  });

  it('should extract double-quoted image paths', () => {
    const input = `Look at "/tmp/error.jpg" for the bug`;
    const paths = extractImagePaths(input);
    expect(paths).toContain('/tmp/error.jpg');
  });

  it('should extract unquoted absolute paths', () => {
    const input = `See /Users/dev/screenshots/bug.png for details`;
    const paths = extractImagePaths(input);
    expect(paths).toContain('/Users/dev/screenshots/bug.png');
  });

  it('should return empty array when no images found', () => {
    const input = `TypeError: Cannot read properties of undefined`;
    const paths = extractImagePaths(input);
    expect(paths).toEqual([]);
  });

  it('should handle multiple image paths', () => {
    const input = `'/tmp/before.png' vs '/tmp/after.jpg'`;
    const paths = extractImagePaths(input);
    expect(paths.length).toBe(2);
    expect(paths).toContain('/tmp/before.png');
    expect(paths).toContain('/tmp/after.jpg');
  });

  it('should support webp and gif extensions', () => {
    const input = `'/tmp/screen.webp' and '/tmp/anim.gif'`;
    const paths = extractImagePaths(input);
    expect(paths).toContain('/tmp/screen.webp');
    expect(paths).toContain('/tmp/anim.gif');
  });
});

// ---------------------------------------------------------------------------
// buildDebugPrompt
// ---------------------------------------------------------------------------
describe('buildDebugPrompt', () => {
  const baseContext: DebugContext = {
    projectDir: '/test/project',
    structureSummary: 'src/\n  main.ts\n  utils/',
    purpose: 'A test REST API',
    claudeMd: '# Project Rules\nUse TypeScript',
    readme: '# Test Project',
    anchorFiles: { 'package.json': '{"name": "test"}' },
    fileIndex: [],
    language: 'backend',
  };

  it('should include project context, relevant files, history, and current message', () => {
    const history: DebugMessage[] = [
      { role: 'user', content: 'prev error' },
      { role: 'assistant', content: 'prev fix' },
    ];
    const relevantContents = { 'src/main.ts': 'console.log("hello")' };

    const prompt = buildDebugPrompt(baseContext, history, 'new error here', relevantContents);

    expect(prompt).toContain('A test REST API');
    expect(prompt).toContain('backend');
    expect(prompt).toContain('package.json');
    expect(prompt).toContain('console.log("hello")');
    expect(prompt).toContain('prev error');
    expect(prompt).toContain('prev fix');
    expect(prompt).toContain('new error here');
  });

  it('should omit history section when history is empty', () => {
    const prompt = buildDebugPrompt(baseContext, [], 'some error', {});
    expect(prompt).not.toContain('Previous Conversation');
  });

  it('should include CLAUDE.md when present', () => {
    const prompt = buildDebugPrompt(baseContext, [], 'error', {});
    expect(prompt).toContain('Use TypeScript');
  });

  it('should handle missing CLAUDE.md gracefully', () => {
    const ctx = { ...baseContext, claudeMd: undefined };
    const prompt = buildDebugPrompt(ctx, [], 'error', {});
    expect(prompt).toContain('error');
    expect(prompt).not.toContain('CLAUDE.md');
  });

  it('should handle empty relevant files', () => {
    const prompt = buildDebugPrompt(baseContext, [], 'error', {});
    expect(prompt).not.toContain('Relevant Source Files');
  });

  it('should include screenshot instructions when image paths provided', () => {
    const prompt = buildDebugPrompt(baseContext, [], 'logo is missing', {}, ['/tmp/screenshot.png']);
    expect(prompt).toContain('Screenshots Attached');
    expect(prompt).toContain('/tmp/screenshot.png');
    expect(prompt).toContain('Read tool');
  });

  it('should omit screenshot section when no images', () => {
    const prompt = buildDebugPrompt(baseContext, [], 'error', {}, []);
    expect(prompt).not.toContain('Screenshots Attached');
  });
});

// ---------------------------------------------------------------------------
// getDebugSystemPrompt
// ---------------------------------------------------------------------------
describe('getDebugSystemPrompt', () => {
  it('should return a non-empty system prompt', () => {
    const prompt = getDebugSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should include required response sections', () => {
    const prompt = getDebugSystemPrompt();
    expect(prompt).toContain('Diagnosis');
    expect(prompt).toContain('Evidence');
    expect(prompt).toContain('Proposed Fix');
    expect(prompt).toContain('Commands to Verify');
    expect(prompt).toContain('Ready to Apply');
  });

  it('should include screenshot/image instructions', () => {
    const prompt = getDebugSystemPrompt();
    expect(prompt).toContain('Screenshots');
    expect(prompt).toContain('Read');
  });
});

// ---------------------------------------------------------------------------
// formatConversationHistory
// ---------------------------------------------------------------------------
describe('formatConversationHistory', () => {
  it('should format messages with role labels', () => {
    const history: DebugMessage[] = [
      { role: 'user', content: 'my error' },
      { role: 'assistant', content: 'here is the fix' },
    ];
    const formatted = formatConversationHistory(history);
    expect(formatted).toContain('**User:**');
    expect(formatted).toContain('**Assistant:**');
    expect(formatted).toContain('my error');
    expect(formatted).toContain('here is the fix');
  });

  it('should return empty string for empty history', () => {
    const formatted = formatConversationHistory([]);
    expect(formatted).toBe('');
  });

  it('should include Previous Conversation header', () => {
    const history: DebugMessage[] = [{ role: 'user', content: 'test' }];
    const formatted = formatConversationHistory(history);
    expect(formatted).toContain('## Previous Conversation');
  });
});
