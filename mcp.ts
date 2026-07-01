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
import { EntityParser } from './src/entity-core/parser.js';
import { EntitySerializer } from './src/entity-core/serializer.js';
import { EntityValidator } from './src/entity-core/validator.js';
import { IDAllocator } from './src/entity-core/id-allocator.js';
import { PathResolver } from './src/entity-core/path-resolver.js';

// Validate environment
const VAULT_PATH = process.env.VAULT_PATH;
if (!VAULT_PATH) {
  console.error('ERROR: VAULT_PATH environment variable is required');
  console.error('Usage: VAULT_PATH=/path/to/vault npm run dev:mcp');
  process.exit(1);
}

// Initialize the entity-core engine with Node.js filesystem adapter
const adapter = new NodeFsAdapter(VAULT_PATH);
const schema = new SchemaRegistry(DEFAULT_SCHEMA);
const parser = new EntityParser(schema);
const serializer = new EntitySerializer(schema);
const validator = new EntityValidator(schema);

const config = {
  vaultPath: VAULT_PATH,
  entitiesFolder: 'entities',
  archiveFolder: 'archive',
  canvasFolder: 'projects',
};

const pathResolver = new PathResolver(schema, config);

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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'create_entity': {
      // TODO: Implement entity creation using entity-core
      // This will use IDAllocator, EntityParser, EntitySerializer, PathResolver, etc.
      return {
        content: [
          {
            type: 'text',
            text: `Entity creation coming soon. Will create ${args.type}: ${args.title}`,
          },
        ],
      };
    }

    case 'list_entities': {
      // TODO: Implement entity listing
      return {
        content: [
          {
            type: 'text',
            text: `Entity listing coming soon${args.type ? ` for type: ${args.type}` : ''}`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
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

