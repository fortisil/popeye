/**
 * Tests for post-generation website content scanner
 * Verifies detection of placeholder fingerprints in generated files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanGeneratedContent } from '../../src/generators/website-content-scanner.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scanner-test-'));
  await fs.mkdir(path.join(tmpDir, 'src', 'app'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'src', 'components'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('scanGeneratedContent', () => {
  it('produces no issues for clean files', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `export default function Home() {
  return <main><h1>Welcome to Gateco</h1></main>;
}
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues).toHaveLength(0);
    expect(result.filesScanned).toBe(1);
    expect(result.score).toBe(100);
  });

  it('flags TODO block comments as errors', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `export default function Home() {
  return <main>/* TODO: Replace with real content */</main>;
}
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues.length).toBeGreaterThan(0);
    const todoIssue = result.issues.find((i) => /TODO/i.test(i.message));
    expect(todoIssue).toBeDefined();
    expect(todoIssue!.severity).toBe('error');
  });

  it('flags TODO line comments as errors', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'components', 'Header.tsx'),
      `// TODO: add real navigation
export function Header() { return <header />; }
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues.some((i) => /TODO/i.test(i.message))).toBe(true);
  });

  it('detects default pricing pattern in file content', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `const tiers = [
  { name: 'Starter', price: '$0/mo', features: ['1 user'] },
  { name: 'Pro', price: '$29/mo', features: ['10 users'] },
  { name: 'Enterprise', price: 'Custom', features: ['Unlimited'] },
];
export default function Page() { return <div />; }
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues.some((i) => /pricing/i.test(i.message))).toBe(true);
    expect(result.issues.some((i) => /\$29/i.test(i.message))).toBe(true);
  });

  it('detects default tagline text', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'components', 'Footer.tsx'),
      `export function Footer() { return <p>Build something amazing</p>; }
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues.some((i) => /tagline/i.test(i.message))).toBe(true);
  });

  it('detects generic description text', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `export default function Page() { return <p>Your modern web application</p>; }
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues.some((i) => /generic description/i.test(i.message))).toBe(true);
  });

  it('detects default How It Works steps', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `const steps = [
  { title: 'Sign Up', desc: 'Create account' },
  { title: 'Configure', desc: 'Set preferences' },
  { title: 'Deploy', desc: 'Go live' },
];
export default function Page() { return <div />; }
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues.some((i) => /How It Works/i.test(i.message))).toBe(true);
  });

  it('returns score of 100 when no issues found', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `export default function Page() { return <h1>Gateco</h1>; }
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.score).toBe(100);
  });

  it('decreases score with multiple issues', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'src', 'app', 'page.tsx'),
      `// TODO: fix this
export default function Page() {
  return <div>
    <p>Build something amazing</p>
    <p>Your modern web application costs $29/mo</p>
  </div>;
}
`,
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.score).toBeLessThan(80);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty src directory gracefully', async () => {
    const result = await scanGeneratedContent(tmpDir);

    expect(result.issues).toHaveLength(0);
    expect(result.filesScanned).toBe(0);
    expect(result.score).toBe(100);
  });

  it('skips node_modules directory', async () => {
    await fs.mkdir(path.join(tmpDir, 'src', 'node_modules'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'src', 'node_modules', 'bad.tsx'),
      '// TODO: should be ignored',
    );

    const result = await scanGeneratedContent(tmpDir);

    expect(result.filesScanned).toBe(0);
    expect(result.issues).toHaveLength(0);
  });
});
