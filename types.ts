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
	defaultCollapsed: boolean;
	showIdInCanvas: boolean;
	expandedFields: string[];
	shapeTask: string;
	shapeAccomplishment: string;
	effortColorMap: Record<string, string>;
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
	defaultCollapsed: false,
	showIdInCanvas: true,
	expandedFields: ["effort", "status", "priority"],
	shapeTask: "task",
	shapeAccomplishment: "accomplishment",
	effortColorMap: {
		Business: "6",
		Infra: "4",
		Engineering: "3",
		Research: "2",
		Design: "1",
		Marketing: "5",
	},
	notionEnabled: false,
	notionIntegrationToken: "",
	notionParentPageId: "",
	notionDatabaseId: "",
	notionDatabaseName: "Obsidian Canvas Items",
	syncOnNoteCreate: true,
	syncOnDemandOnly: false,
};

export type ItemType = "task" | "accomplishment";
// v2.1 spec-aligned status/priority while staying backward compatible with Notion mapping
export type ItemStatus = "Not Started" | "In Progress" | "Completed" | "Blocked";
export type ItemPriority = "Low" | "Medium" | "High" | "Critical";

export interface ItemFrontmatter {
	type: ItemType;
	title: string;
	effort: string;
	id: string;
	status: ItemStatus;
	priority: ItemPriority;
	created_by_plugin?: boolean;
	created: string;
	updated: string;
	canvas_source: string;
	vault_path: string;
	notion_page_id?: string;
	// Optional per-note display sizing
	collapsed_height?: number;
	expanded_height?: number;
	expanded_width?: number;
}

