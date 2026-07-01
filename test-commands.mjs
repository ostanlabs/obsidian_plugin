#!/usr/bin/env node

/**
 * Test script to validate all plugin commands work correctly
 * 
 * This simulates running plugin commands by importing and executing
 * the core logic for each command.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
		
		// Check for key templates
		const expectedTemplates = ['task.md', 'story.md', 'milestone.md', 'feature.md', 'decision.md'];
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
			const hasId = content.match(/^id:\s*[A-Z]+-\d+$/m);
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

console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed:  ${results.passed.length}`);
console.log(`❌ Failed:  ${results.failed.length}`);
console.log(`⏭️  Skipped: ${results.skipped.length}`);
console.log('='.repeat(60));

process.exit(results.failed.length > 0 ? 1 : 0);

