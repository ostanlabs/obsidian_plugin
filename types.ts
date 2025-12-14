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

/**
 * Internal canvas node data (from getData())
 * This is not part of the public Obsidian API
 */
export interface InternalCanvasNodeData {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
	text?: string;
	file?: string;
	url?: string;
	label?: string;
	metadata?: {
		plugin?: string;
		collapsed?: boolean;
		alias?: string;
		shape?: string;
		effortColor?: string;
		showId?: boolean;
		expandedFields?: string[];
		expandedSize?: { width: number; height: number };
		[key: string]: unknown;
	};
}

/**
 * Internal canvas node object (runtime representation)
 * This is not part of the public Obsidian API
 */
export interface InternalCanvasNode {
	nodeEl: HTMLElement;
	getData: () => InternalCanvasNodeData;
	setData?: (data: Partial<InternalCanvasNodeData>) => void;
	setColor?: (color: string) => void;
	render?: () => void;
	canvas?: InternalCanvas & { view?: { file?: unknown } };
}

/**
 * Internal canvas object
 * This is not part of the public Obsidian API
 */
export interface InternalCanvas {
	nodes: Map<string, InternalCanvasNode>;
	data?: { nodes: InternalCanvasNodeData[] };
	requestSave?: () => void;
}

/**
 * Result from getCanvasNodeFromEventTarget
 */
export interface CanvasNodeResult {
	node: InternalCanvasNode;
	el: HTMLElement;
}

/**
 * Notion rich text element
 */
export interface NotionRichText {
	type: string;
	text?: { content: string };
	plain_text?: string;
}

/**
 * Notion block element
 */
export interface NotionBlock {
	type: string;
	paragraph?: { rich_text: NotionRichText[] };
	heading_1?: { rich_text: NotionRichText[] };
	heading_2?: { rich_text: NotionRichText[] };
	heading_3?: { rich_text: NotionRichText[] };
	bulleted_list_item?: { rich_text: NotionRichText[] };
	numbered_list_item?: { rich_text: NotionRichText[] };
	to_do?: { rich_text: NotionRichText[]; checked?: boolean };
	code?: { rich_text: NotionRichText[]; language?: string };
	quote?: { rich_text: NotionRichText[] };
}

/**
 * Notion page response (partial)
 */
export interface NotionPage {
	id: string;
	properties?: {
		Title?: { title?: NotionRichText[] };
		ID?: { rich_text?: NotionRichText[] };
		Status?: { select?: { name?: string } };
		Priority?: { select?: { name?: string } };
		Effort?: { select?: { name?: string } };
		"Time Estimate"?: { number?: number };
		"In Progress"?: { checkbox?: boolean };
		"Depends On"?: { multi_select?: Array<{ name?: string }> };
		[key: string]: unknown;
	};
	last_edited_time?: string;
}

/**
 * Canvas edge data
 */
export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	color?: string;
	label?: string;
}

