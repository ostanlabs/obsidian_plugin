/**
 * MCP Server Mode Entry Point
 * 
 * This file provides the MCP protocol server powered by entity-core.
 * Run with: npm run dev:mcp or npm run build:mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NodeFsAdapter } from './src/adapters/node-fs-adapter.js';
import { SchemaRegistry } from './src/entity-core/schema-registry.js';
import { DEFAULT_SCHEMA } from './src/entity-core/default-schema.js';
import {
  buildValidationAllowList,
  buildReverseRelationMap,
  getAllRelationshipFieldNames,
  getRequiredParentRules,
  getFanoutRules,
} from './src/entity-core/schema-derivation.js';
import { loadOrBootstrapSchema, serializeSchema, validateSchema, SCHEMA_FILENAME } from './src/entity-core/schema-bootstrap.js';
import type { Schema } from './src/entity-core/types.js';
// Bundled as a raw string via esbuild `--loader:.html=text`. get_schema_designer
// injects the active schema by replacing the "__SCHEMA_PLACEHOLDER__" token.
// @ts-ignore
import DESIGNER_HTML_TEMPLATE from './schema-designer.html';
import { EntityParser } from './src/entity-core/parser.js';
import { EntitySerializer } from './src/entity-core/serializer.js';
import { EntityValidator } from './src/entity-core/validator.js';
import { IDAllocator, getEntityTypeFromId } from './src/entity-core/id-allocator.js';
import { PathResolver } from './src/entity-core/path-resolver.js';
import { SchemaMigrator } from './src/entity-core/migrator.js';
import { ProjectIndex } from './src/entity-core/project-index.js';
import type { RuntimeEntity, EntityType, EntityId, EntityMetadata } from './src/entity-core/types.js';
import { MsrlEngine, type QueryResult, type IndexStatus } from '@ostanlabs/md-retriever';

// Validate environment
const VAULT_PATH = process.env.VAULT_PATH;
if (!VAULT_PATH) {
  console.error('ERROR: VAULT_PATH environment variable is required');
  console.error('Usage: VAULT_PATH=/path/to/vault npm run dev:mcp');
  process.exit(1);
}

// Initialize the entity-core engine with Node.js filesystem adapter
const adapter = new NodeFsAdapter(VAULT_PATH);

// SINGLE SOURCE OF TRUTH: the active schema comes from <VAULT_PATH>/schema.json
// (bootstrapped from DEFAULT_SCHEMA on first run — see loadSchema() in main()).
// These are `let` so set_schema / (re)load can swap the active schema at runtime.
// The plugin positioning engine derives its rules from the SAME schema file.
let schema = new SchemaRegistry(DEFAULT_SCHEMA);
let parser = new EntityParser(schema);
let serializer = new EntitySerializer(schema);
let validator = new EntityValidator(schema);
let VALIDATION_ALLOWLIST = buildValidationAllowList(schema.getSchema());
let activeSchema: Schema = DEFAULT_SCHEMA;
let schemaSource: 'file' | 'default' = 'default';
let schemaErrors: string[] = [];

/** Rebuild every schema-derived engine object from a schema. */
function applySchema(s: Schema): void {
  schema = new SchemaRegistry(s);
  parser = new EntityParser(schema);
  serializer = new EntitySerializer(schema);
  validator = new EntityValidator(schema);
  VALIDATION_ALLOWLIST = buildValidationAllowList(s);
  // Path routing derives from the schema's entity-type folders/prefixes — without
  // this rebuild, create_entity of a type added via set_schema throws
  // "Unknown entity type" from the stale resolver.
  pathResolver = new PathResolver(schema, config);
  // Keep the index's reverse relationship map in sync with the active schema.
  index.setReverseRelationMap(buildReverseRelationMap(s));
  activeSchema = s;
}

// ---------------------------------------------------------------------------
// Schema-driven write-path routing (BUG-1 fix: flat relationship keys were a
// silent no-op — update assigned them outside entity.relationships and
// create/batch destructuring parked them as inert custom fields; both were
// then dropped by the schema-driven serializer).
// ---------------------------------------------------------------------------

/**
 * Relationship field names an entity of `type` may carry per the ACTIVE schema:
 * forward fields where the type is a pair's `from`, reverse fields where it is
 * the `to`. Per-type CUSTOM FIELDS SHADOW same-named relationship fields (e.g.
 * `decided_by` is a person string field on decisions, but the `affects` reverse
 * on documents), so routing stays unambiguous per type.
 */
function getRelationshipFieldNamesForType(type: string): Set<string> {
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
  type: string,
  input: Record<string, unknown>,
): { relationships: Record<string, unknown>; rest: Record<string, unknown> } {
  const relNames = getRelationshipFieldNamesForType(type);
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

const config = {
  vaultPath: VAULT_PATH,
  entitiesFolder: '', // Scan top-level type folders (tasks/, stories/, etc.)
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

/**
 * Recursively list files under a folder (readDir-based; [] when the folder is
 * missing). The archive folder nests by type/quarter (see archiveLayout and
 * cleanup_completed, which writes archive/<type>/…), so the flat listFiles()
 * scan silently missed archived entities in subfolders — BUG-3: they were then
 * unreachable by id ("Entity not found") for reads and updates alike.
 */
async function listFilesRecursive(folder: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await adapter.readDir(dir)) {
      if (entry.isDirectory) await walk(entry.path);
      else out.push(entry.path);
    }
  };
  await walk(folder);
  return out;
}

// `let` — rebuilt inside applySchema whenever the active schema changes.
let pathResolver = new PathResolver(schema, config);

// Initialize ProjectIndex
const index = new ProjectIndex();

