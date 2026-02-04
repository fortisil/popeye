/**
 * Python project generator
 * Creates complete Python project scaffolding
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectSpec } from '../types/project.js';
import {
  generatePyprojectToml,
  generateRequirementsTxt,
  generateMainInit,
  generateMainPy,
  generateConftest,
  generateTestMain,
  generateDockerfile,
  generateDockerCompose,
  generateGitignore,
  generateEnvExample,
  generateReadme,
  generateMakefile,
} from './templates/python.js';

/**
 * Project generation result
 */
export interface GenerationResult {
  success: boolean;
  projectDir: string;
  filesCreated: string[];
  error?: string;
}

/**
 * Python generator options for workspace/monorepo support
 */
export interface PythonGeneratorOptions {
  /** Base directory for project (defaults to outputDir/projectName) */
  baseDir?: string;
  /** Override auto-derived package name */
  packageName?: string;
  /** Adjust paths for monorepo structure */
  workspaceMode?: boolean;
  /** Skip Docker files (fullstack uses root docker-compose) */
  skipDocker?: boolean;
  /** Skip README (fullstack has root README) */
  skipReadme?: boolean;
}

/**
 * Create a directory if it doesn't exist
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Write a file with content
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Convert project name to Python package name
 */
function toPythonPackageName(name: string): string {
  return name.toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Generate a complete Python project
 *
 * @param spec - Project specification
 * @param outputDir - Output directory
 * @param options - Generator options for workspace/monorepo support
 * @returns Generation result
 */
export async function generatePythonProject(
  spec: ProjectSpec,
  outputDir: string,
  options: PythonGeneratorOptions = {}
): Promise<GenerationResult> {
  const {
    baseDir,
    packageName: customPackageName,
    workspaceMode = false,
    skipDocker = false,
    skipReadme = false,
  } = options;

  const projectName = spec.name || 'my-project';
  const packageName = customPackageName || toPythonPackageName(projectName);

  // In workspace mode with baseDir, use it directly; otherwise create subdirectory
  const projectDir = baseDir || path.join(outputDir, projectName);
  const filesCreated: string[] = [];

  try {
    // Create project directory structure
    await ensureDir(projectDir);
    await ensureDir(path.join(projectDir, 'src', packageName));
    await ensureDir(path.join(projectDir, 'tests'));

    // Only create data/docs dirs in standalone mode
    if (!workspaceMode) {
      await ensureDir(path.join(projectDir, 'data'));
      await ensureDir(path.join(projectDir, 'docs'));
    }

    // Generate and write files
    const files: Array<{ path: string; content: string }> = [
      // Root files
      {
        path: path.join(projectDir, 'pyproject.toml'),
        content: generatePyprojectToml(projectName),
      },
      {
        path: path.join(projectDir, 'requirements.txt'),
        content: generateRequirementsTxt(),
      },
      {
        path: path.join(projectDir, '.gitignore'),
        content: generateGitignore(),
      },
      {
        path: path.join(projectDir, '.env.example'),
        content: generateEnvExample(),
      },
      {
        path: path.join(projectDir, 'Makefile'),
        content: generateMakefile(projectName),
      },

      // Source files
      {
        path: path.join(projectDir, 'src', packageName, '__init__.py'),
        content: generateMainInit(projectName),
      },
      {
        path: path.join(projectDir, 'src', packageName, 'main.py'),
        content: generateMainPy(projectName),
      },
      {
        path: path.join(projectDir, 'src', '__init__.py'),
        content: '# Source root\n',
      },

      // Test files
      {
        path: path.join(projectDir, 'tests', '__init__.py'),
        content: '# Tests package\n',
      },
      {
        path: path.join(projectDir, 'tests', 'conftest.py'),
        content: generateConftest(),
      },
      {
        path: path.join(projectDir, 'tests', 'test_main.py'),
        content: generateTestMain(projectName),
      },
    ];

    // Add README if not skipped
    if (!skipReadme) {
      files.push({
        path: path.join(projectDir, 'README.md'),
        content: generateReadme(projectName, spec.idea),
      });
    }

    // Add Docker files if not skipped
    if (!skipDocker) {
      files.push(
        {
          path: path.join(projectDir, 'Dockerfile'),
          content: generateDockerfile(projectName),
        },
        {
          path: path.join(projectDir, 'docker-compose.yml'),
          content: generateDockerCompose(projectName),
        }
      );
    }

    // Add data placeholder in standalone mode
    if (!workspaceMode) {
      files.push({
        path: path.join(projectDir, 'data', '.gitkeep'),
        content: '',
      });
    }

    // Write all files
    for (const file of files) {
      await writeFile(file.path, file.content);
      filesCreated.push(file.path);
    }

    return {
      success: true,
      projectDir,
      filesCreated,
    };
  } catch (error) {
    return {
      success: false,
      projectDir,
      filesCreated,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the list of files that would be generated
 *
 * @param projectName - Project name
 * @returns List of relative file paths
 */
export function getPythonProjectFiles(projectName: string): string[] {
  const packageName = toPythonPackageName(projectName);

  return [
    'pyproject.toml',
    'requirements.txt',
    '.gitignore',
    '.env.example',
    'README.md',
    'Makefile',
    'Dockerfile',
    'docker-compose.yml',
    `src/${packageName}/__init__.py`,
    `src/${packageName}/main.py`,
    'src/__init__.py',
    'tests/__init__.py',
    'tests/conftest.py',
    'tests/test_main.py',
    'data/.gitkeep',
  ];
}

/**
 * Validate a Python project structure
 *
 * @param projectDir - Project directory
 * @returns Validation result
 */
export async function validatePythonProject(projectDir: string): Promise<{
  valid: boolean;
  missingFiles: string[];
}> {
  const missingFiles: string[] = [];

  const requiredFiles = [
    'pyproject.toml',
    'requirements.txt',
    'README.md',
    'src',
    'tests',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(projectDir, file);
    try {
      await fs.access(filePath);
    } catch {
      missingFiles.push(file);
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
  };
}

/**
 * Add a new Python module to an existing project
 *
 * @param projectDir - Project directory
 * @param moduleName - Module name
 * @returns Files created
 */
export async function addPythonModule(
  projectDir: string,
  moduleName: string
): Promise<string[]> {
  const packageName = toPythonPackageName(moduleName);
  const filesCreated: string[] = [];

  // Find the src directory
  const srcDir = path.join(projectDir, 'src');
  const dirs = await fs.readdir(srcDir);
  const packageDir = dirs.find((d) => !d.startsWith('.') && d !== '__init__.py');

  if (!packageDir) {
    throw new Error('Could not find package directory in src/');
  }

  const moduleDir = path.join(srcDir, packageDir, packageName);
  await ensureDir(moduleDir);

  // Create module files
  const initContent = `"""
${moduleName} module.
"""
`;
  await writeFile(path.join(moduleDir, '__init__.py'), initContent);
  filesCreated.push(path.join(moduleDir, '__init__.py'));

  const moduleContent = `"""
${moduleName} implementation.
"""

import logging

logger = logging.getLogger(__name__)


class ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/-/g, '')}:
    """
    ${moduleName} class.
    """

    def __init__(self) -> None:
        """Initialize ${moduleName}."""
        logger.info(f"Initializing {self.__class__.__name__}")

    def run(self) -> None:
        """
        Run the ${moduleName} logic.

        This method should be implemented with the actual functionality.
        """
        raise NotImplementedError("Implement this method")
`;
  await writeFile(path.join(moduleDir, 'module.py'), moduleContent);
  filesCreated.push(path.join(moduleDir, 'module.py'));

  // Create test file
  const testDir = path.join(projectDir, 'tests');
  const testContent = `"""
Tests for ${moduleName} module.
"""

import pytest

# from src.${packageDir}.${packageName}.module import ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/-/g, '')}


class Test${moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/-/g, '')}:
    """Test cases for ${moduleName}."""

    def test_placeholder(self) -> None:
        """Placeholder test."""
        assert True
`;
  await writeFile(path.join(testDir, `test_${packageName}.py`), testContent);
  filesCreated.push(path.join(testDir, `test_${packageName}.py`));

  return filesCreated;
}
