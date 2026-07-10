/**
 * MCP Server Mode Entry Point
 *
 * This file provides the MCP protocol server powered by entity-core.
 * Run with: npm run dev:mcp or npm run build:mcp
 *
 * MULTI-VAULT (spec §6/§7/§8, W8): one server process serves N vaults. The
 * module-level engine singletons are gone — a VaultRegistry (global mcp.json ∪
 * VAULT_PATH ∪ MCP client roots, re-read per call) lazily builds one
 * VaultEngine per vault, and every tool call resolves `registry.engine(vault)`
 * and operates on that bundle. VAULT_PATH is OPTIONAL: when set it is absorbed
 * as a transient vault (existing single-vault setups keep working unchanged);
 * when unset the server starts with whatever the registry knows.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import * as nodePath from 'node:path';
import * as nodeFsp from 'node:fs/promises';
import { NodeFsAdapter } from './src/adapters/node-fs-adapter.js';
import { DEFAULT_SCHEMA } from './src/entity-core/default-schema.js';
import {
  getAllRelationshipFieldNames,
  getRequiredParentRules,
  getFanoutRules,
} from './src/entity-core/schema-derivation.js';
import {
  loadOrBootstrapSchema,
  loadSchemaOrDefault,
  serializeSchema,
  validateSchema,
  SCHEMA_FILENAME,
} from './src/entity-core/schema-bootstrap.js';
import type { Schema } from './src/entity-core/types.js';
// Bundled as a raw string via esbuild `--loader:.html=text`. get_schema_designer
// injects the active schema by replacing the "__SCHEMA_PLACEHOLDER__" token.
// @ts-ignore
import DESIGNER_HTML_TEMPLATE from './schema-designer.html';
import { getEntityTypeFromId } from './src/entity-core/id-allocator.js';
import type { SchemaRegistry } from './src/entity-core/schema-registry.js';
import type { RuntimeEntity, EntityType, EntityId, EntityMetadata } from './src/entity-core/types.js';
// Type-only: the real module has native deps (onnxruntime/faiss) that must not
// load at module-eval time — each engine dynamic-imports it inside msrl().
import type { MsrlEngine, QueryResult, IndexStatus } from '@ostanlabs/md-retriever';

// Multi-vault machinery (src/mcp/* — Wave 1 modules wired here, W8)
import { VaultNotFound } from './src/mcp/types.js';
import type { VaultEntry } from './src/mcp/types.js';
import {
  buildVaultEngine,
  archiveEntity,
  ensureDefaultCanvas,
  ensurePluginInstalled,
  type NodeVaultEngine,
} from './src/mcp/vault-engine.js';
import { VaultRegistry, kebabSlug } from './src/mcp/vault-registry.js';
import {
  resolveConfigPath,
  confinePath,
  confineExisting,
  assertDocPath,
} from './src/mcp/confine.js';
import { detectVaultLayout } from './src/mcp/vault-detect.js';
import {
  readWorkspaces,
  addWorkspace,
  removeWorkspace,
  resolveWorkspace,
  WORKSPACES_FILE,
} from './src/mcp/workspaces.js';
import {
  resolveVaultRef,
  assertEntityMatchesVault,
  selectEnumMode,
  echoVault,
} from './src/mcp/routing.js';

// VAULT_PATH is OPTIONAL since multi-vault: when set, the registry absorbs it
// as a transient vault (the legacy single-vault contract keeps working with
// zero config); when unset, vaults come from mcp.json / MCP roots / add_vault.
const VAULT_PATH = process.env.VAULT_PATH;

// ---------------------------------------------------------------------------
// Schema-driven write-path routing (BUG-1 fix: flat relationship keys were a
// silent no-op — update assigned them outside entity.relationships and
// create/batch destructuring parked them as inert custom fields; both were
// then dropped by the schema-driven serializer). Parameterized on the resolved
// vault's SchemaRegistry (was the module-level `schema` singleton).
// ---------------------------------------------------------------------------

/**
 * Relationship field names an entity of `type` may carry per that vault's
 * schema: forward fields where the type is a pair's `from`, reverse fields
 * where it is the `to`. Per-type CUSTOM FIELDS SHADOW same-named relationship
 * fields (e.g. `decided_by` is a person string field on decisions, but the
 * `affects` reverse on documents), so routing stays unambiguous per type.
 */
function getRelationshipFieldNamesForType(schema: SchemaRegistry, type: string): Set<string> {
  const names = new Set<string>();
  for (const rel of schema.getRelationshipsForType(type)) {
    for (const pair of rel.pairs) {
      if (pair.from === type || pair.from === '*') names.add(pair.forward);
      if (pair.to === type || pair.to === '*') names.add(pair.reverse);
    }
  }
  for (const f of schema.getFields(type)) names.delete(f.name);
  return names;
}

/**
 * Split a flat properties/payload object into relationship entries vs the rest,
 * so flat relationship keys (e.g. `implements: [...]` at top level) are honored
 * on create paths instead of silently becoming inert custom fields.
 */
function splitFlatRelationshipKeys(
  schema: SchemaRegistry,
  type: string,
  input: Record<string, unknown>,
): { relationships: Record<string, unknown>; rest: Record<string, unknown> } {
  const relNames = getRelationshipFieldNamesForType(schema, type);
  const relationships: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (relNames.has(key)) relationships[key] = value;
    else rest[key] = value;
  }
  return { relationships, rest };
}

// ---------------------------------------------------------------------------
// Markdown-body plumbing (BUG A, 2026-07 shakedown): the schema-driven
// serializer emits FRONTMATTER ONLY, and every rewrite path wrote its output
// verbatim — so rewriting an existing file silently destroyed its markdown
// body, and an explicit `updates.body` was silently ignored. Every path that
// rewrites an existing entity file now extracts the original body and
// re-attaches it (or an explicit string replacement) after the frontmatter.
// ---------------------------------------------------------------------------

/** Everything after the frontmatter block (leading newline preserved verbatim). */
function extractBody(content: string): string {
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : '';
}

/**
 * Normalize an explicit body replacement: blank-line separated from the
 * frontmatter and newline-terminated. '' clears the body entirely.
 */
function normalizeBody(body: string): string {
  if (body === '') return '';
  return `\n${body.replace(/^\n+/, '').replace(/\n*$/, '')}\n`;
}

/** BUG B: explicit "clear this key" values for passthrough updates. */
function isClearValue(v: unknown): boolean {
  return v === null || (Array.isArray(v) && v.length === 0);
}

/**
 * The EXPLICIT frontmatter `updated_at` of a raw file, in epoch ms — or null
 * when the key is absent or unparseable. The parser defaults a missing
 * updated_at to `now`, which must NOT feed the reconcile staleness rule
 * (two files scanned ms apart would get arbitrary orderings), so this reads
 * the raw frontmatter instead of the parsed entity.
 */
function explicitUpdatedAtMs(content: string): number | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^updated_at:\s*["']?([^"'\n]+?)["']?\s*$/m);
  if (!m) return null;
  const t = Date.parse(m[1]);
  return Number.isFinite(t) ? t : null;
}

// Create MCP server (version bundled in from package.json at build time)
import { version as PKG_VERSION } from './package.json';
const server = new Server(
  {
    name: 'obsidian-unified',
    version: PKG_VERSION,
  },
  {
    capabilities: {
      // listChanged: set_schema can alter the tool surface (entity-type enums
      // are derived from the active schema), so clients are told to re-fetch.
      tools: { listChanged: true },
    },
  }
);

// ---------------------------------------------------------------------------
// VaultRegistry — THE engine source. Config is re-read per call (other MCP
// clients' add_vault mutations become visible immediately); engines are built
// lazily on first use and cached until invalidated. `builtEngines` mirrors the
// registry cache for registry-global introspection (list_vaults entityCount)
// and shutdown — it never triggers a build by itself.
// ---------------------------------------------------------------------------

const builtEngines = new Map<string, NodeVaultEngine>();

const registry = new VaultRegistry({
  configPath: resolveConfigPath(),
  buildEngine: async (entry: VaultEntry) => {
    const eng = await buildVaultEngine(entry);
    builtEngines.set(entry.id, eng);
    return eng;
  },
  env: process.env,
  // MCP SDK ^1.29 first-class roots: when the connected client advertises the
  // roots capability, absorb each file:// root as a transient vault (merged,
  // never replacing config entries). Clients without roots → [] silently.
  rootsProvider: async () => {
    try {
      const caps = server.getClientCapabilities();
      if (!caps?.roots) return [];
      const res = await server.listRoots();
      const paths: string[] = [];
      for (const root of res.roots ?? []) {
        if (typeof root.uri === 'string' && root.uri.startsWith('file://')) {
          try {
            paths.push(fileURLToPath(root.uri));
          } catch { /* skip unparseable root URIs */ }
        }
      }
      return paths;
    } catch {
      return []; // roots/list unsupported or failed — skip silently (spec §6.1)
    }
  },
});

/** registry.engine with the Node-engine type (adds validationAllowList). */
async function getEngine(ref: string): Promise<NodeVaultEngine> {
  return (await registry.engine(ref)) as NodeVaultEngine;
}

// Per-vault MSRL engines, keyed by vault id in mcp.ts (NOT on the engine
// object) so a registry.invalidate() after set_schema doesn't strand a live
// MSRL instance — the rebuilt engine keeps talking to the same MSRL.
const msrlStarted = new Map<string, Promise<MsrlEngine>>();

function getMsrl(eng: NodeVaultEngine): Promise<MsrlEngine> {
  let pending = msrlStarted.get(eng.entry.id);
  if (!pending) {
    pending = eng.msrl();
    msrlStarted.set(eng.entry.id, pending);
  }
  return pending;
}

/**
 * Entity type names of a schema — used for the tool inputSchema enums
 * (create_entity, list_entities, search_entities, entities, …). Only consulted
 * when EXACTLY ONE vault is registered (D8): with N vaults the tool schemas
 * stay permissive plain strings and dispatch-time matching is the authority.
 */
function entityTypeEnumValues(schema: Schema): string[] {
  return schema.entityTypes.map((e) => e.type);
}

/**
 * Enum values of the feature `phase` field per a schema, so the
 * get_feature_coverage tool advertises values that can actually match vault
 * data. Falls back to the codified default (src/entity-core/default-schema.ts:
 * MVP|0|1|2|3|4|5) if the schema has no enum values for it.
 */
function featurePhaseEnumValues(schema: Schema): string[] {
  const phaseField = schema.entityTypes
    .find((t) => t.type === 'feature')
    ?.fields.find((f) => f.name === 'phase');
  if (phaseField?.values && phaseField.values.length > 0) {
    return phaseField.values;
  }
  return ['MVP', '0', '1', '2', '3', '4', '5'];
}