// Helper: Build EntityMetadata from RuntimeEntity
function buildMetadata(entity: RuntimeEntity, filePath: string, mtimeMs: number): EntityMetadata {
  // Extract parent from relationships
  const parentRel = entity.relationships?.parent;
  const parent_id = Array.isArray(parentRel) ? parentRel[0] : parentRel;

  // Count children
  const childrenRel = entity.relationships?.children;
  const children_count = Array.isArray(childrenRel) ? childrenRel.length : (childrenRel ? 1 : 0);

  // Check if in progress
  const in_progress = entity.status === 'In Progress' || entity.status === 'In-progress';

  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    workstream: entity.workstream || '',
    status: entity.status,
    archived: entity.archived,
    in_progress,
    parent_id,
    children_count,
    priority: entity.fields?.priority as string | undefined,
    canvas_source: '', // Not applicable for MCP
    vault_path: filePath,
    file_mtime: mtimeMs,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };
}

// Helper: Scan and populate the index
async function scanIndex(): Promise<void> {
  index.clear();

  // Build list of folders to scan: archive + each entity type's folder from the
  // ACTIVE schema (custom types added via set_schema are scanned too).
  // Archive is scanned FIRST so that when a stale duplicate of an entity exists
  // in both a live type folder and archive/, the LIVE copy wins the id→path
  // mapping (index.set is last-writer-wins per id).
  const folders: string[] = [config.archiveFolder];
  for (const typeDef of schema.getAllEntityTypes()) {
    const folder = pathResolver.getTypeFolderPath(typeDef.type);
    if (!folders.includes(folder)) folders.push(folder);
  }

  // Scan all folders. Type folders are flat; archive/ nests by type/quarter,
  // so it is walked recursively — otherwise archived entities in subfolders
  // are invisible to the index and unreachable by id (BUG 3).
  for (const folder of folders) {
    try {
      const files = folder === config.archiveFolder
        ? await listFilesRecursive(folder)
        : await adapter.listFiles(folder);
      for (const filePath of files) {
        if (!filePath.endsWith('.md')) continue;
        try {
          const content = await adapter.readFile(filePath);
          const entity = parser.parse(content, filePath);

          // Get file stats for mtime
          const stat = await adapter.stat(filePath);
          const metadata = buildMetadata(entity, filePath, stat.mtimeMs);

          index.set(metadata);

          // Index relationships
          if (entity.relationships) {
            for (const [relType, targets] of Object.entries(entity.relationships)) {
              const targetIds = Array.isArray(targets) ? targets : [targets];
              for (const targetId of targetIds) {
                index.addRelationship(entity.id, relType, targetId);
              }
            }
          }
        } catch (err) {
          // Skip unparseable files
          if (process.env.DEBUG) {
            console.error(`Failed to parse ${filePath}:`, err);
          }
        }
      }
    } catch (err) {
      // Folder doesn't exist, skip
      if (process.env.DEBUG) {
        console.error(`Folder not found: ${folder}`, err);
      }
    }
  }
}

// Initialize MSRL Engine (lazy - created on first search)
let msrlEngine: MsrlEngine | null = null;

async function getMsrlEngine(): Promise<MsrlEngine> {
  if (!msrlEngine) {
    console.error('Initializing MSRL engine...');
    msrlEngine = await MsrlEngine.create({
      vaultRoot: VAULT_PATH!,
      logLevel: 'info',
    });
    console.error('MSRL engine initialized');
  }
  return msrlEngine;
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
      tools: {},
    },
  }
);

/**
 * Enum values of the feature `phase` field per the ACTIVE schema, so the
 * get_feature_coverage tool advertises values that can actually match vault
 * data. Falls back to the codified default (src/entity-core/default-schema.ts:
 * MVP|0|1|2|3|4|5) if the active schema has no enum values for it.
 */
