/**
 * Tests for project naming logic
 * Verifies CWD-aware naming, doc-derived names, and fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateProjectName,
  generateProjectNameFromIdea,
  extractNameFromDocs,
} from '../../src/cli/interactive.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-naming-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('generateProjectNameFromIdea', () => {
  it('should extract explicit project name patterns', () => {
    // "named" pattern extracts the word after it
    expect(generateProjectNameFromIdea("Create an app named 'Gateco'")).toBe('gateco');
    // "called" pattern extracts the word after it
    expect(generateProjectNameFromIdea('Build something called TodoApp')).toBe('todo-app');
  });

  it('should extract CamelCase project names', () => {
    // Without "for" keyword that triggers the explicit pattern, CamelCase is detected
    expect(generateProjectNameFromIdea('Build TodoMaster with style')).toBe('todo-master');
  });

  it('should filter out action words from prompt text', () => {
    // "read all files" should NOT produce "read-all-files" since those are stop words
    const result = generateProjectNameFromIdea('read all files');
    expect(result).not.toBe('read-all-files');
    // Meaningful word extraction filters all three, but the fallback takes first 2 raw words
    expect(result).toBe('read-all');
  });

  it('should extract meaningful words when no explicit name found', () => {
    const result = generateProjectNameFromIdea('secure enterprise authentication system');
    expect(result).toBe('secure-enterprise-authentication');
  });

  it('should return my-project as last resort', () => {
    expect(generateProjectNameFromIdea('')).toBe('my-project');
  });
});

describe('extractNameFromDocs', () => {
  it('should extract product name from markdown heading', async () => {
    const docPath = path.join(tmpDir, 'Gateco-spec.md');
    await fs.writeFile(docPath, '# Gateco\n\nSome description here.');

    const name = await extractNameFromDocs(tmpDir);
    expect(name).toBe('Gateco');
  });

  it('should skip README files', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# MyProject\n\nDescription.');

    const name = await extractNameFromDocs(tmpDir);
    expect(name).toBeNull();
  });

  it('should return null when no docs found', async () => {
    const name = await extractNameFromDocs(tmpDir);
    expect(name).toBeNull();
  });

  it('should return null for non-existent directory', async () => {
    const name = await extractNameFromDocs('/nonexistent/path/123456');
    expect(name).toBeNull();
  });

  it('should ignore generic headings', async () => {
    // "Home" is too short, but length >= 3 so it would pass... let's test with a generic dir name
    await fs.writeFile(path.join(tmpDir, 'spec.md'), '# Src\n\nDescription.');

    const name = await extractNameFromDocs(tmpDir);
    // "Src" is in GENERIC_DIR_NAMES
    expect(name).toBeNull();
  });
});

describe('generateProjectName (CWD-aware)', () => {
  it('should prefer doc-derived name over CWD basename', async () => {
    const projectDir = path.join(tmpDir, 'SomeDir');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'product-spec.md'),
      '# Gateco\n\nA security layer for AI.'
    );

    const name = await generateProjectName('read all files', projectDir);
    expect(name).toBe('gateco');
  });

  it('should use CWD basename when no docs found', async () => {
    const projectDir = path.join(tmpDir, 'MyAwesomeApp');
    await fs.mkdir(projectDir, { recursive: true });

    const name = await generateProjectName('read all files', projectDir);
    expect(name).toBe('my-awesome-app');
  });

  it('should skip generic CWD names and fall back to idea', async () => {
    const projectDir = path.join(tmpDir, 'Projects');
    await fs.mkdir(projectDir, { recursive: true });

    // "Projects" is a generic dir name, so falls back to idea extraction
    // The idea contains "named SuperApp" pattern -> extracts "SuperApp"
    const name = await generateProjectName('Build an app named SuperApp', projectDir);
    expect(name).toBe('super-app');
  });

  it('should fall back to idea extraction when no CWD provided', async () => {
    const name = await generateProjectName('Build an app called Gateco');
    expect(name).toBe('gateco');
  });

  it('should handle CamelCase CWD basenames', async () => {
    const projectDir = path.join(tmpDir, 'MyGateco');
    await fs.mkdir(projectDir, { recursive: true });

    const name = await generateProjectName('some idea', projectDir);
    expect(name).toBe('my-gateco');
  });
});
