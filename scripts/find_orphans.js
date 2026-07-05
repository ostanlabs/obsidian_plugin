#!/usr/bin/env node

/**
 * Find true orphan entities in the vault
 * - No parent
 * - No sequencing relationships (depends_on, enables, etc.)
 * - Not referenced by any other entity
 */

const fs = require('fs');
const path = require('path');

const VAULT_PATH = '/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform';

function parseEntity(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    const entity = {};

    // Parse frontmatter fields
    const idMatch = fm.match(/^id:\s*(.+)$/m);
    const typeMatch = fm.match(/^type:\s*(.+)$/m);
    const parentMatch = fm.match(/^parent:\s*(.+)$/m);

    entity.id = idMatch ? idMatch[1].trim().replace(/^["']|["']$/g, '') : null;
    entity.type = typeMatch ? typeMatch[1].trim() : null;
    entity.parent = parentMatch ? parentMatch[1].trim().replace(/^["']|["']$/g, '') : null;
    entity.file = filePath;

    // Parse array fields - handle both inline [a, b] and multi-line YAML formats
    const parseArrayField = (fieldName) => {
        // Try inline format first: field: [a, b, c]
        const inlineMatch = fm.match(new RegExp(`^${fieldName}:\\s*\\[([\\s\\S]*?)\\]`, 'm'));
        if (inlineMatch) {
            return inlineMatch[1]
                .split(',')
                .map(s => s.trim().replace(/^["']|["']$/g, ''))
                .filter(s => s && s !== '');
        }

        // Try multi-line format: field:\n  - a\n  - b
        // Match the field name, then capture everything until the next field or end
        const regex = new RegExp(`^${fieldName}:\\s*\\n((?: {2,}- .+\\n?)+)`, 'm');
        const multilineMatch = fm.match(regex);
        if (multilineMatch) {
            const lines = multilineMatch[1].split('\n');
            return lines
                .filter(line => line.trim().startsWith('-'))
                .map(line => line.trim().substring(1).trim().replace(/^["']|["']$/g, ''))
                .filter(s => s && s !== '');
        }

        return [];
    };

    entity.dependsOn = parseArrayField('depends_on');
    entity.enables = parseArrayField('enables');
    entity.affects = parseArrayField('affects');
    entity.implements = parseArrayField('implements');
    entity.implementedBy = parseArrayField('implemented_by');
    entity.documents = parseArrayField('documents');
    entity.documentedBy = parseArrayField('documented_by');
    entity.decidedBy = parseArrayField('decided_by');
    entity.enabledBy = parseArrayField('enabled_by');
    entity.blocks = parseArrayField('blocks');
    entity.blockedBy = parseArrayField('blocked_by');
    entity.children = parseArrayField('children');

    // Parse single-value relationships
    const supersedesMatch = fm.match(/^supersedes:\s*(.+)$/m);
    const previousVersionMatch = fm.match(/^previous_version:\s*(.+)$/m);

    entity.supersedes = supersedesMatch ? supersedesMatch[1].trim().replace(/^["']|["']$/g, '') : null;
    entity.previousVersion = previousVersionMatch ? previousVersionMatch[1].trim().replace(/^["']|["']$/g, '') : null;

    return entity;
}

function scanVault() {
    const entities = [];
    const folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents', 'features'];

    for (const folder of folders) {
        const folderPath = path.join(VAULT_PATH, folder);
        if (!fs.existsSync(folderPath)) continue;

        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const entity = parseEntity(path.join(folderPath, file));
            if (entity && entity.id) {
                entities.push(entity);
            }
        }
    }

    return entities;
}

function findOrphans(entities) {
    // Build a map of all entity IDs
    const entityMap = new Map(entities.map(e => [e.id, e]));

    // Build reverse references (who references each entity)
    const referencedBy = new Map();

    // Track all relationship types
    const relationshipTypes = {
        parent: 0,
        dependsOn: 0,
        enables: 0,
        affects: 0,
        implements: 0,
        implementedBy: 0,
        documents: 0,
        documentedBy: 0,
        decidedBy: 0,
        enabledBy: 0,
        blocks: 0,
        blockedBy: 0,
        children: 0,
        supersedes: 0,
        previousVersion: 0
    };

    for (const entity of entities) {
        // Count parent relationships
        if (entity.parent) {
            relationshipTypes.parent++;
            if (!referencedBy.has(entity.parent)) {
                referencedBy.set(entity.parent, []);
            }
            referencedBy.get(entity.parent).push({from: entity.id, type: 'parent'});
        }

        // Process array relationships
        const arrayRels = {
            dependsOn: entity.dependsOn,
            enables: entity.enables,
            affects: entity.affects,
            implements: entity.implements,
            implementedBy: entity.implementedBy,
            documents: entity.documents,
            documentedBy: entity.documentedBy,
            decidedBy: entity.decidedBy,
            enabledBy: entity.enabledBy,
            blocks: entity.blocks,
            blockedBy: entity.blockedBy,
            children: entity.children
        };

        for (const [relType, refs] of Object.entries(arrayRels)) {
            for (const ref of refs) {
                relationshipTypes[relType]++;
                if (!referencedBy.has(ref)) {
                    referencedBy.set(ref, []);
                }
                referencedBy.get(ref).push({from: entity.id, type: relType});
            }
        }

        // Process single-value relationships
        if (entity.supersedes) {
            relationshipTypes.supersedes++;
            if (!referencedBy.has(entity.supersedes)) {
                referencedBy.set(entity.supersedes, []);
            }
            referencedBy.get(entity.supersedes).push({from: entity.id, type: 'supersedes'});
        }

        if (entity.previousVersion) {
            relationshipTypes.previousVersion++;
            if (!referencedBy.has(entity.previousVersion)) {
                referencedBy.set(entity.previousVersion, []);
            }
            referencedBy.get(entity.previousVersion).push({from: entity.id, type: 'previousVersion'});
        }
    }

    // Find true orphans
    const orphans = [];

    for (const entity of entities) {
        const hasParent = !!entity.parent;
        const hasOutgoingRefs =
            entity.dependsOn.length > 0 ||
            entity.enables.length > 0 ||
            entity.affects.length > 0 ||
            entity.implements.length > 0 ||
            entity.implementedBy.length > 0 ||
            entity.documents.length > 0 ||
            entity.documentedBy.length > 0 ||
            entity.decidedBy.length > 0 ||
            entity.enabledBy.length > 0 ||
            entity.blocks.length > 0 ||
            entity.blockedBy.length > 0 ||
            entity.children.length > 0 ||
            entity.supersedes ||
            entity.previousVersion;
        const hasIncomingRefs = (referencedBy.get(entity.id) || []).length > 0;

        if (!hasParent && !hasOutgoingRefs && !hasIncomingRefs) {
            orphans.push(entity);
        }
    }

    return { orphans, relationshipTypes, referencedBy };
}

// Main
const entities = scanVault();
console.log(`Total active entities: ${entities.length}`);

const { orphans, relationshipTypes, referencedBy } = findOrphans(entities);

console.log('\n=== RELATIONSHIP STATISTICS ===');
console.log('Relationship counts across all entities:');
for (const [relType, count] of Object.entries(relationshipTypes)) {
    console.log(`  ${relType}: ${count}`);
}

const totalRelationships = Object.values(relationshipTypes).reduce((a, b) => a + b, 0);
console.log(`\nTotal relationships: ${totalRelationships}`);

console.log(`\n=== TRUE ORPHANS (no relationships of any kind) ===`);
console.log(`True orphans: ${orphans.length} out of ${entities.length} (${(orphans.length / entities.length * 100).toFixed(1)}%)`);

if (orphans.length > 0) {
    console.log('\nOrphans by type:');
    const byType = {};
    for (const orphan of orphans) {
        byType[orphan.type] = (byType[orphan.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(byType)) {
        const typeTotal = entities.filter(e => e.type === type).length;
        const pct = (count / typeTotal * 100).toFixed(1);
        console.log(`  ${type}: ${count} / ${typeTotal} (${pct}%)`);
    }

    console.log('\n=== ALL ORPHAN MILESTONES ===');
    const orphanMilestones = orphans.filter(o => o.type === 'milestone');
    for (const orphan of orphanMilestones) {
        console.log(`  ${orphan.id}`);
    }

    console.log('\n=== SAMPLE OTHER ORPHAN ENTITIES (first 20) ===');
    const nonMilestoneOrphans = orphans.filter(o => o.type !== 'milestone');
    for (const orphan of nonMilestoneOrphans.slice(0, 20)) {
        console.log(`  ${orphan.id} (${orphan.type}) - ${path.basename(orphan.file)}`);
    }

    if (nonMilestoneOrphans.length > 20) {
        console.log(`  ... and ${nonMilestoneOrphans.length - 20} more`);
    }
}

// Count entities by type with at least one relationship
console.log('\n=== ENTITIES WITH RELATIONSHIPS ===');
const entitiesWithRels = entities.filter(e => {
    return e.parent ||
           e.dependsOn.length > 0 ||
           e.enables.length > 0 ||
           e.affects.length > 0 ||
           e.implements.length > 0 ||
           e.implementedBy.length > 0 ||
           e.documents.length > 0 ||
           e.documentedBy.length > 0 ||
           e.decidedBy.length > 0 ||
           e.enabledBy.length > 0 ||
           e.blocks.length > 0 ||
           e.blockedBy.length > 0 ||
           e.children.length > 0 ||
           e.supersedes ||
           e.previousVersion ||
           (referencedBy.get(e.id) || []).length > 0;
});

const byTypeWithRels = {};
for (const entity of entitiesWithRels) {
    byTypeWithRels[entity.type] = (byTypeWithRels[entity.type] || 0) + 1;
}

console.log('Entities with at least one relationship:');
for (const [type, count] of Object.entries(byTypeWithRels)) {
    const typeTotal = entities.filter(e => e.type === type).length;
    const pct = (count / typeTotal * 100).toFixed(1);
    console.log(`  ${type}: ${count} / ${typeTotal} (${pct}%)`);
}

