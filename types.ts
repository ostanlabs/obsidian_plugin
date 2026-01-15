// Entity Navigator types
export type EntityType = 'milestone' | 'story' | 'task' | 'decision' | 'document' | 'feature';
export type OpenBehavior = 'tabs' | 'split-h' | 'split-v';

// Feature-specific types
export type FeatureTier = 'OSS' | 'Premium';
export type FeaturePhase = 'MVP' | '0' | '1' | '2' | '3' | '4' | '5';
export type FeatureStatus = 'Planned' | 'In Progress' | 'Complete' | 'Deferred';

export interface EntityNavigatorSettings {
	showDataviewWarning: boolean;
	openBehavior: OpenBehavior;
	// Entity folder paths (for optimized search)
	milestonesFolder: string;
	storiesFolder: string;
	tasksFolder: string;
	decisionsFolder: string;
	documentsFolder: string;
	featuresFolder: string;
}

export const DEFAULT_ENTITY_NAVIGATOR_SETTINGS: EntityNavigatorSettings = {
	showDataviewWarning: true,
	openBehavior: 'tabs',
	milestonesFolder: 'milestones',
	storiesFolder: 'stories',
	tasksFolder: 'tasks',
	decisionsFolder: 'decisions',
	documentsFolder: 'documents',
	featuresFolder: 'features',
};

export interface CanvasItemFromTemplateSettings {
	notesBaseFolder: string;
	templateFolder: string; // Folder to scan for additional templates
	useTemplateFolder: boolean; // Enable template folder scanning
	idZeroPadLength: number;
	effortOptions: string[];
	defaultEffort: string;
	inferBaseFolderFromCanvas: boolean;
	showIdInCanvas: boolean;
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
	// Entity Navigator
	entityNavigator: EntityNavigatorSettings;
	// HTTP Server
	httpServerEnabled: boolean;
	httpServerPort: number;
}

export const DEFAULT_SETTINGS: CanvasItemFromTemplateSettings = {
	notesBaseFolder: "Projects",
	templateFolder: "Templates",
	useTemplateFolder: false,
	idZeroPadLength: 3,
	effortOptions: ["Business", "Infra", "Engineering", "Research"],
	defaultEffort: "Engineering",
	inferBaseFolderFromCanvas: true,
	showIdInCanvas: true,
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
	entityNavigator: DEFAULT_ENTITY_NAVIGATOR_SETTINGS,
	httpServerEnabled: false,
	httpServerPort: 12312,
};
// v2.1 spec-aligned status/priority while staying backward compatible with Notion mapping
export type ItemStatus = "Not Started" | "In Progress" | "Completed" | "Blocked";
export type ItemPriority = "Low" | "Medium" | "High" | "Critical";

export interface ItemFrontmatter {
	type: EntityType;
	title: string;
	effort: string;
	id: string;
	status: ItemStatus;
	priority: ItemPriority;
	inProgress?: boolean; // When true, node border is red
	time_estimate?: number; // Total time estimate in hours (sum of task estimates)
	depends_on?: string[]; // Array of entity IDs this depends on
	implements?: string[]; // Array of feature IDs this entity implements (for milestones/stories)
	documents?: string[]; // Array of feature IDs this document documents (for documents)
	affects?: string[]; // Array of feature IDs this decision affects (for decisions)
	created_by_plugin?: boolean;
	created: string;
	updated: string;
	canvas_source: string;
	vault_path: string;
	notion_page_id?: string;
}

/**
 * Feature entity frontmatter (F-XXX)
 * Per FEATURE_ENTITY_SPEC.md
 */
export interface FeatureFrontmatter {
	// Identity (required)
	id: string;                      // F-XXX format
	type: 'feature';
	title: string;
	workstream: string;              // e.g., "engineering"

	// Feature Classification (required)
	user_story: string;              // "As a..., I want to..., so that..."
	tier: FeatureTier;               // OSS | Premium
	phase: FeaturePhase;             // MVP | 0 | 1 | 2 | 3 | 4 | 5
	status: FeatureStatus;           // Planned | In Progress | Complete | Deferred
	priority: ItemPriority;          // Low | Medium | High | Critical

	// Detail Fields (optional)
	personas?: string[];             // Target user personas
	acceptance_criteria?: string[];  // Completion criteria
	test_refs?: string[];            // Test file references

	// Relationships
	implemented_by?: string[];       // Milestones and Stories (M-XXX, S-XXX)
	documented_by?: string[];        // Documents (DOC-XXX)
	decided_by?: string[];           // Decisions (DEC-XXX)
	depends_on?: string[];           // Other Features (F-XXX)
	blocks?: string[];               // Features this blocks (auto-synced)

	// Metadata (auto-managed)
	last_updated: string;            // ISO 8601 datetime
	created_at: string;              // ISO 8601 datetime
	created_by_plugin?: boolean;
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

/**
 * Internal canvas object (view's canvas property)
 * This is not part of the public Obsidian API
 */
export interface InternalCanvasObject {
	x?: number;
	y?: number;
	zoom?: number;
	wrapperEl?: HTMLElement;
	setViewport?: (x: number, y: number, zoom: number) => void;
	requestFrame?: () => void;
	markViewportChanged?: () => void;
}

/**
 * Internal canvas view (runtime representation)
 * This is not part of the public Obsidian API
 */
export interface InternalCanvasView {
	file?: { path: string };
	canvas?: InternalCanvasObject;
}

/**
 * Extended CanvasNode with styleAttributes (Obsidian-specific)
 */
export interface ExtendedCanvasNode {
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
	metadata?: Record<string, unknown>;
	styleAttributes?: Record<string, unknown>;
}

