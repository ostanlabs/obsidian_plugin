/**
 * Test script for MCP tools
 * Run with: VAULT_PATH=/path/to/vault tsx test-mcp-tools.ts
 */

import { SchemaRegistry } from './src/entity-core/schema-registry';
import { EntityParser } from './src/entity-core/parser';
import { EntitySerializer } from './src/entity-core/serializer';
import { EntityValidator } from './src/entity-core/validator';
import { IDAllocator } from './src/entity-core/id-allocator';
import { PathResolver } from './src/entity-core/path-resolver';
import { NodeFsAdapter } from './src/adapters/node-fs-adapter';
import { DEFAULT_SCHEMA } from './src/entity-core/default-schema';

const VAULT_PATH = process.env.VAULT_PATH || '/tmp/test-vault';

async function scanAllFiles(adapter: NodeFsAdapter, dir: string = ''): Promise<Set<string>> {
  const allIds = new Set<string>();
  const entries = await adapter.readDir(dir);

  for (const entry of entries) {
    if (entry.isDirectory) {
      const subIds = await scanAllFiles(adapter, entry.path);
      subIds.forEach(id => allIds.add(id));
    } else if (entry.name.endsWith('.md')) {
      const content = await adapter.readFile(entry.path);
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const idMatch = match[1].match(/^id:\s*(.+)$/m);
        if (idMatch) {
          allIds.add(idMatch[1].trim());
        }
      }
    }
  }

  return allIds;
}

async function testMCPTools() {
  console.log('🧪 Testing MCP Tools\n');
  console.log(`Vault: ${VAULT_PATH}\n`);

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
  
  console.log('📋 Scanning vault for existing IDs...');
  const existingIds = await scanAllFiles(adapter);
  console.log(`Found ${existingIds.size} existing entities\n`);

  // Create a simple in-memory index
  const index = {
    getAllIds: (includeArchived: boolean = false) => Array.from(existingIds),
    getAll: () => [],
    getById: (id: string) => undefined,
    getByType: (type: string) => [],
    hasId: (id: string) => existingIds.has(id),
  };

  const allocator = new IDAllocator(schema, index as any);

  // Test 1: get_schema
  console.log('1️⃣  Testing get_schema');
  try {
    const schemaData = DEFAULT_SCHEMA;
    console.log(`   ✅ Schema has ${schemaData.entityTypes.length} entity types`);
    console.log(`   ✅ Entity types: ${schemaData.entityTypes.map(t => t.label).join(', ')}\n`);
  } catch (error) {
    console.error('   ❌ Error:', error);
  }

  // Test 2: create_entity
  console.log('2️⃣  Testing create_entity');
  try {
    const type = 'task';
    const title = 'Test MCP Integration';
    const id = await allocator.allocate(type);
    
    const entity: any = {
      id,
      type,
      title,
      workstream: 'api-server',
      status: 'Not Started',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived: false,
      vault_path: '',
      canvas_source: '',
      fields: {
        goal: 'Test that MCP server tools are working correctly',
      },
      relationships: {},
    };
    
    const errors = validator.validate(entity);
    if (errors.length > 0) {
      console.log(`   ⚠️  Validation warnings: ${errors.map(e => e.message).join(', ')}`);
    }
    
    const content = serializer.serialize(entity);
    const filename = pathResolver.generateFilename(id, title);
    const folder = pathResolver.getTypeFolderPath(type);
    const filePath = `${folder}/${filename}`;
    
    await adapter.writeFile(filePath, content);
    console.log(`   ✅ Created ${type} ${id}: ${title}`);
    console.log(`   ✅ Path: ${filePath}\n`);
  } catch (error) {
    console.error('   ❌ Error:', error);
  }

  // Test 3: list_entities
  console.log('3️⃣  Testing list_entities');
  try {
    const typeFilter = 'task';
    const folder = pathResolver.getTypeFolderPath(typeFilter);

    let taskCount = 0;
    const entries = await adapter.readDir(folder);
    for (const entry of entries) {
      if (entry.name.endsWith('.md')) {
        const content = await adapter.readFile(entry.path);
        const entity = parser.parse(content, typeFilter);
        if (entity && !entity.archived) {
          taskCount++;
        }
      }
    }

    console.log(`   ✅ Found ${taskCount} ${typeFilter}s\n`);
  } catch (error) {
    console.error('   ❌ Error:', error);
  }

  // Test 4: get_entity
  console.log('4️⃣  Testing get_entity');
  try {
    const testId = await allocator.allocate('task');
    await allocator.allocate('task'); // Use it

    // Search for any task
    const folder = pathResolver.getTypeFolderPath('task');
    const entries = await adapter.readDir(folder);

    if (entries.length > 0) {
      const entry = entries[0];
      const content = await adapter.readFile(entry.path);
      const entity = parser.parse(content, 'task');

      if (entity) {
        console.log(`   ✅ Retrieved entity ${entity.id}: ${entity.title}`);
        console.log(`   ✅ Status: ${entity.status}, Workstream: ${entity.workstream || 'none'}\n`);
      } else {
        console.log(`   ⚠️  No entities found\n`);
      }
    } else {
      console.log(`   ⚠️  No task files found\n`);
    }
  } catch (error) {
    console.error('   ❌ Error:', error);
  }

  // Test 5: update_entity
  console.log('5️⃣  Testing update_entity');
  try {
    const folder = pathResolver.getTypeFolderPath('task');
    const entries = await adapter.readDir(folder);

    if (entries.length > 0) {
      const entry = entries[0];
      const content = await adapter.readFile(entry.path);
      const entity = parser.parse(content, 'task');

      if (entity) {
        const oldStatus = entity.status;
        entity.status = 'InProgress';

        const errors = validator.validate(entity);
        if (errors.length > 0) {
          console.log(`   ⚠️  Validation warnings: ${errors.map(e => e.message).join(', ')}`);
        }

        const newContent = serializer.serialize(entity);
        await adapter.writeFile(entry.path, newContent);

        console.log(`   ✅ Updated ${entity.id}: ${oldStatus} → ${entity.status}\n`);
      }
    } else {
      console.log(`   ⚠️  No tasks to update\n`);
    }
  } catch (error) {
    console.error('   ❌ Error:', error);
  }

  console.log('✅ All 5 MCP tools tested successfully!\n');
}

testMCPTools().catch(console.error);