// Register tools. The handler is evaluated PER REQUEST: with exactly one
// registered vault the type/status/phase enums derive from that vault's
// active schema (v1.9.1 behavior, zero regression); with 0 or >1 vaults the
// API layer stays permissive — plain strings whose descriptions point at
// get_schema({vault}) — and the dispatch layer enforces the match (D8).
server.setRequestHandler(ListToolsRequestSchema, async () => {
  let soleSchema: Schema | null = null;
  try {
    const vaults = await registry.list();
    if (selectEnumMode(vaults.length) === 'schema') {
      soleSchema = (await getEngine(vaults[0].id)).activeSchema;
    }
  } catch {
    // Registry/config/engine trouble must never break tools/list — fall back
    // to the permissive (plain-string) tool surface.
    soleSchema = null;
  }
  const typeValues = soleSchema ? entityTypeEnumValues(soleSchema) : null;
  const phaseValues = soleSchema ? featurePhaseEnumValues(soleSchema) : null;

  const typeProp = (description: string) =>
    typeValues
      ? { type: 'string', enum: typeValues, description }
      : {
          type: 'string',
          description: `${description} Valid types are defined per vault — call get_schema({vault}) for the target vault's values.`,
        };
  const vaultRequired = {
    type: 'string',
    description: 'Vault id (call list_vaults). Required.',
  };
  const vaultOptional = {
    type: 'string',
    description:
      'Vault id (call list_vaults). Optional only while exactly one vault is registered; required otherwise.',
  };
  const workspaceProp = {
    type: 'string',
    description:
      'Optional workspace name (call list_workspaces) — resolves paths inside that workspace\'s confined external root instead of the vault.',
  };

  return {
    tools: [
      {
        name: 'create_entity',
        description: typeValues
          ? `Create a new entity (${typeValues.join(', ')})`
          : 'Create a new entity (valid types are defined by the target vault\'s schema — call get_schema({vault}))',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            type: typeProp('The type of entity to create.'),
            title: {
              type: 'string',
              description: 'The title of the entity',
            },
            properties: {
              type: 'object',
              description: 'Additional entity properties (status, workstream, relationships, etc.). Valid relationship fields, their target types, and per-type custom fields are defined by the vault schema — call get_schema for the authoritative list.',
            },
          },
          required: ['vault', 'type', 'title'],
        },
      },
      {
        name: 'list_entities',
        description: 'List all entities or filter by type',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            type: typeProp('Optional: filter by entity type.'),
          },
        },
      },
      {
        name: 'get_entity',
        description: 'Get an entity by ID',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            id: {
              type: 'string',
              description: 'Entity ID (e.g., M-001, S-035, T-127)',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'update_entity',
        description: 'Update an existing entity',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            id: {
              type: 'string',
              description: 'Entity ID to update',
            },
            updates: {
              type: 'object',
              description: 'Fields to update (title, status, workstream, relationships, etc.). Valid relationship fields and target types are defined by the vault schema — call get_schema for the authoritative list. A string "body" key replaces the markdown body below the frontmatter ("" clears it). Setting a passthrough-only key (a field not valid for this type) to null or [] deletes it from the file.',
            },
          },
          required: ['vault', 'id', 'updates'],
        },
      },
      {
        name: 'get_schema',
        description: 'Get the active schema (from schema.json or the codified default), its source, and any validation errors. Beyond entity types and relationships, the schema carries validation rules (per-relationship requiredForTypes parent rules and maxForwardTargets/maxReverseTargets fan-out limits — validate_project derives its rule set from these), canvas positioning metadata, and settings (e.g. settings.defaultCanvas, the canvas file bootstrapped on startup).',
        inputSchema: {
          type: 'object',
          properties: { vault: vaultOptional },
        },
      },
      {
        name: 'set_schema',
        description: 'Configure the vault\'s relationships/schema. Writes <vault>/schema.json (the single source of truth for both the MCP validator and the plugin positioning) and hot-reloads all schema-derived machinery (path routing, index scanning, validation). The schema also carries validation rules (requiredForTypes parent rules, fan-out limits) that validate_project derives its rules from, positioning metadata, and settings.defaultCanvas (bootstrapped if missing after a successful save). Provide a full "schema" object, or a "relationships" array to merge into the current schema. Invalid schemas are rejected and not saved.',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            schema: { type: 'object', description: 'Full Schema object (entityTypes, relationships, settings, workstreams).' },
            relationships: { type: 'array', description: 'Relationships array to merge into the current schema (relationships-only edit).' },
          },
          required: ['vault'],
        },
      },
      {
        name: 'get_schema_designer',
        description: 'Return a self-contained HTML relationship designer, pre-populated with this vault\'s schema. Toggle relationships/pairs, then copy the result and apply it with set_schema.',
        inputSchema: {
          type: 'object',
          properties: { vault: vaultOptional },
        },
      },
      {
        name: 'search_entities',
        description: `Search, list, or navigate structured project entities.

USE FOR: Finding entities by text, listing by type/status, traversing relationships.

MODES:
1. SEARCH: query="text" - Full-text search
2. LIST: filters={type:["task"], status:["Blocked"]} - List matching entities
3. NAVIGATE: from_id="M-001", direction="down" - Traverse hierarchy

EXAMPLES:
- "Find blocked tasks" → filters: {type: ["task"], status: ["Blocked"]}
- "List all tasks in api-server" → filters: {type: ["task"], workstream: ["api-server"]}`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            query: { type: 'string', description: 'Search query (search mode)' },
            from_id: { type: 'string', description: 'Starting entity ID (navigation mode)' },
            direction: { type: 'string', enum: ['up', 'down', 'siblings', 'dependencies'], description: 'Navigation direction' },
            depth: { type: 'number', description: 'Traversal depth (default: 1)' },
            filters: {
              type: 'object',
              properties: {
                type: typeValues
                  ? { type: 'array', items: { type: 'string', enum: typeValues } }
                  : { type: 'array', items: { type: 'string' }, description: 'Entity types (per-vault — call get_schema({vault})).' },
                status: { type: 'array', items: { type: 'string' } },
                workstream: { type: 'array', items: { type: 'string' } },
                archived: { type: 'boolean', description: 'Include archived (default: false)' },
              },
            },
            limit: { type: 'number', description: 'Max results (default: 20)' },
          },
        },
      },
      {
        name: 'get_project_overview',
        description: `Get high-level project status summary across workstreams.

INCLUDES: Entity counts by type and status, workstream breakdowns.

EXAMPLES:
- "What's the overall project status?"
- "Show me the engineering workstream progress"
- "How many tasks are blocked?"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            include_completed: { type: 'boolean', description: 'Include completed items' },
            include_archived: { type: 'boolean', description: 'Include archived items' },
            workstream: { type: 'string', description: 'Filter by specific workstream' },
          },
        },
      },
      {
        name: 'reconcile_relationships',
        description: `Fix inconsistent bidirectional relationships across all entities.

USE FOR: Fixing broken relationships, ensuring consistency after manual edits.

SYNCS: every bidirectional pair in the active schema (parent↔children,
depends_on↔blocks, implements↔implemented_by, documents↔documented_by,
affects↔decided_by, supersedes↔superseded_by, previous_version↔next_version):
missing inverse edges are filled in BOTH directions, and entries pointing at
entities that no longer exist are pruned.

STALENESS RULE (forward side is authoritative when newer): a reverse-only edge
(e.g. a document's decided_by with no matching affects on the decision) fills
the missing FORWARD only when the reverse-side file's frontmatter updated_at is
newer or equal — or when either timestamp is absent (reverse-only-authored
vaults keep working). If the forward-side file is STRICTLY newer, its missing
edge is treated as an explicit removal and the stale reverse entry is pruned
instead, so editing a forward list then reconciling never resurrects removed
links.

EXAMPLES:
- "Check for broken relationships" → dry_run: true
- "Fix all relationship inconsistencies" → dry_run: false`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            dry_run: { type: 'boolean', description: 'Preview changes without executing', default: false },
          },
          required: ['vault'],
        },
      },
      {
        name: 'rebuild_index',
        description: `Rebuild the in-memory entity index from scratch by re-scanning all vault files.

USE FOR: Fixing index inconsistencies, recovering from corrupted state.

RETURNS: entities_before, entities_after, duration_ms`,
        inputSchema: {
          type: 'object',
          properties: { vault: vaultRequired },
          required: ['vault'],
        },
      },
      {
        name: 'read_docs',
        description: `Read workspace documents (README, guides, specs).

NOT FOR: Reading entity files (use get_entity or search_entities instead).

EXAMPLES:
- "Read the README" → path: "README.md"
- "Show the API spec" → path: "docs/api-spec.md"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            path: { type: 'string', description: 'Document path relative to vault root (or to the workspace root when "workspace" is given)' },
            workspace: workspaceProp,
          },
          required: ['path'],
        },
      },
      {
        name: 'update_doc',
        description: `Update workspace documents.

NOT FOR: Updating entities (use update_entity instead).

EXAMPLES:
- Update README → path: "README.md", content: "..."`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            path: { type: 'string', description: 'Document path' },
            content: { type: 'string', description: 'New content' },
            workspace: workspaceProp,
          },
          required: ['vault', 'path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: `List files in the vault or a specific directory.

EXAMPLES:
- "List all markdown files" → pattern: "*.md"
- "List files in docs/" → directory: "docs"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            directory: { type: 'string', description: 'Directory to list (default: vault root)' },
            pattern: { type: 'string', description: 'File pattern (e.g., *.md)' },
            recursive: { type: 'boolean', description: 'Search recursively', default: false },
            workspace: workspaceProp,
          },
        },
      },
      {
        name: 'analyze_project_state',
        description: `Deep analysis of project state identifying blockers and suggesting actions.

USE FOR: Finding blockers, getting actionable recommendations.

EXAMPLES:
- "What's blocking progress?"
- "What actions should I take?"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            workstream: { type: 'string', description: 'Filter by workstream' },
            focus: { type: 'string', enum: ['blockers', 'actions', 'both'], description: 'Analysis focus' },
          },
        },
      },
      {
        name: 'get_feature_coverage',
        description: `Analyze feature implementation and documentation coverage.

USE FOR: Coverage reports, gap analysis, finding undocumented features.

EXAMPLES:
- "How many features have documentation?"
- "What features are missing implementation?"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            phase: phaseValues
              ? { type: 'string', enum: phaseValues, description: 'Filter by phase' }
              : { type: 'string', description: 'Filter by phase (values are per-vault — call get_schema({vault})).' },
            tier: typeValues
              ? { type: 'string', enum: ['OSS', 'Premium'], description: 'Filter by tier' }
              : { type: 'string', description: 'Filter by tier' },
          },
        },
      },
      {
        name: 'validate_project',
        description: `Validate project entities against relationship rules.

USE FOR: Finding missing relationships, ensuring entities are properly connected.

Returns hard "violations" (invalid relationships/targets, orphans) plus soft
"advisories" — fan-out guidelines that are NOT enforced on writes: a document
should document ≤2 features, a decision should affect ≤2 documents, a feature
should have ≤3 implementers, a feature should be documented by ≤2 documents.
Each advisory carries a concrete reorganization
suggestion; reconcile them gradually rather than treating them as errors.

EXAMPLES:
- "Are there any orphaned documents?"
- "Validate backend workstream"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            workstream: { type: 'string', description: 'Filter by workstream' },
            entity_types: typeValues
              ? {
                  type: 'array',
                  items: { type: 'string', enum: typeValues },
                  description: 'Filter to specific entity types',
                }
              : {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter to specific entity types (per-vault — call get_schema({vault})).',
                },
          },
        },
      },
      {
        name: 'cleanup_completed',
        description: `Archive completed stories/tasks under completed milestones.

USE FOR: Archiving completed work, cleaning up the vault.

FLOW:
1. Find completed milestones
2. Archive their completed stories/tasks (copy to archive/, verify, delete original)
3. Return summary

EXAMPLES:
- "Clean up all completed milestones" → {}
- "Preview cleanup" → dry_run: true`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            milestone_id: { type: 'string', description: 'Optional milestone ID to clean up' },
            dry_run: { type: 'boolean', description: 'Preview without making changes', default: false },
          },
          required: ['vault'],
        },
      },
      {
        name: 'manage_documents',
        description: `Manage documents and decisions: history, versioning, freshness checks.

ACTIONS:
- get_decision_history: List decisions
- check_freshness: Check if document is stale

EXAMPLES:
- "What decisions have we made about auth?" → action: "get_decision_history", topic: "auth"`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            action: {
              type: 'string',
              enum: ['get_decision_history', 'check_freshness'],
              description: 'The action to perform',
            },
            topic: { type: 'string', description: 'Filter by topic (for get_decision_history)' },
            workstream: { type: 'string', description: 'Filter by workstream (for get_decision_history)' },
            document_id: { type: 'string', description: 'Document ID (for check_freshness)' },
          },
          required: ['vault', 'action'],
        },
      },
      {
        name: 'search_docs',
        description: `Semantic search across all documents in the vault using hybrid vector + keyword search.

USE FOR: Finding relevant documents by meaning, not just keywords.
NOT FOR: Listing all files (use list_files), getting specific entity (use get_entity).

FEATURES:
- Hybrid search: combines semantic (vector) and keyword (BM25) matching
- Relevance-weighted excerpt budgets: higher-scoring results get more context
- Score threshold filtering: drop low-relevance results
- Budget feedback: know when excerpts were truncated to adjust queries

BUDGET BEHAVIOR:
- Total budget (default 8000 chars) is distributed across results based on relevance scores
- Higher-scoring results get proportionally more characters
- If a result's content is smaller than its allocation, surplus is redistributed
- budget_info in response tells you if content was truncated

WORKSPACE MODE: passing "workspace" scopes the search to that workspace's
confined external root using a plain keyword scan (external docs are not in
the vault's semantic index).

EXAMPLES:
- "Search for authentication implementation details"
- "Find documents about Kubernetes deployment" with min_score: 0.5 to filter noise
- Large budget search: excerpt_budget: { total_chars: 15000 }`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultOptional,
            workspace: workspaceProp,
            query: {
              type: 'string',
              description: 'Natural language search query',
            },
            top_k: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10, max: 100)',
            },
            min_score: {
              type: 'number',
              description: 'Minimum relevance score threshold (default: 0.2, floor: 0.2). Results below this are dropped.',
            },
            excerpt_budget: {
              type: 'object',
              description: 'Configure how character budget is allocated across results',
              properties: {
                total_chars: {
                  type: 'number',
                  description: 'Total character budget across all results (default: 8000)',
                },
                min_per_result: {
                  type: 'number',
                  description: 'Minimum characters per result (default: 200)',
                },
                max_per_result: {
                  type: 'number',
                  description: 'Maximum characters per result (default: 3000)',
                },
              },
            },
            max_excerpt_chars: {
              type: 'number',
              description: '[DEPRECATED] Use excerpt_budget.max_per_result instead',
            },
            filters: {
              type: 'object',
              properties: {
                doc_uri_prefix: {
                  type: 'string',
                  description: 'Filter to documents starting with this path prefix (e.g., "stories/")',
                },
                doc_uris: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter to specific document URIs',
                },
                heading_path_contains: {
                  type: 'string',
                  description: 'Filter to sections containing this heading path segment',
                },
              },
            },
            include_scores: {
              type: 'boolean',
              description: 'Include detailed scores (vector_score, bm25_score) in results',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'msrl_status',
        description: `Get the status of the MSRL semantic search index.

USE FOR: Checking if the index is ready, viewing index statistics.
NOT FOR: Searching (use search_docs).

RETURNS:
- state: 'ready', 'building', or 'error'
- snapshot_id: Current snapshot identifier
- stats: Document, node, leaf, and shard counts
- watcher: File watcher status`,
        inputSchema: {
          type: 'object',
          properties: { vault: vaultOptional },
          required: [],
        },
      },
      {
        name: 'entities',
        description: `Unified bulk operations tool. Fetch multiple entities or perform batch operations.

ACTIONS:
- get: Fetch multiple entities by IDs (more efficient than multiple entity calls)
- batch: Perform multiple create/update/archive operations in a single call

USE FOR:
- Fetching 2+ entities at once
- Batch status updates across multiple items
- Creating related entities together
- Any operation touching multiple entities

EXAMPLES:
- { action: "get", ids: ["M-001", "S-001", "T-001"] }
- { action: "batch", ops: [...], options: { dry_run: true } }`,
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            action: {
              type: 'string',
              enum: ['get', 'batch'],
              description: 'Action to perform',
            },
            // For 'get' action
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Entity IDs to fetch (for get action)',
            },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description: 'Fields to include in response (default: all)',
            },
            // For 'batch' action
            ops: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  client_id: { type: 'string', description: 'Client-provided ID for idempotency' },
                  op: { type: 'string', enum: ['create', 'update', 'archive'], description: 'Operation type' },
                  type: typeProp('Entity type (for create).'),
                  id: { type: 'string', description: 'Entity ID (for update/archive)' },
                  payload: { type: 'object', description: 'Operation payload (title, workstream, relationships, etc.)' },
                },
                required: ['client_id', 'op', 'payload'],
              },
              description: 'Operations to perform (for batch action)',
            },
            options: {
              type: 'object',
              properties: {
                atomic: { type: 'boolean', description: 'Rollback all on any failure (default: false)' },
                dry_run: { type: 'boolean', description: 'Preview changes without executing (default: false)' },
                include_entities: { type: 'boolean', description: 'Include full entity data in results (default: false)' },
              },
              description: 'Options for batch action',
            },
          },
          required: ['vault', 'action'],
        },
      },
      // --- Registry-global vault management (spec §7, D6) — no `vault` arg ---
      {
        name: 'list_vaults',
        description: 'List every registered vault (config + absorbed VAULT_PATH / client roots) with id, name, path, whether the path exists, and — for vaults whose engine has been built — entity count and schema source.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'add_vault',
        description: `Register a vault with the MCP server (scaffold a new one or adopt an existing one).

MODES (bootstrap):
- "auto" (default): missing/empty dir → scaffold a fresh vault; recognizable vault → adopt with layout detection; anything else → refused.
- "always": scaffold; errors when the directory is non-empty.
- "never": register only — no files are written.

Scaffold writes schema.json (the default schema), one folder per entity type, archive/, workspaces.json, and the default canvas. Adopt DETECTS the on-disk layout (top-level vs entities/ type folders, by-type vs quarterly archive) and never creates a competing tree. The path must be inside the config's allowedRoots (hand-edited in mcp.json only).`,
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path of the vault directory (must be within allowedRoots).' },
            name: { type: 'string', description: 'Human-readable vault name (default: the directory basename).' },
            id: { type: 'string', description: 'Stable vault id (default: kebab slug of the name/basename; suffixed on collision).' },
            bootstrap: { type: 'string', enum: ['auto', 'always', 'never'], description: 'Scaffold/adopt behavior (default: auto).' },
            installPlugin: { type: 'boolean', description: 'Also install the bundled Obsidian plugin into the new vault (scaffold only; default: false).' },
          },
          required: ['path'],
        },
      },
      {
        name: 'remove_vault',
        description: 'Deregister a vault from the MCP config. NEVER touches or deletes any vault files — it only removes the registry entry.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Vault id to deregister (call list_vaults).' },
          },
          required: ['id'],
        },
      },
      // --- Per-vault workspaces (spec §8, D1) ---
      {
        name: 'list_workspaces',
        description: 'List the vault\'s registered workspaces (named external doc-source pointers stored in <vault>/workspaces.json).',
        inputSchema: {
          type: 'object',
          properties: { vault: vaultOptional },
        },
      },
      {
        name: 'add_workspace',
        description: 'Register a named external doc-source for the vault. The path must be inside the config\'s allowedRoots; workspace file access is restricted to .md/.canvas documents.',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            name: { type: 'string', description: 'Workspace name (a label — no path separators).' },
            path: { type: 'string', description: 'Absolute path of the external doc root (must be within allowedRoots).' },
            description: { type: 'string', description: 'Optional human-readable description.' },
          },
          required: ['vault', 'name', 'path'],
        },
      },
      {
        name: 'remove_workspace',
        description: 'Unregister a workspace from the vault\'s workspaces.json. Never touches the workspace\'s files.',
        inputSchema: {
          type: 'object',
          properties: {
            vault: vaultRequired,
            name: { type: 'string', description: 'Workspace name to remove (call list_workspaces).' },
          },
          required: ['vault', 'name'],
        },
      },
    ],
  };
});

