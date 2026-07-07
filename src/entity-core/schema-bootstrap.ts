/**
 * schema-bootstrap.ts — the vault's schema.json is the SINGLE SOURCE OF TRUTH.
 *
 * `loadOrBootstrapSchema(fs, vaultPath)`:
 *   - absent  → write the codified DEFAULT_SCHEMA to <vaultPath>/schema.json ("inject")
 *   - present + valid   → use it (source: 'file')
 *   - present + INVALID → fall back to DEFAULT_SCHEMA and SURFACE the errors (non-blocking)
 *
 * Both the MCP server and the Obsidian plugin call this so they derive from the
 * exact same file. Validation + serialization live here too so `set_schema`
 * (MCP tool) and the designer UI round-trip go through one code path.
 */

import type { Schema, FileSystem } from './types.js';
import { DEFAULT_SCHEMA } from './default-schema.js';

export const SCHEMA_FILENAME = 'schema.json';

export interface SchemaLoadResult {
  schema: Schema;
  source: 'file' | 'default';
  /** Non-empty when a present schema.json was invalid (and we fell back) or on IO issues. */
  errors: string[];
  /** True when we wrote the default because none existed (bootstrap injection). */
  wroteDefault: boolean;
  path: string;
}

export function serializeSchema(schema: Schema): string {
  return JSON.stringify(schema, null, 2) + '\n';
}

/** Thorough structural validation of a candidate schema object. Returns [] when valid. */
export function validateSchema(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== 'object') {
    errors.push('schema is not an object');
    return errors;
  }
  const s = obj as Record<string, any>;

  if (!Array.isArray(s.entityTypes)) errors.push('missing "entityTypes" array');
  else {
    const types = new Set<string>();
    s.entityTypes.forEach((e: any, i: number) => {
      if (!e || typeof e !== 'object') { errors.push(`entityTypes[${i}] is not an object`); return; }
      if (!e.type) errors.push(`entityTypes[${i}] missing "type"`);
      else { if (types.has(e.type)) errors.push(`duplicate entity type "${e.type}"`); types.add(e.type); }
    });
  }

  if (!Array.isArray(s.relationships)) errors.push('missing "relationships" array');
  else {
    const knownTypes = new Set<string>(Array.isArray(s.entityTypes) ? s.entityTypes.map((e: any) => e?.type) : []);
    const okType = (t: string) => t === '*' || knownTypes.size === 0 || knownTypes.has(t);
    s.relationships.forEach((r: any, i: number) => {
      const label = r?.name ?? i;
      if (!r || typeof r !== 'object') { errors.push(`relationships[${i}] is not an object`); return; }
      if (!r.name) errors.push(`relationships[${i}] missing "name"`);
      if (!Array.isArray(r.pairs)) { errors.push(`relationships[${label}] missing "pairs" array`); }
      else {
        r.pairs.forEach((p: any, j: number) => {
          for (const k of ['from', 'to', 'forward', 'reverse'] as const) {
            if (!p || !p[k]) errors.push(`relationships[${label}].pairs[${j}] missing "${k}"`);
          }
          if (p?.from && !okType(p.from)) errors.push(`relationships[${label}].pairs[${j}].from unknown type "${p.from}"`);
          if (p?.to && !okType(p.to)) errors.push(`relationships[${label}].pairs[${j}].to unknown type "${p.to}"`);
        });
      }
      if (r.positioning) {
        const role = r.positioning.role;
        if (role !== 'containment' && role !== 'sequencing') {
          errors.push(`relationships[${label}].positioning.role must be "containment" or "sequencing"`);
        }
        if (role === 'containment' && r.positioning.containerEnd &&
            r.positioning.containerEnd !== 'from' && r.positioning.containerEnd !== 'to') {
          errors.push(`relationships[${label}].positioning.containerEnd must be "from" or "to"`);
        }
        if (role === 'sequencing' && r.positioning.forwardDirection &&
            r.positioning.forwardDirection !== 'before' && r.positioning.forwardDirection !== 'after') {
          errors.push(`relationships[${label}].positioning.forwardDirection must be "before" or "after"`);
        }
        if (r.positioning.priority !== undefined &&
            (typeof r.positioning.priority !== 'number' || r.positioning.priority < 0)) {
          errors.push(`relationships[${label}].positioning.priority must be a non-negative number`);
        }
      }
    });
  }
  return errors;
}

/**
 * READ-ONLY load: never writes. Use where the caller must NOT create files if the
 * schema is missing — e.g. the plugin, which can't be certain a given folder is the
 * canonical project root (bootstrapping/injection is the MCP server's job, since it
 * is configured with the exact project VAULT_PATH). Missing/invalid → default.
 */
export async function loadSchemaOrDefault(fs: FileSystem, dir: string): Promise<SchemaLoadResult> {
  const path = dir && dir !== '.' ? `${dir}/${SCHEMA_FILENAME}` : SCHEMA_FILENAME;
  let content: string | null = null;
  try { content = await fs.readFile(path); } catch { content = null; }
  if (content === null) {
    return { schema: DEFAULT_SCHEMA, source: 'default', errors: [], wroteDefault: false, path };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch (e) { return { schema: DEFAULT_SCHEMA, source: 'default', errors: [`${SCHEMA_FILENAME} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`], wroteDefault: false, path }; }
  const errors = validateSchema(parsed);
  if (errors.length > 0) return { schema: DEFAULT_SCHEMA, source: 'default', errors, wroteDefault: false, path };
  return { schema: parsed as Schema, source: 'file', errors: [], wroteDefault: false, path };
}

/**
 * Read-or-inject the vault schema. Never throws — always returns a usable schema.
 * `dir` is the directory holding schema.json, RELATIVE TO the fs adapter's base
 * (adapters resolve their own base): pass '' for an fs already rooted at the vault
 * (e.g. NodeFsAdapter(VAULT_PATH)); pass the vault-relative project folder for a
 * whole-vault adapter (e.g. the Obsidian plugin).
 */
export async function loadOrBootstrapSchema(fs: FileSystem, dir: string): Promise<SchemaLoadResult> {
  const path = dir && dir !== '.' ? `${dir}/${SCHEMA_FILENAME}` : SCHEMA_FILENAME;

  // Presence is detected via readFile (not exists()) so a flaky/missing exists()
  // can never cause us to overwrite a schema.json that is actually there.
  let content: string | null = null;
  try { content = await fs.readFile(path); } catch { content = null; }

  if (content === null) {
    try {
      await fs.writeFile(path, serializeSchema(DEFAULT_SCHEMA));
      return { schema: DEFAULT_SCHEMA, source: 'default', errors: [], wroteDefault: true, path };
    } catch (e) {
      return { schema: DEFAULT_SCHEMA, source: 'default', errors: [`could not write ${SCHEMA_FILENAME}: ${e instanceof Error ? e.message : String(e)}`], wroteDefault: false, path };
    }
  }

  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch (e) { return { schema: DEFAULT_SCHEMA, source: 'default', errors: [`${SCHEMA_FILENAME} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`], wroteDefault: false, path }; }

  const errors = validateSchema(parsed);
  if (errors.length > 0) {
    // Per config: fall back to the codified default, but surface the errors.
    return { schema: DEFAULT_SCHEMA, source: 'default', errors, wroteDefault: false, path };
  }
  return { schema: parsed as Schema, source: 'file', errors: [], wroteDefault: false, path };
}
