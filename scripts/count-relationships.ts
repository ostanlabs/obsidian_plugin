#!/usr/bin/env node
/**
 * Count all relationships in the vault to understand scope of cleanup needed
 */

import { NodeFsAdapter } from '../src/entity-core/adapters/node-fs-adapter.js';
import { EntityIndex } from '../src/entity-core/entity-index.js';
import { SchemaRegistry } from '../src/entity-core/schema-registry.js';
import { DEFAULT_SCHEMA } from '../src/entity-core/default-schema.js';

const VAULT_PATH = process.env.VAULT_PATH || 
  '/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform';

interface RelationshipCount {
  total: number;
  byType: Record<string, number>;
}

async function main() {
  console.log('📊 Counting Relationships in Vault\n');
  console.log(`Vault: ${VAULT_PATH}\n`);

  const adapter = new NodeFsAdapter(VAULT_PATH);
  const schema = new SchemaRegistry(DEFAULT_SCHEMA);
  const index = new EntityIndex(adapter, schema);

  await index.scan();
  const entities = index.getAll();

  console.log(`Total entities: ${entities.length}\n`);

  // Count relationships by field name and source entity type
  const relationshipCounts: Record<string, RelationshipCount> = {};

  for (const entity of entities) {
    if (!entity.relationships) continue;

    for (const [relName, value] of Object.entries(entity.relationships)) {
      const key = `${entity.type}.${relName}`;
      
      if (!relationshipCounts[key]) {
        relationshipCounts[key] = { total: 0, byType: {} };
      }

      if (Array.isArray(value)) {
        relationshipCounts[key].total += value.length;
        for (const targetId of value) {
          const targetType = schema.getEntityTypeFromId(targetId as string);
          relationshipCounts[key].byType[targetType] = 
            (relationshipCounts[key].byType[targetType] || 0) + 1;
        }
      } else if (value) {
        relationshipCounts[key].total += 1;
        const targetType = schema.getEntityTypeFromId(value as string);
        relationshipCounts[key].byType[targetType] = 
          (relationshipCounts[key].byType[targetType] || 0) + 1;
      }
    }
  }

  // Sort by total count descending
  const sorted = Object.entries(relationshipCounts)
    .sort(([, a], [, b]) => b.total - a.total);

  console.log('Relationship Counts:\n');
  console.log('Source Type | Relationship | Total | Target Breakdown');
  console.log('------------|--------------|-------|------------------');

  for (const [key, count] of sorted) {
    const [sourceType, relName] = key.split('.');
    const targetBreakdown = Object.entries(count.byType)
      .map(([type, num]) => `${type}:${num}`)
      .join(', ');
    
    console.log(
      `${sourceType.padEnd(11)} | ${relName.padEnd(12)} | ${String(count.total).padStart(5)} | ${targetBreakdown}`
    );
  }

  console.log('\n');

  // Check for invalid relationships per new rules
  console.log('⚠️  Invalid Relationships:\n');
  
  const invalidRels: Array<{entity: string; type: string; rel: string; issue: string}> = [];

  for (const entity of entities) {
    if (!entity.relationships) continue;

    // Document should not have implements, blocks
    if (entity.type === 'document') {
      if (entity.relationships.implements) {
        invalidRels.push({
          entity: entity.id,
          type: 'document',
          rel: 'implements',
          issue: 'Should use implemented_by instead'
        });
      }
      if (entity.relationships.blocks) {
        invalidRels.push({
          entity: entity.id,
          type: 'document',
          rel: 'blocks',
          issue: 'Should not have blocks'
        });
      }
    }

    // Decision should not have depends_on
    if (entity.type === 'decision' && entity.relationships.depends_on) {
      invalidRels.push({
        entity: entity.id,
        type: 'decision',
        rel: 'depends_on',
        issue: 'Should not have depends_on'
      });
    }

    // Feature should not have implements, blocks, decided_by, depends_on
    if (entity.type === 'feature') {
      if (entity.relationships.implements) {
        invalidRels.push({
          entity: entity.id,
          type: 'feature',
          rel: 'implements',
          issue: 'Should use implemented_by instead'
        });
      }
      if (entity.relationships.blocks) {
        invalidRels.push({
          entity: entity.id,
          type: 'feature',
          rel: 'blocks',
          issue: 'Should not have blocks'
        });
      }
      if (entity.relationships.decided_by) {
        invalidRels.push({
          entity: entity.id,
          type: 'feature',
          rel: 'decided_by',
          issue: 'Decisions use affects instead'
        });
      }
      if (entity.relationships.depends_on) {
        invalidRels.push({
          entity: entity.id,
          type: 'feature',
          rel: 'depends_on',
          issue: 'Should not have depends_on'
        });
      }
    }
  }

  if (invalidRels.length > 0) {
    console.log(`Found ${invalidRels.length} invalid relationships:\n`);
    for (const inv of invalidRels) {
      console.log(`  ${inv.entity} (${inv.type}): ${inv.rel} - ${inv.issue}`);
    }
  } else {
    console.log('✅ No invalid relationships found!');
  }

  console.log('\n');
}

main().catch(console.error);

