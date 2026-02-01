/**
 * Tests for plan-mode workflow
 */

import { describe, it, expect } from 'vitest';
import { parsePlanMilestones } from '../../src/workflow/plan-mode.js';

describe('parsePlanMilestones', () => {
  describe('with explicit task markers', () => {
    it('should extract tasks with "### Task N:" format', () => {
      const plan = `
# Development Plan

## Milestone 1: Core Setup

### Task 1: Create project structure
- **Description**: Set up the basic project directory structure
- **Acceptance Criteria**:
  - All directories created
  - Package.json initialized

### Task 2: Implement user authentication
- **Description**: Build the authentication module
- **Acceptance Criteria**:
  - Login endpoint works
  - JWT tokens issued
`;

      const milestones = parsePlanMilestones(plan);

      expect(milestones.length).toBeGreaterThan(0);
      const allTasks = milestones.flatMap(m => m.tasks);
      expect(allTasks.length).toBeGreaterThanOrEqual(2);

      const taskNames = allTasks.map(t => t.name.toLowerCase());
      expect(taskNames.some(n => n.includes('create project structure'))).toBe(true);
      expect(taskNames.some(n => n.includes('implement user authentication'))).toBe(true);
    });

    it('should extract tasks with actionable verbs from bullets', () => {
      const plan = `
## Implementation Phase

- Implement the REST API endpoints for user management
- Create the database schema for products
- Build the authentication middleware
- Set up Docker containerization
`;

      const milestones = parsePlanMilestones(plan);
      const allTasks = milestones.flatMap(m => m.tasks);

      expect(allTasks.length).toBeGreaterThanOrEqual(4);
      const taskNames = allTasks.map(t => t.name.toLowerCase());
      expect(taskNames.some(n => n.includes('implement'))).toBe(true);
      expect(taskNames.some(n => n.includes('create'))).toBe(true);
      expect(taskNames.some(n => n.includes('build'))).toBe(true);
    });
  });

  describe('filtering non-actionable content', () => {
    it('should NOT extract plan metadata as tasks', () => {
      const plan = `
## Background & Context
- This project uses Python
- The team has experience with FastAPI

## Goals & Objectives
- Improve developer experience
- Reduce deployment time

## Implementation Timeline
- Week 1: Setup
- Week 2-3: Core development
- Week 4: Testing

## Tasks
### Task 1: Implement the core API
Description: Build the main API endpoints
`;

      const milestones = parsePlanMilestones(plan);
      const allTasks = milestones.flatMap(m => m.tasks);
      const taskNames = allTasks.map(t => t.name.toLowerCase());

      // Should NOT contain these non-actionable items
      expect(taskNames.some(n => n.includes('this project uses'))).toBe(false);
      expect(taskNames.some(n => n.includes('team has experience'))).toBe(false);
      expect(taskNames.some(n => n.includes('improve developer'))).toBe(false);
      expect(taskNames.some(n => n.includes('week 1'))).toBe(false);
      expect(taskNames.some(n => n.includes('week 2'))).toBe(false);

      // Should contain the actual task
      expect(taskNames.some(n => n.includes('implement the core api'))).toBe(true);
    });

    it('should NOT extract file structure descriptions as tasks', () => {
      const plan = `
## Project Structure
- Final file structure showing project organization
- Directory layout for the application
- File naming conventions used

## Implementation
- Create the main application entry point
- Build the user service module
`;

      const milestones = parsePlanMilestones(plan);
      const allTasks = milestones.flatMap(m => m.tasks);
      const taskNames = allTasks.map(t => t.name.toLowerCase());

      // Should NOT contain file structure descriptions
      expect(taskNames.some(n => n.includes('final file structure'))).toBe(false);
      expect(taskNames.some(n => n.includes('directory layout'))).toBe(false);
      expect(taskNames.some(n => n.includes('naming conventions'))).toBe(false);

      // Should contain implementation tasks
      expect(taskNames.some(n => n.includes('create'))).toBe(true);
      expect(taskNames.some(n => n.includes('build'))).toBe(true);
    });

    it('should NOT extract timeline estimates as tasks', () => {
      const plan = `
## Schedule
- Implementation timeline (5-week estimate)
- 2-week sprint for authentication
- 3 days for API documentation

## Development Tasks
- Implement the payment processing module
- Create order management system
`;

      const milestones = parsePlanMilestones(plan);
      const allTasks = milestones.flatMap(m => m.tasks);
      const taskNames = allTasks.map(t => t.name.toLowerCase());

      // Should NOT contain timeline items
      expect(taskNames.some(n => n.includes('implementation timeline'))).toBe(false);
      expect(taskNames.some(n => n.includes('2-week sprint'))).toBe(false);
      expect(taskNames.some(n => n.includes('3 days'))).toBe(false);

      // Should contain implementation tasks
      expect(taskNames.some(n => n.includes('implement the payment'))).toBe(true);
      expect(taskNames.some(n => n.includes('create order'))).toBe(true);
    });
  });

  describe('milestone organization', () => {
    it('should group tasks into phases when no explicit milestones', () => {
      const plan = `
# Implementation Tasks

1. Create the database models
2. Implement user registration
3. Build login endpoint
4. Set up JWT authentication
5. Create profile management
6. Implement password reset
7. Build admin dashboard
`;

      const milestones = parsePlanMilestones(plan);

      // Should have at least one milestone
      expect(milestones.length).toBeGreaterThan(0);

      // Each milestone should have tasks
      for (const milestone of milestones) {
        expect(milestone.tasks.length).toBeGreaterThan(0);
      }

      // Total tasks should be preserved
      const totalTasks = milestones.reduce((sum, m) => sum + m.tasks.length, 0);
      expect(totalTasks).toBeGreaterThanOrEqual(7);
    });

    it('should respect explicit milestone sections', () => {
      const plan = `
## Milestone 1: Foundation
- Create project scaffolding
- Set up CI/CD pipeline

## Milestone 2: Core Features
- Implement user authentication
- Build API endpoints
`;

      const milestones = parsePlanMilestones(plan);
      const milestoneNames = milestones.map(m => m.name.toLowerCase());

      expect(milestoneNames.some(n => n.includes('foundation'))).toBe(true);
      expect(milestoneNames.some(n => n.includes('core features'))).toBe(true);
    });
  });

  describe('fallback behavior', () => {
    it('should create a default milestone when no tasks found', () => {
      const plan = `
This is just a description of the project with no actual tasks.
The project will do various things but no specific implementation steps are listed.
`;

      const milestones = parsePlanMilestones(plan);

      expect(milestones.length).toBeGreaterThan(0);
      expect(milestones[0].tasks.length).toBeGreaterThan(0);
      // Fallback creates "Set up project structure and dependencies" as first task
      expect(milestones[0].tasks[0].name.toLowerCase()).toContain('set up');
    });
  });
});
