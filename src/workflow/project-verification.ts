/**
 * Comprehensive Project Verification
 * Ensures generated projects are actually complete and runnable
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Verification result
 */
export interface VerificationResult {
  passed: boolean;
  category: string;
  check: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  autoFixable: boolean;
  fix?: () => Promise<void>;
}

/**
 * Project verification report
 */
export interface VerificationReport {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warnings: number;
  results: VerificationResult[];
  criticalIssues: string[];
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read file content safely
 */
async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Find files matching a pattern recursively
 */
async function findFiles(dir: string, pattern: RegExp, maxDepth = 5): Promise<string[]> {
  const results: string[] = [];

  async function search(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
          await search(fullPath, depth + 1);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  await search(dir, 0);
  return results;
}

/**
 * Check if content contains Tailwind classes
 */
function hasTailwindClasses(content: string): boolean {
  const tailwindPatterns = [
    /className=["'][^"']*(?:flex|grid|block|inline|hidden)/,
    /className=["'][^"']*(?:bg-|text-|border-|rounded-|shadow-|p-|m-|w-|h-)/,
    /className=["'][^"']*(?:hover:|focus:|active:|disabled:)/,
    /className=["'][^"']*(?:sm:|md:|lg:|xl:|2xl:)/,
  ];

  return tailwindPatterns.some(pattern => pattern.test(content));
}

/**
 * Check if content contains TODO placeholders
 */
function findTodoPlaceholders(content: string): string[] {
  const patterns = [
    /TODO:?\s*(.+)/gi,
    /<div>.*TODO.*<\/div>/gi,
    /\{\/\*\s*TODO.*\*\/\}/gi,
    /placeholder.*TODO/gi,
  ];

  const todos: string[] = [];
  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      todos.push(match[0].trim());
    }
  }

  return todos;
}

/**
 * Verify CSS/Styling setup
 */
async function verifyStylingSetup(projectDir: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const frontendDir = path.join(projectDir, 'packages', 'frontend');

  // Check if frontend uses Tailwind classes
  const tsxFiles = await findFiles(path.join(frontendDir, 'src'), /\.tsx$/);
  let usesTailwind = false;

  for (const file of tsxFiles.slice(0, 20)) { // Check first 20 files
    const content = await readFile(file);
    if (content && hasTailwindClasses(content)) {
      usesTailwind = true;
      break;
    }
  }

  if (usesTailwind) {
    // Check Tailwind is in package.json
    const pkgJson = await readFile(path.join(frontendDir, 'package.json'));
    const hasTailwindDep = pkgJson?.includes('tailwindcss');

    results.push({
      passed: !!hasTailwindDep,
      category: 'Styling',
      check: 'Tailwind CSS dependency',
      message: hasTailwindDep
        ? 'Tailwind CSS is installed'
        : 'Components use Tailwind classes but tailwindcss is not in package.json',
      severity: hasTailwindDep ? 'info' : 'error',
      autoFixable: true,
      fix: hasTailwindDep ? undefined : async () => {
        await execAsync('npm install -D tailwindcss @tailwindcss/postcss', { cwd: frontendDir });
      },
    });

    // Check PostCSS config
    const hasPostcssConfig = await fileExists(path.join(frontendDir, 'postcss.config.js')) ||
                            await fileExists(path.join(frontendDir, 'postcss.config.cjs'));

    results.push({
      passed: hasPostcssConfig,
      category: 'Styling',
      check: 'PostCSS configuration',
      message: hasPostcssConfig
        ? 'PostCSS is configured'
        : 'Missing postcss.config.js for Tailwind CSS',
      severity: hasPostcssConfig ? 'info' : 'error',
      autoFixable: true,
    });

    // Check CSS file exists and is imported
    const mainTsx = await readFile(path.join(frontendDir, 'src', 'main.tsx'));
    const hasCssImport = mainTsx?.includes("import './index.css'") ||
                         mainTsx?.includes('import "./index.css"') ||
                         mainTsx?.includes("import '../index.css'");

    results.push({
      passed: !!hasCssImport,
      category: 'Styling',
      check: 'CSS import in main.tsx',
      message: hasCssImport
        ? 'CSS is imported in main entry point'
        : 'No CSS import found in main.tsx - styles will not load',
      severity: hasCssImport ? 'info' : 'error',
      autoFixable: true,
    });

    // Check index.css exists
    const hasIndexCss = await fileExists(path.join(frontendDir, 'src', 'index.css'));

    results.push({
      passed: hasIndexCss,
      category: 'Styling',
      check: 'Global CSS file',
      message: hasIndexCss
        ? 'Global CSS file exists'
        : 'Missing src/index.css',
      severity: hasIndexCss ? 'info' : 'error',
      autoFixable: true,
    });
  }

  return results;
}

/**
 * Verify authentication setup
 */
async function verifyAuthSetup(projectDir: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const frontendDir = path.join(projectDir, 'packages', 'frontend');

  // Check if project uses Auth0
  const pkgJson = await readFile(path.join(frontendDir, 'package.json'));
  const usesAuth0 = pkgJson?.includes('@auth0/auth0-react');

  if (usesAuth0) {
    // Check for dev mode bypass
    const useAuthFile = await readFile(path.join(frontendDir, 'src', 'hooks', 'useAuth.ts'));
    const hasDevBypass = useAuthFile?.includes('isAuth0Configured') ||
                         useAuthFile?.includes('DEV_MOCK_USER') ||
                         useAuthFile?.includes('development mode');

    results.push({
      passed: !!hasDevBypass,
      category: 'Authentication',
      check: 'Development mode bypass',
      message: hasDevBypass
        ? 'Auth has development mode bypass'
        : 'Auth requires Auth0 configuration - app will not work without it',
      severity: hasDevBypass ? 'info' : 'error',
      autoFixable: false,
    });

    // Check Auth0 provider has fallback
    const authProviderFile = await readFile(path.join(frontendDir, 'src', 'providers', 'Auth0ProviderWithNavigate.tsx'));
    const hasFallback = authProviderFile?.includes('isAuth0Configured') &&
                        authProviderFile?.includes('return <>{children}</>');

    results.push({
      passed: !!hasFallback,
      category: 'Authentication',
      check: 'Auth0 provider fallback',
      message: hasFallback
        ? 'Auth0 provider has fallback for unconfigured state'
        : 'Auth0 provider may hang if not configured',
      severity: hasFallback ? 'info' : 'warning',
      autoFixable: false,
    });
  }

  return results;
}

/**
 * Verify routes are complete (no TODO placeholders)
 */
async function verifyRouteCompleteness(projectDir: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const frontendDir = path.join(projectDir, 'packages', 'frontend');

  // Check routes file
  const routesFile = await readFile(path.join(frontendDir, 'src', 'routes', 'index.tsx'));

  if (routesFile) {
    const todos = findTodoPlaceholders(routesFile);

    results.push({
      passed: todos.length === 0,
      category: 'Routes',
      check: 'Route completeness',
      message: todos.length === 0
        ? 'All routes are implemented'
        : `Found ${todos.length} TODO placeholder(s) in routes: ${todos.slice(0, 3).join(', ')}`,
      severity: todos.length === 0 ? 'info' : 'warning',
      autoFixable: false,
    });
  }

  // Check all page components
  const pageFiles = await findFiles(path.join(frontendDir, 'src', 'pages'), /\.tsx$/);
  const incompletePages: string[] = [];

  for (const file of pageFiles) {
    const content = await readFile(file);
    if (content) {
      // Check if page is just a placeholder
      const lineCount = content.split('\n').length;
      if (lineCount < 15) {
        incompletePages.push(path.basename(file));
      }

      // Check for TODO in page content
      const todos = findTodoPlaceholders(content);
      if (todos.length > 0) {
        incompletePages.push(`${path.basename(file)} (TODOs)`);
      }
    }
  }

  results.push({
    passed: incompletePages.length === 0,
    category: 'Pages',
    check: 'Page completeness',
    message: incompletePages.length === 0
      ? 'All pages are implemented'
      : `Incomplete pages: ${incompletePages.slice(0, 5).join(', ')}`,
    severity: incompletePages.length === 0 ? 'info' : 'warning',
    autoFixable: false,
  });

  return results;
}

/**
 * Verify database setup
 */
async function verifyDatabaseSetup(projectDir: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const backendDir = path.join(projectDir, 'packages', 'backend');

  // Check .env.example has database config
  const envExample = await readFile(path.join(projectDir, '.env.example')) ||
                     await readFile(path.join(backendDir, '.env.example'));

  const hasDbConfig = envExample?.includes('DATABASE_URL') ||
                      envExample?.includes('DB_HOST');

  results.push({
    passed: !!hasDbConfig,
    category: 'Database',
    check: 'Database configuration documented',
    message: hasDbConfig
      ? 'Database configuration is documented in .env.example'
      : 'Missing database configuration in .env.example',
    severity: hasDbConfig ? 'info' : 'warning',
    autoFixable: true,
  });

  // Check for docker-compose
  const hasDocker = await fileExists(path.join(projectDir, 'docker-compose.yml')) ||
                    await fileExists(path.join(projectDir, 'docker-compose.yaml'));

  results.push({
    passed: hasDocker,
    category: 'Database',
    check: 'Docker Compose for local development',
    message: hasDocker
      ? 'Docker Compose file exists for local development'
      : 'No docker-compose.yml - users need to set up database manually',
    severity: hasDocker ? 'info' : 'warning',
    autoFixable: true,
  });

  return results;
}

/**
 * Verify the app actually starts
 */
async function verifyAppStarts(projectDir: string): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const frontendDir = path.join(projectDir, 'packages', 'frontend');

  // Try to start frontend briefly
  try {
    await execAsync('npm run build', {
      cwd: frontendDir,
      timeout: 120000,
    });

    results.push({
      passed: true,
      category: 'Build',
      check: 'Frontend builds successfully',
      message: 'Frontend production build completed',
      severity: 'info',
      autoFixable: false,
    });
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    results.push({
      passed: false,
      category: 'Build',
      check: 'Frontend builds successfully',
      message: `Frontend build failed: ${error.stderr?.slice(0, 200) || error.message}`,
      severity: 'error',
      autoFixable: false,
    });
  }

  return results;
}

/**
 * Run comprehensive project verification
 */
export async function runComprehensiveVerification(
  projectDir: string,
  onProgress?: (message: string) => void
): Promise<VerificationReport> {
  const allResults: VerificationResult[] = [];

  onProgress?.('Checking styling setup...');
  allResults.push(...await verifyStylingSetup(projectDir));

  onProgress?.('Checking authentication setup...');
  allResults.push(...await verifyAuthSetup(projectDir));

  onProgress?.('Checking route completeness...');
  allResults.push(...await verifyRouteCompleteness(projectDir));

  onProgress?.('Checking database setup...');
  allResults.push(...await verifyDatabaseSetup(projectDir));

  onProgress?.('Verifying app builds...');
  allResults.push(...await verifyAppStarts(projectDir));

  // Calculate summary
  const passedChecks = allResults.filter(r => r.passed).length;
  const failedChecks = allResults.filter(r => !r.passed && r.severity === 'error').length;
  const warnings = allResults.filter(r => !r.passed && r.severity === 'warning').length;

  const criticalIssues = allResults
    .filter(r => !r.passed && r.severity === 'error')
    .map(r => `[${r.category}] ${r.message}`);

  return {
    passed: failedChecks === 0,
    totalChecks: allResults.length,
    passedChecks,
    failedChecks,
    warnings,
    results: allResults,
    criticalIssues,
  };
}

/**
 * Auto-fix fixable issues
 */
export async function autoFixIssues(
  report: VerificationReport,
  onProgress?: (message: string) => void
): Promise<number> {
  let fixed = 0;

  for (const result of report.results) {
    if (!result.passed && result.autoFixable && result.fix) {
      try {
        onProgress?.(`Fixing: ${result.check}...`);
        await result.fix();
        fixed++;
      } catch (err) {
        onProgress?.(`Failed to fix ${result.check}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  return fixed;
}
