/**
 * Contract suite F — PathResolver. (TDD plan §4.2.F)
 *
 *   - per-type folder routing, filename pattern, single (by-type) archive layout.
 *
 * Canonical convention (production vault, refactor §9): BARE type folders (no
 * `entities/` prefix), TITLE-ONLY filenames (no id prefix), PRESERVE-case slugs.
 * The layout is schema-configurable — these tests also cover the legacy
 * snake/`{id}_{title}`/`entities/`-prefixed shape via explicit config/schema.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, PathResolver, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import {
  sanitizeTitleForFilename,
  buildEntityFilename,
  type PathResolverConfig,
} from '../../src/entity-core/path-resolver.js';
import type { Schema } from '../../src/entity-core/types.js';

// Canonical config: bare type folders (empty entitiesFolder prefix).
const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: '',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

describe('F. PathResolver (canonical: bare folders, title-only, preserve-case)', () => {
  let resolver: PathResolver;
  beforeEach(() => {
    resolver = new PathResolver(new SchemaRegistry(DEFAULT_SCHEMA), CONFIG);
  });

  it('routes each type to its BARE schema folder (no entities/ prefix)', () => {
    expect(resolver.getTypeFolderPath('milestone')).toBe('milestones');
    expect(resolver.getTypeFolderPath('story')).toBe('stories');
    expect(resolver.getTypeFolderPath('decision')).toBe('decisions');
    expect(resolver.getTypeFolderPath('feature')).toBe('features');
  });

  it('generates a TITLE-ONLY, preserve-case filename (no id prefix)', () => {
    expect(resolver.generateFilename('M-001', 'Q1 Launch')).toBe('Q1_Launch.md');
    expect(resolver.generateFilename('T-1', 'Add 90-day retention policy')).toBe(
      'Add_90-day_retention_policy.md'
    );
  });

  it('sanitizes filesystem-invalid characters in titles', () => {
    expect(resolver.generateFilename('DEC-002', 'Use Postgres: ADR #1')).toBe(
      'Use_Postgres_ADR_1.md'
    );
  });

  it('builds the full entity path (bare folder + title-only)', () => {
    expect(resolver.getEntityPath('S-001', 'Auth')).toBe('stories/Auth.md');
  });

  it('routes the archive by type under a single by-type layout', () => {
    expect(resolver.getArchiveFolderPath('T-900')).toBe('archive/tasks');
    expect(resolver.getArchivePath('T-900', 'Old')).toBe('archive/tasks/Old.md');
  });

  it('parses id and type out of a path', () => {
    const p = 'decisions/DEC-001_db.md';
    expect(resolver.extractIdFromPath(p)).toBe('DEC-001');
    expect(resolver.getTypeFromPath(p)).toBe('decision');
  });

  it('recognises archive vs entity paths with an empty prefix', () => {
    expect(resolver.isArchivePath('archive/stories/S-035_x.md')).toBe(true);
    expect(resolver.isArchivePath('stories/S-001_x.md')).toBe(false);
    expect(resolver.isEntityPath('stories/S-001_x.md')).toBe(true);
    expect(resolver.isEntityPath('archive/stories/S-001_x.md')).toBe(false);
  });

  it('converts between vault-relative and absolute paths', () => {
    const vault = 'milestones/M-001_x.md';
    const abs = resolver.toAbsolutePath(vault);
    expect(abs).toBe('/vault/milestones/M-001_x.md');
    expect(resolver.toVaultPath(abs)).toBe(vault);
  });
});

// ---------------------------------------------------------------------------
// Schema-configurable layout: legacy `entities/` prefix + `{id}_{title}` snake.
// ---------------------------------------------------------------------------
describe('F. PathResolver (schema-configurable legacy shape)', () => {
  const legacySchema: Schema = {
    ...DEFAULT_SCHEMA,
    settings: {
      ...DEFAULT_SCHEMA.settings,
      filenamePattern: '{id}_{title}',
      filenameCase: 'snake',
    },
  };
  const legacyConfig: PathResolverConfig = {
    vaultPath: '/vault',
    entitiesFolder: 'entities',
    archiveFolder: 'archive',
    canvasFolder: 'projects',
  };
  const resolver = new PathResolver(new SchemaRegistry(legacySchema), legacyConfig);

  it('honours an entities/ prefix when entitiesFolder is set', () => {
    expect(resolver.getTypeFolderPath('milestone')).toBe('entities/milestones');
    expect(resolver.getEntityPath('S-001', 'Auth')).toBe('entities/stories/S-001_auth.md');
  });

  it('applies the {id}_{title} snake pattern', () => {
    expect(resolver.generateFilename('M-001', 'Q1 Launch')).toBe('M-001_q1_launch.md');
    expect(resolver.generateFilename('DEC-002', 'Use Postgres: ADR #1')).toBe(
      'DEC-002_use_postgres_adr_1.md'
    );
  });
});

// ---------------------------------------------------------------------------
// Unit coverage: sanitizer modes + shared builder + folder joining.
// ---------------------------------------------------------------------------
describe('sanitizeTitleForFilename', () => {
  it("snake mode: lowercases, non-alphanumerics → _, trims", () => {
    expect(sanitizeTitleForFilename('Q1 Launch', 'snake')).toBe('q1_launch');
    expect(sanitizeTitleForFilename('Add 90-day retention policy', 'snake')).toBe(
      'add_90_day_retention_policy'
    );
    expect(sanitizeTitleForFilename('  !Leading! ', 'snake')).toBe('leading');
  });

  it('snake is the default mode', () => {
    expect(sanitizeTitleForFilename('Q1 Launch')).toBe('q1_launch');
  });

  it('preserve mode: keeps case + hyphens, whitespace/invalid → _', () => {
    expect(sanitizeTitleForFilename('Add 90-day retention policy', 'preserve')).toBe(
      'Add_90-day_retention_policy'
    );
    expect(sanitizeTitleForFilename('API Versioning Strategy', 'preserve')).toBe(
      'API_Versioning_Strategy'
    );
    expect(sanitizeTitleForFilename('a/b:c*d?e"f<g>h|i', 'preserve')).toBe('a_b_c_d_e_f_g_h_i');
    expect(sanitizeTitleForFilename('  Trim Me!  ', 'preserve')).toBe('Trim_Me');
  });
});

describe('buildEntityFilename (shared builder)', () => {
  it('title-only + preserve', () => {
    expect(buildEntityFilename('M-001', 'Q1 Launch', '{title}', 'preserve')).toBe('Q1_Launch.md');
  });
  it('id_title + snake', () => {
    expect(buildEntityFilename('M-001', 'Q1 Launch', '{id}_{title}', 'snake')).toBe(
      'M-001_q1_launch.md'
    );
  });
  it('defaults to snake when mode omitted', () => {
    expect(buildEntityFilename('M-001', 'Q1 Launch', '{title}')).toBe('q1_launch.md');
  });
});

describe('empty-prefix folder handling', () => {
  it('empty entitiesFolder yields no leading slash', () => {
    const r = new PathResolver(new SchemaRegistry(DEFAULT_SCHEMA), {
      vaultPath: '/vault',
      entitiesFolder: '',
      archiveFolder: '',
      canvasFolder: 'projects',
    });
    expect(r.getTypeFolderPath('milestone')).toBe('milestones');
    expect(r.getArchiveFolderPath('T-1')).toBe('tasks');
  });
});
