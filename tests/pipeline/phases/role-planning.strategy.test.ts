/**
 * Role planning strategy injection tests.
 * Verifies that WEBSITE_PROGRAMMER, MARKETING_EXPERT, SOCIAL_EXPERT
 * get strategy context in their planning prompts, and other roles do not.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runRolePlanning } from '../../../src/pipeline/phases/role-planning.js';
import type { PhaseContext } from '../../../src/pipeline/phases/phase-context.js';
import type { PipelineRole, ArtifactEntry } from '../../../src/pipeline/types.js';
import { createDefaultPipelineState } from '../../../src/pipeline/types.js';
import { SkillUsageRegistry } from '../../../src/pipeline/skills/usage-registry.js';

const TEST_DIR = join(process.cwd(), 'tmp-role-planning-strategy-test');

function makeValidStrategy() {
  return {
    icp: { primaryPersona: 'developers', painPoints: ['slow builds'], goals: ['fast CI'], objections: ['cost'] },
    positioning: { category: 'DevTools', differentiators: ['speed'], valueProposition: 'Build faster', proofPoints: ['10x'] },
    messaging: { headline: 'Build Faster', subheadline: 'CI that works', elevatorPitch: 'Fast CI', longDescription: 'A fast CI platform' },
    seoStrategy: { primaryKeywords: ['CI'], secondaryKeywords: ['build'], longTailKeywords: ['fast CI'], titleTemplates: {}, metaDescriptions: {} },
    siteArchitecture: {
      pages: [{ path: '/', title: 'Home', purpose: 'Landing', pageType: 'landing', sections: ['hero'], seoKeywords: ['CI'], conversionGoal: 'signup' }],
      navigation: [{ label: 'Home', href: '/' }],
      footerSections: [{ title: 'Links', links: [{ label: 'Home', href: '/' }] }],
    },
    conversionStrategy: {
      primaryCta: { text: 'Get Started', href: '/signup' },
      secondaryCta: { text: 'Learn More', href: '/docs' },
      trustSignals: ['SOC2'],
      socialProof: ['1000+ teams'],
      leadCapture: 'webhook',
    },
    competitiveContext: { category: 'CI/CD', competitors: ['CircleCI'], differentiators: ['speed'] },
  };
}

// Capture all prompts passed to executePrompt
let capturedPrompts: string[] = [];

vi.mock('../../../src/adapters/claude.js', () => ({
  executePrompt: vi.fn(async (prompt: string) => {
    capturedPrompts.push(prompt);
    return { response: 'Mocked plan output' };
  }),
}));

function makeMockSkill(role: string) {
  return {
    role,
    version: '1.0',
    systemPrompt: `You are ${role}. Follow best practices.`,
    required_outputs: [],
    constraints: ['Stay in scope'],
    tools: [],
  };
}

function makeArtifact(type: string, path: string): ArtifactEntry {
  return {
    id: `art-${type}`,
    type: type as any,
    phase: 'ARCHITECTURE',
    version: 1,
    path,
    sha256: 'abc',
    timestamp: new Date().toISOString(),
    immutable: true,
    content_type: 'markdown',
    group_id: 'g1',
  };
}

function makePhaseContext(activeRoles: PipelineRole[]): PhaseContext {
  const pipeline = createDefaultPipelineState();
  pipeline.activeRoles = activeRoles;

  // Add architecture and master plan artifacts
  const archPath = 'docs/architecture.md';
  const planPath = 'docs/master-plan.md';
  pipeline.artifacts.push(makeArtifact('architecture', archPath));
  pipeline.artifacts.push(makeArtifact('master_plan', planPath));

  // Write artifact files
  writeFileSync(join(TEST_DIR, archPath), '# Architecture\nMicroservices');
  writeFileSync(join(TEST_DIR, planPath), '# Master Plan\nBuild a CI tool');

  const events: any[] = [];
  const registry = new SkillUsageRegistry(events);

  let artifactCounter = 0;

  return {
    pipeline,
    projectDir: TEST_DIR,
    state: {} as any,
    skillLoader: {
      loadSkill: (role: string) => makeMockSkill(role),
      loadSkillWithMeta: (role: string) => ({
        definition: makeMockSkill(role),
        meta: { source: 'defaults' as const, version: '1.0' },
      }),
      listSkills: () => [],
    } as any,
    artifactManager: {
      createAndStoreText: (_type: string, content: string, _phase: string) => {
        artifactCounter++;
        return makeArtifact('role_plan', `docs/role-plans/plan-${artifactCounter}.md`);
      },
    } as any,
    gateEngine: {} as any,
    consensusRunner: {} as any,
    skillUsageRegistry: registry,
  };
}

beforeEach(() => {
  capturedPrompts = [];
  mkdirSync(join(TEST_DIR, 'docs', 'role-plans'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.popeye'), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe('role-planning strategy injection', () => {
  it('WEBSITE_PROGRAMMER planning prompt includes strategy when file exists', async () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify(makeValidStrategy()),
    );

    const ctx = makePhaseContext(['WEBSITE_PROGRAMMER']);
    await runRolePlanning(ctx);

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain('Website Marketing Strategy');
    expect(capturedPrompts[0]).toContain('Target Customer');
    expect(capturedPrompts[0]).toContain('developers');
  });

  it('MARKETING_EXPERT planning prompt includes strategy', async () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify(makeValidStrategy()),
    );

    const ctx = makePhaseContext(['MARKETING_EXPERT']);
    await runRolePlanning(ctx);

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain('Website Marketing Strategy');
  });

  it('DB_EXPERT planning prompt does NOT include strategy', async () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify(makeValidStrategy()),
    );

    const ctx = makePhaseContext(['DB_EXPERT']);
    await runRolePlanning(ctx);

    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).not.toContain('Website Marketing Strategy');
    expect(capturedPrompts[0]).not.toContain('Target Customer');
  });

  it('missing strategy file does not crash planning', async () => {
    // No strategy file written
    const ctx = makePhaseContext(['WEBSITE_PROGRAMMER', 'BACKEND_PROGRAMMER']);
    const result = await runRolePlanning(ctx);

    expect(result.success).toBe(true);
    expect(capturedPrompts).toHaveLength(2);
    // Neither prompt should contain strategy
    for (const prompt of capturedPrompts) {
      expect(prompt).not.toContain('Website Marketing Strategy');
    }
  });

  it('records strategy_context usage for strategy roles only', async () => {
    writeFileSync(
      join(TEST_DIR, '.popeye', 'website-strategy.json'),
      JSON.stringify(makeValidStrategy()),
    );

    const ctx = makePhaseContext(['WEBSITE_PROGRAMMER', 'BACKEND_PROGRAMMER']);
    await runRolePlanning(ctx);

    const events = ctx.skillUsageRegistry.getEvents();
    const strategyEvents = events.filter((e) => e.used_as === 'strategy_context');
    expect(strategyEvents).toHaveLength(1);
    expect(strategyEvents[0].role).toBe('WEBSITE_PROGRAMMER');
    expect(strategyEvents[0].phase).toBe('ROLE_PLANNING');
    expect(strategyEvents[0].skill_source).toBe('disk');
  });
});
