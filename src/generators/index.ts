/**
 * Project generators module
 * Provides unified API for generating Python, TypeScript, and Fullstack projects
 */

import type { ProjectSpec, OutputLanguage } from '../types/project.js';
import {
  generatePythonProject,
  validatePythonProject,
  addPythonModule,
  getPythonProjectFiles,
  type GenerationResult,
} from './python.js';
import {
  generateTypeScriptProject,
  validateTypeScriptProject,
  addTypeScriptModule,
  getTypeScriptProjectFiles,
} from './typescript.js';
import {
  generateFullstackProject,
  validateFullstackProject,
  getFullstackProjectFiles,
} from './fullstack.js';
import {
  generateWebsiteProject,
  validateWebsiteProject,
  getWebsiteProjectFiles,
} from './website.js';
import {
  generateAllProject,
  validateAllProject,
  getAllProjectFiles,
} from './all.js';

// Re-export (explicitly to avoid name conflicts)
export {
  generatePythonProject,
  validatePythonProject,
  addPythonModule,
  getPythonProjectFiles,
  type GenerationResult,
  type PythonGeneratorOptions,
} from './python.js';
export {
  generateTypeScriptProject,
  validateTypeScriptProject,
  addTypeScriptModule,
  getTypeScriptProjectFiles,
  addDependency,
  updateScripts,
  type TypeScriptGeneratorOptions,
} from './typescript.js';
export {
  generateFullstackProject,
  validateFullstackProject,
  getFullstackProjectFiles,
  type FullstackGeneratorOptions,
} from './fullstack.js';
export {
  generateWebsiteProject,
  validateWebsiteProject,
  getWebsiteProjectFiles,
  type WebsiteGeneratorOptions,
} from './website.js';
export {
  generateAllProject,
  validateAllProject,
  getAllProjectFiles,
  type AllGeneratorOptions,
} from './all.js';
export * from './templates/index.js';

/**
 * Generate a project based on the specification
 *
 * @param spec - Project specification
 * @param outputDir - Output directory
 * @returns Generation result
 */
export async function generateProject(
  spec: ProjectSpec,
  outputDir: string
): Promise<GenerationResult> {
  switch (spec.language) {
    case 'python':
      return generatePythonProject(spec, outputDir);
    case 'typescript':
      return generateTypeScriptProject(spec, outputDir);
    case 'fullstack':
      return generateFullstackProject(spec, outputDir);
    case 'website':
      return generateWebsiteProject(spec, outputDir);
    case 'all':
      return generateAllProject(spec, outputDir);
    default:
      return {
        success: false,
        projectDir: outputDir,
        filesCreated: [],
        error: `Unsupported language: ${spec.language}`,
      };
  }
}

/**
 * Validate a project structure
 *
 * @param projectDir - Project directory
 * @param language - Project language
 * @returns Validation result
 */
export async function validateProject(
  projectDir: string,
  language: OutputLanguage
): Promise<{
  valid: boolean;
  missingFiles: string[];
}> {
  switch (language) {
    case 'python':
      return validatePythonProject(projectDir);
    case 'typescript':
      return validateTypeScriptProject(projectDir);
    case 'fullstack':
      return validateFullstackProject(projectDir);
    case 'website':
      return validateWebsiteProject(projectDir);
    case 'all':
      return validateAllProject(projectDir);
    default:
      return {
        valid: false,
        missingFiles: ['Unknown language'],
      };
  }
}

/**
 * Add a module to an existing project
 *
 * @param projectDir - Project directory
 * @param moduleName - Module name
 * @param language - Project language
 * @returns Files created
 */
export async function addModule(
  projectDir: string,
  moduleName: string,
  language: OutputLanguage
): Promise<string[]> {
  switch (language) {
    case 'python':
      return addPythonModule(projectDir, moduleName);
    case 'typescript':
    case 'website':
      return addTypeScriptModule(projectDir, moduleName);
    case 'fullstack':
    case 'all':
      // For workspace projects, determine which app to add to
      throw new Error(
        'Use addModule with specific app path for workspace projects: apps/frontend or apps/backend'
      );
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

/**
 * Get the list of files that would be generated for a project
 *
 * @param projectName - Project name
 * @param language - Project language
 * @returns List of relative file paths
 */
export function getProjectFiles(projectName: string, language: OutputLanguage): string[] {
  switch (language) {
    case 'python':
      return getPythonProjectFiles(projectName);
    case 'typescript':
      return getTypeScriptProjectFiles(projectName);
    case 'fullstack':
      return getFullstackProjectFiles(projectName);
    case 'website':
      return getWebsiteProjectFiles(projectName);
    case 'all':
      return getAllProjectFiles(projectName);
    default:
      return [];
  }
}

/**
 * Get the default test command for a language
 *
 * @param language - Project language
 * @returns Test command
 */
export function getTestCommand(language: OutputLanguage): string {
  switch (language) {
    case 'python':
      return 'python -m pytest tests/ -v';
    case 'typescript':
      return 'npm test';
    case 'fullstack':
      return 'cd apps/backend && pytest && cd ../frontend && npm test';
    case 'website':
      return 'npm test';
    case 'all':
      return 'npm run test:all';
    default:
      return 'echo "No test command configured"';
  }
}

/**
 * Get the default build command for a language
 *
 * @param language - Project language
 * @returns Build command
 */
export function getBuildCommand(language: OutputLanguage): string {
  switch (language) {
    case 'python':
      return 'python -m pip install -e .';
    case 'typescript':
      return 'npm run build';
    case 'fullstack':
      return 'cd apps/backend && pip install -e . && cd ../frontend && npm run build';
    case 'website':
      return 'npm run build';
    case 'all':
      return 'npm run build';
    default:
      return 'echo "No build command configured"';
  }
}

/**
 * Get the default lint command for a language
 *
 * @param language - Project language
 * @returns Lint command
 */
export function getLintCommand(language: OutputLanguage): string {
  switch (language) {
    case 'python':
      return 'ruff check src/ tests/';
    case 'typescript':
      return 'npm run lint';
    case 'fullstack':
      return 'cd apps/backend && ruff check . && cd ../frontend && npm run lint';
    case 'website':
      return 'npm run lint';
    case 'all':
      return 'npm run lint:all';
    default:
      return 'echo "No lint command configured"';
  }
}

/**
 * Get the file extension for a language
 *
 * @param language - Project language
 * @returns File extension (without dot)
 */
export function getFileExtension(language: OutputLanguage): string {
  switch (language) {
    case 'python':
      return 'py';
    case 'typescript':
      return 'ts';
    default:
      return 'txt';
  }
}

/**
 * Get the source directory name for a language
 *
 * @param language - Project language
 * @returns Source directory name
 */
export function getSourceDir(_language: OutputLanguage): string {
  return 'src';
}

/**
 * Get the test directory name for a language
 *
 * @param language - Project language
 * @returns Test directory name
 */
export function getTestDir(_language: OutputLanguage): string {
  return 'tests';
}

/**
 * Check if a project directory already exists and has content
 *
 * @param projectDir - Project directory
 * @returns True if directory exists and has content
 */
export async function projectDirExists(projectDir: string): Promise<boolean> {
  const { promises: fs } = await import('node:fs');

  try {
    const files = await fs.readdir(projectDir);
    return files.length > 0;
  } catch {
    return false;
  }
}

/**
 * Clean up a failed project generation
 *
 * @param projectDir - Project directory
 */
export async function cleanupProject(projectDir: string): Promise<void> {
  const { promises: fs } = await import('node:fs');

  try {
    await fs.rm(projectDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}
