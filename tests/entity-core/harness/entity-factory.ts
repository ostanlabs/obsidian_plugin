/**
 * Test helpers for constructing RuntimeEntity objects in-memory (serializer,
 * validator, relationship suites). Real harness code — not part of the engine.
 */

import type { EntityId, EntityType, RuntimeEntity } from '../../src/types.js';

let counter = 0;

export function makeEntity(
  type: EntityType,
  id: EntityId,
  overrides: Partial<RuntimeEntity> = {}
): RuntimeEntity {
  counter += 1;
  const base: RuntimeEntity = {
    id,
    type,
    title: overrides.title ?? `Test ${type} ${counter}`,
    status: overrides.status ?? defaultStatusFor(type),
    workstream: overrides.workstream ?? 'engineering',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-06-30T14:30:00Z',
    archived: overrides.archived ?? false,
    vault_path: overrides.vault_path ?? `entities/${type}s/${id}.md`,
    canvas_source: overrides.canvas_source ?? 'projects/main.canvas',
    fields: overrides.fields ?? {},
    relationships: overrides.relationships ?? {},
    passthrough: overrides.passthrough,
  };
  return base;
}

function defaultStatusFor(type: EntityType): string {
  switch (type) {
    case 'decision':
      return 'Pending';
    case 'document':
      return 'Draft';
    case 'feature':
      return 'Planned';
    default:
      return 'Not Started';
  }
}
