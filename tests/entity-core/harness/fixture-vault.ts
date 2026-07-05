/**
 * Drift fixture vault — mirrors the real AgentPlatform production drift (design §8.1,
 * TDD plan §4.1). This is the migration ACCEPTANCE fixture for suite H. Each file is
 * authored as raw markdown (NOT via the serializer, which is stubbed) so the fixture
 * is independent of the engine under test.
 *
 * Drift deliberately encoded:
 *   - dual `updated` + `updated_at`            (S-001; newer `updated` must win)
 *   - `effort` field, no `workstream`          (S-001 effort: dev → workstream engineering)
 *   - `cssclasses` plugin-only key             (M-001; dropped)
 *   - task missing `status`                    (T-010 → default Not Started)
 *   - invalid decision status `Accepted`       (DEC-001 → Decided)
 *   - decision deprecated `blocks`             (DEC-001 blocks → merged into affects)
 *   - deprecated `enables` field               (M-001 enables → blocks)
 *   - duplicate ID S-035 (active + archived)   (one active, one archived → repair)
 *   - mixed archive layout                     (flat archive/stories + quarter archive/2026-Q1/tasks)
 *   - relationship pairs that must survive     (parent/children, documents/documented_by,
 *                                               previous_version/next_version, supersedes/superseded_by)
 *
 * NO schema.json is present (v0 / unversioned) — migration Step 1 writes it.
 */

import { InMemoryFileSystem } from './in-memory-fs.js';
import { InMemoryIndex } from './in-memory-index.js';
import type { EntityId, VaultPath } from '../../src/types.js';

export const VAULT_ROOT = '/vault';

/** path → raw markdown content. */
export const FIXTURE_FILES: Record<string, string> = {
  // --- Milestone: cssclasses (drop), deprecated enables (→ blocks), children ---
  '/vault/entities/milestones/M-001_launch.md': `---
id: M-001
type: milestone
title: Q1 Launch
status: In Progress
workstream: engineering
priority: High
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-02T00:00:00Z
archived: false
cssclasses:
  - milestone-card
children:
  - S-001
enables:
  - S-001
vault_path: entities/milestones/M-001_launch.md
canvas_source: projects/main.canvas
---

# Objective

Ship the MVP to production.
`,

  // --- Story: dual updated/updated_at (newer updated wins), effort→workstream, parent ---
  '/vault/entities/stories/S-001_auth.md': `---
id: S-001
type: story
title: Authentication
status: In Progress
priority: High
effort: dev
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-10T00:00:00Z
updated: 2026-03-15T00:00:00Z
archived: false
parent: M-001
notion_page_id: notion-abc-123
vault_path: entities/stories/S-001_auth.md
canvas_source: projects/main.canvas
---

# Outcome

Users can sign in.
`,

  // --- Task: MISSING status (→ default), parent ---
  '/vault/entities/tasks/T-010_setup.md': `---
id: T-010
type: task
title: Set up auth provider
workstream: engineering
goal: Configure the OAuth provider
parent: S-001
created_at: 2026-01-03T00:00:00Z
updated_at: 2026-01-03T00:00:00Z
archived: false
vault_path: entities/tasks/T-010_setup.md
canvas_source: projects/main.canvas
---

# Goal

Configure the OAuth provider.
`,

  // --- Decision: invalid status Accepted (→ Decided), deprecated blocks (→ affects) ---
  '/vault/entities/decisions/DEC-001_db.md': `---
id: DEC-001
type: decision
title: Use Postgres
status: Accepted
workstream: engineering
created_at: 2026-01-04T00:00:00Z
updated_at: 2026-01-04T00:00:00Z
archived: false
decided_by: Alice
decided_on: 2026-01-04
blocks:
  - S-001
vault_path: entities/decisions/DEC-001_db.md
canvas_source: projects/main.canvas
---

# Context

We need a relational store.

# Decision

Adopt Postgres.
`,

  // --- Document v1: documents F-001, supersedes nothing; later superseded ---
  '/vault/entities/documents/DOC-001_spec.md': `---
id: DOC-001
type: document
title: Auth Spec
status: Approved
workstream: engineering
doc_type: spec
version: "1.0"
created_at: 2026-01-05T00:00:00Z
updated_at: 2026-01-05T00:00:00Z
archived: false
documents:
  - F-001
vault_path: entities/documents/DOC-001_spec.md
canvas_source: projects/main.canvas
---

# Content

Authentication specification, v1.
`,

  // --- Document v2: previous_version DOC-001 (versioning pair must survive) ---
  '/vault/entities/documents/DOC-002_spec_v2.md': `---
id: DOC-002
type: document
title: Auth Spec v2
status: Draft
workstream: engineering
doc_type: spec
version: "2.0"
created_at: 2026-02-05T00:00:00Z
updated_at: 2026-02-05T00:00:00Z
archived: false
previous_version: DOC-001
vault_path: entities/documents/DOC-002_spec_v2.md
canvas_source: projects/main.canvas
---

# Content

Authentication specification, v2.
`,

  // --- Feature: documented_by DOC-001 (reverse of documents) ---
  '/vault/entities/features/F-001_login.md': `---
id: F-001
type: feature
title: Login
status: In Progress
workstream: engineering
user_story: As a user I want to log in so that I can access my account
tier: OSS
phase: MVP
created_at: 2026-01-06T00:00:00Z
updated_at: 2026-01-06T00:00:00Z
archived: false
documented_by:
  - DOC-001
vault_path: entities/features/F-001_login.md
canvas_source: projects/main.canvas
---

# Content

Login feature.
`,

  // --- Duplicate ID S-035 (ACTIVE) — keep this one ---
  '/vault/entities/stories/S-035_active.md': `---
id: S-035
type: story
title: Active S-035
status: In Progress
workstream: engineering
priority: Medium
created_at: 2026-01-07T00:00:00Z
updated_at: 2026-01-07T00:00:00Z
archived: false
vault_path: entities/stories/S-035_active.md
canvas_source: projects/main.canvas
---

# Outcome

The active S-035 story.
`,

  // --- Duplicate ID S-035 (ARCHIVED, flat archive/stories) — reassign this one ---
  '/vault/archive/stories/S-035_archived.md': `---
id: S-035
type: story
title: Archived S-035
status: Completed
workstream: engineering
priority: Low
created_at: 2025-09-01T00:00:00Z
updated_at: 2025-10-01T00:00:00Z
archived: true
vault_path: archive/stories/S-035_archived.md
canvas_source: projects/main.canvas
---

# Outcome

The archived duplicate S-035 story.
`,

  // --- Archived task in QUARTER-nested layout (mixed) — consolidate to archive/tasks/ ---
  '/vault/archive/2026-Q1/tasks/T-900_old.md': `---
id: T-900
type: task
title: Old archived task
status: Completed
workstream: engineering
goal: Legacy work
created_at: 2025-08-01T00:00:00Z
updated_at: 2025-08-15T00:00:00Z
archived: true
vault_path: archive/2026-Q1/tasks/T-900_old.md
canvas_source: projects/main.canvas
---

# Goal

Legacy work, archived.
`,
};

