/**
 * Entity Navigator - Index and navigation utilities for project entities
 *
 * Supports entity types: milestone, story, task, decision, document
 * ID patterns: M-xxx, S-xxx, T-xxx, DEC-xxx, DOC-xxx
 */

import { App, TFile } from "obsidian";
import { EntityType, EntityNavigatorSettings } from "../types";

// ID patterns for entity types
export const ID_PATTERNS: Record<string, RegExp> = {
	milestone: /^M-\d{3,}$/,
	story: /^S-\d{3,}$/,
	task: /^T-\d{3,}$/,
	decision: /^DEC-\d{3,}$/,
	document: /^DOC-\d{3,}$/,
};

// Entity frontmatter interface
export interface EntityFrontmatter {
	id?: string;
	type?: EntityType;
	title?: string;
	parent?: string;
	depends_on?: string[];
	implements?: string[];
	enables?: string[];
	affects_documents?: string[];
	implemented_by?: string[];
}

// Entity index entry
export interface EntityIndexEntry {
	id: string;
	type: EntityType;
	file: TFile;
	title: string;
	parent?: string;
	depends_on: string[];
	implements: string[];
	enables: string[];
	implemented_by: string[];
}

/** Get entity type from ID string */
export function getEntityTypeFromId(id: string): EntityType | null {
	if (ID_PATTERNS.milestone.test(id)) return 'milestone';
	if (ID_PATTERNS.story.test(id)) return 'story';
	if (ID_PATTERNS.task.test(id)) return 'task';
	if (ID_PATTERNS.decision.test(id)) return 'decision';
	if (ID_PATTERNS.document.test(id)) return 'document';
	return null;
}

/** Check if a string is a valid entity ID */
export function isEntityId(id: string): boolean {
	return getEntityTypeFromId(id) !== null;
}

/** Entity Index - maintains a map of entity IDs to files */
export class EntityIndex {
	private index: Map<string, EntityIndexEntry> = new Map();
	private app: App;
	private settings: EntityNavigatorSettings;
	private initialized: boolean = false;

	constructor(app: App, settings: EntityNavigatorSettings) {
		this.app = app;
		this.settings = settings;
	}

	/** Build the entity index from vault files */
	async buildIndex(): Promise<void> {
		console.log("[Entity Navigator] Building entity index...");
		this.index.clear();
		const files = this.app.vault.getMarkdownFiles();
		let indexed = 0;
		for (const file of files) {
			const entry = await this.indexFile(file);
			if (entry) {
				this.index.set(entry.id, entry);
				indexed++;
			}
		}
		this.initialized = true;
		console.log(`[Entity Navigator] Indexed ${indexed} entities`);
	}

	/** Index a single file and return entry if it's an entity */
	private async indexFile(file: TFile): Promise<EntityIndexEntry | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return null;
		const fm = cache.frontmatter as EntityFrontmatter;
		let id = fm.id;
		if (!id) {
			const match = file.basename.match(/^([A-Z]+-\d{3,}|DEC-\d{3,}|DOC-\d{3,})/);
			if (match) id = match[1];
		}
		if (!id || !isEntityId(id)) return null;
		const type = fm.type || getEntityTypeFromId(id);
		if (!type) return null;
		return {
			id, type, file,
			title: fm.title || file.basename,
			parent: fm.parent,
			depends_on: this.normalizeArray(fm.depends_on),
			implements: this.normalizeArray(fm.implements),
			enables: this.normalizeArray(fm.enables),
			implemented_by: this.normalizeArray(fm.implemented_by),
		};
	}

	private normalizeArray(arr: string[] | string | undefined): string[] {
		if (!arr) return [];
		if (typeof arr === 'string') return [arr];
		return arr;
	}

	/** Update index when a file changes */
	async updateFile(file: TFile): Promise<void> {
		for (const [id, entry] of this.index) {
			if (entry.file.path === file.path) {
				this.index.delete(id);
				break;
			}
		}
		const entry = await this.indexFile(file);
		if (entry) this.index.set(entry.id, entry);
	}

	/** Remove file from index */
	removeFile(file: TFile): void {
		for (const [id, entry] of this.index) {
			if (entry.file.path === file.path) {
				this.index.delete(id);
				break;
			}
		}
	}

	/** Get entity by ID */
	get(id: string): EntityIndexEntry | undefined { return this.index.get(id); }

	/** Get file by entity ID */
	getFile(id: string): TFile | undefined { return this.index.get(id)?.file; }

	/** Check if index is ready */
	isReady(): boolean { return this.initialized; }

	/** Get all entities of a specific type */
	getByType(type: EntityType): EntityIndexEntry[] {
		return Array.from(this.index.values()).filter(e => e.type === type);
	}

	// =========================================================================
	// Navigation Methods
	// =========================================================================

	/** Get parent entity (Story->Milestone, Task->Story) */
	getParent(id: string): EntityIndexEntry | undefined {
		const entity = this.index.get(id);
		if (!entity?.parent) return undefined;
		return this.index.get(entity.parent);
	}

	/** Get children entities (Milestone->Stories, Story->Tasks) */
	getChildren(id: string): EntityIndexEntry[] {
		return Array.from(this.index.values()).filter(e => e.parent === id);
	}

	/** Get dependencies (entities this one depends on) */
	getDependencies(id: string): EntityIndexEntry[] {
		const entity = this.index.get(id);
		if (!entity) return [];
		return entity.depends_on
			.map(depId => this.index.get(depId))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	/** Get dependents (entities that depend on this one) */
	getDependents(id: string): EntityIndexEntry[] {
		return Array.from(this.index.values()).filter(e => e.depends_on.includes(id));
	}

	/** Get documents this entity implements */
	getImplementedDocuments(id: string): EntityIndexEntry[] {
		const entity = this.index.get(id);
		if (!entity) return [];
		return entity.implements
			.map(docId => this.index.get(docId))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	/** Get entities that implement this document */
	getImplementors(docId: string): EntityIndexEntry[] {
		const doc = this.index.get(docId);
		if (!doc) return [];
		const fromImplements = Array.from(this.index.values()).filter(e => e.implements.includes(docId));
		const fromImplementedBy = doc.implemented_by
			.map(id => this.index.get(id))
			.filter((e): e is EntityIndexEntry => e !== undefined);
		const seen = new Set<string>();
		const result: EntityIndexEntry[] = [];
		for (const e of [...fromImplements, ...fromImplementedBy]) {
			if (!seen.has(e.id)) { seen.add(e.id); result.push(e); }
		}
		return result;
	}

	/** Get decisions related to an entity */
	getRelatedDecisions(id: string): EntityIndexEntry[] {
		const entity = this.index.get(id);
		if (!entity) return [];
		const decisions = new Set<string>();
		for (const depId of entity.depends_on) {
			if (getEntityTypeFromId(depId) === 'decision') decisions.add(depId);
		}
		for (const dec of this.getByType('decision')) {
			if (dec.enables.includes(id)) decisions.add(dec.id);
		}
		return Array.from(decisions)
			.map(decId => this.index.get(decId))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	/** Get entities enabled by a decision */
	getEnabledEntities(decisionId: string): EntityIndexEntry[] {
		const decision = this.index.get(decisionId);
		if (!decision) return [];
		return decision.enables
			.map(id => this.index.get(id))
			.filter((e): e is EntityIndexEntry => e !== undefined);
	}

	/** Get entity from file */
	getFromFile(file: TFile): EntityIndexEntry | undefined {
		for (const entry of this.index.values()) {
			if (entry.file.path === file.path) return entry;
		}
		return undefined;
	}
}
