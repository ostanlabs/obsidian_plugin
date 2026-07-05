/**
 * Contract suite F — PathResolver. (TDD plan §4.2.F)
 *
 *   - per-type folder routing, filename pattern, single (by-type) archive layout.
 *
 * RED now: every PathResolver method throws NOT_IMPLEMENTED.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaRegistry, PathResolver, DEFAULT_SCHEMA } from '../../src/entity-core/index.js';
import type { PathResolverConfig } from '../../src/entity-core/path-resolver.js';

const CONFIG: PathResolverConfig = {
  vaultPath: '/vault',
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

describe('F. PathResolver', () => {
  let resolver: PathResolver;
  beforeEach(() => {
    resolver = new PathResolver(new SchemaRegistry(DEFAULT_SCHEMA), CONFIG);
  });

  it('routes each type to its schema folder under entities/', () => {
    expect(resolver.getTypeFolderPath('milestone')).toBe('entities/milestones');
    expect(resolver.getTypeFolderPath('story')).toBe('entities/stories');
    expect(resolver.getTypeFolderPath('decision')).toBe('entities/decisions');
    expect(resolver.getTypeFolderPath('feature')).toBe('entities/features');
  });

  it('generates a filename from the {id}_{title} pattern', () => {
    expect(resolver.generateFilename('M-001', 'Q1 Launch')).toBe('M-001_q1_launch.md');
  });

  it('sanitizes special characters in titles', () => {
    expect(resolver.generateFilename('DEC-002', 'Use Postgres: ADR #1')).toBe(
      'DEC-002_use_postgres_adr_1.md'
    );
  });

  it('builds the full entity path', () => {
    expect(resolver.getEntityPath('S-001', 'Auth')).toBe('entities/stories/S-001_auth.md');
  });

  it('routes the archive by type under a single by-type layout', () => {
    expect(resolver.getArchiveFolderPath('T-900')).toBe('archive/tasks');
    expect(resolver.getArchivePath('T-900', 'Old')).toBe('archive/tasks/T-900_old.md');
  });

  it('parses id and type out of a path', () => {
    const p = 'entities/decisions/DEC-001_db.md';
    expect(resolver.extractIdFromPath(p)).toBe('DEC-001');
    expect(resolver.getTypeFromPath(p)).toBe('decision');
  });

  it('recognises archive vs entity paths', () => {
    expect(resolver.isArchivePath('archive/stories/S-035_x.md')).toBe(true);
    expect(resolver.isArchivePath('entities/stories/S-001_x.md')).toBe(false);
    expect(resolver.isEntityPath('entities/stories/S-001_x.md')).toBe(true);
  });

  it('converts between vault-relative and absolute paths', () => {
    const vault = 'entities/milestones/M-001_x.md';
    const abs = resolver.toAbsolutePath(vault);
    expect(abs).toBe('/vault/entities/milestones/M-001_x.md');
    expect(resolver.toVaultPath(abs)).toBe(vault);
  });
});
