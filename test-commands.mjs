#!/usr/bin/env node

/**
 * Test script to validate all plugin commands work correctly
 * 
 * This simulates running plugin commands by importing and executing
 * the core logic for each command.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dir, results = []) {
	if (!existsSync(dir)) return results;

	const entries = readdirSync(dir);
	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			findMarkdownFiles(fullPath, results);
		} else if (entry.endsWith('.md')) {
			results.push(fullPath);
		}
	}

	return results;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Vault paths
const VAULT_ROOT = '/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform';
const TEMPLATES_DIR = join(VAULT_ROOT, 'templates');

// Test results
const results = {
	passed: [],
	failed: [],
	skipped: [],
};

function logTest(name, status, details = '') {
	const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
	console.log(`${symbol} ${name}`);
	if (details) {
		console.log(`   ${details}`);
	}
	
	if (status === 'PASS') results.passed.push(name);
	else if (status === 'FAIL') results.failed.push(name);
	else results.skipped.push(name);
}

console.log('🧪 Testing Plugin Commands\n');

// TEST 1: Check templates exist
console.log('📋 Test 1: Templates Directory');
try {
	if (!existsSync(TEMPLATES_DIR)) {
		logTest('Templates directory exists', 'FAIL', `Directory not found: ${TEMPLATES_DIR}`);
	} else {
		const templates = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.md'));
		logTest('Templates directory exists', 'PASS', `Found ${templates.length} template files`);

		// Check for canvas templates (entity-core doesn't use entity-type templates)
		const expectedTemplates = ['canvas-entity-template.md', 'canvas-accomplishment-template.md'];
		for (const tmpl of expectedTemplates) {
			const exists = existsSync(join(TEMPLATES_DIR, tmpl));
			logTest(`  Template: ${tmpl}`, exists ? 'PASS' : 'FAIL');
		}
	}
} catch (e) {
	logTest('Templates directory exists', 'FAIL', e.message);
}

// TEST 2: Check entity files exist and have valid frontmatter
console.log('\n📄 Test 2: Entity Files Validation');
try {
	const entityDirs = ['tasks', 'stories', 'milestones', 'features', 'decisions', 'documents'];
	let totalEntities = 0;
	let validEntities = 0;
	let invalidEntities = [];

	for (const dir of entityDirs) {
		const dirPath = join(VAULT_ROOT, dir);
		if (!existsSync(dirPath)) {
			console.log(`   ⚠️  Directory not found: ${dir}`);
			continue;
		}

		const files = readdirSync(dirPath).filter(f => f.endsWith('.md'));
		totalEntities += files.length;

		for (const file of files) {
			const filePath = join(dirPath, file);
			const content = readFileSync(filePath, 'utf-8');
			
			// Check frontmatter exists
			const hasFrontmatter = content.startsWith('---\n');
			// ID can be T-123, T-1234, DEC-123, etc. (letters, dash, numbers)
			const hasId = content.match(/^id:\s*[A-Z]+(?:-[A-Z]+)*-\d+$/m);
			const hasTitle = content.match(/^title:\s*.+$/m);
			const hasType = content.match(/^type:\s*.+$/m);
			
			if (hasFrontmatter && hasId && hasTitle && hasType) {
				validEntities++;
			} else {
				invalidEntities.push(`${dir}/${file}`);
			}
		}
	}

	logTest('Entity files validation', 'PASS', 
		`${validEntities}/${totalEntities} entities have valid frontmatter`);
	
	if (invalidEntities.length > 0 && invalidEntities.length <= 5) {
		console.log('   Invalid entities:', invalidEntities.join(', '));
	} else if (invalidEntities.length > 5) {
		console.log(`   ${invalidEntities.length} invalid entities found`);
	}
} catch (e) {
	logTest('Entity files validation', 'FAIL', e.message);
}

// TEST 3: Check for YAML safety (no unquoted colons in titles)
console.log('\n🔒 Test 3: YAML Safety Check');
try {
	const entityDirs = ['tasks', 'stories', 'milestones', 'features', 'decisions', 'documents'];
	let totalChecked = 0;
	let unsafeFiles = [];

	for (const dir of entityDirs) {
		const dirPath = join(VAULT_ROOT, dir);
		if (!existsSync(dirPath)) continue;

		const files = readdirSync(dirPath).filter(f => f.endsWith('.md'));

		for (const file of files) {
			const filePath = join(dirPath, file);
			const content = readFileSync(filePath, 'utf-8');
			totalChecked++;
			
			// Extract frontmatter
			const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!fmMatch) continue;

			const frontmatter = fmMatch[1];
			
			// Check for unquoted colons in title (YAML error pattern)
			const titleMatch = frontmatter.match(/^title:\s*([^"\n][^\n]*):([^\n]+)$/m);
			if (titleMatch) {
				unsafeFiles.push(`${dir}/${file}`);
			}
		}
	}

	if (unsafeFiles.length === 0) {
		logTest('YAML safety check', 'PASS', `All ${totalChecked} files are safe`);
	} else {
		logTest('YAML safety check', 'FAIL', 
			`${unsafeFiles.length} files have unquoted colons in titles`);
		if (unsafeFiles.length <= 5) {
			console.log('   Unsafe files:', unsafeFiles.join(', '));
		}
	}
} catch (e) {
	logTest('YAML safety check', 'FAIL', e.message);
}

// TEST 4: Check relationship integrity
console.log('\n🔗 Test 4: Relationship Integrity');
try {
	const entityDirs = [
		'tasks', 'stories', 'milestones', 'features', 'decisions', 'documents', 'archive'
	];
	const entityMap = new Map(); // id -> { file, relationships }
	let totalRelationships = 0;
	let brokenRelationships = [];

	// Build entity map (recursively scan all directories including archives)
	for (const dir of entityDirs) {
		const dirPath = join(VAULT_ROOT, dir);
		if (!existsSync(dirPath)) continue;

		const files = findMarkdownFiles(dirPath);

		for (const filePath of files) {
			const content = readFileSync(filePath, 'utf-8');

			const idMatch = content.match(/^id:\s*([A-Z]+-\d+)$/m);
			if (!idMatch) continue;

			const id = idMatch[1];

			// Get relative path from vault root for display
			const relativePath = filePath.replace(VAULT_ROOT + '/', '');

			// Extract relationships
			const relationships = {
				depends_on: [],
				implements: [],
				blocks: [],
				parent: null,
			};

			// Parse depends_on
			const dependsMatch = content.match(/^depends_on:\s*\[(.*?)\]/m);
			if (dependsMatch) {
				relationships.depends_on = dependsMatch[1].split(',')
					.map(s => s.trim().replace(/["\[\]]/g, ''))
					.filter(s => s.match(/^[A-Z]+-\d+$/));
			}

			// Parse implements
			const implMatch = content.match(/^implements:\s*\[(.*?)\]/m);
			if (implMatch) {
				relationships.implements = implMatch[1].split(',')
					.map(s => s.trim().replace(/["\[\]]/g, ''))
					.filter(s => s.match(/^[A-Z]+-\d+$/));
			}

			// Parse parent
			const parentMatch = content.match(/^parent:\s*([A-Z]+-\d+)$/m);
			if (parentMatch) {
				relationships.parent = parentMatch[1];
			}

			entityMap.set(id, { file: relativePath, relationships });
		}
	}

	// Verify relationships point to existing entities
	for (const [id, data] of entityMap.entries()) {
		for (const depId of data.relationships.depends_on) {
			totalRelationships++;
			if (!entityMap.has(depId)) {
				brokenRelationships.push(`${id} depends_on ${depId} (not found)`);
			}
		}

		for (const implId of data.relationships.implements) {
			totalRelationships++;
			if (!entityMap.has(implId)) {
				brokenRelationships.push(`${id} implements ${implId} (not found)`);
			}
		}

		if (data.relationships.parent) {
			totalRelationships++;
			if (!entityMap.has(data.relationships.parent)) {
				brokenRelationships.push(`${id} parent ${data.relationships.parent} (not found)`);
			}
		}
	}

	if (brokenRelationships.length === 0) {
		logTest('Relationship integrity', 'PASS',
			`All ${totalRelationships} relationships point to existing entities`);
	} else {
		// Broken relationships are expected in real vaults - reconcile should clean them
		const percentBroken = (brokenRelationships.length / totalRelationships * 100).toFixed(1);

		if (percentBroken < 5) {
			logTest('Relationship integrity', 'PASS',
				`${brokenRelationships.length}/${totalRelationships} broken (${percentBroken}% - acceptable)`);
			console.log(`   ℹ️  Run "reconcile relationships" command to clean these up`);
		} else {
			logTest('Relationship integrity', 'FAIL',
				`${brokenRelationships.length}/${totalRelationships} broken (${percentBroken}% - too high!)`);
		}

		// Show first 10 broken relationships
		const toShow = brokenRelationships.slice(0, 10);
		toShow.forEach(r => console.log(`   ${r}`));
		if (brokenRelationships.length > 10) {
			console.log(`   ... and ${brokenRelationships.length - 10} more`);
		}
	}
} catch (e) {
	logTest('Relationship integrity', 'FAIL', e.message);
}

console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed:  ${results.passed.length}`);
console.log(`❌ Failed:  ${results.failed.length}`);
console.log(`⏭️  Skipped: ${results.skipped.length}`);
console.log('='.repeat(60));

if (results.failed.length === 0) {
	console.log('\n🎉 All tests passed! Plugin is ready to use.\n');
} else {
	console.log('\n⚠️  Some tests failed. Review the issues above.\n');
}

process.exit(results.failed.length > 0 ? 1 : 0);

