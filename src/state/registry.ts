/**
 * Project Registry
 * Tracks all Popeye projects globally and provides discovery functionality
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { homedir } from 'os';
import { STATE_DIR, STATE_FILE, loadState } from './persistence.js';

/**
 * Global registry directory
 */
const REGISTRY_DIR = path.join(homedir(), '.popeye');

/**
 * Registry file name
 */
const REGISTRY_FILE = 'projects.json';

/**
 * Registered project entry
 */
export interface RegisteredProject {
  path: string;
  name: string;
  idea?: string;
  language: string;
  phase: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project registry structure
 */
interface ProjectRegistry {
  version: string;
  projects: RegisteredProject[];
}

/**
 * Get registry file path
 */
function getRegistryPath(): string {
  return path.join(REGISTRY_DIR, REGISTRY_FILE);
}

/**
 * Ensure registry directory exists
 */
async function ensureRegistryDir(): Promise<void> {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
}

/**
 * Load the project registry
 */
async function loadRegistry(): Promise<ProjectRegistry> {
  try {
    const content = await fs.readFile(getRegistryPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return { version: '1.0', projects: [] };
  }
}

/**
 * Save the project registry
 */
async function saveRegistry(registry: ProjectRegistry): Promise<void> {
  await ensureRegistryDir();
  const content = JSON.stringify(registry, null, 2);
  await fs.writeFile(getRegistryPath(), content, 'utf-8');
}

/**
 * Register a new project or update existing registration
 */
export async function registerProject(projectDir: string): Promise<void> {
  const state = await loadState(projectDir);
  if (!state) return;

  const registry = await loadRegistry();

  // Check if project already registered
  const existingIndex = registry.projects.findIndex(p => p.path === projectDir);

  const entry: RegisteredProject = {
    path: projectDir,
    name: state.name,
    idea: state.idea?.slice(0, 200),
    language: state.language,
    phase: state.phase,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };

  if (existingIndex >= 0) {
    registry.projects[existingIndex] = entry;
  } else {
    registry.projects.push(entry);
  }

  await saveRegistry(registry);
}

/**
 * Remove a project from the registry
 */
export async function unregisterProject(projectDir: string): Promise<void> {
  const registry = await loadRegistry();
  registry.projects = registry.projects.filter(p => p.path !== projectDir);
  await saveRegistry(registry);
}

/**
 * Get all registered projects
 */
export async function getRegisteredProjects(): Promise<RegisteredProject[]> {
  const registry = await loadRegistry();

  // Verify each project still exists and update status
  const validProjects: RegisteredProject[] = [];

  for (const project of registry.projects) {
    try {
      const state = await loadState(project.path);
      if (state) {
        validProjects.push({
          ...project,
          phase: state.phase,
          status: state.status,
          updatedAt: state.updatedAt,
        });
      }
    } catch {
      // Project no longer exists, skip it
    }
  }

  // Update registry with valid projects only
  if (validProjects.length !== registry.projects.length) {
    await saveRegistry({ ...registry, projects: validProjects });
  }

  // Sort by updatedAt (most recent first)
  return validProjects.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Scan a directory (and subdirectories) for Popeye projects
 */
export async function scanForProjects(
  baseDir: string,
  maxDepth: number = 3
): Promise<RegisteredProject[]> {
  const discovered: RegisteredProject[] = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      // Check if this directory has a Popeye project
      const statePath = path.join(dir, STATE_DIR, STATE_FILE);
      try {
        await fs.access(statePath);
        const state = await loadState(dir);
        if (state) {
          discovered.push({
            path: dir,
            name: state.name,
            idea: state.idea?.slice(0, 200),
            language: state.language,
            phase: state.phase,
            status: state.status,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
          });
          // Register discovered project
          await registerProject(dir);
        }
      } catch {
        // No state file in this directory
      }

      // Scan subdirectories
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scanDir(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Can't read directory, skip it
    }
  }

  await scanDir(baseDir, 0);

  // Sort by updatedAt (most recent first)
  return discovered.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Find projects in the current directory and registered projects
 */
export async function discoverProjects(cwd: string): Promise<{
  registered: RegisteredProject[];
  discovered: RegisteredProject[];
  all: RegisteredProject[];
}> {
  // Get registered projects
  const registered = await getRegisteredProjects();

  // Scan current directory for projects
  const scanned = await scanForProjects(cwd, 2);

  // Merge, avoiding duplicates
  const registeredPaths = new Set(registered.map(p => p.path));
  const discovered = scanned.filter(p => !registeredPaths.has(p.path));

  // Combine all projects
  const all = [...registered, ...discovered].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return { registered, discovered, all };
}

/**
 * Format a project for display
 */
export function formatProjectForDisplay(project: RegisteredProject): {
  name: string;
  status: string;
  path: string;
  lastUpdated: string;
  age: string;
} {
  const now = new Date();
  const updated = new Date(project.updatedAt);
  const diffMs = now.getTime() - updated.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let age: string;
  if (diffMins < 1) {
    age = 'just now';
  } else if (diffMins < 60) {
    age = `${diffMins}m ago`;
  } else if (diffHours < 24) {
    age = `${diffHours}h ago`;
  } else if (diffDays < 7) {
    age = `${diffDays}d ago`;
  } else {
    age = updated.toLocaleDateString();
  }

  const statusIcon = project.status === 'complete' ? '✓' :
                     project.status === 'failed' ? '✗' :
                     project.status === 'in-progress' ? '→' : '○';

  return {
    name: project.name,
    status: `${statusIcon} ${project.phase}/${project.status}`,
    path: project.path,
    lastUpdated: updated.toISOString(),
    age,
  };
}
