import { Client } from "@notionhq/client";
import { requestUrl, RequestUrlParam } from "obsidian";
import { CanvasItemFromTemplateSettings, ItemFrontmatter } from "../types";
import { Logger } from "../util/logger";

/**
 * Notion property value types
 */
type NotionPropertyValue =
	| { title: Array<{ text: { content: string } }> }
	| { select: { name: string } | null }
	| { rich_text: Array<{ text: { content: string } }> }
	| { checkbox: boolean }
	| { number: number }
	| { date: { start: string } | null }
	| { relation: Array<{ id: string }> };

/**
 * Type for dual_property relation (not fully typed in Notion SDK)
 */
interface DualPropertyRelation {
	relation: {
		database_id: string;
		type: "dual_property";
		dual_property: {
			synced_property_name: string;
		};
	};
}

/**
 * Notion properties object
 */
type NotionProperties = Record<string, NotionPropertyValue>;

/**
 * Notion page result from API
 */
interface NotionPageResult {
	id: string;
	object: "page";
	properties: Record<string, unknown>;
	last_edited_time?: string;
	created_time?: string;
}

/**
 * Notion block result from API
 */
interface NotionBlockResult {
	id: string;
	object: "block";
	type: string;
	[key: string]: unknown;
}

/**
 * Custom fetch implementation using Obsidian's requestUrl to bypass CORS
 * The Notion SDK uses fetch internally, which triggers CORS in Electron.
 * Obsidian's requestUrl makes requests at the native level, bypassing CORS.
 */
function obsidianFetch(url: string, init?: RequestInit): Promise<Response> {
	const params: RequestUrlParam = {
		url,
		method: (init?.method as string) || "GET",
		headers: init?.headers as Record<string, string>,
		body: init?.body as string,
		throw: false, // Don't throw on non-2xx, let us handle it
	};

	return requestUrl(params).then((response) => {
		// Convert Obsidian's response to a fetch-like Response object
		// Using 'as unknown as Response' to satisfy TypeScript while providing
		// the minimal interface the Notion SDK actually uses
		return {
			ok: response.status >= 200 && response.status < 300,
			status: response.status,
			statusText: String(response.status),
			headers: new Headers(response.headers),
			url,
			json: () => Promise.resolve(response.json),
			text: () => Promise.resolve(response.text),
			blob: () => Promise.resolve(new Blob([response.arrayBuffer])),
			arrayBuffer: () => Promise.resolve(response.arrayBuffer),
			bytes: () => Promise.resolve(new Uint8Array(response.arrayBuffer)),
			clone: () => { throw new Error("clone not implemented"); },
			body: null,
			bodyUsed: false,
			formData: () => Promise.reject(new Error("formData not implemented")),
			redirected: false,
			type: "basic" as ResponseType,
		} as unknown as Response;
	});
}

export class NotionClient {
	private client: Client | null = null;
	private settings: CanvasItemFromTemplateSettings;
	private logger: Logger;

	constructor(settings: CanvasItemFromTemplateSettings, logger: Logger) {
		this.settings = settings;
		this.logger = logger;
		this.initializeClient();
	}

	/**
	 * Initialize the Notion client if credentials are available
	 * Uses custom fetch to bypass CORS restrictions in Obsidian
	 */
	private initializeClient(): void {
		if (
			this.settings.notionEnabled &&
			this.settings.notionIntegrationToken
		) {
			this.client = new Client({
				auth: this.settings.notionIntegrationToken,
				fetch: obsidianFetch,
			});
			this.logger.info("Notion client initialized with Obsidian fetch");
		} else {
			this.client = null;
		}
	}

	/**
	 * Update settings and reinitialize client
	 */
	updateSettings(settings: CanvasItemFromTemplateSettings): void {
		this.settings = settings;
		this.initializeClient();
	}

	/**
	 * Check if Notion is enabled and configured
	 */
	isConfigured(): boolean {
		return (
			this.settings.notionEnabled &&
			!!this.settings.notionIntegrationToken &&
			!!this.settings.notionParentPageId
		);
	}

	/**
	 * Check if a database is initialized
	 */
	isDatabaseInitialized(): boolean {
		return !!this.settings.notionDatabaseId;
	}

	/**
	 * Create a Notion database with the required schema
	 */
	async createDatabase(): Promise<string> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		if (!this.settings.notionParentPageId) {
			throw new Error("Parent page ID not set");
		}

