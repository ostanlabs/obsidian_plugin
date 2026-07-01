#!/usr/bin/env node

/**
 * Delete true orphan entities from the vault
 */

const fs = require('fs');
const path = require('path');

const VAULT_PATH = '/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform';

// The 14 true orphan entity IDs identified by find_orphans.js
const ORPHAN_IDS = [
    'DEC-229',
    'DOC-050',
    'DOC-053',
    'DOC-039',
    'DOC-040',
    'DOC-044',
    'F-077',
    'F-040',
    'F-041',
    'F-080',
    'F-039',
    'F-037',
    'F-038',
    'F-081'
];

function findFileForEntity(entityId) {
    const folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents', 'features'];
    
    for (const folder of folders) {
        const folderPath = path.join(VAULT_PATH, folder);
        if (!fs.existsSync(folderPath)) continue;
        
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!fmMatch) continue;
            
            const idMatch = fmMatch[1].match(/^id:\s*(.+)$/m);
            if (idMatch) {
                const id = idMatch[1].trim().replace(/^["']|["']$/g, '');
                if (id === entityId) {
                    return filePath;
                }
            }
        }
    }
    
    return null;
}

console.log('=== DELETE TRUE ORPHAN ENTITIES ===\n');
console.log(`Found ${ORPHAN_IDS.length} orphan entities to delete\n`);

const deleted = [];
const notFound = [];

for (const entityId of ORPHAN_IDS) {
    const filePath = findFileForEntity(entityId);
    
    if (!filePath) {
        notFound.push(entityId);
        console.log(`❌ ${entityId}: File not found`);
        continue;
    }
    
    try {
        const fileName = path.basename(filePath);
        fs.unlinkSync(filePath);
        deleted.push({ id: entityId, file: fileName });
        console.log(`✓ Deleted ${entityId}: ${fileName}`);
    } catch (error) {
        console.log(`❌ ${entityId}: Failed to delete - ${error.message}`);
    }
}

console.log('\n=== SUMMARY ===');
console.log(`Deleted: ${deleted.length}`);
console.log(`Not found: ${notFound.length}`);

if (notFound.length > 0) {
    console.log('\nNot found:');
    notFound.forEach(id => console.log(`  ${id}`));
}

if (deleted.length > 0) {
    console.log('\nDeleted files:');
    deleted.forEach(({id, file}) => console.log(`  ${id} - ${file}`));
}

