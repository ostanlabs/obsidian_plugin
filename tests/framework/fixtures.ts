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
 * Helper to normalize entity fixture arguments
 * Supports both: entity(id, title, options) and entity(id, { title, ...options })
 */
function normalizeEntityArgs(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): { id: string; title: string; options: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>> } {
  if (typeof titleOrOptions === 'string') {
    return { id, title: titleOrOptions, options: maybeOptions || {} };
  } else {
    const { title, ...rest } = titleOrOptions;
    return { id, title: title || id, options: rest };
  }
}

/**
 * Create a milestone fixture
 * Supports: milestone(id, title, options) or milestone(id, { title, ...options })
 */
export function milestone(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): EntityFixture {
  const { title, options } = normalizeEntityArgs(id, titleOrOptions, maybeOptions);
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
 * Supports: story(id, title, options) or story(id, { title, ...options })
 */
export function story(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): EntityFixture {
  const { title, options } = normalizeEntityArgs(id, titleOrOptions, maybeOptions);
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
 * Supports: task(id, title, options) or task(id, { title, ...options })
 */
export function task(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): EntityFixture {
  const { title, options } = normalizeEntityArgs(id, titleOrOptions, maybeOptions);
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
 * Supports: decision(id, title, options) or decision(id, { title, ...options })
 */
export function decision(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): EntityFixture {
  const { title, options } = normalizeEntityArgs(id, titleOrOptions, maybeOptions);
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
 * Supports: document(id, title, options) or document(id, { title, ...options })
 */
export function document(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): EntityFixture {
  const { title, options } = normalizeEntityArgs(id, titleOrOptions, maybeOptions);
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
 * Supports: feature(id, title, options) or feature(id, { title, ...options })
 */
export function feature(
  id: string,
  titleOrOptions: string | Partial<EntityFixture>,
  maybeOptions?: Partial<Omit<EntityFixture, 'type' | 'id' | 'title'>>
): EntityFixture {
  const { title, options } = normalizeEntityArgs(id, titleOrOptions, maybeOptions);
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

/**
 * Create an edge between nodes
 */
export function edge(
  id: string,
  fromNode: string,
  toNode: string,
  options: Partial<Omit<CanvasEdgeFixture, 'id' | 'fromNode' | 'toNode'>> = {}
): CanvasEdgeFixture {
  return {
    id,
    fromNode,
    toNode,
    fromSide: options.fromSide || 'right',
    toSide: options.toSide || 'left',
    label: options.label,
  };
}

// ============================================================================
// Expectation Helpers
// ============================================================================

import {
  FileExistsExpectation,
  FrontmatterExpectation,
  CanvasNodeExpectation,
  CanvasEdgeExpectation,
  ArrayContainsExpectation,
  NodePositionExpectation,
} from './types';

/**
 * Expect file to exist
 */
export function expectFileExists(path: string, expected = true): FileExistsExpectation {
  return { check: 'file-exists', path, expected };
}

/**
 * Expect frontmatter field to equal value
 */
export function expectFrontmatter(
  path: string,
  field: string,
  expected: unknown,
  mode: 'equals' | 'contains' = 'equals'
): FrontmatterExpectation {
  return { check: 'frontmatter', path, field, expected, mode };
}

/**
 * Expect canvas to have node for entity
 * Supports: expectCanvasNode(entityId) or expectCanvasNode(canvas, entityId)
 */
export function expectCanvasNode(
  canvasOrEntityId: string,
  entityIdOrExpected?: string | boolean,
  maybeExpected?: boolean
): CanvasNodeExpectation {
  // If second arg is boolean or undefined, first arg is entityId
  if (typeof entityIdOrExpected === 'boolean' || entityIdOrExpected === undefined) {
    return {
      check: 'canvas-node',
      canvas: 'project.canvas',
      entityId: canvasOrEntityId,
      expected: entityIdOrExpected ?? true
    };
  }
  // Otherwise first arg is canvas, second is entityId
  return {
    check: 'canvas-node',
    canvas: canvasOrEntityId,
    entityId: entityIdOrExpected,
    expected: maybeExpected ?? true
  };
}

/**
 * Expect canvas to have edge between entities
 * Supports: expectCanvasEdge(from, to) or expectCanvasEdge(canvas, from, to)
 */
export function expectCanvasEdge(
  canvasOrFromId: string,
  fromOrToId: string,
  toIdOrExpected?: string | boolean,
  maybeExpected?: boolean
): CanvasEdgeExpectation {
  // If third arg is boolean or undefined, first two args are from/to
  if (typeof toIdOrExpected === 'boolean' || toIdOrExpected === undefined) {
    return {
      check: 'canvas-edge',
      canvas: 'project.canvas',
      fromEntityId: canvasOrFromId,
      toEntityId: fromOrToId,
      expected: toIdOrExpected ?? true
    };
  }
  // Otherwise first arg is canvas, second is from, third is to
  return {
    check: 'canvas-edge',
    canvas: canvasOrFromId,
    fromEntityId: fromOrToId,
    toEntityId: toIdOrExpected,
    expected: maybeExpected ?? true
  };
}

/**
 * Expect array field to contain value
 */
export function expectArrayContains(
  path: string,
  field: string,
  value: string,
  expected = true
): ArrayContainsExpectation {
  return { check: 'array-contains', path, field, value, expected };
}

/**
 * Expect node position relative to another
 */
export function expectNodePosition(
  canvas: string,
  entityIdA: string,
  entityIdB: string,
  relation: 'left-of' | 'right-of' | 'above' | 'below'
): NodePositionExpectation {
  return { check: 'node-position', canvas, entityIdA, entityIdB, relation };
}

// ============================================================================
// Step Helpers
// ============================================================================

import { CommandStep, EditFileStep, DeleteFileStep, WaitStep, CreateFileStep } from './types';

/**
 * Execute a plugin command
 */
export function command(commandId: string, input?: Record<string, unknown>): CommandStep {
  return { action: 'command', command: commandId, input };
}

/**
 * Edit a file's frontmatter or body
 * Can be called as:
 *   editFile('path.md', { frontmatter: { field: value } })
 *   editFile('path.md', { field: value })  // shorthand for frontmatter only
 */
export function editFile(
  path: string,
  options: { frontmatter?: Record<string, unknown>; body?: string } | Record<string, unknown>
): EditFileStep {
  // If options has 'frontmatter' or 'body' keys, use as-is
  if ('frontmatter' in options || 'body' in options) {
    return { action: 'edit-file', path, ...options as { frontmatter?: Record<string, unknown>; body?: string } };
  }
  // Otherwise, treat the entire options object as frontmatter
  return { action: 'edit-file', path, frontmatter: options };
}

/**
 * Delete a file
 */
export function deleteFile(path: string): DeleteFileStep {
  return { action: 'delete-file', path };
}

/**
 * Create a file with content
 */
export function createFile(path: string, content: string): CreateFileStep {
  return { action: 'create-file', path, content };
}

/**
 * Wait for a specified time
 */
export function wait(ms: number): WaitStep {
  return { action: 'wait', ms };
}