// Every vault-scoped tool the dispatch switch below understands. Anything not
// here and not registry-global is an unknown tool (checked BEFORE vault
// resolution so bogus names error as "Unknown tool", not as a vault problem).
const VAULT_SCOPED_TOOLS = new Set<string>([
  'create_entity', 'list_entities', 'get_entity', 'update_entity',
  'get_schema', 'set_schema', 'get_schema_designer',
  'search_entities', 'get_project_overview', 'reconcile_relationships',
  'rebuild_index', 'read_docs', 'update_doc', 'list_files',
  'analyze_project_state', 'get_feature_coverage', 'validate_project',
  'cleanup_completed', 'manage_documents', 'search_docs', 'msrl_status',
  'entities', 'list_workspaces', 'add_workspace', 'remove_workspace',
]);

const REGISTRY_GLOBAL_TOOLS = new Set<string>(['list_vaults', 'add_vault', 'remove_vault']);

/** JSON tool result (all JSON payloads carry the resolved vault id, D3). */
function jsonResult(payload: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Workspace-scoped doc access (spec §8 + D7): resolve the workspace's stored
// path with confineExisting (TOCTOU re-check on EVERY access — a registered
// dir swapped for a symlink to /etc is caught here), then re-confine the
// requested file to the WORKSPACE subtree and enforce the doc-extension
// allowlist. Workspace reads/writes go through node:fs — they live outside
// the vault-rooted adapter.
// ---------------------------------------------------------------------------

async function resolveWorkspaceRoot(
  eng: NodeVaultEngine,
  workspaceName: string
): Promise<string> {
  const allowed = (await registry.loadConfig()).allowedRoots;
  const ws = await readWorkspaces(eng.fs);
  const resolved = resolveWorkspace(ws, workspaceName, (p) => confineExisting(p, allowed));
  return resolved.path;
}

/** Recursively list files under a workspace root; symlinks that escape the
 * confined subtree are skipped (never followed). Paths are root-relative. */
async function listWorkspaceFiles(
  rootReal: string,
  dir: string,
  recursive: boolean,
  out: string[]
): Promise<void> {
  const entries = await nodeFsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = nodePath.join(dir, entry.name);
    let real: string;
    try {
      real = confineExisting(p, [rootReal]);
    } catch {
      continue; // escapes the workspace subtree (symlink) — never follow
    }
    if (entry.isDirectory()) {
      if (recursive) await listWorkspaceFiles(rootReal, real, recursive, out);
    } else {
      out.push(nodePath.relative(rootReal, p));
    }
  }
}

