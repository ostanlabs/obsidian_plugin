import { ItemView, WorkspaceLeaf, TFile, App } from "obsidian";
import { parseAnyFrontmatter } from "../util/frontmatter";
import { FeatureFrontmatter } from "../types";

export const FEATURE_DETAILS_VIEW_TYPE = "feature-details-view";

export class FeatureDetailsView extends ItemView {
	private currentFeature: FeatureFrontmatter | null = null;
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return FEATURE_DETAILS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Feature Details";
	}

	getIcon(): string {
		return "star";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("feature-details-container");
		
		this.renderEmptyState(container as HTMLElement);
		
		// Listen for active file changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateFromActiveFile();
			})
		);
		
		// Initial update
		this.updateFromActiveFile();
	}

	async onClose(): Promise<void> {
		// Cleanup
	}

	private async updateFromActiveFile(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			return;
		}

		// Check if it's a feature file
		if (!activeFile.basename.match(/^F-\d{3,}/)) {
			return;
		}

		const content = await this.app.vault.read(activeFile);
		const fm = parseAnyFrontmatter(content);
		if (!fm || fm.type !== "feature") {
			return;
		}

		this.currentFeature = fm as unknown as FeatureFrontmatter;
		this.currentFile = activeFile;
		this.render();
	}

	public async showFeature(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const fm = parseAnyFrontmatter(content);
		if (!fm) return;

		this.currentFeature = fm as unknown as FeatureFrontmatter;
		this.currentFile = file;
		this.render();
	}

	private render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		if (!this.currentFeature) {
			this.renderEmptyState(container);
			return;
		}

		const f = this.currentFeature;

		// Header
		const header = container.createDiv({ cls: "feature-details-header" });
		header.createEl("h3", { text: f.id || "Feature" });
		header.createEl("h4", { text: f.title || "Untitled" });

		// Status badges
		const badges = container.createDiv({ cls: "feature-details-badges" });
		badges.createEl("span", { text: f.tier || "OSS", cls: `badge badge-tier-${(f.tier || "OSS").toLowerCase()}` });
		badges.createEl("span", { text: `Phase ${f.phase || "MVP"}`, cls: "badge badge-phase" });
		badges.createEl("span", { text: f.status || "Planned", cls: `badge badge-status-${(f.status || "Planned").toLowerCase().replace(" ", "-")}` });
		badges.createEl("span", { text: f.priority || "Medium", cls: `badge badge-priority-${(f.priority || "Medium").toLowerCase()}` });

		// User Story
		if (f.user_story) {
			const storySection = container.createDiv({ cls: "feature-details-section" });
			storySection.createEl("h5", { text: "User Story" });
			storySection.createEl("p", { text: f.user_story, cls: "feature-user-story" });
		}

		// Workstream & Personas
		const metaSection = container.createDiv({ cls: "feature-details-section" });
		if (f.workstream) {
			metaSection.createEl("div", { text: `Workstream: ${f.workstream}` });
		}
		if (f.personas && f.personas.length > 0) {
			metaSection.createEl("div", { text: `Personas: ${f.personas.join(", ")}` });
		}

		// Acceptance Criteria
		if (f.acceptance_criteria && f.acceptance_criteria.length > 0) {
			const acSection = container.createDiv({ cls: "feature-details-section" });
			acSection.createEl("h5", { text: "Acceptance Criteria" });
			const list = acSection.createEl("ul");
			for (const criterion of f.acceptance_criteria) {
				list.createEl("li", { text: criterion });
			}
		}

		// Relationships
		this.renderRelationships(container, f);
	}

	private renderRelationships(container: HTMLElement, f: FeatureFrontmatter): void {
		const relSection = container.createDiv({ cls: "feature-details-section" });
		relSection.createEl("h5", { text: "Relationships" });

		this.renderRelationshipList(relSection, "Implemented By", f.implemented_by);
		this.renderRelationshipList(relSection, "Documented By", f.documented_by);
		this.renderRelationshipList(relSection, "Decided By", f.decided_by);
		this.renderRelationshipList(relSection, "Depends On", f.depends_on);
		this.renderRelationshipList(relSection, "Blocks", f.blocks);
	}

	private renderRelationshipList(container: HTMLElement, label: string, ids?: string[]): void {
		if (!ids || ids.length === 0) return;
		const div = container.createDiv({ cls: "feature-relationship" });
		div.createEl("strong", { text: `${label}: ` });
		div.createEl("span", { text: ids.join(", ") });
	}

	private renderEmptyState(container: HTMLElement): void {
		const empty = container.createDiv({ cls: "feature-details-empty" });
		empty.createEl("p", { text: "Open a feature file to see details" });
		empty.createEl("p", { text: "Feature files start with F- (e.g., F-001)", cls: "feature-details-hint" });
	}
}

