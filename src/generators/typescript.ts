/**
 * TypeScript project generator
 * Creates complete TypeScript project scaffolding
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectSpec } from '../types/project.js';
import {
  generatePackageJson,
  generateTsconfig,
  generateVitestConfig,
  generateEslintConfig,
  generatePrettierrc,
  generateIndexTs,
  generateTestFile,
  generateDockerfile,
  generateDockerCompose,
  generateGitignore,
  generateEnvExample,
  generateReadme,
} from './templates/typescript.js';

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
 * Generate a complete TypeScript project
 *
 * @param spec - Project specification
 * @param outputDir - Output directory
 * @returns Generation result
 */
export async function generateTypeScriptProject(
  spec: ProjectSpec,
  outputDir: string
): Promise<GenerationResult> {
  const projectName = spec.name || 'my-project';
  const projectDir = path.join(outputDir, projectName);
  const filesCreated: string[] = [];

  try {
    // Create project directory structure
    await ensureDir(projectDir);
    await ensureDir(path.join(projectDir, 'src'));
    await ensureDir(path.join(projectDir, 'tests'));
    await ensureDir(path.join(projectDir, 'data'));
    await ensureDir(path.join(projectDir, 'docs'));

    // Generate and write files
    const files: Array<{ path: string; content: string }> = [
      // Root files
      {
        path: path.join(projectDir, 'package.json'),
        content: generatePackageJson(projectName, spec.idea),
      },
      {
        path: path.join(projectDir, 'tsconfig.json'),
        content: generateTsconfig(),
      },
      {
        path: path.join(projectDir, 'vitest.config.ts'),
        content: generateVitestConfig(),
      },
      {
        path: path.join(projectDir, 'eslint.config.js'),
        content: generateEslintConfig(),
      },
      {
        path: path.join(projectDir, '.prettierrc'),
        content: generatePrettierrc(),
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
        path: path.join(projectDir, 'README.md'),
        content: generateReadme(projectName, spec.idea),
      },
      {
        path: path.join(projectDir, 'Dockerfile'),
        content: generateDockerfile(projectName),
      },
      {
        path: path.join(projectDir, 'docker-compose.yml'),
        content: generateDockerCompose(projectName),
      },

      // Source files
      {
        path: path.join(projectDir, 'src', 'index.ts'),
        content: generateIndexTs(projectName),
      },

      // Test files
      {
        path: path.join(projectDir, 'tests', 'index.test.ts'),
        content: generateTestFile(projectName),
      },

      // Data placeholder
      {
        path: path.join(projectDir, 'data', '.gitkeep'),
        content: '',
      },
    ];

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
export function getTypeScriptProjectFiles(_projectName: string): string[] {
  return [
    'package.json',
    'tsconfig.json',
    'vitest.config.ts',
    'eslint.config.js',
    '.prettierrc',
    '.gitignore',
    '.env.example',
    'README.md',
    'Dockerfile',
    'docker-compose.yml',
    'src/index.ts',
    'tests/index.test.ts',
    'data/.gitkeep',
  ];
}

/**
 * Validate a TypeScript project structure
 *
 * @param projectDir - Project directory
 * @returns Validation result
 */
export async function validateTypeScriptProject(projectDir: string): Promise<{
  valid: boolean;
  missingFiles: string[];
}> {
  const missingFiles: string[] = [];

  const requiredFiles = [
    'package.json',
    'tsconfig.json',
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
 * Add a new TypeScript module to an existing project
 *
 * @param projectDir - Project directory
 * @param moduleName - Module name
 * @returns Files created
 */
export async function addTypeScriptModule(
  projectDir: string,
  moduleName: string
): Promise<string[]> {
  const filesCreated: string[] = [];

  const srcDir = path.join(projectDir, 'src');
  const moduleDir = path.join(srcDir, moduleName);
  await ensureDir(moduleDir);

  // Create module files
  const indexContent = `/**
 * ${moduleName} module
 */

export * from './${moduleName}.js';
`;
  await writeFile(path.join(moduleDir, 'index.ts'), indexContent);
  filesCreated.push(path.join(moduleDir, 'index.ts'));

  const className = moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/-/g, '');
  const moduleContent = `/**
 * ${moduleName} implementation
 */

/**
 * ${className} class
 */
export class ${className} {
  /**
   * Create a new ${className} instance
   */
  constructor() {
    console.log(\`Initializing \${this.constructor.name}\`);
  }

  /**
   * Run the ${moduleName} logic
   */
  run(): void {
    throw new Error('Not implemented');
  }
}
`;
  await writeFile(path.join(moduleDir, `${moduleName}.ts`), moduleContent);
  filesCreated.push(path.join(moduleDir, `${moduleName}.ts`));

  // Create test file
  const testDir = path.join(projectDir, 'tests');
  const testContent = `import { describe, it, expect } from 'vitest';
import { ${className} } from '../src/${moduleName}/index.js';

describe('${className}', () => {
  it('should create an instance', () => {
    const instance = new ${className}();
    expect(instance).toBeDefined();
  });

  it('should throw on run (placeholder)', () => {
    const instance = new ${className}();
    expect(() => instance.run()).toThrow('Not implemented');
  });
});
`;
  await writeFile(path.join(testDir, `${moduleName}.test.ts`), testContent);
  filesCreated.push(path.join(testDir, `${moduleName}.test.ts`));

  return filesCreated;
}

/**
 * Add a dependency to package.json
 *
 * @param projectDir - Project directory
 * @param packageName - Package name
 * @param version - Package version
 * @param dev - Whether it's a dev dependency
 */
export async function addDependency(
  projectDir: string,
  packageName: string,
  version: string,
  dev: boolean = false
): Promise<void> {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  const key = dev ? 'devDependencies' : 'dependencies';
  packageJson[key] = packageJson[key] || {};
  packageJson[key][packageName] = version;

  // Sort dependencies
  packageJson[key] = Object.fromEntries(
    Object.entries(packageJson[key]).sort(([a], [b]) => a.localeCompare(b))
  );

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * Update package.json scripts
 *
 * @param projectDir - Project directory
 * @param scripts - Scripts to add/update
 */
export async function updateScripts(
  projectDir: string,
  scripts: Record<string, string>
): Promise<void> {
  const packageJsonPath = path.join(projectDir, 'package.json');
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  packageJson.scripts = {
    ...packageJson.scripts,
    ...scripts,
  };

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
}
