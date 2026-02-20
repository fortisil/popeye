/**
 * Fix C tests — readPopeyeMdConfig shared config reader.
 * Verifies popeye.md parsing for CLI commands.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readPopeyeMdConfig } from '../../src/config/popeye-md.js';

describe('Fix C: readPopeyeMdConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'popeye-md-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should return null when popeye.md does not exist', async () => {
    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).toBeNull();
  });

  it('should parse basic config with reviewer and language', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'language: python',
        'reviewer: openai',
        'arbitrator: gemini',
        '---',
        '',
        '# Project Config',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.language).toBe('python');
    expect(config!.reviewer).toBe('openai');
    expect(config!.arbitrator).toBe('gemini');
    expect(config!.enableArbitration).toBe(true);
  });

  it('should parse model fields from popeye.md', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'language: typescript',
        'reviewer: gemini',
        'arbitrator: grok',
        'openaiModel: gpt-4o-mini',
        'geminiModel: gemini-2.0-flash',
        'grokModel: grok-3',
        '---',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.openaiModel).toBe('gpt-4o-mini');
    expect(config!.geminiModel).toBe('gemini-2.0-flash');
    expect(config!.grokModel).toBe('grok-3');
  });

  it('should handle arbitrator: off', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'language: fullstack',
        'reviewer: openai',
        'arbitrator: off',
        '---',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.enableArbitration).toBe(false);
  });

  it('should return null when frontmatter is missing', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      '# Just a markdown file\n\nNo frontmatter here.',
    );

    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).toBeNull();
  });

  it('should return null when essential fields are missing', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'projectName: my-app',
        'created: 2024-01-01',
        '---',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    // Missing language and reviewer -> null
    expect(config).toBeNull();
  });

  it('should extract notes section', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'language: website',
        'reviewer: openai',
        '---',
        '',
        '## Notes',
        'This project uses Tailwind CSS.',
        'Deploy to Vercel.',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.notes).toContain('Tailwind CSS');
  });

  it('should reject invalid language values', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'language: rust',
        'reviewer: openai',
        '---',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    // Invalid language means essential field is missing
    expect(config).toBeNull();
  });

  it('should return model fields as undefined when not specified', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'popeye.md'),
      [
        '---',
        'language: python',
        'reviewer: openai',
        '---',
      ].join('\n'),
    );

    const config = await readPopeyeMdConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.openaiModel).toBeUndefined();
    expect(config!.geminiModel).toBeUndefined();
    expect(config!.grokModel).toBeUndefined();
  });
});
