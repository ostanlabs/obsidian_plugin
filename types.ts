export interface CanvasItemFromTemplateSettings {
	notesBaseFolder: string;
	taskTemplatePath: string;
	accomplishmentTemplatePath: string;
	templateFolder: string; // Folder to scan for additional templates
	useTemplateFolder: boolean; // Enable template folder scanning
	idPrefixTask: string;
	idPrefixAccomplishment: string;
	idZeroPadLength: number;
	effortOptions: string[];
	defaultEffort: string;
	inferBaseFolderFromCanvas: boolean;
	// Notion
	notionEnabled: boolean;
	notionIntegrationToken: string;
	notionParentPageId: string;
	notionDatabaseId: string;
	notionDatabaseName: string;
	syncOnNoteCreate: boolean;
	syncOnDemandOnly: boolean;
}

export const DEFAULT_SETTINGS: CanvasItemFromTemplateSettings = {
	notesBaseFolder: "Projects",
	taskTemplatePath: "Templates/canvas-task-template.md",
	accomplishmentTemplatePath: "Templates/canvas-accomplishment-template.md",
	templateFolder: "Templates",
	useTemplateFolder: false,
	idPrefixTask: "T",
	idPrefixAccomplishment: "A",
	idZeroPadLength: 3,
	effortOptions: ["Business", "Infra", "Engineering", "Research"],
	defaultEffort: "Engineering",
	inferBaseFolderFromCanvas: true,
	notionEnabled: false,
	notionIntegrationToken: "",
	notionParentPageId: "",
	notionDatabaseId: "",
	notionDatabaseName: "Obsidian Canvas Items",
	syncOnNoteCreate: true,
	syncOnDemandOnly: false,
};

export type ItemType = "task" | "accomplishment";
export type ItemStatus = "todo" | "in_progress" | "done" | "blocked";
export type ItemPriority = "low" | "medium" | "high" | "critical";

export interface ItemFrontmatter {
	type: ItemType;
	title: string;
	effort: string;
	id: string;
	parent?: string;
	status: ItemStatus;
	priority: ItemPriority;
	created: string;
	updated: string;
	canvas_source: string;
	vault_path: string;
	notion_page_id?: string;
}

