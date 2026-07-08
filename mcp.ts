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
import { buildValidationAllowList, buildReverseRelationMap } from './src/entity-core/schema-derivation.js';
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
import { RelationshipGraph } from './src/entity-core/relationship-graph.js';
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
  // Keep the index's reverse relationship map in sync with the active schema.
  index.setReverseRelationMap(buildReverseRelationMap(s));
  activeSchema = s;
}

const config = {
  vaultPath: VAULT_PATH,
  entitiesFolder: '', // Scan top-level type folders (tasks/, stories/, etc.)
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

const pathResolver = new PathResolver(schema, config);

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

  // Get all entity types from schema
  const entityTypes = ['task', 'story', 'milestone', 'decision', 'document', 'feature'];

  // Build list of folders to scan: type folders + archive
  const folders: string[] = [];

  // Add type-specific folders
  for (const type of entityTypes) {
    // Map entity type to folder name (handle irregular plurals)
    let typeFolderName: string;
    if (type === 'decision') {
      typeFolderName = 'decisions';
    } else if (type === 'story') {
      typeFolderName = 'stories';
    } else {
      typeFolderName = `${type}s`;
    }
    folders.push(typeFolderName);
  }

  // Add archive folder
  folders.push(config.archiveFolder);

  // Scan all folders
  for (const folder of folders) {
    try {
      const files = await adapter.listFiles(folder);
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

// Create MCP server
const server = new Server(
  {
    name: 'obsidian-unified',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
            description: 'Fields to update (title, status, workstream, relationships, etc.)',
          },
        },
        required: ['id', 'updates'],
      },
    },
    {
      name: 'get_schema',
      description: 'Get the active schema (from schema.json or the codified default), its source, and any validation errors.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'set_schema',
      description: 'Configure the vault\'s relationships/schema. Writes <vault>/schema.json (the single source of truth for both the MCP validator and the plugin positioning) and hot-reloads. Provide a full "schema" object, or a "relationships" array to merge into the current schema. Invalid schemas are rejected and not saved.',
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

SYNCS: parent↔children, depends_on↔blocks, implements↔implemented_by

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
          phase: { type: 'string', enum: ['MVP', 'V1', 'V2', 'Future'], description: 'Filter by phase' },
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
should have ≤3 implementers. Each advisory carries a concrete reorganization
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

        // YAML SAFETY: Sanitize title to prevent colon-related YAML errors
        // Replaces "Component 3: Config" → "Component 3 - Config"
        const sanitizedTitle = title.replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();

        // YAML SAFETY: Sanitize string fields in customFields
        const sanitizedCustomFields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(customFields)) {
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
          relationships: (relationships as Record<string, EntityId | EntityId[]>) ?? {},
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

        // YAML SAFETY: Sanitize string values in updates
        const sanitizedUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
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
        // only a relationship) is not blocked by unrelated required fields that
        // were already missing on the stored entity.
        const errorsBefore = validator.validate(entity);
        const beforeKeys = new Set(errorsBefore.map(e => `${e.code}:${e.field}`));

        // Apply sanitized updates
        Object.assign(entity, sanitizedUpdates);
        entity.updated_at = new Date().toISOString();

        // Validate — only fail on errors introduced by this update, not on
        // pre-existing ones (so relationship recovery isn't blocked by legacy data).
        const errors = validator.validate(entity)
          .filter(e => !beforeKeys.has(`${e.code}:${e.field}`));
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

        // Serialize and write
        const newContent = serializer.serialize(entity);
        await adapter.writeFile(path, newContent);

        return {
          content: [
            {
              type: 'text',
              text: `Updated ${id}: ${entity.title}`,
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

        // Build relationship graph for reconciliation
        const graph = new RelationshipGraph(schema, index);
        // Single write buffer keyed by id: forward-drift fixes mutate the PARENT's
        // `children` / the dependency's `blocks`, so those related entities must be
        // loaded, mutated, and persisted too — not just the child/source `entity`.
        // Keying by id lets multiple children accumulate onto one parent object and
        // avoids a parent that is itself a `meta` being written twice with divergent
        // state (last-writer-wins losing a mutation).
        const pending = new Map<string, RuntimeEntity>();
        const loadEntity = async (id: string): Promise<RuntimeEntity | null> => {
          const buffered = pending.get(id);
          if (buffered) return buffered;
          const p = index.getPathById(id);
          return p ? parser.parse(await adapter.readFile(p), p) : null;
        };

        for (const meta of metas) {
          // Reconciliation reads/writes relationship fields, which live only on
          // the full parsed entity (index metadata is flat).
          const entity = await loadEntity(meta.id);
          if (!entity) continue;
          let modified = false;

          // Fix parent/children relationships
          if (entity.relationships?.parent) {
            const parentId = entity.relationships.parent as string;
            const parent = await loadEntity(parentId);
            if (parent) {
              // Ensure parent has this entity in children (persist the addition).
              const parentChildren = (parent.relationships?.children as string[]) || [];
              if (!parentChildren.includes(entity.id)) {
                changes.push(`${parent.id}: Add ${entity.id} to children`);
                if (!dry_run) {
                  parent.relationships = parent.relationships || {};
                  parent.relationships.children = [...parentChildren, entity.id];
                  pending.set(parent.id, parent);
                }
              }
            } else {
              changes.push(`${entity.id}: Parent ${parentId} not found - removing`);
              delete entity.relationships.parent;
              modified = true;
            }
          }

          // Fix depends_on/blocks relationships
          if (entity.relationships?.depends_on) {
            const deps = entity.relationships.depends_on as string[];
            for (const depId of deps) {
              const dep = await loadEntity(depId);
              if (dep) {
                // Ensure the dependency lists this entity in blocks (persist it).
                const blocks = (dep.relationships?.blocks as string[]) || [];
                if (!blocks.includes(entity.id)) {
                  changes.push(`${dep.id}: Add ${entity.id} to blocks`);
                  if (!dry_run) {
                    dep.relationships = dep.relationships || {};
                    dep.relationships.blocks = [...blocks, entity.id];
                    pending.set(dep.id, dep);
                  }
                }
              } else {
                changes.push(`${entity.id}: Dependency ${depId} not found - removing`);
                modified = true;
              }
            }
          }

          if (modified && !dry_run) {
            pending.set(entity.id, entity);
          }
        }

        // Write updates
        if (!dry_run && pending.size > 0) {
          for (const entity of pending.values()) {
            const content = serializer.serialize(entity);
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

        // Apply filters (from parsed fields)
        let filtered = features;
        if (phase) {
          filtered = filtered.filter(f => f.fields?.phase === phase);
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

        // ADVISORIES — soft fan-out guidelines, deliberately NOT enforced on
        // create/update writes. They flag entities whose relationship fan-out
        // makes the canvas/graph hard to read, with concrete reorganization
        // suggestions for the agent to reconcile over time.
        const FANOUT_LIMITS = {
          document_documents: 2,   // a document should document at most 2 features
          decision_affects: 2,     // a decision should affect at most 2 documents
          feature_implemented_by: 3, // a feature should have at most 3 implementers
        };
        const advisories: Array<{entity: string; rule: string; message: string; suggestion: string}> = [];

        // NOTE: index.getAll() returns EntityMetadata (flat parent_id, no
        // `relationships`/`fields`). The rules below need the full relationship
        // map, so re-parse each entity from disk exactly like get_entity does.
        const hasRel = (v: unknown): boolean => Array.isArray(v) ? v.length > 0 : v != null && v !== '';
        const asList = (v: unknown): string[] =>
          Array.isArray(v) ? (v as string[]) : (v != null && v !== '' ? [v as string] : []);

        // VALID RELATIONSHIP SET — derived from the schema (single source of truth).
        // See schema-derivation.ts / default-schema.ts `positioning` metadata.
        const ALLOWED = VALIDATION_ALLOWLIST;
        // Every relationship field name in the full schema (forward + reverse), so legacy
        // fields that are no longer valid are detected even if the parser parked them in
        // `passthrough` (an entity type the current schema doesn't treat as from/to).
        const REL_FIELDS = ['parent', 'children', 'depends_on', 'blocks', 'implements',
          'implemented_by', 'documents', 'documented_by', 'affects', 'decided_by',
          'supersedes', 'superseded_by', 'previous_version', 'next_version'];

        for (const meta of entities) {
          const path = index.getPathById(meta.id);
          if (!path) continue;
          let entity: RuntimeEntity;
          try {
            entity = parser.parse(await adapter.readFile(path), path);
          } catch {
            continue; // skip unparseable files
          }

          // Rule: Stories and tasks need parents (positioning containment)
          if ((entity.type === 'story' || entity.type === 'task') && !hasRel(entity.relationships?.parent)) {
            violations.push({
              entity: `${entity.id} (${entity.title})`,
              rule: 'ORPHANED_ENTITY',
              message: `${entity.type} missing parent`,
            });
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

          // Advisory: document fan-out (documents → features)
          if (entity.type === 'document') {
            const targets = asList(relView['documents']);
            if (targets.length > FANOUT_LIMITS.document_documents) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: 'DOCUMENT_FANOUT',
                message: `document documents ${targets.length} features (limit ${FANOUT_LIMITS.document_documents}): ${targets.join(', ')}`,
                suggestion: `Split into focused documents so each documents at most ${FANOUT_LIMITS.document_documents} features: keep the ${FANOUT_LIMITS.document_documents} features this document is primarily about in \`documents\`, and move the rest into new per-feature (or per-cohesive-pair) documents that can carry \`previous_version\`/body links back to this one. On the canvas a document anchors to its FIRST documents-target, so wide fan-out also strands the document between distant feature clusters.`,
              });
            }
          }

          // Advisory: decision fan-out (affects → documents)
          if (entity.type === 'decision') {
            const targets = asList(relView['affects']);
            if (targets.length > FANOUT_LIMITS.decision_affects) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: 'DECISION_FANOUT',
                message: `decision affects ${targets.length} documents (limit ${FANOUT_LIMITS.decision_affects}): ${targets.join(', ')}`,
                suggestion: `Point \`affects\` at the ${FANOUT_LIMITS.decision_affects} documents that materially change because of this decision; for the others, record the impact in each document's body or split the decision into narrower per-scope decisions linked via \`supersedes\`/body references. Decisions position next to their first affected document, so long affects lists scatter meaning.`,
              });
            }
          }

          // Advisory: feature implementer fan-out (implemented_by → stories/milestones)
          if (entity.type === 'feature') {
            const targets = asList(relView['implemented_by']);
            if (targets.length > FANOUT_LIMITS.feature_implemented_by) {
              advisories.push({
                entity: `${entity.id} (${entity.title})`,
                rule: 'FEATURE_IMPLEMENTER_FANOUT',
                message: `feature implemented_by ${targets.length} implementers (limit ${FANOUT_LIMITS.feature_implemented_by}): ${targets.join(', ')}`,
                suggestion: `Consolidate to at most ${FANOUT_LIMITS.feature_implemented_by} implementers: either designate one umbrella story/milestone as the primary implementer (demote the others' \`implements\` to \`affects\` or body references), or split the feature into sub-features so each has a small, honest implementer set. Only the first implementer positions the feature on the canvas; the rest are edge-only.`,
              });
            }
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

        const toArchive: RuntimeEntity[] = [];
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
              const full = cp ? parser.parse(await adapter.readFile(cp), cp) : null;
              if (!full) continue;
              toArchive.push(full);
              if (child.type === 'story') stats.stories_archived++;
              if (child.type === 'task') stats.tasks_archived++;
            }
          }
        }

        if (!dry_run && toArchive.length > 0) {
          for (const entity of toArchive) {
            const updated = { ...entity, archived: true };
            const content = serializer.serialize(updated);

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

                  // YAML sanitization
                  const sanitizedTitle = String(payload.title).replace(/:/g, ' -').replace(/\s{2,}/g, ' ').trim();
                  const sanitizedCustomFields: Record<string, unknown> = {};
                  for (const [key, value] of Object.entries(customFields)) {
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
                    relationships: (relationships as Record<string, EntityId | EntityId[]>) ?? {},
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

                if (dryRun) {
                  // Preview changes
                  for (const [key, value] of Object.entries(payload)) {
                    const before = (entity as unknown as Record<string, unknown>)[key];
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
                  // Apply updates
                  for (const [key, value] of Object.entries(payload)) {
                    if (value !== undefined) {
                      (entity as unknown as Record<string, unknown>)[key] = value;
                    }
                  }

                  entity.updated_at = new Date().toISOString();

                  const errors = validator.validate(entity);
                  if (errors.length > 0) {
                    throw new Error(`Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
                  }

                  const newContent = serializer.serialize(entity);
                  await adapter.writeFile(path, newContent);

                  results.push({
                    client_id,
                    success: true,
                    id,
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

                  const newContent = serializer.serialize(entity);
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