// Keyword-scan cap for workspace-scoped search_docs (external docs are not in
// the vault's MSRL index, so this is a bounded plain-text scan).
const WS_SEARCH_MAX_FILES = 500;

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ----- Registry-global tools (no vault argument) -----------------------
    if (REGISTRY_GLOBAL_TOOLS.has(name)) {
      switch (name) {
        case 'list_vaults': {
          const vaults = await registry.list();
          const out = [];
          for (const v of vaults) {
            let exists = false;
            try {
              exists = (await nodeFsp.stat(v.path)).isDirectory();
            } catch { /* missing path → exists: false */ }
            const built = builtEngines.get(v.id);
            out.push({
              id: v.id,
              name: v.name,
              path: v.path,
              exists,
              ...(v.transient && { transient: true }),
              // Only vaults whose engine has already been built report these —
              // list_vaults never force-builds an engine.
              ...(built && {
                entityCount: built.index.getAll().length,
                schemaSource: built.schemaSource,
              }),
            });
          }
          return jsonResult({ count: out.length, vaults: out });
        }

        case 'add_vault': {
          const { path: rawPath, name: vaultName, id: requestedId, bootstrap = 'auto', installPlugin = false } = args as {
            path: string;
            name?: string;
            id?: string;
            bootstrap?: 'auto' | 'always' | 'never';
            installPlugin?: boolean;
          };
          if (!rawPath || typeof rawPath !== 'string') {
            throw new Error(`add_vault requires 'path' (absolute vault directory).`);
          }
          if (bootstrap !== 'auto' && bootstrap !== 'always' && bootstrap !== 'never') {
            throw new Error(`add_vault: bootstrap must be "auto", "always" or "never" — got '${bootstrap}'.`);
          }

          // 1. Confinement FIRST (D7): agent-supplied paths are an arbitrary
          //    read/write primitive until proven inside allowedRoots.
          const cfg = await registry.loadConfig();
          const confined = confinePath(rawPath, cfg.allowedRoots);
          const already = cfg.vaults.find((v) => nodePath.resolve(v.path) === confined);
          if (already) {
            throw new Error(`Path ${confined} is already registered as vault '${already.id}'.`);
          }

          // 2. Read-only layout probe (never writes, never mkdirs).
          const vfs = new NodeFsAdapter(confined);
          const detection = await detectVaultLayout(vfs);

          let mode: 'created' | 'adopted' | 'registered';
          const layout = {
            entitiesFolder: detection.entitiesFolder,
            archiveFolder: detection.archiveFolder,
            archiveLayout: detection.archiveLayout,
            canvasFolder: detection.canvasFolder,
          };
          const folders: string[] = [...detection.typeFolders];

          const scaffold = async (): Promise<void> => {
            // Scaffold (D4/§7.2 step 3) — schema-bootstrap owns the schema file.
            await nodeFsp.mkdir(confined, { recursive: true });
            const schema = DEFAULT_SCHEMA;
            const schemaErrs = validateSchema(schema);
            if (schemaErrs.length > 0) {
              throw new Error(`Scaffold schema failed validation (nothing written): ${schemaErrs.join('; ')}`);
            }
            await vfs.writeFile(SCHEMA_FILENAME, serializeSchema(schema));
            for (const t of schema.entityTypes) {
              const folder = layout.entitiesFolder ? `${layout.entitiesFolder}/${t.folder}` : t.folder;
              await vfs.createDir(folder, { recursive: true });
              folders.push(folder);
            }
            await vfs.createDir(layout.archiveFolder, { recursive: true });
            folders.push(layout.archiveFolder);
            await vfs.writeFile(WORKSPACES_FILE, '{}\n');
            await ensureDefaultCanvas(vfs, schema);
            if (installPlugin) {
              const artifactsDir = await findPluginSourceDir();
              if (artifactsDir) await ensurePluginInstalled(vfs, artifactsDir);
              else console.error('WARNING: installPlugin requested but plugin artifacts not found next to the MCP server — skipped.');
            }
          };

          if (bootstrap === 'always') {
            if (detection.kind !== 'absent' && detection.kind !== 'empty') {
              throw new Error(
                `add_vault bootstrap:"always" refuses to scaffold into non-empty directory ${confined} (detected: ${detection.kind}). Use bootstrap:"auto" to adopt it.`
              );
            }
            mode = 'created';
            await scaffold();
          } else if (bootstrap === 'never') {
            // Register only — no files written, layout from detection.
            mode = 'registered';
          } else {
            // auto
            if (detection.kind === 'absent' || detection.kind === 'empty') {
              mode = 'created';
              await scaffold();
            } else if (detection.kind === 'vault') {
              // Adopt (§7.2 step 4): detection-driven layout, NEVER a competing
              // tree. schema.json is written only now (adopt-commit) and only
              // when it doesn't exist at all; type folders genuinely missing
              // for the effective schema are created in the DETECTED location.
              mode = 'adopted';
              const loaded = await loadSchemaOrDefault(vfs, '');
              if (!detection.hasSchemaJson) {
                await vfs.writeFile(SCHEMA_FILENAME, serializeSchema(loaded.schema));
              }
              for (const t of loaded.schema.entityTypes) {
                const folder = layout.entitiesFolder ? `${layout.entitiesFolder}/${t.folder}` : t.folder;
                if (!(await vfs.exists(folder))) {
                  await vfs.createDir(folder, { recursive: true });
                  folders.push(folder);
                }
              }
            } else {
              throw new Error(
                `${confined} does not look like a vault (no schema.json, no recognizable type folders, no entity frontmatter) and is not empty. Refusing to adopt — pass bootstrap:"never" to force-register it as-is.`
              );
            }
          }

          // 3. Register under the config lock (kebab slug + suffix collision policy).
          const base = kebabSlug(requestedId ?? vaultName ?? nodePath.basename(confined));
          let finalId = base;
          await registry.mutateConfig((c) => {
            if (c.vaults.some((v) => nodePath.resolve(v.path) === confined)) {
              throw new Error(`Path ${confined} is already registered.`);
            }
            if (requestedId) {
              if (c.vaults.some((v) => v.id === base)) {
                throw new Error(`Vault id '${base}' is already taken — pick another id.`);
              }
              finalId = base;
            } else {
              finalId = base;
              for (let n = 2; c.vaults.some((v) => v.id === finalId); n++) {
                finalId = `${base}-${n}`;
              }
            }
            c.vaults.push({
              id: finalId,
              name: vaultName ?? nodePath.basename(confined),
              path: confined,
              ...layout,
            });
          });
          console.error(`add_vault: ${mode} '${finalId}' at ${confined}`);

          return jsonResult({
            vault: finalId,
            mode,
            path: confined,
            ...layout,
            folders: [...new Set(folders)].sort(),
          });
        }

        case 'remove_vault': {
          const { id } = args as { id: string };
          if (!id || typeof id !== 'string') {
            throw new Error(`remove_vault requires 'id' (call list_vaults).`);
          }
          const vaults = await registry.list();
          const entry = vaults.find((v) => v.id === id);
          if (!entry) {
            throw new VaultNotFound(id, vaults.map((v) => v.id));
          }
          if (entry.transient) {
            throw new Error(
              `Vault '${id}' is absorbed from VAULT_PATH / MCP client roots, not from the config — unset the env var / root to drop it. Nothing to remove.`
            );
          }
          // Deregister ONLY — never touches vault files (D6).
          await registry.mutateConfig((c) => {
            const i = c.vaults.findIndex((v) => v.id === id);
            if (i === -1) {
              throw new VaultNotFound(id, c.vaults.map((v) => v.id));
            }
            c.vaults.splice(i, 1);
          });
          registry.invalidate(id);
          builtEngines.delete(id);
          const msrl = msrlStarted.get(id);
          if (msrl) {
            msrlStarted.delete(id);
            msrl.then((m) => m.shutdown()).catch(() => { /* best-effort */ });
          }
          console.error(`remove_vault: deregistered '${id}' (files untouched)`);
          return jsonResult({ vault: id, removed: true });
        }
      }
    }

    if (!VAULT_SCOPED_TOOLS.has(name)) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // ----- Vault resolution (D3): mutating tools REQUIRE `vault`; read-only
    // tools default only to the sole registered vault. -----------------------
    const registeredVaults = await registry.list();
    const vaultRef = resolveVaultRef(args as Record<string, unknown> | undefined, name, registeredVaults);
    const eng = await getEngine(vaultRef);
    console.error(`[tool] ${name} vault=${eng.entry.id}`);

    switch (name) {
      case 'create_entity': {
        const { type, title, properties = {} } = args as {
          type: EntityType;
          title: string;
          properties?: Record<string, unknown>;
        };

        // Accept-then-match (D8): the API layer accepted the payload; the
        // RESOLVED vault's schema is the authority. Unknown type / illegal
        // status → SchemaMismatch naming the vault + its valid values.
        assertEntityMatchesVault(eng.entry.id, eng.activeSchema, {
          type,
          status: typeof properties.status === 'string' ? properties.status : undefined,
        });

        // Rescan index to get latest IDs
        await eng.scanIndex();

        // Allocate new ID
        const id = await eng.allocator.allocate(type);

        // Build entity
        const now = new Date().toISOString();
        const typeDef = eng.schema.getEntityType(type);

        // Separate base properties from custom fields and relationships
        const { workstream, status, relationships, ...customFields } = properties;

        // BUG 1: flat relationship keys (e.g. `implements: [...]` given directly
        // in properties) are routed into relationships instead of becoming inert
        // custom fields. Explicit `relationships` entries win on conflict.
        const split = splitFlatRelationshipKeys(eng.schema, type, customFields);
        const mergedRelationships = {
          ...split.relationships,
          ...((relationships as Record<string, unknown>) ?? {}),
        } as Record<string, EntityId | EntityId[]>;

        // YAML SAFETY: Sanitize title to prevent colon-related YAML errors
        // Replaces "Component 3: Config" → "Component 3 - Config"
        const sanitizedTitle = title.replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();

        // YAML SAFETY: Sanitize string fields in customFields
        const sanitizedCustomFields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(split.rest)) {
          if (typeof value === 'string') {
            sanitizedCustomFields[key] = value.replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();
          } else {
            sanitizedCustomFields[key] = value;
          }
        }

        const entity: RuntimeEntity = {
          id,
          type,
          title: sanitizedTitle,
          status: (status as string) ?? typeDef?.statuses[0] ?? 'Not Started',
          workstream: (workstream as string) ?? 'engineering',
          created_at: now,
          updated_at: now,
          archived: false,
          vault_path: '', // Will be set after write
          canvas_source: '',
          fields: sanitizedCustomFields, // Sanitized custom fields
          relationships: mergedRelationships,
        };

        // Validate
        const errors = eng.validator.validate(entity);
        if (errors.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Validation failed:\n${errors.map(e => `- ${e.field}: ${e.message}`).join('\n')}`,
              },
            ],
            isError: true,
          };
        }

        // Serialize (no body content)
        const content = eng.serializer.serialize(entity);

        // Determine path
        const filename = eng.pathResolver.generateFilename(id, title);
        const folder = eng.pathResolver.getTypeFolderPath(type);
        const filePath = `${folder}/${filename}`;

        // Write file
        await eng.fs.writeFile(filePath, content);

        return {
          content: [
            {
              type: 'text',
              text: `Created ${type} ${id}: ${title}\nPath: ${filePath}\nVault: ${eng.entry.id}`,
            },
          ],
        };
      }

      case 'list_entities': {
        const { type } = args as { type?: EntityType };

        // Rescan index
        await eng.scanIndex();

        const allIds = eng.index.getAllIds();
        let filteredIds = allIds;

        if (type) {
          filteredIds = allIds.filter(id => {
            try {
              return getEntityTypeFromId(id, eng.schema) === type;
            } catch {
              return false;
            }
          });
        }

        // Load entities
        const entities: RuntimeEntity[] = [];
        for (const id of filteredIds) {
          const path = eng.index.getPathById(id);
          if (!path) continue;

          try {
            const content = await eng.fs.readFile(path);
            const entity = eng.parser.parse(content, path);
            entities.push(entity);
          } catch (err) {
            // Skip unparseable files
          }
        }

        // Format output
        const summary = entities
          .map(e => `- [${e.id}] ${e.title} (${e.status})`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'}${type ? ` of type ${type}` : ''}:\n\n${summary}\n\nVault: ${eng.entry.id}`,
            },
          ],
        };
      }

      case 'get_entity': {
        const { id } = args as { id: EntityId };

        // Rescan index
        await eng.scanIndex();

        const path = eng.index.getPathById(id);
        if (!path) {
          return {
            content: [
              {
                type: 'text',
                text: `Entity ${id} not found in vault '${eng.entry.id}'`,
              },
            ],
            isError: true,
          };
        }

        const content = await eng.fs.readFile(path);
        const entity = eng.parser.parse(content, path);

        // Format as JSON for agents (echoing the resolved vault, D3)
        return jsonResult(echoVault(eng.entry.id, entity));
      }

      case 'update_entity': {
        const { id, updates } = args as { id: EntityId; updates: Record<string, unknown> };

        // Rescan index
        await eng.scanIndex();

        const path = eng.index.getPathById(id);
        if (!path) {
          return {
            content: [
              {
                type: 'text',
                text: `Entity ${id} not found in vault '${eng.entry.id}'`,
              },
            ],
            isError: true,
          };
        }

        // Load current entity
        const content = await eng.fs.readFile(path);
        const entity = eng.parser.parse(content, path);

        // BUG A: `updates.body` addresses the markdown BODY, not frontmatter.
        // Pull it out BEFORE sanitization (the YAML sanitizer would mangle
        // colons in prose) and before routing (so it can never leak into
        // frontmatter-side structures). Only a string replaces the body.
        const { body: bodyUpdate, ...frontmatterUpdates } = updates as
          Record<string, unknown> & { body?: unknown };

        // YAML SAFETY: Sanitize string values in updates
        const sanitizedUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(frontmatterUpdates)) {
          if (typeof value === 'string') {
            // Replace colons and other unsafe YAML chars
            sanitizedUpdates[key] = value.replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();
          } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Recursively sanitize nested objects (like fields)
            const nested: Record<string, unknown> = {};
            for (const [nkey, nvalue] of Object.entries(value)) {
              if (typeof nvalue === 'string') {
                nested[nkey] = nvalue.replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();
              } else {
                nested[nkey] = nvalue;
              }
            }
            sanitizedUpdates[key] = nested;
          } else {
            sanitizedUpdates[key] = value;
          }
        }

        // Capture pre-existing validation errors so a partial update (e.g. setting
        // only a relationship) is not blocked by unrelated violations that were
        // already present on the stored entity (BUG 4).
        const errorsBefore = eng.validator.validate(entity);
        const beforeKeys = new Set(errorsBefore.map(e => `${e.code}:${e.field}`));

        // BUG 1: schema-driven routing — flat relationship keys go into
        // entity.relationships and flat custom-field keys into entity.fields
        // (Object.assign put both at top level, where the schema-driven
        // serializer silently dropped them). Nested `relationships`/`fields`
        // objects keep their existing whole-map-replace contract.
        const relNames = getRelationshipFieldNamesForType(eng.schema, entity.type);
        const customNames = new Set(eng.schema.getFields(entity.type).map(f => f.name));
        // BUG 4: track which fields this update actually touches (nested
        // objects touch their inner keys) so only THOSE can block.
        const touched = new Set<string>();
        const topLevel: Record<string, unknown> = {};
        const relPatch: Record<string, unknown> = {};
        const fieldPatch: Record<string, unknown> = {};
        const passthroughPatch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(sanitizedUpdates)) {
          if ((key === 'relationships' || key === 'fields') && value && typeof value === 'object' && !Array.isArray(value)) {
            for (const k of Object.keys(value)) touched.add(k);
            topLevel[key] = value;
          } else if (relNames.has(key)) {
            relPatch[key] = value;
            touched.add(key);
          } else if (customNames.has(key)) {
            fieldPatch[key] = value;
            touched.add(key);
          } else if (entity.passthrough && key in entity.passthrough) {
            // BUG B: keys that only exist as PASSTHROUGH (e.g. a relationship
            // field that is invalid for this type, left over from a schema
            // change) were routed to topLevel where the schema-driven
            // serializer dropped the assignment — the stale value was then
            // re-emitted from passthrough, so the field could never be
            // updated OR cleared. Route them to passthrough; null / empty
            // array means DELETE the key (the only sane "clear" semantics).
            passthroughPatch[key] = value;
            touched.add(key);
          } else {
            topLevel[key] = value;
            touched.add(key);
          }
        }

        Object.assign(entity, topLevel);
        if (Object.keys(relPatch).length > 0) {
          entity.relationships = {
            ...(entity.relationships ?? {}),
            ...relPatch,
          } as Record<string, EntityId | EntityId[]>;
        }
        if (Object.keys(fieldPatch).length > 0) {
          entity.fields = { ...(entity.fields ?? {}), ...fieldPatch };
        }
        for (const [key, value] of Object.entries(passthroughPatch)) {
          if (isClearValue(value)) delete entity.passthrough![key];
          else entity.passthrough![key] = value;
        }
        entity.updated_at = new Date().toISOString();

        // BUG 4: validate the RESULTING entity, but only REJECT for problems in
        // fields this update touched (or newly introduced elsewhere).
        // Pre-existing violations in untouched fields become non-blocking
        // warnings so legacy data can't hold unrelated repairs hostage.
        const errorsAfter = eng.validator.validate(entity);
        const blocking = errorsAfter.filter(
          e => touched.has(e.field) || !beforeKeys.has(`${e.code}:${e.field}`)
        );
        if (blocking.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Validation failed:\n${blocking.map(e => `- ${e.field}: ${e.message}`).join('\n')}`,
              },
            ],
            isError: true,
          };
        }
        const warnings = errorsAfter
          .filter(e => !blocking.includes(e))
          .map(e => `${e.field}: ${e.message}`);

        // Serialize and write, RE-ATTACHING the markdown body: replaced when
        // the update carries a string `body`, otherwise preserved verbatim
        // (BUG A — frontmatter-only writes destroyed it).
        const body = typeof bodyUpdate === 'string' ? normalizeBody(bodyUpdate) : extractBody(content);
        const newContent = eng.serializer.serialize(entity) + body;
        await eng.fs.writeFile(path, newContent);

        return {
          content: [
            {
              type: 'text',
              text: (warnings.length > 0
                ? `Updated ${id}: ${entity.title}\n${JSON.stringify({ warnings }, null, 2)}`
                : `Updated ${id}: ${entity.title}`) + `\nVault: ${eng.entry.id}`,
            },
          ],
        };
      }

      case 'get_schema': {
        // Return the vault's ACTIVE schema (from schema.json, or the codified
        // default) plus where it came from and any validation errors.
        return jsonResult({
          vault: eng.entry.id,
          source: eng.schemaSource,
          path: `${eng.entry.path}/${SCHEMA_FILENAME}`,
          errors: eng.schemaErrors,
          schema: eng.activeSchema,
        });
      }

      case 'set_schema': {
        // Write the vault's schema.json (single source of truth) and hot-reload.
        // Accepts a FULL schema object, or a relationships[] array to merge into the
        // current schema (the designer UI edits relationships only).
        // NOTE: set_schema payloads are exempt from accept-then-match (they
        // DEFINE the schema) but still gated by validateSchema. Folder
        // reconciliation (D5) is wired in a follow-up wave — this stays
        // reconcile-free for now.
        const { schema: fullSchema, relationships } = args as {
          schema?: Schema;
          relationships?: unknown[];
        };
        let candidate: Schema;
        if (fullSchema) {
          candidate = fullSchema;
        } else if (Array.isArray(relationships)) {
          candidate = { ...eng.activeSchema, relationships } as Schema;
        } else {
          return {
            content: [{ type: 'text', text: 'set_schema requires "schema" (full Schema object) or "relationships" (array).' }],
            isError: true,
          };
        }

        const errors = validateSchema(candidate);
        if (errors.length > 0) {
          return {
            content: [{ type: 'text', text: `Schema is invalid — NOT saved:\n- ${errors.join('\n- ')}` }],
            isError: true,
          };
        }

        // eng.fs is rooted at the vault → write the RELATIVE filename.
        await eng.fs.writeFile(SCHEMA_FILENAME, serializeSchema(candidate));
        console.error(`set_schema: wrote ${eng.entry.path}/${SCHEMA_FILENAME}`);
        // Hot-reload the in-flight engine AND invalidate the registry cache so
        // the next engine() rebuilds from the file (both stay consistent).
        eng.applySchema(candidate);
        eng.schemaSource = 'file';
        eng.schemaErrors = [];
        registry.invalidate(eng.entry.id);
        // If the new schema names a defaultCanvas that doesn't exist yet (or is
        // an empty file), bootstrap/repair it now — same step as server startup.
        await ensureDefaultCanvas(eng.fs, candidate);
        // Tool inputSchemas embed schema-derived enums (entity types, feature
        // phase values) — tell clients the tool surface may have changed.
        try { await server.sendToolListChanged(); } catch { /* transport may not be connected */ }
        return jsonResult({
          vault: eng.entry.id,
          saved: true,
          path: `${eng.entry.path}/${SCHEMA_FILENAME}`,
          entityTypes: candidate.entityTypes.length,
          relationships: candidate.relationships.length,
        });
      }

      case 'get_schema_designer': {
        // Return the self-contained HTML relationship designer, pre-populated with
        // the vault's ACTIVE schema. Its "copy" output feeds set_schema.
        const html = (DESIGNER_HTML_TEMPLATE as string).replaceAll(
          '"__SCHEMA_PLACEHOLDER__"',
          JSON.stringify(eng.activeSchema),
        );
        return { content: [{ type: 'text', text: html }] };
      }

      case 'search_entities': {
        const { query, from_id, direction, depth = 1, filters = {}, limit = 20 } = args as {
          query?: string;
          from_id?: string;
          direction?: 'up' | 'down' | 'siblings' | 'dependencies';
          depth?: number;
          filters?: {
            type?: string[];
            status?: string[];
            workstream?: string[];
            archived?: boolean;
          };
          limit?: number;
        };

        // Rescan index
        await eng.scanIndex();

        // index.get*/getAll return EntityMetadata (flat parent_id, no
        // relationships/fields). Downstream we only surface metadata fields, so
        // results is EntityMetadata[]; the full entity is re-parsed only where
        // relationships/fields are actually needed.
        let results: EntityMetadata[] = [];

        // Navigation mode
        if (from_id && direction) {
          const startPath = eng.index.getPathById(from_id);
          const startEntity = startPath ? eng.parser.parse(await eng.fs.readFile(startPath), startPath) : null;
          if (!startEntity) {
            return {
              content: [{ type: 'text', text: `Entity ${from_id} not found in vault '${eng.entry.id}'` }],
              isError: true,
            };
          }

          // Simple navigation implementation
          if (direction === 'down') {
            // Get children
            results = eng.index.getAll().filter(e =>
              e.parent_id === from_id && !e.archived
            );
          } else if (direction === 'up') {
            // Get parent
            const parentId = startEntity.relationships?.parent;
            if (parentId) {
              const parent = eng.index.get(parentId as string);
              if (parent) results = [parent];
            }
          } else if (direction === 'siblings') {
            // Get entities with same parent
            const parentId = startEntity.relationships?.parent;
            if (parentId) {
              results = eng.index.getAll().filter(e =>
                e.parent_id === parentId && e.id !== from_id && !e.archived
              );
            }
          } else if (direction === 'dependencies') {
            // Get dependencies
            const depsIds = (startEntity.relationships?.depends_on as string[]) || [];
            results = depsIds.map(id => eng.index.get(id)).filter(Boolean) as EntityMetadata[];
          }
        }
        // Search mode
        else if (query) {
          const lowerQuery = query.toLowerCase();
          const matched: EntityMetadata[] = [];
          for (const e of eng.index.getAll()) {
            if (e.archived && !filters.archived) continue;
            let match =
              e.title.toLowerCase().includes(lowerQuery) ||
              e.id.toLowerCase().includes(lowerQuery);
            if (!match) {
              // Field values require the full parsed entity (metadata is flat).
              const p = eng.index.getPathById(e.id);
              const ent = p ? eng.parser.parse(await eng.fs.readFile(p), p) : null;
              match = !!(ent?.fields && Object.values(ent.fields).some(v =>
                typeof v === 'string' && v.toLowerCase().includes(lowerQuery)
              ));
            }
            if (match) matched.push(e);
          }
          results = matched;
        }
        // List mode
        else {
          results = eng.index.getAll().filter(e => {
            if (e.archived && !filters.archived) return false;
            return true;
          });
        }

        // Apply filters
        if (filters.type && filters.type.length > 0) {
          results = results.filter(e => filters.type!.includes(e.type));
        }
        if (filters.status && filters.status.length > 0) {
          results = results.filter(e => filters.status!.includes(e.status));
        }
        if (filters.workstream && filters.workstream.length > 0) {
          results = results.filter(e => filters.workstream!.includes(e.workstream));
        }

        // Apply limit
        results = results.slice(0, limit);

        // Format results
        const formatted = results.map(e => ({
          id: e.id,
          type: e.type,
          title: e.title,
          status: e.status,
          workstream: e.workstream,
          parent: e.parent_id,
        }));

        return jsonResult({
          vault: eng.entry.id,
          total: results.length,
          results: formatted,
        });
      }

      case 'get_project_overview': {
        const { include_completed = false, include_archived = false, workstream: filterWorkstream } = args as {
          include_completed?: boolean;
          include_archived?: boolean;
          workstream?: string;
        };

        await eng.scanIndex();
        const entities = eng.index.getAll();

        // Initialize counters
        const summary = {
          milestones: { total: 0, completed: 0, in_progress: 0, blocked: 0, not_started: 0 },
          stories: { total: 0, completed: 0, in_progress: 0, blocked: 0, not_started: 0 },
          tasks: { total: 0, completed: 0, in_progress: 0, blocked: 0, not_started: 0 },
          decisions: { total: 0, pending: 0, decided: 0, superseded: 0 },
          documents: { total: 0, draft: 0, approved: 0 },
          features: { total: 0 },
        };

        const workstreams: Record<string, any> = {};

        for (const entity of entities) {
          // Skip archived if not included
          if (entity.archived && !include_archived) continue;
          // Skip completed if not included
          if (entity.status === 'Completed' && !include_completed) continue;
          // Filter by workstream
          if (filterWorkstream && entity.workstream !== filterWorkstream) continue;

          // Count by workstream
          if (!workstreams[entity.workstream]) {
            workstreams[entity.workstream] = {
              milestones: 0, stories: 0, tasks: 0, decisions: 0, documents: 0, features: 0
            };
          }
          workstreams[entity.workstream][entity.type + 's'] = (workstreams[entity.workstream][entity.type + 's'] || 0) + 1;

          // Count by type and status
          switch (entity.type) {
            case 'milestone':
              summary.milestones.total++;
              if (entity.status === 'Completed') summary.milestones.completed++;
              else if (entity.status === 'In Progress') summary.milestones.in_progress++;
              else if (entity.status === 'Blocked') summary.milestones.blocked++;
              else if (entity.status === 'Not Started') summary.milestones.not_started++;
              break;
            case 'story':
              summary.stories.total++;
              if (entity.status === 'Completed') summary.stories.completed++;
              else if (entity.status === 'In Progress') summary.stories.in_progress++;
              else if (entity.status === 'Blocked') summary.stories.blocked++;
              else if (entity.status === 'Not Started') summary.stories.not_started++;
              break;
            case 'task':
              summary.tasks.total++;
              if (entity.status === 'Completed') summary.tasks.completed++;
              else if (entity.status === 'In Progress') summary.tasks.in_progress++;
              else if (entity.status === 'Blocked') summary.tasks.blocked++;
              else if (entity.status === 'Not Started') summary.tasks.not_started++;
              break;
            case 'decision':
              summary.decisions.total++;
              if (entity.status === 'Pending') summary.decisions.pending++;
              else if (entity.status === 'Decided') summary.decisions.decided++;
              else if (entity.status === 'Superseded') summary.decisions.superseded++;
              break;
            case 'document':
              summary.documents.total++;
              if (entity.status === 'Draft') summary.documents.draft++;
              else if (entity.status === 'Approved') summary.documents.approved++;
              break;
            case 'feature':
              summary.features.total++;
              break;
          }
        }

        return jsonResult({ vault: eng.entry.id, summary, workstreams });
      }

      case 'reconcile_relationships': {
        const { dry_run = false } = args as { dry_run?: boolean };

        await eng.scanIndex();
        const metas = eng.index.getAll();
        const changes: string[] = [];

        // BUG 2: the previous implementation hardcoded TWO pair handlers
        // (parent→children fill, depends_on→blocks fill) so every other schema
        // pair — implements↔implemented_by, documents↔documented_by,
        // affects↔decided_by, supersedes↔superseded_by, versioning — was never
        // reconciled (reported 0 changes with missing reverses on disk), and
        // the "Dependency … removing" branch never actually removed the entry.
        // Pairs are now DERIVED from the active schema, in both directions:
        //   - forward edge present, reverse missing  → fill the reverse
        //   - reverse edge present, forward missing  → fill the forward
        //   - either side pointing at a non-existent entity → prune the entry
        //     (keeps the legacy dangling-parent/-dependency contract)
        //   - cardinality-'one' slots already occupied by a DIFFERENT id are
        //     treated as conflicts and left untouched (never clobbered).
        //
        // Single write buffer keyed by id: fixes mutate RELATED entities (the
        // parent's `children`, the feature's `implemented_by`, …), so those are
        // loaded, mutated and persisted too. Keying by id lets multiple fixes
        // accumulate onto one object (no last-writer-wins loss). Mutations are
        // applied in-memory in BOTH modes so dry-run reports exactly what write
        // mode persists; files are only written when !dry_run.
        const pending = new Map<string, RuntimeEntity>();
        // id → original markdown body (re-attached on write; BUG A) and
        // id → EXPLICIT frontmatter updated_at in ms (null when absent) for
        // the forward-authoritative staleness rule (BUG C). Captured on first
        // disk read; in-run mutations never change authorship stamps.
        const bodies = new Map<string, string>();
        const stamps = new Map<string, number | null>();
        const loadEntity = async (id: string): Promise<RuntimeEntity | null> => {
          const buffered = pending.get(id);
          if (buffered) return buffered;
          const p = eng.index.getPathById(id);
          if (!p) return null;
          try {
            const raw = await eng.fs.readFile(p);
            const parsed = eng.parser.parse(raw, p);
            bodies.set(id, extractBody(raw));
            stamps.set(id, explicitUpdatedAtMs(raw));
            return parsed;
          } catch {
            return null;
          }
        };
        const touch = (e: RuntimeEntity) => pending.set(e.id, e);
        const asIds = (v: unknown): string[] =>
          Array.isArray(v)
            ? (v.filter(x => typeof x === 'string') as string[])
            : typeof v === 'string' && v !== '' ? [v] : [];
        // Legacy message shapes (kept for contract/test stability).
        const danglingMsg = (id: string, field: string, target: string): string =>
          field === 'parent' ? `${id}: Parent ${target} not found - removing`
          : field === 'depends_on' ? `${id}: Dependency ${target} not found - removing`
          : `${id}: ${field} entry ${target} not found - removing`;

        // type → relationship field names it may carry (memoized per call).
        const relNamesByType = new Map<string, Set<string>>();
        const relNamesFor = (type: string): Set<string> => {
          let names = relNamesByType.get(type);
          if (!names) {
            names = getRelationshipFieldNamesForType(eng.schema, type);
            relNamesByType.set(type, names);
          }
          return names;
        };

        /**
         * Reconcile one side of a pair on `entity`:
         *  - `field` is the side entity carries (pair.forward or pair.reverse),
         *  - `inverseField` the field expected on each target,
         *  - `inverseCard` that field's cardinality,
         *  - `sideIsForward` whether `field` is the pair's FORWARD side.
         *
         * BUG C (2026-07 shakedown): the unconditional reverse→forward fill
         * treated reverse-only edges as authored intent, so explicitly editing
         * a forward list (e.g. removing DOC-X from a decision's affects) was
         * UNDONE by the next reconcile, which re-added the forward from DOC-X's
         * stale decided_by. Forward-authoritative staleness rule: fill the
         * forward from a reverse only when the reverse-side file's EXPLICIT
         * frontmatter updated_at is newer or equal — or when either stamp is
         * absent (reverse-only-authored vaults without updated_at keep the
         * legacy fill behavior). When the forward-side file is STRICTLY newer,
         * its missing edge is an explicit removal → prune the stale reverse
         * entry instead. Forward→reverse fills stay unconditional: a forward
         * edge is authored intent by definition.
         */
        const reconcileSide = async (
          entity: RuntimeEntity,
          field: string,
          inverseField: string,
          inverseCard: 'one' | 'many',
          sideIsForward: boolean,
        ): Promise<void> => {
          const val = entity.relationships?.[field];
          if (val === undefined || val === null) return;
          const ids = asIds(val);
          const keep: string[] = [];

          for (const targetId of ids) {
            const targetMeta = eng.index.get(targetId);
            if (!targetMeta) {
              // Dangling entry: the other endpoint no longer exists → prune.
              changes.push(danglingMsg(entity.id, field, targetId));
              continue;
            }

            // Fill the missing inverse edge — but only when the target's type
            // can CARRY the inverse field per the schema (the serializer would
            // drop it otherwise; also skips types where the name is shadowed by
            // a custom field, e.g. decision.decided_by). This deliberately
            // tolerates cross-pair targets like a task parented to a milestone,
            // matching the legacy children/blocks fill contract.
            if (!relNamesFor(targetMeta.type).has(inverseField)) {
              keep.push(targetId);
              continue;
            }
            const target = await loadEntity(targetId);
            if (!target) {
              keep.push(targetId);
              continue;
            }
            target.relationships = target.relationships || {};
            const inverseVal = target.relationships[inverseField];
            const inverseIds = asIds(inverseVal);
            if (inverseIds.includes(entity.id)) {
              keep.push(targetId); // consistent pair — nothing to do
              continue;
            }

            // Inverse edge is missing. For a REVERSE side, apply the
            // forward-authoritative staleness rule before filling.
            if (!sideIsForward) {
              const forwardStamp = stamps.get(targetId);
              const reverseStamp = stamps.get(entity.id);
              if (
                typeof forwardStamp === 'number' &&
                typeof reverseStamp === 'number' &&
                forwardStamp > reverseStamp
              ) {
                changes.push(
                  `${entity.id}: Stale ${field} entry ${targetId} (${targetId} was updated more recently and does not list ${entity.id} in ${inverseField}) - removing`,
                );
                continue; // dropped from keep → reverse entry pruned
              }
            }

            keep.push(targetId);
            if (inverseCard === 'many') {
              changes.push(`${target.id}: Add ${entity.id} to ${inverseField}`);
              target.relationships[inverseField] = [...inverseIds, entity.id];
              touch(target);
            } else if (inverseVal === undefined || inverseVal === null || inverseVal === '') {
              changes.push(`${target.id}: Add ${entity.id} to ${inverseField}`);
              target.relationships[inverseField] = entity.id;
              touch(target);
            }
            // else: 'one' slot occupied by another id → conflict, leave as-is.
          }

          if (keep.length !== ids.length) {
            if (Array.isArray(val)) {
              entity.relationships[field] = keep;
            } else if (keep.length === 0) {
              delete entity.relationships[field];
            }
            touch(entity);
          }
        };

        const relationshipDefs = eng.schema.getAllRelationships();
        for (const meta of metas) {
          // Reconciliation reads/writes relationship fields, which live only on
          // the full parsed entity (index metadata is flat).
          const entity = await loadEntity(meta.id);
          if (!entity || !entity.relationships) continue;

          for (const rel of relationshipDefs) {
            for (const pair of rel.pairs) {
              if (pair.from === entity.type || pair.from === '*') {
                await reconcileSide(entity, pair.forward, pair.reverse, rel.cardinality.reverse, true);
              }
              if (pair.to === entity.type || pair.to === '*') {
                await reconcileSide(entity, pair.reverse, pair.forward, rel.cardinality.forward, false);
              }
            }
          }
        }

        // Write updates
        if (!dry_run && pending.size > 0) {
          for (const entity of pending.values()) {
            // Re-attach the file's original markdown body (BUG A: the
            // frontmatter-only serializer output used to destroy it).
            const content = eng.serializer.serialize(entity) + (bodies.get(entity.id) ?? '');
            // Write back to the entity's existing file path; only fall back to a
            // generated <ID>_<title> path for entities not yet in the index.
            // Recomputing unconditionally forks a duplicate file whenever the
            // vault's filename doesn't match the generated pattern.
            const existingPath = eng.index.getPathById(entity.id);
            const filePath = existingPath ??
              `${eng.pathResolver.getTypeFolderPath(entity.type)}/${eng.pathResolver.generateFilename(entity.id, entity.title)}`;
            await eng.fs.writeFile(filePath, content);
          }
        }

        return jsonResult({
          vault: eng.entry.id,
          dry_run,
          changes_count: changes.length,
          changes: changes.slice(0, 50), // Limit output
        });
      }

      case 'rebuild_index': {
        const before = eng.index.getAll().length;
        const startTime = Date.now();

        await eng.scanIndex();

        const after = eng.index.getAll().length;
        const duration = Date.now() - startTime;

        return jsonResult({
          vault: eng.entry.id,
          entities_before: before,
          entities_after: after,
          duration_ms: duration,
        });
      }

      case 'read_docs': {
        const { path, workspace } = args as { path: string; workspace?: string };

        if (workspace) {
          // Workspace-scoped read: confineExisting at ACCESS time (TOCTOU) +
          // doc-extension allowlist. Raw content result (no vault suffix —
          // the payload must stay byte-faithful).
          const root = await resolveWorkspaceRoot(eng, workspace);
          const real = confineExisting(nodePath.resolve(root, path), [root]);
          assertDocPath(real);
          const content = await nodeFsp.readFile(real, 'utf8');
          return { content: [{ type: 'text', text: content }] };
        }

        try {
          const content = await eng.fs.readFile(path);
          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `File not found: ${path}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'update_doc': {
        const { path, content, workspace } = args as { path: string; content: string; workspace?: string };

        if (workspace) {
          // Workspace-scoped write: target may not exist yet, so confine via
          // the deepest-existing-ancestor rule, then enforce the doc allowlist.
          const root = await resolveWorkspaceRoot(eng, workspace);
          const real = confinePath(nodePath.resolve(root, path), [root]);
          assertDocPath(real);
          await nodeFsp.mkdir(nodePath.dirname(real), { recursive: true });
          await nodeFsp.writeFile(real, content, 'utf8');
          return {
            content: [{ type: 'text', text: `Updated ${path} (workspace: ${workspace})\nVault: ${eng.entry.id}` }],
          };
        }

        try {
          await eng.fs.writeFile(path, content);
          return {
            content: [
              {
                type: 'text',
                text: `Updated ${path}\nVault: ${eng.entry.id}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error updating ${path}: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'list_files': {
        const { directory = '', pattern, recursive = false, workspace } = args as {
          directory?: string;
          pattern?: string;
          recursive?: boolean;
          workspace?: string;
        };

        const matchesPattern = (relativePath: string): boolean => {
          if (!pattern) return true;
          const filename = relativePath.split('/').pop() || '';
          // Convert glob pattern to regex (simple * → .* conversion)
          const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
          return filename.match(new RegExp(`^${regexPattern}$`)) !== null;
        };

        try {
          const files: string[] = [];

          if (workspace) {
            // Workspace-scoped listing: node:fs walk with per-entry re-confinement.
            const root = await resolveWorkspaceRoot(eng, workspace);
            const startDir = directory
              ? confineExisting(nodePath.resolve(root, directory), [root])
              : root;
            const all: string[] = [];
            await listWorkspaceFiles(root, startDir, recursive, all);
            for (const rel of all) {
              if (matchesPattern(rel)) files.push(rel);
            }
          } else {
            const scan = async (dir: string): Promise<void> => {
              const entries = await eng.fs.readDir(dir);
              for (const entry of entries) {
                if (entry.isDirectory && recursive) {
                  await scan(entry.path);
                } else if (!entry.isDirectory) {
                  // Match pattern against filename only, not full path
                  if (matchesPattern(entry.path)) {
                    files.push(entry.path);
                  }
                }
              }
            };
            await scan(directory);
          }

          return jsonResult({
            vault: eng.entry.id,
            ...(workspace && { workspace }),
            directory,
            pattern,
            count: files.length,
            files: files.slice(0, 100), // Limit output
          });
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error listing files: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      case 'analyze_project_state': {
        const { workstream: filterWorkstream, focus = 'both' } = args as {
          workstream?: string;
          focus?: 'blockers' | 'actions' | 'both';
        };

        await eng.scanIndex();
        const entities = eng.index.getAll().filter(e => !e.archived);

        const blockers: Array<{id: string; title: string; type: string; blocked_by: string[]}> = [];
        const suggestions: string[] = [];

        // Find blocked entities
        for (const entity of entities) {
          if (filterWorkstream && entity.workstream !== filterWorkstream) continue;

          if (entity.status === 'Blocked') {
            // depends_on lives on the full parsed entity (metadata is flat).
            const p = eng.index.getPathById(entity.id);
            const full = p ? eng.parser.parse(await eng.fs.readFile(p), p) : null;
            const blockedBy = (full?.relationships?.depends_on as string[]) || [];
            blockers.push({
              id: entity.id,
              title: entity.title,
              type: entity.type,
              blocked_by: blockedBy,
            });
          }
        }

        // Generate suggestions
        if (focus === 'actions' || focus === 'both') {
          const notStarted = entities.filter(e =>
            e.status === 'Not Started' &&
            (!filterWorkstream || e.workstream === filterWorkstream)
          );
          if (notStarted.length > 0) {
            suggestions.push(`${notStarted.length} entities are not started - consider prioritizing`);
          }

          const inProgress = entities.filter(e =>
            e.status === 'In Progress' &&
            (!filterWorkstream || e.workstream === filterWorkstream)
          );
          if (inProgress.length > 5) {
            suggestions.push(`${inProgress.length} entities in progress - consider reducing WIP`);
          }

          if (blockers.length > 0) {
            suggestions.push(`${blockers.length} entities are blocked - resolve dependencies`);
          }
        }

        return jsonResult({
          vault: eng.entry.id,
          health: blockers.length === 0 ? 'good' : blockers.length < 5 ? 'fair' : 'poor',
          blockers_count: blockers.length,
          blockers: blockers.slice(0, 20),
          suggested_actions: suggestions,
        });
      }

      case 'get_feature_coverage': {
        const { phase, tier } = args as {
          phase?: string;
          tier?: 'OSS' | 'Premium';
        };

        await eng.scanIndex();
        const featureMeta = eng.index.getAll().filter(e => e.type === 'feature' && !e.archived);

        // NOTE: index.getAll() returns EntityMetadata (no `relationships`/`fields`).
        // Re-parse each feature from disk so filters and coverage read real data.
        const features: RuntimeEntity[] = [];
        for (const meta of featureMeta) {
          const p = eng.index.getPathById(meta.id);
          if (!p) continue;
          try {
            features.push(eng.parser.parse(await eng.fs.readFile(p), p));
          } catch {
            continue;
          }
        }

        // Apply filters (from parsed fields). Phase is compared as a string:
        // YAML parses `phase: 4` as the number 4 while the schema enum and the
        // tool argument are strings ("4"), and both forms appear in real vaults.
        let filtered = features;
        if (phase !== undefined && phase !== null) {
          filtered = filtered.filter(f => String(f.fields?.phase) === String(phase));
        }
        if (tier) {
          filtered = filtered.filter(f => f.fields?.tier === tier);
        }

        let withImpl = 0;
        let withDoc = 0;
        const featureRows = filtered.map(f => {
          const implIds = (f.relationships?.implemented_by as string[]) || [];
          const docIds = (f.relationships?.documented_by as string[]) || [];

          const hasImpl = implIds.length > 0;
          const hasDoc = docIds.length > 0;

          if (hasImpl) withImpl++;
          if (hasDoc) withDoc++;

          return {
            id: f.id,
            title: f.title,
            phase: f.fields?.phase,
            tier: f.fields?.tier,
            has_implementation: hasImpl,
            has_documentation: hasDoc,
            implementation_count: implIds.length,
            documentation_count: docIds.length,
          };
        });

        return jsonResult({
          vault: eng.entry.id,
          total: filtered.length,
          with_implementation: withImpl,
          with_documentation: withDoc,
          features: featureRows,
        });
      }

      case 'validate_project': {
        const { workstream: filterWorkstream, entity_types } = args as {
          workstream?: string;
          entity_types?: string[];
        };

        await eng.scanIndex();
        let entities = eng.index.getAll().filter(e => !e.archived);

        // Apply filters
        if (filterWorkstream) {
          entities = entities.filter(e => e.workstream === filterWorkstream);
        }
        if (entity_types && entity_types.length > 0) {
          entities = entities.filter(e => entity_types.includes(e.type));
        }

        const violations: Array<{entity: string; rule: string; message: string}> = [];

        // ADVISORIES — soft fan-out guidelines derived from the ACTIVE schema's
        // relationship `validation.maxForwardTargets`/`maxReverseTargets`
        // (schema-derivation.getFanoutRules). Deliberately NOT enforced on
        // create/update writes. They flag entities whose relationship fan-out
        // makes the canvas/graph hard to read, with concrete reorganization
        // suggestions for the agent to reconcile over time.
        const fanoutRules = getFanoutRules(eng.activeSchema);

        // Rule-id stability: these four ids predate the schema-driven rules and
        // are pinned by integration tests + agent playbooks, and their rich
        // reorganization prose stays in code. Any OTHER schema-defined fan-out
        // rule gets a generated `<RELATIONSHIP>_<END>_FANOUT` id and a generic
        // suggestion. Limits always come from the schema, never from here.
        const LEGACY_FANOUT: Record<string, { rule: string; noun: string; suggestion: (limit: number) => string }> = {
          'documentation:forward': {
            rule: 'DOCUMENT_FANOUT',
            noun: 'features',
            suggestion: (limit) => `Split into focused documents so each documents at most ${limit} features: keep the ${limit} features this document is primarily about in \`documents\`, and move the rest into new per-feature (or per-cohesive-pair) documents that can carry \`previous_version\`/body links back to this one. On the canvas a document anchors to its FIRST documents-target, so wide fan-out also strands the document between distant feature clusters.`,
          },
          'decision-impact:forward': {
            rule: 'DECISION_FANOUT',
            noun: 'documents',
            suggestion: (limit) => `Point \`affects\` at the ${limit} documents that materially change because of this decision; for the others, record the impact in each document's body or split the decision into narrower per-scope decisions linked via \`supersedes\`/body references. Decisions position next to their first affected document, so long affects lists scatter meaning.`,
          },
          'documentation:reverse': {
            rule: 'FEATURE_DOC_FANOUT',
            noun: 'documents',
            suggestion: (limit) => `Unify the documentation into at most ${limit} documents: merge overlapping/partial specs into one current document, chain superseded versions via \`previous_version\` (a superseded document should drop its \`documents\` link to this feature), and keep only the documents this feature genuinely relies on (e.g. current spec + guide). Wide doc fan-in usually signals stale or duplicated specs rather than thorough coverage.`,
          },
          'implementation:reverse': {
            rule: 'FEATURE_IMPLEMENTER_FANOUT',
            noun: 'implementers',
            suggestion: (limit) => `Consolidate to at most ${limit} implementers: either designate one umbrella story/milestone as the primary implementer (demote the others' \`implements\` to \`affects\` or body references), or split the feature into sub-features so each has a small, honest implementer set. Only the first implementer positions the feature on the canvas; the rest are edge-only.`,
          },
        };
        const advisories: Array<{entity: string; rule: string; message: string; suggestion: string}> = [];

        // Hard required-parent rules from the schema (`validation.requiredForTypes`,
        // e.g. tasks/stories need a hierarchy parent) → ORPHANED_ENTITY violations.
        const requiredParentRules = getRequiredParentRules(eng.activeSchema);

        // NOTE: index.getAll() returns EntityMetadata (flat parent_id, no
        // `relationships`/`fields`). The rules below need the full relationship
        // map, so re-parse each entity from disk exactly like get_entity does.
        const hasRel = (v: unknown): boolean => Array.isArray(v) ? v.length > 0 : v != null && v !== '';
        const asList = (v: unknown): string[] =>
          Array.isArray(v) ? (v as string[]) : (v != null && v !== '' ? [v as string] : []);

        // VALID RELATIONSHIP SET — derived from the schema (single source of truth).
        // See schema-derivation.ts / default-schema.ts `positioning` metadata.
        const ALLOWED = eng.validationAllowList;
        // Every relationship field name in the ACTIVE schema (forward + reverse), so legacy
        // fields that are no longer valid are detected even if the parser parked them in
        // `passthrough` (an entity type the current schema doesn't treat as from/to).
        const REL_FIELDS = getAllRelationshipFieldNames(eng.activeSchema);

        for (const meta of entities) {
          const path = eng.index.getPathById(meta.id);
          if (!path) continue;
          let entity: RuntimeEntity;
          try {
            entity = eng.parser.parse(await eng.fs.readFile(path), path);
          } catch {
            continue; // skip unparseable files
          }

          // Rule: required-parent relationships (schema `validation.requiredForTypes` —
          // in the default schema: stories and tasks need a hierarchy parent).
          for (const req of requiredParentRules) {
            if (req.types.includes(entity.type) && !hasRel(entity.relationships?.[req.field])) {
              violations.push({
                entity: `${entity.id} (${entity.title})`,
                rule: 'ORPHANED_ENTITY',
                message: `${entity.type} missing ${req.field}`,
              });
            }
          }

          // Rule: enforce the valid relationship set (allowed fields + allowed target types).
          const allowedForType = ALLOWED[entity.type] || {};
          const relView: Record<string, unknown> = {
            ...((entity as unknown as { passthrough?: Record<string, unknown> }).passthrough || {}),
            ...(entity.relationships || {}),
          };
          for (const field of REL_FIELDS) {
            const val = relView[field];
            if (!hasRel(val)) continue;

            if (!(field in allowedForType)) {
              violations.push({
                entity: `${entity.id} (${entity.title})`,
                rule: 'INVALID_RELATIONSHIP',
                message: `${entity.type} should not have "${field}" relationship`,
              });
              continue;
            }

            // Field is allowed — verify each resolvable target is an allowed type.
            const okTypes = allowedForType[field];
            const badTargets: string[] = [];
            for (const targetId of asList(val)) {
              const target = eng.index.get(targetId);
              if (target && !okTypes.includes(target.type)) {
                badTargets.push(`${targetId} (${target.type})`);
              }
            }
            if (badTargets.length > 0) {
              violations.push({
                entity: `${entity.id} (${entity.title})`,
                rule: 'INVALID_RELATIONSHIP_TARGET',
                message: `${entity.type} "${field}" must target ${okTypes.join('/')} — invalid: ${badTargets.join(', ')}`,
              });
            }
          }

          // Advisories: fan-out limits from the schema (one rule per relationship end
          // carrying a `validation.maxForwardTargets`/`maxReverseTargets`).
          for (const fr of fanoutRules) {
            if (!fr.sourceTypes.includes(entity.type) && !fr.sourceTypes.includes('*')) continue;
            const targets = asList(relView[fr.field]);
            if (targets.length <= fr.limit) continue;
            const legacy = LEGACY_FANOUT[`${fr.relationship}:${fr.end}`];
            const rule = legacy?.rule
              ?? `${fr.relationship.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_${fr.end.toUpperCase()}_FANOUT`;
            advisories.push({
              entity: `${entity.id} (${entity.title})`,
              rule,
              message: `${entity.type} ${fr.field} ${targets.length} ${legacy?.noun ?? 'targets'} (limit ${fr.limit}): ${targets.join(', ')}`,
              suggestion: legacy
                ? legacy.suggestion(fr.limit)
                : `Reduce \`${fr.field}\` on this ${entity.type} to at most ${fr.limit} targets (schema advisory on the "${fr.relationship}" relationship): keep the primary targets in the field and move the rest into body references or narrower split-out entities.`,
            });
          }
        }

        return jsonResult({
          vault: eng.entry.id,
          entities_checked: entities.length,
          violations_count: violations.length,
          violations: violations.slice(0, 500),
          advisories_count: advisories.length,
          advisories: advisories.slice(0, 200),
          advisory_note: advisories.length > 0
            ? 'Advisories are non-blocking fan-out guidelines (not enforced on writes). Reconcile them over time using each suggestion — prefer small, reviewable re-organizations over bulk edits.'
            : undefined,
        });
      }

      case 'cleanup_completed': {
        const { milestone_id, dry_run = false } = args as {
          milestone_id?: string;
          dry_run?: boolean;
        };

        await eng.scanIndex();

        let milestones = eng.index.getAll().filter(e =>
          e.type === 'milestone' && e.status === 'Completed' && !e.archived
        );

        if (milestone_id) {
          milestones = milestones.filter(m => m.id === milestone_id);
        }

        // Candidates: completed stories/tasks under each completed milestone.
        const candidates: EntityMetadata[] = [];
        for (const milestone of milestones) {
          const children = eng.index.getAll().filter(e =>
            (e.type === 'story' || e.type === 'task') &&
            e.parent_id === milestone.id &&
            !e.archived
          );
          for (const child of children) {
            if (child.status === 'Completed') candidates.push(child);
          }
        }

        const stats = {
          milestones_processed: milestones.length,
          stories_archived: 0,
          tasks_archived: 0,
        };
        const archived: Array<{ id: string; from: string; to: string }> = [];
        const errors: string[] = [];

        if (dry_run) {
          // Preview counts only — nothing written.
          for (const c of candidates) {
            if (c.type === 'story') stats.stories_archived++;
            if (c.type === 'task') stats.tasks_archived++;
          }
        } else {
          // archiveEntity is copy → VERIFY → delete-original (fixes the old
          // block that wrote the archive copy but never removed the source —
          // NodeFsAdapter.deleteFile exists and is used now).
          for (const c of candidates) {
            try {
              const moved = await archiveEntity(eng, c.id);
              archived.push({ id: c.id, ...moved });
              if (c.type === 'story') stats.stories_archived++;
              if (c.type === 'task') stats.tasks_archived++;
            } catch (e) {
              errors.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }

        return jsonResult({
          vault: eng.entry.id,
          dry_run,
          ...stats,
          entities_to_archive: candidates.length,
          ...(archived.length > 0 && { archived }),
          ...(errors.length > 0 && { errors }),
        });
      }

      case 'manage_documents': {
        const { action, topic, workstream: filterWorkstream, document_id } = args as {
          action: 'get_decision_history' | 'check_freshness';
          topic?: string;
          workstream?: string;
          document_id?: string;
        };

        await eng.scanIndex();

        if (action === 'get_decision_history') {
          // Re-parse into full entities: the filter/map below reads `fields`
          // and `relationships`, which are absent from flat index metadata.
          const decisionMetas = eng.index.getAll().filter(e =>
            e.type === 'decision' && !e.archived
          );
          let decisions: RuntimeEntity[] = [];
          for (const meta of decisionMetas) {
            const p = eng.index.getPathById(meta.id);
            const ent = p ? eng.parser.parse(await eng.fs.readFile(p), p) : null;
            if (ent) decisions.push(ent);
          }

          if (topic) {
            const lowerTopic = topic.toLowerCase();
            decisions = decisions.filter(d =>
              d.title.toLowerCase().includes(lowerTopic) ||
              (d.fields?.context && String(d.fields.context).toLowerCase().includes(lowerTopic))
            );
          }

          if (filterWorkstream) {
            decisions = decisions.filter(d => d.workstream === filterWorkstream);
          }

          const history = decisions.map(d => ({
            id: d.id,
            title: d.title,
            status: d.status,
            workstream: d.workstream,
            created: d.created_at,
            affects: d.relationships?.affects || [],
          }));

          return jsonResult({
            vault: eng.entry.id,
            total: history.length,
            decisions: history,
          });
        } else if (action === 'check_freshness') {
          if (!document_id) {
            return {
              content: [{ type: 'text', text: 'document_id required for check_freshness' }],
              isError: true,
            };
          }

          const doc = eng.index.get(document_id);
          if (!doc) {
            return {
              content: [{ type: 'text', text: `Document ${document_id} not found` }],
              isError: true,
            };
          }

          // Check if there are newer decisions that might affect this document
          const docUpdated = new Date(doc.updated_at);
          const decisions = eng.index.getAll().filter(e =>
            e.type === 'decision' &&
            e.status === 'Decided' &&
            new Date(e.created_at) > docUpdated
          );

          const stale = decisions.length > 0;

          return jsonResult({
            vault: eng.entry.id,
            document_id,
            last_updated: doc.updated_at,
            is_stale: stale,
            newer_decisions_count: decisions.length,
            newer_decisions: decisions.slice(0, 5).map(d => ({
              id: d.id,
              title: d.title,
              created: d.created_at,
            })),
          });
        }

        return {
          content: [{ type: 'text', text: 'Invalid action' }],
          isError: true,
        };
      }

      case 'search_docs': {
        const {
          query,
          top_k,
          max_excerpt_chars,
          min_score,
          excerpt_budget,
          filters,
          include_scores,
          workspace,
        } = args as {
          query: string;
          top_k?: number;
          max_excerpt_chars?: number;
          min_score?: number;
          excerpt_budget?: {
            total_chars?: number;
            min_per_result?: number;
            max_per_result?: number;
          };
          filters?: {
            doc_uri_prefix?: string;
            doc_uris?: string[];
            heading_path_contains?: string;
          };
          include_scores?: boolean;
          workspace?: string;
        };

        if (workspace) {
          // Workspace scope: external docs are NOT in the vault's MSRL index —
          // bounded plain keyword scan over the confined subtree (.md/.canvas
          // only, symlink-escape safe via listWorkspaceFiles).
          const root = await resolveWorkspaceRoot(eng, workspace);
          const all: string[] = [];
          await listWorkspaceFiles(root, root, true, all);
          const docs = all.filter(f => f.endsWith('.md') || f.endsWith('.canvas')).slice(0, WS_SEARCH_MAX_FILES);
          const needle = query.toLowerCase();
          const limit = Math.min(top_k ?? 10, 100);
          const results: Array<{ path: string; excerpt: string }> = [];
          for (const rel of docs) {
            if (results.length >= limit) break;
            let real: string;
            try {
              real = confineExisting(nodePath.join(root, rel), [root]);
            } catch {
              continue;
            }
            assertDocPath(real);
            let text: string;
            try {
              text = await nodeFsp.readFile(real, 'utf8');
            } catch {
              continue;
            }
            const at = text.toLowerCase().indexOf(needle);
            if (at === -1) continue;
            const start = Math.max(0, at - 200);
            const end = Math.min(text.length, at + needle.length + 200);
            results.push({ path: rel, excerpt: text.slice(start, end) });
          }
          return jsonResult({
            vault: eng.entry.id,
            workspace,
            mode: 'keyword-scan',
            total_results: results.length,
            results,
          });
        }

        const engine = await getMsrl(eng);
        const result: QueryResult = await engine.query({
          query,
          topK: top_k,
          maxExcerptChars: max_excerpt_chars,
          minScore: min_score,
          excerptBudget: excerpt_budget
            ? {
                totalChars: excerpt_budget.total_chars,
                minPerResult: excerpt_budget.min_per_result,
                maxPerResult: excerpt_budget.max_per_result,
              }
            : undefined,
          filters: filters
            ? {
                docUriPrefix: filters.doc_uri_prefix,
                docUris: filters.doc_uris,
                headingPathContains: filters.heading_path_contains,
              }
            : undefined,
          debug: include_scores ? { includeScores: true } : undefined,
        });

        // Map camelCase results back to snake_case for MCP
        return jsonResult({
          vault: eng.entry.id,
          results: result.results.map((r) => ({
            doc_uri: r.docUri,
            heading_path: r.headingPath,
            excerpt: r.excerpt,
            excerpt_truncated: r.excerptTruncated,
            content_length: r.contentLength,
            allocated_budget: r.allocatedBudget,
            ...(include_scores && {
              score: r.score,
              vector_score: r.vectorScore,
              bm25_score: r.bm25Score,
            }),
          })),
          total_results: result.results.length,
          took_ms: result.meta.tookMs,
          budget_info: {
            total_chars_returned: result.meta.totalCharsReturned,
            total_chars_available: result.meta.totalCharsAvailable,
            budget_exhausted: result.meta.budgetExhausted,
            results_dropped_by_score: result.meta.resultsDroppedByScore,
            results_dropped_by_limit: result.meta.resultsDroppedByLimit,
          },
        });
      }

      case 'msrl_status': {
        const engine = await getMsrl(eng);
        const status: IndexStatus = engine.getStatus();

        return jsonResult({
          vault: eng.entry.id,
          state: status.state,
          snapshot_id: status.snapshotId,
          snapshot_timestamp: status.snapshotTimestamp,
          stats: status.stats,
          watcher: {
            enabled: status.watcher.enabled,
            debounce_ms: status.watcher.debounceMs,
          },
          ...(status.buildProgress && {
            build_progress: {
              phase: status.buildProgress.phase,
              files_processed: status.buildProgress.filesProcessed,
              total_files: status.buildProgress.totalFiles,
              chunks_processed: status.buildProgress.chunksProcessed,
              percent: status.buildProgress.percent,
              current_file: status.buildProgress.currentFile,
            },
          }),
        });
      }

      case 'list_workspaces': {
        const workspaces = await readWorkspaces(eng.fs);
        return jsonResult({
          vault: eng.entry.id,
          count: Object.keys(workspaces).length,
          workspaces,
        });
      }

      case 'add_workspace': {
        const { name: wsName, path: wsPath, description } = args as {
          name: string;
          path: string;
          description?: string;
        };
        if (!wsName || typeof wsName !== 'string') throw new Error(`add_workspace requires 'name'.`);
        if (!wsPath || typeof wsPath !== 'string') throw new Error(`add_workspace requires 'path'.`);
        // Registration-time confinement (D7) — the stored path is the
        // CONFINED canonical result, and every later access re-confines it.
        const allowed = (await registry.loadConfig()).allowedRoots;
        const updated = await addWorkspace(
          eng.fs,
          { name: wsName, path: wsPath, description },
          (p) => confinePath(p, allowed)
        );
        console.error(`add_workspace: '${wsName}' → ${updated[wsName].path} (vault ${eng.entry.id})`);
        return jsonResult({
          vault: eng.entry.id,
          name: wsName,
          path: updated[wsName].path,
          ...(description !== undefined && { description }),
        });
      }

      case 'remove_workspace': {
        const { name: wsName } = args as { name: string };
        if (!wsName || typeof wsName !== 'string') throw new Error(`remove_workspace requires 'name'.`);
        await removeWorkspace(eng.fs, wsName);
        console.error(`remove_workspace: '${wsName}' (vault ${eng.entry.id})`);
        return jsonResult({ vault: eng.entry.id, name: wsName, removed: true });
      }

      case 'entities': {
        const { action, ids, fields, ops, options } = args as {
          action: 'get' | 'batch';
          ids?: EntityId[];
          fields?: string[];
          ops?: Array<{
            client_id: string;
            op: 'create' | 'update' | 'archive';
            type?: EntityType;
            id?: EntityId;
            payload: Record<string, unknown>;
          }>;
          options?: {
            atomic?: boolean;
            dry_run?: boolean;
            include_entities?: boolean;
          };
        };

        if (action === 'get') {
          // GET ACTION: Fetch multiple entities
          if (!ids || ids.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: ids is required for get action' }],
              isError: true,
            };
          }

          await eng.scanIndex();

          const entities: RuntimeEntity[] = [];
          const notFound: EntityId[] = [];

          for (const id of ids) {
            const path = eng.index.getPathById(id);
            if (!path) {
              notFound.push(id);
              continue;
            }

            try {
              const content = await eng.fs.readFile(path);
              const entity = eng.parser.parse(content, path);

              // Apply field filtering if requested
              if (fields && fields.length > 0) {
                const filtered: Partial<RuntimeEntity> = { id: entity.id, type: entity.type };
                for (const field of fields) {
                  if (field in entity) {
                    (filtered as Record<string, unknown>)[field] = (entity as unknown as Record<string, unknown>)[field];
                  }
                }
                entities.push(filtered as RuntimeEntity);
              } else {
                entities.push(entity);
              }
            } catch (err) {
              notFound.push(id);
            }
          }

          return jsonResult({
            vault: eng.entry.id,
            entities,
            count: entities.length,
            ...(notFound.length > 0 && { not_found: notFound }),
          });
        } else if (action === 'batch') {
          // BATCH ACTION: Perform multiple operations
          if (!ops || ops.length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: ops is required for batch action' }],
              isError: true,
            };
          }

          const atomic = options?.atomic ?? false;
          const dryRun = options?.dry_run ?? false;
          const includeEntities = options?.include_entities ?? false;

          // Track client_id → real EntityId mapping
          const clientIdMap = new Map<string, EntityId>();
          const processedClientIds = new Set<string>();

          const results: Array<{
            client_id: string;
            success: boolean;
            id?: EntityId;
            error?: string;
            entity?: RuntimeEntity;
            changes?: Array<{ field: string; before: unknown; after: unknown }>;
            /** Pre-existing violations in fields this op did NOT touch (non-blocking). */
            warnings?: string[];
          }> = [];

          let succeeded = 0;
          let failed = 0;

          // Process each operation
          for (const operation of ops) {
            const { client_id, op, type, id, payload } = operation;

            // Check idempotency
            if (processedClientIds.has(client_id)) {
              results.push({
                client_id,
                success: true,
                id: clientIdMap.get(client_id),
              });
              continue;
            }

            try {
              if (op === 'create') {
                if (!type || !payload.title) {
                  throw new Error('type and payload.title are required for create operation');
                }

                // Accept-then-match (D8) — PER ITEM: a type/status that doesn't
                // match the resolved vault's schema rejects THIS op only (the
                // per-op catch reports it; valid sibling ops still run).
                assertEntityMatchesVault(eng.entry.id, eng.activeSchema, {
                  type,
                  status: typeof payload.status === 'string' ? payload.status : undefined,
                });

                if (dryRun) {
                  // Dry run: preview the entity that would be created
                  await eng.scanIndex();
                  const newId = await eng.allocator.allocate(type);

                  results.push({
                    client_id,
                    success: true,
                    id: newId,
                    changes: [
                      { field: 'op', before: null, after: 'create' },
                      { field: 'type', before: null, after: type },
                      { field: 'title', before: null, after: payload.title },
                    ],
                  });
                  succeeded++;
                } else {
                  // Actually create the entity
                  await eng.scanIndex();
                  const newId = await eng.allocator.allocate(type);

                  const now = new Date().toISOString();
                  const typeDef = eng.schema.getEntityType(type);

                  // Resolve cross-references in payload
                  const resolvedPayload = { ...payload };
                  for (const [key, value] of Object.entries(resolvedPayload)) {
                    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
                      const refClientId = value.slice(2, -2);
                      const refId = clientIdMap.get(refClientId);
                      if (refId) {
                        resolvedPayload[key] = refId;
                      }
                    }
                  }

                  const { workstream, status, relationships, ...customFields } = resolvedPayload;

                  // BUG 1: route flat relationship keys in the payload into
                  // relationships (explicit `relationships` entries win).
                  const split = splitFlatRelationshipKeys(eng.schema, type, customFields);
                  const mergedRelationships = {
                    ...split.relationships,
                    ...((relationships as Record<string, unknown>) ?? {}),
                  } as Record<string, EntityId | EntityId[]>;

                  // YAML sanitization
                  const sanitizedTitle = String(payload.title).replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();
                  const sanitizedCustomFields: Record<string, unknown> = {};
                  for (const [key, value] of Object.entries(split.rest)) {
                    if (typeof value === 'string') {
                      sanitizedCustomFields[key] = value.replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();
                    } else {
                      sanitizedCustomFields[key] = value;
                    }
                  }

                  const entity: RuntimeEntity = {
                    id: newId,
                    type,
                    title: sanitizedTitle,
                    status: (status as string) ?? typeDef?.statuses[0] ?? 'Not Started',
                    workstream: (workstream as string) ?? 'engineering',
                    created_at: now,
                    updated_at: now,
                    archived: false,
                    vault_path: '',
                    canvas_source: '',
                    fields: sanitizedCustomFields,
                    relationships: mergedRelationships,
                  };

                  const errors = eng.validator.validate(entity);
                  if (errors.length > 0) {
                    throw new Error(`Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
                  }

                  const content = eng.serializer.serialize(entity);
                  const filename = eng.pathResolver.generateFilename(newId, sanitizedTitle);
                  const folder = eng.pathResolver.getTypeFolderPath(type);
                  const filePath = `${folder}/${filename}`;

                  await eng.fs.writeFile(filePath, content);

                  clientIdMap.set(client_id, newId);
                  processedClientIds.add(client_id);

                  results.push({
                    client_id,
                    success: true,
                    id: newId,
                    ...(includeEntities && { entity }),
                  });
                  succeeded++;
                }
              } else if (op === 'update') {
                if (!id) {
                  throw new Error('id is required for update operation');
                }

                await eng.scanIndex();
                const path = eng.index.getPathById(id);
                if (!path) {
                  throw new Error(`Entity ${id} not found`);
                }

                const content = await eng.fs.readFile(path);
                const entity = eng.parser.parse(content, path);

                const changes: Array<{ field: string; before: unknown; after: unknown }> = [];

                // BUG 1: schema-driven routing for flat payload keys — same
                // rules as update_entity (relationship names → relationships,
                // per-type custom fields → fields; nested objects replace).
                const relNames = getRelationshipFieldNamesForType(eng.schema, entity.type);
                const customNames = new Set(eng.schema.getFields(entity.type).map(f => f.name));
                const currentValue = (key: string): unknown =>
                  key === 'body'
                    ? extractBody(content)
                    : key === 'relationships' || key === 'fields'
                      ? (entity as unknown as Record<string, unknown>)[key]
                      : relNames.has(key)
                        ? entity.relationships?.[key]
                        : customNames.has(key)
                          ? entity.fields?.[key]
                          : entity.passthrough && key in entity.passthrough
                            ? entity.passthrough[key]
                            : (entity as unknown as Record<string, unknown>)[key];

                if (dryRun) {
                  // Preview against the value that will ACTUALLY be written
                  // (relationship/custom-field keys read their routed slot).
                  for (const [key, value] of Object.entries(payload)) {
                    const before = currentValue(key);
                    if (JSON.stringify(before) !== JSON.stringify(value)) {
                      changes.push({ field: key, before, after: value });
                    }
                  }

                  results.push({
                    client_id,
                    success: true,
                    id,
                    changes,
                  });
                  succeeded++;
                } else {
                  // BUG 4: capture pre-existing violations before applying.
                  const errorsBefore = eng.validator.validate(entity);
                  const beforeKeys = new Set(errorsBefore.map(e => `${e.code}:${e.field}`));
                  const touched = new Set<string>();

                  // Apply updates (routed per the schema)
                  // BUG A: a string `body` replaces the markdown body on write.
                  let bodyUpdate: string | undefined;
                  for (const [key, value] of Object.entries(payload)) {
                    if (value === undefined) continue;
                    if (key === 'body') {
                      if (typeof value === 'string') bodyUpdate = value;
                      continue; // never leaks into frontmatter structures
                    }
                    if ((key === 'relationships' || key === 'fields') && value && typeof value === 'object' && !Array.isArray(value)) {
                      for (const k of Object.keys(value)) touched.add(k);
                      (entity as unknown as Record<string, unknown>)[key] = value;
                    } else if (relNames.has(key)) {
                      entity.relationships = {
                        ...(entity.relationships ?? {}),
                        [key]: value,
                      } as Record<string, EntityId | EntityId[]>;
                      touched.add(key);
                    } else if (customNames.has(key)) {
                      entity.fields = { ...(entity.fields ?? {}), [key]: value };
                      touched.add(key);
                    } else if (entity.passthrough && key in entity.passthrough) {
                      // BUG B: update passthrough-only keys in place; null /
                      // empty array DELETES the key (clear semantics).
                      if (isClearValue(value)) delete entity.passthrough[key];
                      else entity.passthrough[key] = value;
                      touched.add(key);
                    } else {
                      (entity as unknown as Record<string, unknown>)[key] = value;
                      touched.add(key);
                    }
                  }

                  entity.updated_at = new Date().toISOString();

                  // BUG 4: reject only problems in touched fields (or newly
                  // introduced); pre-existing untouched violations → warnings.
                  const errorsAfter = eng.validator.validate(entity);
                  const blocking = errorsAfter.filter(
                    e => touched.has(e.field) || !beforeKeys.has(`${e.code}:${e.field}`)
                  );
                  if (blocking.length > 0) {
                    throw new Error(`Validation failed: ${blocking.map(e => `${e.field}: ${e.message}`).join(', ')}`);
                  }
                  const warnings = errorsAfter
                    .filter(e => !blocking.includes(e))
                    .map(e => `${e.field}: ${e.message}`);

                  // BUG A: re-attach (or replace) the markdown body.
                  const newBody = bodyUpdate !== undefined ? normalizeBody(bodyUpdate) : extractBody(content);
                  const newContent = eng.serializer.serialize(entity) + newBody;
                  await eng.fs.writeFile(path, newContent);

                  results.push({
                    client_id,
                    success: true,
                    id,
                    ...(warnings.length > 0 && { warnings }),
                    ...(includeEntities && { entity }),
                  });
                  succeeded++;
                }
              } else if (op === 'archive') {
                if (!id) {
                  throw new Error('id is required for archive operation');
                }

                if (dryRun) {
                  results.push({
                    client_id,
                    success: true,
                    id,
                    changes: [{ field: 'archived', before: false, after: true }],
                  });
                  succeeded++;
                } else {
                  await eng.scanIndex();
                  const path = eng.index.getPathById(id);
                  if (!path) {
                    throw new Error(`Entity ${id} not found`);
                  }

                  const content = await eng.fs.readFile(path);
                  const entity = eng.parser.parse(content, path);

                  entity.archived = true;
                  entity.updated_at = new Date().toISOString();

                  // BUG A: preserve the markdown body across the archive rewrite.
                  const newContent = eng.serializer.serialize(entity) + extractBody(content);
                  await eng.fs.writeFile(path, newContent);

                  results.push({
                    client_id,
                    success: true,
                    id,
                    ...(includeEntities && { entity }),
                  });
                  succeeded++;
                }
              } else {
                throw new Error(`Invalid operation: ${op}`);
              }
            } catch (error) {
              failed++;
              results.push({
                client_id,
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });

              if (atomic) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Batch operation failed (atomic mode): ${error instanceof Error ? error.message : String(error)}\nRolled back all changes.`,
                    },
                  ],
                  isError: true,
                };
              }
            }
          }

          return jsonResult({
            vault: eng.entry.id,
            results,
            summary: {
              total: ops.length,
              succeeded,
              failed,
              dry_run: dryRun,
            },
          });
        } else {
          return {
            content: [{ type: 'text', text: `Error: Invalid action '${action}'. Valid actions: get, batch` }],
            isError: true,
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Graceful shutdown — every vault's MSRL instance (spec §10: iterate the map).
async function shutdown() {
  console.error('Shutting down...');
  for (const [id, pending] of msrlStarted) {
    try {
      const engine = await pending;
      await engine.shutdown();
      console.error(`MSRL engine shut down (vault '${id}')`);
    } catch {
      // Never let one vault's MSRL block process shutdown.
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Plugin installation bootstrap — the npm package that ships this MCP server
// (bin/mcp-server.mjs) ALSO contains the Obsidian plugin artifacts
// (manifest.json, main.js, styles.css at the package root), so a new vault
// doesn't need a separate download-and-extract step. The install itself is the
// parameterized ensurePluginInstalled(fs, artifactsDir) in vault-engine.ts;
// locating the artifacts is HOST-process state and stays here.
// ---------------------------------------------------------------------------

/**
 * The directory holding the plugin artifacts: the package root. When running
 * the published bundle this file lives at <pkg>/bin/mcp-server.mjs → parent
 * dir; when running from a repo checkout (tsx mcp.ts) it's the repo root
 * itself. Probe for manifest.json in the module's dir, then its parent.
 */
async function findPluginSourceDir(): Promise<string | null> {
  const { dirname, join } = await import('node:path');
  const { fileURLToPath: toPath } = await import('node:url');
  const { access } = await import('node:fs/promises');
  const here = dirname(toPath(import.meta.url));
  for (const candidate of [here, dirname(here)]) {
    try {
      await access(join(candidate, 'manifest.json'));
      await access(join(candidate, 'main.js'));
      return candidate;
    } catch { /* keep probing */ }
  }
  return null;
}

/**
 * Startup bootstrap for the legacy VAULT_PATH vault (absorbed into the
 * registry as a transient entry). Preserves the pre-multi-vault UX: on first
 * connect the vault gets schema.json (bootstrapped if missing), the default
 * canvas, and the bundled plugin — WITHOUT building a full engine (startup
 * stays light; engines are built lazily on first tool use). Vaults without
 * VAULT_PATH bootstrap through add_vault instead.
 */
async function bootstrapVaultPath(): Promise<void> {
  if (!VAULT_PATH) return;
  const fs = new NodeFsAdapter(VAULT_PATH);
  const schemaAbsPath = `${VAULT_PATH}/${SCHEMA_FILENAME}`;
  const result = await loadOrBootstrapSchema(fs, '');
  if (result.wroteDefault) {
    console.error(`Bootstrapped ${schemaAbsPath} from the default schema.`);
  }
  if (result.errors.length > 0) {
    console.error(`WARNING: ${SCHEMA_FILENAME} is invalid — falling back to the default schema. Errors:`);
    for (const e of result.errors) console.error(`  - ${e}`);
  } else {
    console.error(`Schema source: ${result.source} (${schemaAbsPath})`);
  }
  // The vault's default canvas is part of the bootstrap contract too.
  await ensureDefaultCanvas(fs, result.schema);
  // As is the plugin itself — the npm package carries the same artifacts.
  const artifactsDir = await findPluginSourceDir();
  if (artifactsDir) {
    await ensurePluginInstalled(fs, artifactsDir);
  } else {
    console.error('WARNING: plugin artifacts (manifest.json/main.js) not found next to the MCP server — skipping plugin install.');
  }
}

// Start the server
async function main() {
  // Legacy single-vault bootstrap (no-op when VAULT_PATH is unset — the
  // server then starts on the registry alone).
  await bootstrapVaultPath();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Obsidian Unified MCP Server started');
  console.error(
    VAULT_PATH
      ? `Vault path: ${VAULT_PATH}`
      : `No VAULT_PATH set — serving registered vaults from ${resolveConfigPath()} (use list_vaults / add_vault).`
  );
  console.error('Waiting for requests...');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
