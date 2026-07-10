/**
 * Contract suite E3 — IDAllocator.repairDuplicates inbound-reference rewrite.
 * (spec §5.3, work item W1)
 *
 * After a duplicate id is reassigned, every relationship-field reference to the
 * old id must follow the REASSIGNED copy — in the entity files (scalar, block-list
 * and inline-array shapes) and in the index relationship graph. Ids inside
 * non-relationship fields (title, vault_path, body prose) must NOT be rewritten.
 */

import { describe, it, expect } from 'vitest';
import {
  SchemaRegistry,
  IDAllocator,
  PathResolver,
  ProjectIndex,
  DEFAULT_SCHEMA,
} from '../../src/entity-core/index.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';
import type {
  EntityMetadata,
  EntityType,
  VaultPath,
} from '../../src/entity-core/types.js';
import { InMemoryIndex } from './harness/in-memory-index.js';
import { InMemoryFileSystem } from './harness/in-memory-fs.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

const ACTIVE_S035 = '/vault/entities/stories/S-035_active.md';
const ARCHIVED_S035 = '/vault/archive/stories/S-035_archived.md';
const BLOCK_REF = '/vault/entities/stories/S-040_block.md';
const INLINE_REF = '/vault/entities/stories/S-042_inline.md';
const SCALAR_REF = '/vault/entities/tasks/T-010_scalar.md';
const OTHER_STORY = '/vault/entities/stories/S-001_other.md';

/** Raw fixture files — authored directly so the suite is serializer-independent. */
const FILES: Record<string, string> = {
  [ACTIVE_S035]: `---
id: S-035
type: story
title: Active S-035
status: In Progress
archived: false
vault_path: entities/stories/S-035_active.md
---

# Outcome

The active S-035 story.
`,
  [ARCHIVED_S035]: `---
id: S-035
type: story
title: Archived S-035
status: Completed
archived: true
vault_path: archive/stories/S-035_archived.md
---

# Outcome

The archived duplicate S-035 story.
`,
  // Array-valued (block-list) relationship field + an id mention in the title.
  [BLOCK_REF]: `---
id: S-040
type: story
title: Story about S-035
status: In Progress
archived: false
depends_on:
  - S-035
  - S-001
---

# Outcome

Depends on S-035 (body mention must survive).
`,
  // Array-valued (inline flow) relationship field.
  [INLINE_REF]: `---
id: S-042
type: story
title: Inline ref
status: In Progress
archived: false
depends_on: [S-035, S-001]
---
`,
  // Scalar-valued relationship field.
  [SCALAR_REF]: `---
id: T-010
type: task
title: Scalar ref
status: Not Started
archived: false
parent: S-035
---
`,
  [OTHER_STORY]: `---
id: S-001
type: story
title: Other story
status: In Progress
archived: false
---
`,
};

function makeFs(paths: string[] = Object.keys(FILES)): InMemoryFileSystem {
  const subset: Record<string, string> = {};
  for (const p of paths) subset[p] = FILES[p];
  return new InMemoryFileSystem(subset);
}

/** Full fixture: dup S-035 + all three referencing shapes. Story max = 42 → S-043. */
function makeHarness() {
  const fs = makeFs();
  const index = new InMemoryIndex([
    { id: 'S-035', path: ACTIVE_S035 },
    { id: 'S-035', path: ARCHIVED_S035, archived: true },
    { id: 'S-040', path: BLOCK_REF, relationships: { depends_on: ['S-035', 'S-001'] } },
    { id: 'S-042', path: INLINE_REF, relationships: { depends_on: ['S-035', 'S-001'] } },
    { id: 'T-010', path: SCALAR_REF, relationships: { parent: 'S-035' } },
    { id: 'S-001', path: OTHER_STORY },
  ]);
  const reg = new SchemaRegistry(DEFAULT_SCHEMA);
  const allocator = new IDAllocator(reg, index);
  const resolver = new PathResolver(reg, CONFIG);
  return { fs, index, allocator, resolver };
}

