/**
 * Fixture Helpers
 * 
 * Helper functions for creating test entities and fixtures.
 * Makes scenario definitions more readable and reduces boilerplate.
 */

import { EntityType, ItemStatus, ItemPriority } from '../../types';
import { EntityFixture, CanvasFixture, CanvasNodeFixture, CanvasEdgeFixture } from './types';

// ============================================================================
// Entity Fixture Helpers
// ============================================================================

/**
 * Create a milestone fixture
 */
export function milestone(
  id: string,
  title: string,
  options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> = {}
): EntityFixture {
  return {
    type: 'milestone',
    id,
    title,
    workstream: options.workstream || 'engineering',
    status: options.status || 'Not Started',
    priority: options.priority || 'High',
    ...options,
  };
}

/**
 * Create a story fixture
 */
export function story(
  id: string,
  title: string,
  options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> = {}
): EntityFixture {
  return {
    type: 'story',
    id,
    title,
    workstream: options.workstream || 'engineering',
    status: options.status || 'Not Started',
    priority: options.priority || 'Medium',
    ...options,
  };
}

/**
 * Create a task fixture
 */
export function task(
  id: string,
  title: string,
  options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> = {}
): EntityFixture {
  return {
    type: 'task',
    id,
    title,
    workstream: options.workstream || 'engineering',
    status: options.status || 'Not Started',
    priority: options.priority || 'Medium',
    ...options,
  };
}

/**
 * Create a decision fixture
 */
export function decision(
  id: string,
  title: string,
  options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> = {}
): EntityFixture {
  return {
    type: 'decision',
    id,
    title,
    workstream: options.workstream || 'engineering',
    status: options.status || 'Not Started',
    priority: options.priority || 'Medium',
    ...options,
  };
}

/**
 * Create a document fixture
 */
export function document(
  id: string,
  title: string,
  options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> = {}
): EntityFixture {
  return {
    type: 'document',
    id,
    title,
    workstream: options.workstream || 'engineering',
    status: options.status || 'Not Started',
    priority: options.priority || 'Low',
    ...options,
  };
}

/**
 * Create a feature fixture
 */
export function feature(
  id: string,
  title: string,
  options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> = {}
): EntityFixture {
  return {
    type: 'feature',
    id,
    title,
    workstream: options.workstream || 'engineering',
    status: options.status || 'Not Started',
    priority: options.priority || 'Medium',
    ...options,
  };
}

// ============================================================================
// Canvas Fixture Helpers
// ============================================================================

/**
 * Create a canvas fixture
 */
export function canvas(
  name: string,
  nodes: CanvasNodeFixture[] = [],
  edges: CanvasEdgeFixture[] = []
): CanvasFixture {
  return { name, nodes, edges };
}

/**
 * Create a file node for canvas
 */
export function fileNode(
  id: string,
  file: string,
  x: number,
  y: number,
  width = 400,
  height = 300,
  color?: string
): CanvasNodeFixture {
  return { id, type: 'file', file, x, y, width, height, color };
}

/**
 * Create a text node for canvas
 */
export function textNode(
  id: string,
  text: string,
  x: number,
  y: number,
  width = 200,
  height = 100,
  color?: string
): CanvasNodeFixture {
  return { id, type: 'text', text, x, y, width, height, color };
}

/**
 * Create a group node for canvas
 */
export function groupNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color?: string
): CanvasNodeFixture {
  return { id, type: 'group', x, y, width, height, color };
}

