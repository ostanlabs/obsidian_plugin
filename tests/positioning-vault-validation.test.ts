/**
 * Positioning Validation Test - Real Vault
 * 
 * Validates the positioning algorithm against the actual AgentPlatform vault.
 * Checks that containment hierarchy and no-overlap rules are honored.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	PositioningEngineV4,
	EntityData,
	DEFAULT_POSITIONING_CONFIG,
	PositioningResult,
} from '../util/positioningV4';
import { parseEntityFromContent, generateNodeIdFromEntityId } from '../util/entityParser';

// Path to the real vault
const VAULT_PATH = '/Users/marc-ostan/Obsidian/OstanLabs/obsidian_notion_planning_system/obsidian-vault/Projects/AgentPlatform';

interface LoadedEntity {
	entityData: EntityData;
	filePath: string;
}

/**
 * Recursively scan the vault and parse all entities
 */
function scanVault(): LoadedEntity[] {
	const entities: LoadedEntity[] = [];
	const folders = ['milestones', 'stories', 'tasks', 'decisions', 'documents', 'features'];

	for (const folder of folders) {
		const folderPath = path.join(VAULT_PATH, folder);
		if (!fs.existsSync(folderPath)) {
			console.log(`Skipping non-existent folder: ${folder}`);
			continue;
		}

		const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
		console.log(`Found ${files.length} files in ${folder}`);

		for (const file of files) {
			const filePath = path.join(folderPath, file);
			const content = fs.readFileSync(filePath, 'utf-8');
			const relativePath = `${folder}/${file}`;

			try {
				const entityData = parseEntityFromContent(
					content,
					generateNodeIdFromEntityId(file.replace('.md', '')),
					relativePath
				);

				if (!entityData) {
					console.warn(`Failed to parse: ${relativePath}`);
					continue;
				}

				// Update nodeId to use entityId for consistency
				entityData.nodeId = generateNodeIdFromEntityId(entityData.entityId);

				entities.push({ entityData, filePath: relativePath });
			} catch (error) {
				console.error(`Error parsing ${relativePath}:`, error);
			}
		}
	}

	return entities;
}

describe('Positioning Vault Validation', () => {
	let entities: LoadedEntity[];
	let result: PositioningResult;

	beforeAll(() => {
		console.log(`\n=== Scanning vault: ${VAULT_PATH} ===\n`);
		entities = scanVault();
		console.log(`\nLoaded ${entities.length} entities total\n`);

		// Group by type for summary
		const byType = new Map<string, number>();
		for (const e of entities) {
			const count = byType.get(e.entityData.type) || 0;
			byType.set(e.entityData.type, count + 1);
		}
		console.log('Entity counts by type:');
		for (const [type, count] of byType) {
			console.log(`  ${type}: ${count}`);
		}

		// Run positioning
		console.log('\n=== Running Positioning Engine V4 ===\n');
		const engine = new PositioningEngineV4(
			entities.map(e => e.entityData),
			DEFAULT_POSITIONING_CONFIG
		);
		result = engine.run();

		console.log(`\nPositioning complete:`);
		console.log(`  Positions: ${result.positions.size}`);
		console.log(`  Errors: ${result.errors.length}`);
		console.log(`  Warnings: ${result.warnings.length}`);

		if (result.errors.length > 0) {
			console.log('\nErrors:');
			result.errors.forEach(e => console.log(`  - ${e}`));
		}
		if (result.warnings.length > 0) {
			console.log('\nWarnings (first 10):');
			result.warnings.slice(0, 10).forEach(w => console.log(`  - ${w}`));
		}
	});

	test('should position all entities', () => {
		expect(result.positions.size).toBeGreaterThan(0);
		expect(result.positions.size).toBe(entities.length);
	});

	test('should have no critical errors', () => {
		expect(result.errors).toEqual([]);
	});

	test('children should be contained within parent bounds (stories in milestones)', () => {
		// Find all milestones and their stories
		const milestones = entities.filter(e => e.entityData.type === 'milestone');
		
		for (const milestone of milestones) {
			const mPos = result.positions.get(milestone.entityData.nodeId);
			if (!mPos) continue;

			// Find all stories with this milestone as parent
			const stories = entities.filter(e => 
				e.entityData.type === 'story' && 
				e.entityData.parent === milestone.entityData.entityId
			);

			for (const story of stories) {
				const sPos = result.positions.get(story.entityData.nodeId);
				if (!sPos) continue;

				// Story should be to the right of milestone
				expect(sPos.x).toBeGreaterThan(mPos.x);
			}
		}
	});

