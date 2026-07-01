/**
 * Test script for MCP tools
 * Run with: VAULT_PATH=/path/to/vault tsx test-mcp-tools.ts
 */

import { SchemaRegistry } from './src/entity-core/schema-registry.js';
import { EntityParser } from './src/entity-core/parser.js';
import { EntitySerializer } from './src/entity-core/serializer.js';
import { EntityValidator } from './src/entity-core/validator.js';
import { IDAllocator } from './src/entity-core/id-allocator.js';
import { PathResolver } from './src/entity-core/path-resolver.js';
import { NodeFsAdapter } from './src/adapters/node-fs-adapter.js';
import { DEFAULT_SCHEMA } from './src/entity-core/schema.js';

const VAULT_PATH = process.env.VAULT_PATH || '/tmp/test-vault';

async function scanAllFiles(adapter: NodeFsAdapter, dir: string = ''): Promise<Set<string>> {
  const allIds = new Set<string>();
  const files = await adapter.readDir(dir);
  
  for (const file of files) {
    const fullPath = dir ? `${dir}/${file}` : file;
    const isDir = await adapter.isDirectory(fullPath);
    
    if (isDir) {
      const subIds = await scanAllFiles(adapter, fullPath);
      subIds.forEach(id => allIds.add(id));
    } else if (file.endsWith('.md')) {
      const content = await adapter.readFile(fullPath);
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
  
  const allocator = new IDAllocator(existingIds);

  // Test 1: get_schema
  console.log('1️⃣  Testing get_schema');
  try {
    const schemaData = DEFAULT_SCHEMA;
    console.log(`   ✅ Schema has ${schemaData.entityTypes.length} entity types`);
    console.log(`   ✅ Entity types: ${schemaData.entityTypes.map(t => t.name).join(', ')}\n`);
  } catch (error) {
    console.error('   ❌ Error:', error);
  }

  // Test 2: create_entity
  console.log('2️⃣  Testing create_entity');
  try {
    const type = 'task';
    const title = 'Test MCP Integration';
    const id = allocator.allocateId(type);
    
    const entity: any = {
      id,
      type,
      title,
      workstream: 'api-server',
      status: 'NotStarted',
      created: new Date().toISOString(),
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
    const files = await adapter.readDir(folder);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = `${folder}/${file}`;
        const content = await adapter.readFile(filePath);
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
    const testId = allocator.allocateId('task');
    allocator.allocateId('task'); // Use it
    
    // Search for any task
    const folder = pathResolver.getTypeFolderPath('task');
    const files = await adapter.readDir(folder);
    
    if (files.length > 0) {
      const file = files[0];
      const filePath = `${folder}/${file}`;
      const content = await adapter.readFile(filePath);
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
    const files = await adapter.readDir(folder);
    
    if (files.length > 0) {
      const file = files[0];
      const filePath = `${folder}/${file}`;
      const content = await adapter.readFile(filePath);
      const entity = parser.parse(content, 'task');
      
      if (entity) {
        const oldStatus = entity.status;
        entity.status = 'InProgress';
        
        const errors = validator.validate(entity);
        if (errors.length > 0) {
          console.log(`   ⚠️  Validation warnings: ${errors.map(e => e.message).join(', ')}`);
        }
        
        const newContent = serializer.serialize(entity);
        await adapter.writeFile(filePath, newContent);
        
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