function projectMeta(
  id: string,
  type: EntityType,
  path: string,
  archived = false
): EntityMetadata {
  return {
    id,
    type,
    title: id,
    workstream: 'engineering',
    status: archived ? 'Completed' : 'In Progress',
    archived,
    in_progress: !archived,
    children_count: 0,
    canvas_source: 'projects/main.canvas',
    vault_path: path as VaultPath,
    file_mtime: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('E3. IDAllocator.repairDuplicates — inbound reference rewrite', () => {
  it('reassigns the duplicate and rewrites BLOCK-LIST array references to the new id', async () => {
    const { fs, allocator, resolver } = makeHarness();

    const reassigned = await allocator.repairDuplicates(fs, resolver);
    expect(reassigned).toEqual(['S-043']);

    // The active copy keeps S-035; the archived copy carries the fresh id.
    expect(await fs.readFile(ACTIVE_S035)).toMatch(/^id: S-035$/m);
    expect(await fs.readFile(ARCHIVED_S035)).toMatch(/^id: S-043$/m);

    const block = await fs.readFile(BLOCK_REF);
    expect(block).toMatch(/^ {2}- S-043$/m);
    expect(block).not.toMatch(/^ {2}- S-035$/m);
    // Sibling array entries survive untouched.
    expect(block).toMatch(/^ {2}- S-001$/m);
  });

  it('rewrites INLINE-ARRAY references, preserving siblings and flow style', async () => {
    const { fs, allocator, resolver } = makeHarness();
    await allocator.repairDuplicates(fs, resolver);

    const inline = await fs.readFile(INLINE_REF);
    expect(inline).toMatch(/^depends_on: \[S-043, S-001\]$/m);
  });

  it('rewrites SCALAR relationship references', async () => {
    const { fs, allocator, resolver } = makeHarness();
    await allocator.repairDuplicates(fs, resolver);

    const scalar = await fs.readFile(SCALAR_REF);
    expect(scalar).toMatch(/^parent: S-043$/m);
    expect(scalar).not.toContain('S-035');
  });

  it('does NOT rewrite id mentions outside relationship fields (title, vault_path, body)', async () => {
    const { fs, allocator, resolver } = makeHarness();
    await allocator.repairDuplicates(fs, resolver);

    const block = await fs.readFile(BLOCK_REF);
    expect(block).toMatch(/^title: Story about S-035$/m);
    expect(block).toContain('Depends on S-035 (body mention must survive).');
    // The reassigned file keeps its historical vault_path/title text.
    const archived = await fs.readFile(ARCHIVED_S035);
    expect(archived).toMatch(/^vault_path: archive\/stories\/S-035_archived\.md$/m);
    expect(archived).toMatch(/^title: Archived S-035$/m);
  });

  it('leaves untouched files byte-identical (no gratuitous reformatting)', async () => {
    const { fs, allocator, resolver } = makeHarness();
    await allocator.repairDuplicates(fs, resolver);

    expect(await fs.readFile(OTHER_STORY)).toBe(FILES[OTHER_STORY]);
    expect(await fs.readFile(ACTIVE_S035)).toBe(FILES[ACTIVE_S035]);
  });

  it('updates the index relationship graph on a real ProjectIndex', async () => {
    // Smaller fixture: dup S-035 + block + scalar refs. Story max = 40 → S-041.
    const fs = makeFs([ACTIVE_S035, ARCHIVED_S035, BLOCK_REF, SCALAR_REF, OTHER_STORY]);
    const index = new ProjectIndex();
    index.set(projectMeta('S-035', 'story', ACTIVE_S035));
    // Second set() of the same id keeps both path mappings → duplicate group.
    index.set(projectMeta('S-035', 'story', ARCHIVED_S035, true));
    index.set(projectMeta('S-040', 'story', BLOCK_REF));
    index.set(projectMeta('T-010', 'task', SCALAR_REF));
    index.set(projectMeta('S-001', 'story', OTHER_STORY));
    index.addRelationship('S-040', 'depends_on', 'S-035');
    index.addRelationship('S-040', 'depends_on', 'S-001');
    index.addRelationship('T-010', 'parent', 'S-035');

    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    const allocator = new IDAllocator(reg, index);
    const resolver = new PathResolver(reg, CONFIG);

    const reassigned = await allocator.repairDuplicates(fs, resolver);
    expect(reassigned).toEqual(['S-041']);

    // Forward edges follow the reassigned copy…
    expect(index.getRelated('S-040', 'depends_on')).toContain('S-041');
    expect(index.getRelated('S-040', 'depends_on')).not.toContain('S-035');
    expect(index.getRelated('S-040', 'depends_on')).toContain('S-001');
    expect(index.getRelated('T-010', 'parent')).toEqual(['S-041']);
    // …and the reverse graph agrees (keyed by the INVERSE field name).
    expect(index.getRelatedReverse('S-041', 'blocks')).toContain('S-040');
    expect(index.getRelatedReverse('S-041', 'children')).toContain('T-010');
    expect(index.getRelatedReverse('S-035', 'children')).toEqual([]);
  });

  it('is a no-op on a self-consistent vault (no duplicates, refs untouched)', async () => {
    const fs = makeFs([ACTIVE_S035, BLOCK_REF, INLINE_REF, SCALAR_REF, OTHER_STORY]);
    const index = new InMemoryIndex([
      { id: 'S-035', path: ACTIVE_S035 },
      { id: 'S-040', path: BLOCK_REF, relationships: { depends_on: ['S-035', 'S-001'] } },
      { id: 'S-042', path: INLINE_REF, relationships: { depends_on: ['S-035', 'S-001'] } },
      { id: 'T-010', path: SCALAR_REF, relationships: { parent: 'S-035' } },
      { id: 'S-001', path: OTHER_STORY },
    ]);
    const reg = new SchemaRegistry(DEFAULT_SCHEMA);
    const allocator = new IDAllocator(reg, index);
    const resolver = new PathResolver(reg, CONFIG);
    const before = new Map(fs.allFiles());

    expect(await allocator.repairDuplicates(fs, resolver)).toEqual([]);
    expect(fs.allFiles()).toEqual(before);
  });
});
