/**
 * Tests for project generators
 */

import { describe, it, expect } from 'vitest';
import {
  getProjectFiles,
  getTestCommand,
  getBuildCommand,
  getLintCommand,
  getFileExtension,
  getSourceDir,
  getTestDir,
} from '../../src/generators/index.js';
import {
  generatePyprojectToml,
  generateReadme as generatePythonReadme,
  generateGitignore as generatePythonGitignore,
} from '../../src/generators/templates/python.js';
import {
  generatePackageJson,
  generateTsconfig,
  generateReadme as generateTsReadme,
  generateGitignore as generateTsGitignore,
} from '../../src/generators/templates/typescript.js';

describe('getProjectFiles', () => {
  it('should return Python project files', () => {
    const files = getProjectFiles('my-project', 'python');

    expect(files).toContain('pyproject.toml');
    expect(files).toContain('requirements.txt');
    expect(files).toContain('README.md');
    expect(files).toContain('tests/conftest.py');
  });

  it('should return TypeScript project files', () => {
    const files = getProjectFiles('my-project', 'typescript');

    expect(files).toContain('package.json');
    expect(files).toContain('tsconfig.json');
    expect(files).toContain('README.md');
    expect(files).toContain('src/index.ts');
  });
});

describe('getTestCommand', () => {
  it('should return pytest for Python', () => {
    expect(getTestCommand('python')).toContain('pytest');
  });

  it('should return npm test for TypeScript', () => {
    expect(getTestCommand('typescript')).toContain('npm');
  });
});

describe('getBuildCommand', () => {
  it('should return pip install for Python', () => {
    expect(getBuildCommand('python')).toContain('pip');
  });

  it('should return npm build for TypeScript', () => {
    expect(getBuildCommand('typescript')).toContain('npm');
    expect(getBuildCommand('typescript')).toContain('build');
  });
});

describe('getLintCommand', () => {
  it('should return ruff for Python', () => {
    expect(getLintCommand('python')).toContain('ruff');
  });

  it('should return npm lint for TypeScript', () => {
    expect(getLintCommand('typescript')).toContain('lint');
  });
});

describe('getFileExtension', () => {
  it('should return py for Python', () => {
    expect(getFileExtension('python')).toBe('py');
  });

  it('should return ts for TypeScript', () => {
    expect(getFileExtension('typescript')).toBe('ts');
  });
});

describe('getSourceDir', () => {
  it('should return src for both languages', () => {
    expect(getSourceDir('python')).toBe('src');
    expect(getSourceDir('typescript')).toBe('src');
  });
});

describe('getTestDir', () => {
  it('should return tests for both languages', () => {
    expect(getTestDir('python')).toBe('tests');
    expect(getTestDir('typescript')).toBe('tests');
  });
});

describe('Python templates', () => {
  describe('generatePyprojectToml', () => {
    it('should generate valid pyproject.toml', () => {
      const content = generatePyprojectToml('my-project');

      expect(content).toContain('[build-system]');
      expect(content).toContain('name = "my-project"');
      expect(content).toContain('requires-python');
      expect(content).toContain('[tool.pytest.ini_options]');
    });
  });

  describe('generateReadme', () => {
    it('should include project name', () => {
      const readme = generatePythonReadme('awesome-app', 'An awesome application');

      expect(readme).toContain('# awesome-app');
      expect(readme).toContain('An awesome application');
      expect(readme).toContain('Installation');
      expect(readme).toContain('pytest');
    });
  });

  describe('generateGitignore', () => {
    it('should include Python patterns', () => {
      const gitignore = generatePythonGitignore();

      expect(gitignore).toContain('__pycache__');
      expect(gitignore).toContain('*.py[cod]');  // Pattern for .pyc, .pyo, .pyd
      expect(gitignore).toContain('venv');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('.popeye');
    });
  });
});

describe('TypeScript templates', () => {
  describe('generatePackageJson', () => {
    it('should generate valid package.json', () => {
      const content = generatePackageJson('my-app', 'Test app');
      const pkg = JSON.parse(content);

      expect(pkg.name).toBe('my-app');
      expect(pkg.description).toBe('Test app');
      expect(pkg.scripts.build).toBeDefined();
      expect(pkg.scripts.test).toBeDefined();
      expect(pkg.devDependencies.typescript).toBeDefined();
    });
  });

  describe('generateTsconfig', () => {
    it('should generate valid tsconfig.json', () => {
      const content = generateTsconfig();
      const config = JSON.parse(content);

      expect(config.compilerOptions).toBeDefined();
      expect(config.compilerOptions.strict).toBe(true);
      expect(config.compilerOptions.target).toBe('ES2022');
      expect(config.include).toContain('src/**/*');
    });
  });

  describe('generateReadme', () => {
    it('should include project name', () => {
      const readme = generateTsReadme('cool-app', 'A cool application');

      expect(readme).toContain('# cool-app');
      expect(readme).toContain('A cool application');
      expect(readme).toContain('npm install');
      expect(readme).toContain('npm test');
    });
  });

  describe('generateGitignore', () => {
    it('should include Node patterns', () => {
      const gitignore = generateTsGitignore();

      expect(gitignore).toContain('node_modules');
      expect(gitignore).toContain('dist');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('.popeye');
    });
  });
});
