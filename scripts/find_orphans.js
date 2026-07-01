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
    const dependsOnMatch = fm.match(/^depends_on:\s*\[([\s\S]*?)\]/m);
    const enablesMatch = fm.match(/^enables:\s*\[([\s\S]*?)\]/m);
    const affectsMatch = fm.match(/^affects:\s*\[([\s\S]*?)\]/m);
    const implementsMatch = fm.match(/^implements:\s*\[([\s\S]*?)\]/m);
    const documentsMatch = fm.match(/^documents:\s*\[([\s\S]*?)\]/m);
    const decidedByMatch = fm.match(/^decided_by:\s*\[([\s\S]*?)\]/m);
    const enabledByMatch = fm.match(/^enabled_by:\s*\[([\s\S]*?)\]/m);

    entity.id = idMatch ? idMatch[1].trim().replace(/^["']|["']$/g, '') : null;
    entity.type = typeMatch ? typeMatch[1].trim() : null;
    entity.parent = parentMatch ? parentMatch[1].trim().replace(/^["']|["']$/g, '') : null;
    entity.file = filePath;

    // Parse array fields
    const parseArray = (match) => {
        if (!match) return [];
        return match[1]
            .split(',')
            .map(s => s.trim().replace(/^["']|["']$/g, ''))
            .filter(s => s && s !== '');
    };

    entity.dependsOn = parseArray(dependsOnMatch);
    entity.enables = parseArray(enablesMatch);
    entity.affects = parseArray(affectsMatch);
    entity.implements = parseArray(implementsMatch);
    entity.documents = parseArray(documentsMatch);
    entity.decidedBy = parseArray(decidedByMatch);
    entity.enabledBy = parseArray(enabledByMatch);

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
    
    for (const entity of entities) {
        const refs = [
            ...entity.dependsOn,
            ...entity.enables,
            ...entity.affects,
            ...entity.implements,
            ...entity.documents,
            ...entity.decidedBy,
            ...entity.enabledBy
        ];
        
        for (const ref of refs) {
            if (!referencedBy.has(ref)) {
                referencedBy.set(ref, []);
            }
            referencedBy.get(ref).push(entity.id);
        }
        
        if (entity.parent) {
            if (!referencedBy.has(entity.parent)) {
                referencedBy.set(entity.parent, []);
            }
            referencedBy.get(entity.parent).push(entity.id);
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
            entity.documents.length > 0 ||
            entity.decidedBy.length > 0 ||
            entity.enabledBy.length > 0;
        const hasIncomingRefs = (referencedBy.get(entity.id) || []).length > 0;
        
        if (!hasParent && !hasOutgoingRefs && !hasIncomingRefs) {
            orphans.push(entity);
        }
    }
    
    return orphans;
}

// Main
const entities = scanVault();
console.log(`Total active entities: ${entities.length}`);

const orphans = findOrphans(entities);
console.log(`\nTrue orphans (no relationships): ${orphans.length}`);

if (orphans.length > 0) {
    console.log('\nOrphans by type:');
    const byType = {};
    for (const orphan of orphans) {
        byType[orphan.type] = (byType[orphan.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(byType)) {
        console.log(`  ${type}: ${count}`);
    }
    
    console.log('\nOrphan entity IDs:');
    for (const orphan of orphans) {
        console.log(`  ${orphan.id} (${orphan.type}) - ${path.basename(orphan.file)}`);
    }
}

