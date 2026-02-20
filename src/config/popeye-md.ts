/**
 * Shared popeye.md configuration reader.
 * Reads project-local config from the YAML frontmatter in popeye.md.
 * Used by both interactive mode and CLI commands.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { OutputLanguageSchema, type OutputLanguage } from '../types/project.js';
import type { AIProvider, GeminiModel, GrokModel } from '../types/consensus.js';
import type { OpenAIModel } from '../types/project.js';

// ─── Types ───────────────────────────────────────────────

/** Project-local configuration stored in popeye.md */
export interface PopeyeMdConfig {
  language: OutputLanguage;
  reviewer: AIProvider;
  arbitrator: AIProvider;
  enableArbitration: boolean;
  created: string;
  lastRun: string;
  projectName?: string;
  description?: string;
  notes?: string;
  openaiModel?: OpenAIModel;
  geminiModel?: GeminiModel;
  grokModel?: GrokModel;
}

// ─── Reader ──────────────────────────────────────────────

/**
 * Read popeye.md from a project directory.
 * Parses YAML frontmatter for project configuration.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Parsed config or null if file doesn't exist or is invalid
 */
export async function readPopeyeMdConfig(projectDir: string): Promise<PopeyeMdConfig | null> {
  const configPath = path.join(projectDir, 'popeye.md');

  try {
    const content = await fs.readFile(configPath, 'utf-8');

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const config: Partial<PopeyeMdConfig> = {};

    // Parse each line of YAML
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const cleanValue = value.trim();

        switch (key) {
          case 'language':
            if (OutputLanguageSchema.safeParse(cleanValue).success) {
              config.language = cleanValue as OutputLanguage;
            }
            break;
          case 'reviewer':
            if (['openai', 'gemini', 'grok'].includes(cleanValue)) {
              config.reviewer = cleanValue as AIProvider;
            }
            break;
          case 'arbitrator':
            if (['openai', 'gemini', 'grok', 'off'].includes(cleanValue)) {
              if (cleanValue === 'off') {
                config.enableArbitration = false;
              } else {
                config.arbitrator = cleanValue as AIProvider;
                config.enableArbitration = true;
              }
            }
            break;
          case 'created':
            config.created = cleanValue;
            break;
          case 'lastRun':
            config.lastRun = cleanValue;
            break;
          case 'projectName':
            config.projectName = cleanValue;
            break;
          case 'openaiModel':
            if (cleanValue.length > 0) {
              config.openaiModel = cleanValue;
            }
            break;
          case 'geminiModel':
            if (cleanValue.length > 0) {
              config.geminiModel = cleanValue;
            }
            break;
          case 'grokModel':
            if (cleanValue.length > 0) {
              config.grokModel = cleanValue;
            }
            break;
        }
      }
    }

    // Extract notes section if present
    const notesMatch = content.match(/## Notes\n([\s\S]*?)(?=\n## |$)/);
    if (notesMatch) {
      config.notes = notesMatch[1].trim();
    }

    // Return config only if we have the essential fields
    if (config.language && config.reviewer) {
      return {
        language: config.language,
        reviewer: config.reviewer,
        arbitrator: config.arbitrator || 'gemini',
        enableArbitration: config.enableArbitration ?? true,
        created: config.created || new Date().toISOString(),
        lastRun: config.lastRun || new Date().toISOString(),
        projectName: config.projectName,
        description: config.description,
        notes: config.notes,
        openaiModel: config.openaiModel,
        geminiModel: config.geminiModel,
        grokModel: config.grokModel,
      };
    }

    return null;
  } catch {
    return null;
  }
}
