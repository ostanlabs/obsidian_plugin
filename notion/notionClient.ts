import { Client } from "@notionhq/client";
import { Notice } from "obsidian";
import { CanvasItemFromTemplateSettings, ItemFrontmatter } from "../types";
import { Logger } from "../util/logger";

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
	 */
	private initializeClient(): void {
		if (
			this.settings.notionEnabled &&
			this.settings.notionIntegrationToken
		) {
			this.client = new Client({
				auth: this.settings.notionIntegrationToken,
			});
			this.logger.info("Notion client initialized");
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
								{ name: "Task", color: "blue" as const },
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
					Parent: {
						rich_text: {},
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
			return response.id;
		} catch (error) {
			this.logger.error("Failed to create Notion database", error);
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
	private buildProperties(frontmatter: ItemFrontmatter): any {
		const properties: any = {
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
			"Last Synced": {
				date: {
					start: new Date().toISOString(),
				},
			},
		};

		return properties;
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
}