function featurePhaseEnumValues(): string[] {
  const phaseField = schema.getFields('feature').find((f) => f.name === 'phase');
  if (phaseField?.values && phaseField.values.length > 0) {
    return phaseField.values;
  }
  return ['MVP', '0', '1', '2', '3', '4', '5'];
}

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_entity',
      description: 'Create a new entity (milestone, story, task, decision, document, or feature)',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'],
            description: 'The type of entity to create',
          },
          title: {
            type: 'string',
            description: 'The title of the entity',
          },
          properties: {
            type: 'object',
            description: 'Additional entity properties (status, workstream, relationships, etc.)',
          },
        },
        required: ['type', 'title'],
      },
    },
    {
      name: 'list_entities',
      description: 'List all entities or filter by type',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'],
            description: 'Optional: filter by entity type',
          },
        },
      },
    },
    {
      name: 'get_entity',
      description: 'Get an entity by ID',
      inputSchema: {
        type: 'object',
        properties: {
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
          id: {
            type: 'string',
            description: 'Entity ID to update',
          },
          updates: {
            type: 'object',
            description: 'Fields to update (title, status, workstream, relationships, etc.). A string "body" key replaces the markdown body below the frontmatter ("" clears it). Setting a passthrough-only key (a field not valid for this type) to null or [] deletes it from the file.',
          },
        },
        required: ['id', 'updates'],
      },
    },
    {
      name: 'get_schema',
      description: 'Get the active schema (from schema.json or the codified default), its source, and any validation errors. Beyond entity types and relationships, the schema carries validation rules (per-relationship requiredForTypes parent rules and maxForwardTargets/maxReverseTargets fan-out limits — validate_project derives its rule set from these), canvas positioning metadata, and settings (e.g. settings.defaultCanvas, the canvas file bootstrapped on startup).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'set_schema',
      description: 'Configure the vault\'s relationships/schema. Writes <vault>/schema.json (the single source of truth for both the MCP validator and the plugin positioning) and hot-reloads all schema-derived machinery (path routing, index scanning, validation). The schema also carries validation rules (requiredForTypes parent rules, fan-out limits) that validate_project derives its rules from, positioning metadata, and settings.defaultCanvas (bootstrapped if missing after a successful save). Provide a full "schema" object, or a "relationships" array to merge into the current schema. Invalid schemas are rejected and not saved.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'object', description: 'Full Schema object (entityTypes, relationships, settings, workstreams).' },
          relationships: { type: 'array', description: 'Relationships array to merge into the current schema (relationships-only edit).' },
        },
      },
    },
    {
      name: 'get_schema_designer',
      description: 'Return a self-contained HTML relationship designer, pre-populated with this vault\'s schema. Toggle relationships/pairs, then copy the result and apply it with set_schema.',
      inputSchema: {
        type: 'object',
        properties: {},
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
          query: { type: 'string', description: 'Search query (search mode)' },
          from_id: { type: 'string', description: 'Starting entity ID (navigation mode)' },
          direction: { type: 'string', enum: ['up', 'down', 'siblings', 'dependencies'], description: 'Navigation direction' },
          depth: { type: 'number', description: 'Traversal depth (default: 1)' },
          filters: {
            type: 'object',
            properties: {
              type: { type: 'array', items: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'] } },
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
          dry_run: { type: 'boolean', description: 'Preview changes without executing', default: false },
        },
      },
    },
    {
      name: 'rebuild_index',
      description: `Rebuild the in-memory entity index from scratch by re-scanning all vault files.

USE FOR: Fixing index inconsistencies, recovering from corrupted state.

RETURNS: entities_before, entities_after, duration_ms`,
      inputSchema: {
        type: 'object',
        properties: {},
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
          path: { type: 'string', description: 'Document path relative to vault root' },
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
          path: { type: 'string', description: 'Document path' },
          content: { type: 'string', description: 'New content' },
        },
        required: ['path', 'content'],
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
          directory: { type: 'string', description: 'Directory to list (default: vault root)' },
          pattern: { type: 'string', description: 'File pattern (e.g., *.md)' },
          recursive: { type: 'boolean', description: 'Search recursively', default: false },
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
          phase: { type: 'string', enum: featurePhaseEnumValues(), description: 'Filter by phase' },
          tier: { type: 'string', enum: ['OSS', 'Premium'], description: 'Filter by tier' },
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
          workstream: { type: 'string', description: 'Filter by workstream' },
          entity_types: {
            type: 'array',
            items: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'] },
            description: 'Filter to specific entity types',
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
2. Archive their completed stories/tasks
3. Return summary

EXAMPLES:
- "Clean up all completed milestones" → {}
- "Preview cleanup" → dry_run: true`,
      inputSchema: {
        type: 'object',
        properties: {
          milestone_id: { type: 'string', description: 'Optional milestone ID to clean up' },
          dry_run: { type: 'boolean', description: 'Preview without making changes', default: false },
        },
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
          action: {
            type: 'string',
            enum: ['get_decision_history', 'check_freshness'],
            description: 'The action to perform',
          },
          topic: { type: 'string', description: 'Filter by topic (for get_decision_history)' },
          workstream: { type: 'string', description: 'Filter by workstream (for get_decision_history)' },
          document_id: { type: 'string', description: 'Document ID (for check_freshness)' },
        },
        required: ['action'],
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

EXAMPLES:
- "Search for authentication implementation details"
- "Find documents about Kubernetes deployment" with min_score: 0.5 to filter noise
- Large budget search: excerpt_budget: { total_chars: 15000 }`,
      inputSchema: {
        type: 'object',
        properties: {
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
        properties: {},
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
                type: { type: 'string', enum: ['milestone', 'story', 'task', 'decision', 'document', 'feature'], description: 'Entity type (for create)' },
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
        required: ['action'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'create_entity': {
        const { type, title, properties = {} } = args as {
          type: EntityType;
          title: string;
          properties?: Record<string, unknown>;
        };

        // Rescan index to get latest IDs
        await scanIndex();

        // Allocate new ID
        const allocator = new IDAllocator(schema, index);
        const id = await allocator.allocate(type);

        // Build entity
        const now = new Date().toISOString();
        const typeDef = schema.getEntityType(type);

        // Separate base properties from custom fields and relationships
        const { workstream, status, relationships, ...customFields } = properties;

        // BUG 1: flat relationship keys (e.g. `implements: [...]` given directly
        // in properties) are routed into relationships instead of becoming inert
        // custom fields. Explicit `relationships` entries win on conflict.
        const split = splitFlatRelationshipKeys(type, customFields);
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
        const errors = validator.validate(entity);
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
        const content = serializer.serialize(entity);

        // Determine path
        const filename = pathResolver.generateFilename(id, title);
        const folder = pathResolver.getTypeFolderPath(type);
        const filePath = `${folder}/${filename}`;

        // Write file
        await adapter.writeFile(filePath, content);

        return {
          content: [
            {
              type: 'text',
              text: `Created ${type} ${id}: ${title}\nPath: ${filePath}`,
            },
          ],
        };
      }

      case 'list_entities': {
        const { type } = args as { type?: EntityType };

        // Rescan index
        await scanIndex();

        const allIds = index.getAllIds();
        let filteredIds = allIds;

        if (type) {
          filteredIds = allIds.filter(id => {
            try {
              return getEntityTypeFromId(id, schema) === type;
            } catch {
              return false;
            }
          });
        }

        // Load entities
        const entities: RuntimeEntity[] = [];
        for (const id of filteredIds) {
          const path = index.getPathById(id);
          if (!path) continue;

          try {
            const content = await adapter.readFile(path);
            const entity = parser.parse(content, path);
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
              text: `Found ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'}${type ? ` of type ${type}` : ''}:\n\n${summary}`,
            },
          ],
        };
      }

      case 'get_entity': {
        const { id } = args as { id: EntityId };

        // Rescan index
        await scanIndex();

        const path = index.getPathById(id);
        if (!path) {
          return {
            content: [
              {
                type: 'text',
                text: `Entity ${id} not found`,
              },
            ],
            isError: true,
          };
        }

        const content = await adapter.readFile(path);
        const entity = parser.parse(content, path);

        // Format as JSON for agents
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(entity, null, 2),
            },
          ],
        };
      }

      case 'update_entity': {
        const { id, updates } = args as { id: EntityId; updates: Record<string, unknown> };

        // Rescan index
        await scanIndex();

        const path = index.getPathById(id);
        if (!path) {
          return {
            content: [
              {
                type: 'text',
                text: `Entity ${id} not found`,
              },
            ],
            isError: true,
          };
        }

        // Load current entity
        const content = await adapter.readFile(path);
        const entity = parser.parse(content, path);

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
        const errorsBefore = validator.validate(entity);
        const beforeKeys = new Set(errorsBefore.map(e => `${e.code}:${e.field}`));

        // BUG 1: schema-driven routing — flat relationship keys go into
        // entity.relationships and flat custom-field keys into entity.fields
        // (Object.assign put both at top level, where the schema-driven
        // serializer silently dropped them). Nested `relationships`/`fields`
        // objects keep their existing whole-map-replace contract.
        const relNames = getRelationshipFieldNamesForType(entity.type);
        const customNames = new Set(schema.getFields(entity.type).map(f => f.name));
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
        const errorsAfter = validator.validate(entity);
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
        const newContent = serializer.serialize(entity) + body;
        await adapter.writeFile(path, newContent);

        return {
          content: [
            {
              type: 'text',
              text: warnings.length > 0
                ? `Updated ${id}: ${entity.title}\n${JSON.stringify({ warnings }, null, 2)}`
                : `Updated ${id}: ${entity.title}`,
            },
          ],
        };
      }

      case 'get_schema': {
        // Return the ACTIVE schema (from schema.json, or the codified default) plus
        // where it came from and any validation errors (surfaced, per config).
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                source: schemaSource,
                path: `${VAULT_PATH}/${SCHEMA_FILENAME}`,
                errors: schemaErrors,
                schema: activeSchema,
              }, null, 2),
            },
          ],
        };
      }

      case 'set_schema': {
        // Write the vault's schema.json (single source of truth) and hot-reload.
        // Accepts a FULL schema object, or a relationships[] array to merge into the
        // current schema (the designer UI edits relationships only).
        const { schema: fullSchema, relationships } = args as {
          schema?: Schema;
          relationships?: unknown[];
        };
        let candidate: Schema;
        if (fullSchema) {
          candidate = fullSchema;
        } else if (Array.isArray(relationships)) {
          candidate = { ...activeSchema, relationships } as Schema;
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

        // adapter is rooted at VAULT_PATH → write the RELATIVE filename.
        await adapter.writeFile(SCHEMA_FILENAME, serializeSchema(candidate));
        applySchema(candidate);
        schemaSource = 'file';
        schemaErrors = [];
        // If the new schema names a defaultCanvas that doesn't exist yet (or is
        // an empty file), bootstrap/repair it now — same step as server startup.
        await ensureDefaultCanvas();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              saved: true,
              path: `${VAULT_PATH}/${SCHEMA_FILENAME}`,
              entityTypes: candidate.entityTypes.length,
              relationships: candidate.relationships.length,
            }, null, 2),
          }],
        };
      }

      case 'get_schema_designer': {
        // Return the self-contained HTML relationship designer, pre-populated with
        // the vault's ACTIVE schema. Its "copy" output feeds set_schema.
        const html = (DESIGNER_HTML_TEMPLATE as string).replaceAll(
          '"__SCHEMA_PLACEHOLDER__"',
          JSON.stringify(activeSchema),
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
        await scanIndex();

        // index.get*/getAll return EntityMetadata (flat parent_id, no
        // relationships/fields). Downstream we only surface metadata fields, so
        // results is EntityMetadata[]; the full entity is re-parsed only where
        // relationships/fields are actually needed.
        let results: EntityMetadata[] = [];

        // Navigation mode
        if (from_id && direction) {
          const startPath = index.getPathById(from_id);
          const startEntity = startPath ? parser.parse(await adapter.readFile(startPath), startPath) : null;
          if (!startEntity) {
            return {
              content: [{ type: 'text', text: `Entity ${from_id} not found` }],
              isError: true,
            };
          }

          // Simple navigation implementation
          if (direction === 'down') {
            // Get children
            results = index.getAll().filter(e =>
              e.parent_id === from_id && !e.archived
            );
          } else if (direction === 'up') {
            // Get parent
            const parentId = startEntity.relationships?.parent;
            if (parentId) {
              const parent = index.get(parentId as string);
              if (parent) results = [parent];
            }
          } else if (direction === 'siblings') {
            // Get entities with same parent
            const parentId = startEntity.relationships?.parent;
            if (parentId) {
              results = index.getAll().filter(e =>
                e.parent_id === parentId && e.id !== from_id && !e.archived
              );
            }
          } else if (direction === 'dependencies') {
            // Get dependencies
            const depsIds = (startEntity.relationships?.depends_on as string[]) || [];
            results = depsIds.map(id => index.get(id)).filter(Boolean) as EntityMetadata[];
          }
        }
        // Search mode
        else if (query) {
          const lowerQuery = query.toLowerCase();
          const matched: EntityMetadata[] = [];
          for (const e of index.getAll()) {
            if (e.archived && !filters.archived) continue;
            let match =
              e.title.toLowerCase().includes(lowerQuery) ||
              e.id.toLowerCase().includes(lowerQuery);
            if (!match) {
              // Field values require the full parsed entity (metadata is flat).
              const p = index.getPathById(e.id);
              const ent = p ? parser.parse(await adapter.readFile(p), p) : null;
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
          results = index.getAll().filter(e => {
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total: results.length,
                results: formatted,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_project_overview': {
        const { include_completed = false, include_archived = false, workstream: filterWorkstream } = args as {
          include_completed?: boolean;
          include_archived?: boolean;
          workstream?: string;
        };

        await scanIndex();
        const entities = index.getAll();

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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ summary, workstreams }, null, 2),
            },
          ],
        };
      }

      case 'reconcile_relationships': {
        const { dry_run = false } = args as { dry_run?: boolean };

        await scanIndex();
        const metas = index.getAll();
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
          const p = index.getPathById(id);
          if (!p) return null;
          try {
            const raw = await adapter.readFile(p);
            const parsed = parser.parse(raw, p);
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
            names = getRelationshipFieldNamesForType(type);
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
            const targetMeta = index.get(targetId);
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

        const relationshipDefs = schema.getAllRelationships();
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
            const content = serializer.serialize(entity) + (bodies.get(entity.id) ?? '');
            // Write back to the entity's existing file path; only fall back to a
            // generated <ID>_<title> path for entities not yet in the index.
            // Recomputing unconditionally forks a duplicate file whenever the
            // vault's filename doesn't match the generated pattern.
            const existingPath = index.getPathById(entity.id);
            const filePath = existingPath ??
              `${pathResolver.getTypeFolderPath(entity.type)}/${pathResolver.generateFilename(entity.id, entity.title)}`;
            await adapter.writeFile(filePath, content);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                dry_run,
                changes_count: changes.length,
                changes: changes.slice(0, 50), // Limit output
              }, null, 2),
            },
          ],
        };
      }

      case 'rebuild_index': {
        const before = index.getAll().length;
        const startTime = Date.now();

        await scanIndex();

        const after = index.getAll().length;
        const duration = Date.now() - startTime;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                entities_before: before,
                entities_after: after,
                duration_ms: duration,
              }, null, 2),
            },
          ],
        };
      }

      case 'read_docs': {
        const { path } = args as { path: string };

        try {
          const content = await adapter.readFile(path);
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
        const { path, content } = args as { path: string; content: string };

        try {
          await adapter.writeFile(path, content);
          return {
            content: [
              {
                type: 'text',
                text: `Updated ${path}`,
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
        const { directory = '', pattern, recursive = false } = args as {
          directory?: string;
          pattern?: string;
          recursive?: boolean;
        };

        try {
          const files: string[] = [];

          async function scan(dir: string) {
            const entries = await adapter.readDir(dir);
            for (const entry of entries) {
              if (entry.isDirectory && recursive) {
                await scan(entry.path);
              } else if (!entry.isDirectory) {
                const relativePath = entry.path;
                // Match pattern against filename only, not full path
                if (!pattern) {
                  files.push(relativePath);
                } else {
                  const filename = relativePath.split('/').pop() || '';
                  // Convert glob pattern to regex (simple * → .* conversion)
                  const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
                  if (filename.match(new RegExp(`^${regexPattern}$`))) {
                    files.push(relativePath);
                  }
                }
              }
            }
          }

          await scan(directory);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  directory,
                  pattern,
                  count: files.length,
                  files: files.slice(0, 100), // Limit output
                }, null, 2),
              },
            ],
          };
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

        await scanIndex();
        const entities = index.getAll().filter(e => !e.archived);

        const blockers: Array<{id: string; title: string; type: string; blocked_by: string[]}> = [];
        const suggestions: string[] = [];

        // Find blocked entities
        for (const entity of entities) {
          if (filterWorkstream && entity.workstream !== filterWorkstream) continue;

          if (entity.status === 'Blocked') {
            // depends_on lives on the full parsed entity (metadata is flat).
            const p = index.getPathById(entity.id);
            const full = p ? parser.parse(await adapter.readFile(p), p) : null;
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                health: blockers.length === 0 ? 'good' : blockers.length < 5 ? 'fair' : 'poor',
                blockers_count: blockers.length,
                blockers: blockers.slice(0, 20),
                suggested_actions: suggestions,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_feature_coverage': {
        const { phase, tier } = args as {
          phase?: string;
          tier?: 'OSS' | 'Premium';
        };

        await scanIndex();
        const featureMeta = index.getAll().filter(e => e.type === 'feature' && !e.archived);

        // NOTE: index.getAll() returns EntityMetadata (no `relationships`/`fields`).
        // Re-parse each feature from disk so filters and coverage read real data.
        const features: RuntimeEntity[] = [];
        for (const meta of featureMeta) {
          const p = index.getPathById(meta.id);
          if (!p) continue;
          try {
            features.push(parser.parse(await adapter.readFile(p), p));
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

        const coverage = {
          total: filtered.length,
          with_implementation: withImpl,
          with_documentation: withDoc,
          features: featureRows,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(coverage, null, 2),
            },
          ],
        };
      }

      case 'validate_project': {
        const { workstream: filterWorkstream, entity_types } = args as {
          workstream?: string;
          entity_types?: string[];
        };

        await scanIndex();
        let entities = index.getAll().filter(e => !e.archived);

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
        const fanoutRules = getFanoutRules(activeSchema);

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
        const requiredParentRules = getRequiredParentRules(activeSchema);

        // NOTE: index.getAll() returns EntityMetadata (flat parent_id, no
        // `relationships`/`fields`). The rules below need the full relationship
        // map, so re-parse each entity from disk exactly like get_entity does.
        const hasRel = (v: unknown): boolean => Array.isArray(v) ? v.length > 0 : v != null && v !== '';
        const asList = (v: unknown): string[] =>
          Array.isArray(v) ? (v as string[]) : (v != null && v !== '' ? [v as string] : []);

        // VALID RELATIONSHIP SET — derived from the schema (single source of truth).
        // See schema-derivation.ts / default-schema.ts `positioning` metadata.
        const ALLOWED = VALIDATION_ALLOWLIST;
        // Every relationship field name in the ACTIVE schema (forward + reverse), so legacy
        // fields that are no longer valid are detected even if the parser parked them in
        // `passthrough` (an entity type the current schema doesn't treat as from/to).
        const REL_FIELDS = getAllRelationshipFieldNames(activeSchema);

        for (const meta of entities) {
          const path = index.getPathById(meta.id);
          if (!path) continue;
          let entity: RuntimeEntity;
          try {
            entity = parser.parse(await adapter.readFile(path), path);
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
              const target = index.get(targetId);
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

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                entities_checked: entities.length,
                violations_count: violations.length,
                violations: violations.slice(0, 500),
                advisories_count: advisories.length,
                advisories: advisories.slice(0, 200),
                advisory_note: advisories.length > 0
                  ? 'Advisories are non-blocking fan-out guidelines (not enforced on writes). Reconcile them over time using each suggestion — prefer small, reviewable re-organizations over bulk edits.'
                  : undefined,
              }, null, 2),
            },
          ],
        };
      }

      case 'cleanup_completed': {
        const { milestone_id, dry_run = false } = args as {
          milestone_id?: string;
          dry_run?: boolean;
        };

        await scanIndex();

        let milestones = index.getAll().filter(e =>
          e.type === 'milestone' && e.status === 'Completed' && !e.archived
        );

        if (milestone_id) {
          milestones = milestones.filter(m => m.id === milestone_id);
        }

        // Each archive candidate carries its original markdown body so the
        // archive copy keeps it (BUG A: frontmatter-only writes destroyed it).
        const toArchive: Array<{ entity: RuntimeEntity; body: string }> = [];
        const stats = {
          milestones_processed: milestones.length,
          stories_archived: 0,
          tasks_archived: 0,
        };

        for (const milestone of milestones) {
          // Find all stories and tasks under this milestone
          const children = index.getAll().filter(e =>
            (e.type === 'story' || e.type === 'task') &&
            e.parent_id === milestone.id &&
            !e.archived
          );

          for (const child of children) {
            if (child.status === 'Completed') {
              // Archiving re-serializes the entity, so load the full parsed form.
              const cp = index.getPathById(child.id);
              const raw = cp ? await adapter.readFile(cp) : null;
              const full = raw && cp ? parser.parse(raw, cp) : null;
              if (!full || !raw) continue;
              toArchive.push({ entity: full, body: extractBody(raw) });
              if (child.type === 'story') stats.stories_archived++;
              if (child.type === 'task') stats.tasks_archived++;
            }
          }
        }

        if (!dry_run && toArchive.length > 0) {
          for (const { entity, body } of toArchive) {
            const updated = { ...entity, archived: true };
            const content = serializer.serialize(updated) + body;

            // Move to archive folder
            const archiveFolder = 'archive';
            const typeFolder = pathResolver.getTypeFolderPath(entity.type);
            const filename = pathResolver.generateFilename(entity.id, entity.title);

            const archivePath = `${archiveFolder}/${typeFolder.split('/').pop()}/${filename}`;
            await adapter.writeFile(archivePath, content);

            // Remove from original location
            const originalPath = `${typeFolder}/${filename}`;
            try {
              // Note: NodeFsAdapter doesn't have delete, so we just write to archive
              // The original file would need manual cleanup or a delete method added
            } catch (e) {
              // Ignore if original doesn't exist
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                dry_run,
                ...stats,
                entities_to_archive: toArchive.length,
              }, null, 2),
            },
          ],
        };
      }

      case 'manage_documents': {
        const { action, topic, workstream: filterWorkstream, document_id } = args as {
          action: 'get_decision_history' | 'check_freshness';
          topic?: string;
          workstream?: string;
          document_id?: string;
        };

        await scanIndex();

        if (action === 'get_decision_history') {
          // Re-parse into full entities: the filter/map below reads `fields`
          // and `relationships`, which are absent from flat index metadata.
          const decisionMetas = index.getAll().filter(e =>
            e.type === 'decision' && !e.archived
          );
          let decisions: RuntimeEntity[] = [];
          for (const meta of decisionMetas) {
            const p = index.getPathById(meta.id);
            const ent = p ? parser.parse(await adapter.readFile(p), p) : null;
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

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  total: history.length,
                  decisions: history,
                }, null, 2),
              },
            ],
          };
        } else if (action === 'check_freshness') {
          if (!document_id) {
            return {
              content: [{ type: 'text', text: 'document_id required for check_freshness' }],
              isError: true,
            };
          }

          const doc = index.get(document_id);
          if (!doc) {
            return {
              content: [{ type: 'text', text: `Document ${document_id} not found` }],
              isError: true,
            };
          }

          // Check if there are newer decisions that might affect this document
          const docUpdated = new Date(doc.updated_at);
          const decisions = index.getAll().filter(e =>
            e.type === 'decision' &&
            e.status === 'Decided' &&
            new Date(e.created_at) > docUpdated
          );

          const stale = decisions.length > 0;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  document_id,
                  last_updated: doc.updated_at,
                  is_stale: stale,
                  newer_decisions_count: decisions.length,
                  newer_decisions: decisions.slice(0, 5).map(d => ({
                    id: d.id,
                    title: d.title,
                    created: d.created_at,
                  })),
                }, null, 2),
              },
            ],
          };
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
        };

        const engine = await getMsrlEngine();
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
        const output = {
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
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        };
      }

      case 'msrl_status': {
        const engine = await getMsrlEngine();
        const status: IndexStatus = engine.getStatus();

        const output = {
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
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        };
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

          await scanIndex();

          const entities: RuntimeEntity[] = [];
          const notFound: EntityId[] = [];

          for (const id of ids) {
            const path = index.getPathById(id);
            if (!path) {
              notFound.push(id);
              continue;
            }

            try {
              const content = await adapter.readFile(path);
              const entity = parser.parse(content, path);

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

          const output = {
            entities,
            count: entities.length,
            ...(notFound.length > 0 && { not_found: notFound }),
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          };
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

                if (dryRun) {
                  // Dry run: preview the entity that would be created
                  await scanIndex();
                  const allocator = new IDAllocator(schema, index);
                  const newId = await allocator.allocate(type);

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
                  await scanIndex();
                  const allocator = new IDAllocator(schema, index);
                  const newId = await allocator.allocate(type);

                  const now = new Date().toISOString();
                  const typeDef = schema.getEntityType(type);

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
                  const split = splitFlatRelationshipKeys(type, customFields);
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

                  const errors = validator.validate(entity);
                  if (errors.length > 0) {
                    throw new Error(`Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
                  }

                  const content = serializer.serialize(entity);
                  const filename = pathResolver.generateFilename(newId, sanitizedTitle);
                  const folder = pathResolver.getTypeFolderPath(type);
                  const filePath = `${folder}/${filename}`;

                  await adapter.writeFile(filePath, content);

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

                await scanIndex();
                const path = index.getPathById(id);
                if (!path) {
                  throw new Error(`Entity ${id} not found`);
                }

                const content = await adapter.readFile(path);
                const entity = parser.parse(content, path);

                const changes: Array<{ field: string; before: unknown; after: unknown }> = [];

                // BUG 1: schema-driven routing for flat payload keys — same
                // rules as update_entity (relationship names → relationships,
                // per-type custom fields → fields; nested objects replace).
                const relNames = getRelationshipFieldNamesForType(entity.type);
                const customNames = new Set(schema.getFields(entity.type).map(f => f.name));
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
                  const errorsBefore = validator.validate(entity);
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
                  const errorsAfter = validator.validate(entity);
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
                  const newContent = serializer.serialize(entity) + newBody;
                  await adapter.writeFile(path, newContent);

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
                  await scanIndex();
                  const path = index.getPathById(id);
                  if (!path) {
                    throw new Error(`Entity ${id} not found`);
                  }

                  const content = await adapter.readFile(path);
                  const entity = parser.parse(content, path);

                  entity.archived = true;
                  entity.updated_at = new Date().toISOString();

                  // BUG A: preserve the markdown body across the archive rewrite.
                  const newContent = serializer.serialize(entity) + extractBody(content);
                  await adapter.writeFile(path, newContent);

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

          const output = {
            results,
            summary: {
              total: ops.length,
              succeeded,
              failed,
              dry_run: dryRun,
            },
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          };
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

// Graceful shutdown
async function shutdown() {
  console.error('Shutting down...');
  if (msrlEngine) {
    await msrlEngine.shutdown();
    console.error('MSRL engine shut down');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// The NodeFsAdapter is rooted at VAULT_PATH, so schema.json is addressed relative
// to it (''); this is the absolute path only for human-readable logs/output.
const SCHEMA_ABS_PATH = `${VAULT_PATH}/${SCHEMA_FILENAME}`;

// Valid empty canvas JSON (2-space indent + trailing newline) — what the
// bootstrap/repair writes so the plugin's "populate from vault" has a real file.
const EMPTY_CANVAS_JSON = JSON.stringify({ nodes: [], edges: [] }, null, 2) + '\n';

/**
 * Ensure the ACTIVE schema's `settings.defaultCanvas` (fallback:
 * 'projects/Project.canvas') exists and holds valid canvas JSON:
 *   - missing              → create parent folder + write the empty canvas
 *   - empty/whitespace-only → repair by rewriting the empty canvas
 *   - has content          → leave untouched
 * Never throws — canvas bootstrap must not block the server (mirrors the
 * schema bootstrap's stderr logging).
 */
async function ensureDefaultCanvas(): Promise<void> {
  const canvasPath = activeSchema.settings?.defaultCanvas || 'projects/Project.canvas';
  try {
    if (await adapter.exists(canvasPath)) {
      const content = await adapter.readFile(canvasPath);
      if (content.trim() !== '') return; // real content — leave untouched
      await adapter.writeFile(canvasPath, EMPTY_CANVAS_JSON);
      console.error(`Repaired empty canvas ${VAULT_PATH}/${canvasPath} (rewrote valid empty canvas JSON).`);
      return;
    }
    const parentDir = canvasPath.includes('/') ? canvasPath.slice(0, canvasPath.lastIndexOf('/')) : '';
    if (parentDir) {
      await adapter.createDir(parentDir, { recursive: true });
    }
    await adapter.writeFile(canvasPath, EMPTY_CANVAS_JSON);
    console.error(`Bootstrapped ${VAULT_PATH}/${canvasPath} (empty canvas).`);
  } catch (e) {
    console.error(`WARNING: could not ensure default canvas ${canvasPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Plugin installation bootstrap — the npm package that ships this MCP server
// (bin/mcp-server.mjs) ALSO contains the Obsidian plugin artifacts
// (manifest.json, main.js, styles.css at the package root), so a new vault
// doesn't need a separate download-and-extract step: the server copies the
// plugin into <vault>/.obsidian/plugins/<id>/ on startup.
// ---------------------------------------------------------------------------

/**
 * The directory holding the plugin artifacts: the package root. When running
 * the published bundle this file lives at <pkg>/bin/mcp-server.mjs → parent
 * dir; when running from a repo checkout (tsx mcp.ts) it's the repo root
 * itself. Probe for manifest.json in the module's dir, then its parent.
 */
async function findPluginSourceDir(): Promise<string | null> {
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { access } = await import('node:fs/promises');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [here, dirname(here)]) {
    try {
      await access(join(candidate, 'manifest.json'));
      await access(join(candidate, 'main.js'));
      return candidate;
    } catch { /* keep probing */ }
  }
  return null;
}

/** '1.8.99' vs '1.9.0' → negative/zero/positive (numeric per-segment compare). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Install (or upgrade) the bundled Obsidian plugin into the vault:
 *   - not installed            → copy manifest.json/main.js/styles.css into
 *                                .obsidian/plugins/<id>/ and register the id in
 *                                .obsidian/community-plugins.json
 *   - installed, older version → overwrite the artifacts (upgrade); the user's
 *                                data.json settings are never touched
 *   - installed, same or newer → leave untouched
 * Never throws — like the schema/canvas bootstrap, this must not block the
 * server. Obsidian may still ask the user to trust the vault / leave
 * restricted mode the first time; that confirmation can't be done from disk.
 */
async function ensurePluginInstalled(): Promise<void> {
  try {
    const { join } = await import('node:path');
    const { readFile: nodeReadFile } = await import('node:fs/promises');
    const sourceDir = await findPluginSourceDir();
    if (!sourceDir) {
      console.error('WARNING: plugin artifacts (manifest.json/main.js) not found next to the MCP server — skipping plugin install.');
      return;
    }
    const manifestRaw = await nodeReadFile(join(sourceDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw) as { id?: string; version?: string };
    if (!manifest.id || !manifest.version) {
      console.error('WARNING: bundled manifest.json has no id/version — skipping plugin install.');
      return;
    }

    // adapter is rooted at VAULT_PATH → vault-relative paths.
    const pluginDir = `.obsidian/plugins/${manifest.id}`;
    const installedManifestPath = `${pluginDir}/manifest.json`;
    if (await adapter.exists(installedManifestPath)) {
      try {
        const installed = JSON.parse(await adapter.readFile(installedManifestPath)) as { version?: string };
        if (installed.version && compareVersions(installed.version, manifest.version) >= 0) {
          return; // same or newer already installed — leave untouched
        }
      } catch { /* unreadable installed manifest → reinstall */ }
    }

    await adapter.createDir(pluginDir, { recursive: true });
    await adapter.writeFile(installedManifestPath, manifestRaw);
    await adapter.writeFile(`${pluginDir}/main.js`, await nodeReadFile(join(sourceDir, 'main.js'), 'utf8'));
    try {
      await adapter.writeFile(`${pluginDir}/styles.css`, await nodeReadFile(join(sourceDir, 'styles.css'), 'utf8'));
    } catch { /* styles.css is optional */ }

    // Register in community-plugins.json so Obsidian enables it on next load
    // (preserving any other enabled plugins).
    const communityPath = '.obsidian/community-plugins.json';
    let enabled: string[] = [];
    if (await adapter.exists(communityPath)) {
      try {
        const parsed = JSON.parse(await adapter.readFile(communityPath));
        if (Array.isArray(parsed)) enabled = parsed;
      } catch { /* malformed → rewrite with just our id below */ }
    }
    if (!enabled.includes(manifest.id)) {
      enabled.push(manifest.id);
      await adapter.writeFile(communityPath, JSON.stringify(enabled, null, 2) + '\n');
    }
    console.error(`Installed plugin ${manifest.id} v${manifest.version} into ${VAULT_PATH}/${pluginDir} (and enabled it in community-plugins.json).`);
  } catch (e) {
    console.error(`WARNING: could not install the bundled plugin: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Load (or bootstrap-inject) <VAULT_PATH>/schema.json and apply it. */
async function loadSchema(): Promise<void> {
  const result = await loadOrBootstrapSchema(adapter, '');
  applySchema(result.schema);
  schemaSource = result.source;
  schemaErrors = result.errors;
  if (result.wroteDefault) {
    console.error(`Bootstrapped ${SCHEMA_ABS_PATH} from the default schema.`);
  }
  if (result.errors.length > 0) {
    console.error(`WARNING: ${SCHEMA_FILENAME} is invalid — falling back to the default schema. Errors:`);
    for (const e of result.errors) console.error(`  - ${e}`);
  } else {
    console.error(`Schema source: ${result.source} (${SCHEMA_ABS_PATH})`);
  }
  // The vault's default canvas is part of the bootstrap contract too.
  await ensureDefaultCanvas();
  // As is the plugin itself — the npm package carries the same artifacts.
  await ensurePluginInstalled();
}

// Start the server
async function main() {
  // Single source of truth: read/inject schema.json BEFORE serving any requests.
  await loadSchema();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Obsidian Unified MCP Server started');
  console.error(`Vault path: ${VAULT_PATH}`);
  console.error('Waiting for requests...');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

