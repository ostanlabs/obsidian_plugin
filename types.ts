export interface CanvasItemFromTemplateSettings {
	notesBaseFolder: string;
	accomplishmentTemplatePath: string;
	templateFolder: string; // Folder to scan for additional templates
	useTemplateFolder: boolean; // Enable template folder scanning
	idPrefixAccomplishment: string;
	idZeroPadLength: number;
	effortOptions: string[];
	defaultEffort: string;
	inferBaseFolderFromCanvas: boolean;
	showIdInCanvas: boolean;
	shapeAccomplishment: string;
	effortColorMap: Record<string, string>;
	inProgressColor: string; // Color to use when inProgress is true
	// Notion
	notionEnabled: boolean;
	notionIntegrationToken: string;
	notionParentPageId: string;
	notionDatabaseId: string;
	notionDatabaseName: string;
	syncOnNoteCreate: boolean;
	syncOnDemandOnly: boolean;
	notionSyncIntervalMinutes: number; // Polling interval for bi-directional sync
	autoSyncOnMdChange: boolean; // Auto-sync when MD file is modified
}

export const DEFAULT_SETTINGS: CanvasItemFromTemplateSettings = {
	notesBaseFolder: "Projects",
	accomplishmentTemplatePath: "Templates/canvas-accomplishment-template.md",
	templateFolder: "Templates",
	useTemplateFolder: false,
	idPrefixAccomplishment: "A",
	idZeroPadLength: 3,
	effortOptions: ["Business", "Infra", "Engineering", "Research"],
	defaultEffort: "Engineering",
	inferBaseFolderFromCanvas: true,
	showIdInCanvas: true,
	shapeAccomplishment: "accomplishment",
	effortColorMap: {
		Business: "6",
		Infra: "4",
		Engineering: "3",
		Research: "2",
	},
	inProgressColor: "1", // Red
	notionEnabled: false,
	notionIntegrationToken: "",
	notionParentPageId: "",
	notionDatabaseId: "",
	notionDatabaseName: "Obsidian Canvas Items",
	syncOnNoteCreate: true,
	syncOnDemandOnly: false,
	notionSyncIntervalMinutes: 5,
	autoSyncOnMdChange: true,
};

export type ItemType = "accomplishment";
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
	inProgress?: boolean; // When true, node border is red
	time_estimate?: number; // Total time estimate in hours (sum of task estimates)
	depends_on?: string[]; // Array of accomplishment IDs this depends on
	created_by_plugin?: boolean;
	created: string;
	updated: string;
	canvas_source: string;
	vault_path: string;
	notion_page_id?: string;
}