		try {
			this.logger.info("Creating Notion database...");

			const response = await this.client.databases.create({
				parent: {
					type: "page_id",
					page_id: this.settings.notionParentPageId,
				},
				title: [
					{
						type: "text",
						text: {
							content: this.settings.notionDatabaseName,
						},
					},
				],
				properties: {
					Name: {
						title: {},
					},
					Type: {
						select: {
							options: [
								{ name: "Accomplishment", color: "green" as const },
							],
						},
					},
					Effort: {
						select: {
							options: this.settings.effortOptions.map((effort, idx) => ({
								name: effort,
								color: this.getColorForIndex(idx),
							})),
						},
					},
					ID: {
						rich_text: {},
					},
					Status: {
						select: {
							options: [
								{ name: "todo", color: "gray" as const },
								{ name: "in_progress", color: "yellow" as const },
								{ name: "done", color: "green" as const },
								{ name: "blocked", color: "red" as const },
							],
						},
					},
					Priority: {
						select: {
							options: [
								{ name: "low", color: "gray" as const },
								{ name: "medium", color: "yellow" as const },
								{ name: "high", color: "orange" as const },
								{ name: "critical", color: "red" as const },
							],
						},
					},
					"In Progress": {
						checkbox: {},
					},
					"Time Estimate": {
						number: {
							format: "number" as const,
						},
					},
					Created: {
						date: {},
					},
					Updated: {
						date: {},
					},
					"Canvas Source": {
						rich_text: {},
					},
					"Vault Path": {
						rich_text: {},
					},
					"Last Synced": {
						date: {},
					},
				},
			});

			this.logger.info("Notion database created", { id: response.id });

			// Add self-referential relation for dependencies
			// This must be done after database creation since we need the database ID
			await this.addDependencyRelation(response.id);

			return response.id;
		} catch (error) {
			this.logger.error("Failed to create Notion database", error);
			throw error;
		}
	}

	/**
	 * Add the "Depends On" self-referential relation to the database
	 * This creates a two-way relation (Depends On / Blocks)
	 */
	private async addDependencyRelation(databaseId: string): Promise<void> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			this.logger.info("Adding dependency relation to database...");

			// Use type assertion because the SDK types don't fully support dual_property
			const dependsOnProperty: DualPropertyRelation = {
				relation: {
					database_id: databaseId,
					type: "dual_property",
					dual_property: {
						synced_property_name: "Blocks",
					},
				},
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await this.client.databases.update({
				database_id: databaseId,
				properties: {
					"Depends On": dependsOnProperty,
				} as any,
			});

			this.logger.info("Dependency relation added successfully");
		} catch (error) {
			this.logger.error("Failed to add dependency relation", error);
			throw error;
		}
	}

	/**
	 * Get a color for an index (for select options)
	 */
	private getColorForIndex(idx: number): "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red" {
		const colors: Array<"default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red"> = [
			"default",
			"gray",
			"brown",
			"orange",
			"yellow",
			"green",
			"blue",
			"purple",
			"pink",
			"red",
		];
		return colors[idx % colors.length];
	}

	/**
	 * Create a page in Notion from frontmatter
	 */
	async createPage(frontmatter: ItemFrontmatter): Promise<string> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		if (!this.settings.notionDatabaseId) {
			throw new Error("Notion database not initialized");
		}

		try {
			this.logger.info("Creating Notion page", { id: frontmatter.id });

			const response = await this.client.pages.create({
				parent: {
					type: "database_id",
					database_id: this.settings.notionDatabaseId,
				},
				properties: this.buildProperties(frontmatter),
			});

			this.logger.info("Notion page created", { pageId: response.id });
			return response.id;
		} catch (error) {
			this.logger.error("Failed to create Notion page", error);
			throw error;
		}
	}

	/**
	 * Update an existing page in Notion
	 */
	async updatePage(pageId: string, frontmatter: ItemFrontmatter): Promise<void> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			this.logger.info("Updating Notion page", { pageId, id: frontmatter.id });

			await this.client.pages.update({
				page_id: pageId,
				properties: this.buildProperties(frontmatter),
			});

			this.logger.info("Notion page updated", { pageId });
		} catch (error) {
			this.logger.error("Failed to update Notion page", error);
			throw error;
		}
	}

	/**
	 * Build Notion properties from frontmatter
	 */
	private buildProperties(frontmatter: ItemFrontmatter): NotionProperties {
		const properties: NotionProperties = {
			Name: {
				title: [
					{
						text: {
							content: frontmatter.title,
						},
					},
				],
			},
			Type: {
				select: {
					name: "Accomplishment",
				},
			},
			Effort: {
				select: {
					name: frontmatter.effort,
				},
			},
			ID: {
				rich_text: [
					{
						text: {
							content: frontmatter.id,
						},
					},
				],
			},
			Status: {
				select: {
					name: this.mapStatus(frontmatter.status),
				},
			},
			Priority: {
				select: {
					name: this.mapPriority(frontmatter.priority),
				},
			},
			"Canvas Source": {
				rich_text: [
					{
						text: {
							content: frontmatter.canvas_source,
						},
					},
				],
			},
			"Vault Path": {
				rich_text: [
					{
						text: {
							content: frontmatter.vault_path,
						},
					},
				],
			},
			"In Progress": {
				checkbox: frontmatter.inProgress ?? false,
			},
			"Time Estimate": {
				number: typeof frontmatter.time_estimate === 'number'
					? frontmatter.time_estimate
					: (parseInt(String(frontmatter.time_estimate), 10) || 0),
			},
			Created: {
				date: frontmatter.created ? {
					start: frontmatter.created,
				} : null,
			},
			Updated: {
				date: frontmatter.updated ? {
					start: frontmatter.updated,
				} : null,
			},
			"Last Synced": {
				date: {
					start: new Date().toISOString(),
				},
			},
		};

		return properties;
	}

	/**
	 * Build Notion properties with dependency relations
	 * This is used when we have the page IDs for dependencies
	 */
	buildPropertiesWithRelations(frontmatter: ItemFrontmatter, dependencyPageIds: string[]): NotionProperties {
		const properties = this.buildProperties(frontmatter);

		if (dependencyPageIds.length > 0) {
			properties["Depends On"] = {
				relation: dependencyPageIds.map(id => ({ id })),
			};
		}

		return properties;
	}

	/**
	 * Update only the dependency relations for a page
	 */
	async updateDependencies(pageId: string, dependencyPageIds: string[]): Promise<void> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			this.logger.info("Updating dependencies for page", { pageId, dependencyCount: dependencyPageIds.length });

			await this.client.pages.update({
				page_id: pageId,
				properties: {
					"Depends On": {
						relation: dependencyPageIds.map(id => ({ id })),
					},
				},
			});

			this.logger.info("Dependencies updated", { pageId });
		} catch (error) {
			this.logger.error("Failed to update dependencies", error);
			throw error;
		}
	}

	private mapStatus(status: string): string {
		const map: Record<string, string> = {
			"Not Started": "todo",
			"In Progress": "in_progress",
			"Completed": "done",
			"Blocked": "blocked",
		};

		if (!status) return "todo";
		if (map[status]) return map[status];

		const lowerMap: Record<string, string> = {
			todo: "todo",
			"in_progress": "in_progress",
			"in progress": "in_progress",
			done: "done",
			completed: "done",
			blocked: "blocked",
		};

		const lower = status.toLowerCase();
		if (lowerMap[lower]) return lowerMap[lower];

		return "todo";
	}

	private mapPriority(priority: string): string {
		const map: Record<string, string> = {
			Low: "low",
			Medium: "medium",
			High: "high",
			Critical: "critical",
		};

		if (!priority) return "medium";
		if (map[priority]) return map[priority];

		const lowerMap: Record<string, string> = {
			low: "low",
			medium: "medium",
			high: "high",
			critical: "critical",
		};

		const lower = priority.toLowerCase();
		if (lowerMap[lower]) return lowerMap[lower];

		return "medium";
	}

	/**
	 * Sync a note to Notion (create or update)
	 */
	async syncNote(frontmatter: ItemFrontmatter): Promise<string> {
		if (!this.isConfigured()) {
			throw new Error("Notion is not configured");
		}

		if (!this.isDatabaseInitialized()) {
			throw new Error("Notion database is not initialized");
		}

		try {
			if (frontmatter.notion_page_id) {
				// Update existing page
				await this.updatePage(frontmatter.notion_page_id, frontmatter);
				return frontmatter.notion_page_id;
			} else {
				// Create new page
				const pageId = await this.createPage(frontmatter);
				return pageId;
			}
		} catch (error) {
			this.logger.error("Failed to sync note to Notion", error);
			throw error;
		}
	}

	/**
	 * Query all pages in the database
	 * Used for bi-directional sync and finding pages by accomplishment ID
	 */
	async queryAllPages(): Promise<NotionPageResult[]> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		if (!this.settings.notionDatabaseId) {
			throw new Error("Notion database not initialized");
		}

		try {
			const pages: NotionPageResult[] = [];
			let hasMore = true;
			let startCursor: string | undefined;

			while (hasMore) {
				const response = await this.client.databases.query({
					database_id: this.settings.notionDatabaseId,
					start_cursor: startCursor,
					page_size: 100,
				});

				pages.push(...(response.results as NotionPageResult[]));
				hasMore = response.has_more;
				startCursor = response.next_cursor ?? undefined;
			}

			this.logger.info("Queried all pages", { count: pages.length });
			return pages;
		} catch (error) {
			this.logger.error("Failed to query pages", error);
			throw error;
		}
	}

	/**
	 * Find a page by accomplishment ID
	 */
	async findPageByAccomplishmentId(accomplishmentId: string): Promise<NotionPageResult | null> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		if (!this.settings.notionDatabaseId) {
			throw new Error("Notion database not initialized");
		}

		try {
			const response = await this.client.databases.query({
				database_id: this.settings.notionDatabaseId,
				filter: {
					property: "ID",
					rich_text: {
						equals: accomplishmentId,
					},
				},
			});

			if (response.results.length > 0) {
				return response.results[0] as NotionPageResult;
			}
			return null;
		} catch (error) {
			this.logger.error("Failed to find page by ID", error);
			throw error;
		}
	}

	/**
	 * Archive a page in Notion (soft delete)
	 */
	async archivePage(pageId: string): Promise<void> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			this.logger.info("Archiving Notion page", { pageId });

			await this.client.pages.update({
				page_id: pageId,
				archived: true,
			});

			this.logger.info("Notion page archived", { pageId });
		} catch (error) {
			this.logger.error("Failed to archive Notion page", error);
			throw error;
		}
	}

	/**
	 * Get a page by ID with all properties
	 */
	async getPage(pageId: string): Promise<NotionPageResult> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			const page = await this.client.pages.retrieve({
				page_id: pageId,
			});
			return page as NotionPageResult;
		} catch (error) {
			this.logger.error("Failed to get page", error);
			throw error;
		}
	}

	/**
	 * Get page content (blocks)
	 */
	async getPageContent(pageId: string): Promise<NotionBlockResult[]> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			const blocks: NotionBlockResult[] = [];
			let hasMore = true;
			let startCursor: string | undefined;

			while (hasMore) {
				const response = await this.client.blocks.children.list({
					block_id: pageId,
					start_cursor: startCursor,
					page_size: 100,
				});

				blocks.push(...(response.results as NotionBlockResult[]));
				hasMore = response.has_more;
				startCursor = response.next_cursor ?? undefined;
			}

			return blocks;
		} catch (error) {
			this.logger.error("Failed to get page content", error);
			throw error;
		}
	}

	/**
	 * Update page content (replace all blocks)
	 * @param blocks - Array of block objects to append (using unknown to allow Notion SDK's BlockObjectRequest)
	 */
	async updatePageContent(pageId: string, blocks: unknown[]): Promise<void> {
		if (!this.client) {
			throw new Error("Notion client not initialized");
		}

		try {
			// First, delete existing blocks
			const existingBlocks = await this.getPageContent(pageId);
			for (const block of existingBlocks) {
				await this.client.blocks.delete({
					block_id: block.id,
				});
			}

			// Then, add new blocks
			if (blocks.length > 0) {
				// Cast to expected type - blocks come from markdownToNotionBlocks which creates valid block objects
				await this.client.blocks.children.append({
					block_id: pageId,
					children: blocks as Parameters<typeof this.client.blocks.children.append>[0]["children"],
				});
			}

			this.logger.info("Page content updated", { pageId, blockCount: blocks.length });
		} catch (error) {
			this.logger.error("Failed to update page content", error);
			throw error;
		}
	}
}