/** Build an InMemoryFileSystem seeded with the drift fixture. */
export function loadFixtureFs(): InMemoryFileSystem {
  return new InMemoryFileSystem(FIXTURE_FILES);
}

/** Build an EntityIndex matching the drift fixture (note the S-035 collision). */
export function loadFixtureIndex(): InMemoryIndex {
  return new InMemoryIndex([
    {
      id: 'M-001',
      path: '/vault/entities/milestones/M-001_launch.md',
      relationships: { children: ['S-001'], blocks: ['S-001'] },
      forwardFields: { dependency: 'blocks' },
    },
    {
      id: 'S-001',
      path: '/vault/entities/stories/S-001_auth.md',
      relationships: { parent: 'M-001' },
    },
    { id: 'T-010', path: '/vault/entities/tasks/T-010_setup.md', relationships: { parent: 'S-001' } },
    {
      id: 'DEC-001',
      path: '/vault/entities/decisions/DEC-001_db.md',
      relationships: { blocks: ['S-001'] },
    },
    {
      id: 'DOC-001',
      path: '/vault/entities/documents/DOC-001_spec.md',
      relationships: { documents: ['F-001'] },
    },
    {
      id: 'DOC-002',
      path: '/vault/entities/documents/DOC-002_spec_v2.md',
      relationships: { previous_version: 'DOC-001' },
    },
    {
      id: 'F-001',
      path: '/vault/entities/features/F-001_login.md',
      relationships: { documented_by: ['DOC-001'] },
    },
    { id: 'S-035', path: '/vault/entities/stories/S-035_active.md' },
    { id: 'S-035', path: '/vault/archive/stories/S-035_archived.md', archived: true },
    { id: 'T-900', path: '/vault/archive/2026-Q1/tasks/T-900_old.md', archived: true },
  ]);
}

/**
 * Generic fixture loader: seed an arbitrary set of files (+ optional schema.json)
 * onto a fresh InMemoryFileSystem. Mirrors TDD plan §4.1 `loadFixture(json)`.
 */
export function loadFixture(spec: {
  files?: Record<string, string>;
  schema?: unknown;
  schemaPath?: VaultPath;
}): InMemoryFileSystem {
  const fs = new InMemoryFileSystem(spec.files ?? {});
  if (spec.schema !== undefined) {
    const path = spec.schemaPath ?? `${VAULT_ROOT}/schema.json`;
    fs.seed({ [path]: JSON.stringify(spec.schema, null, 2) });
  }
  return fs;
}

/** Read a single entity's frontmatter value crudely (test assertion helper). */
export function rawFrontmatterHasKey(content: string, key: string): boolean {
  const fm = content.split(/^---$/m)[1] ?? '';
  return new RegExp(`^${key}:`, 'm').test(fm);
}

export const FIXTURE_DUPLICATE_ID: EntityId = 'S-035';
