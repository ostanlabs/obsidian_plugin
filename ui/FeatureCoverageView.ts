import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { parseAnyFrontmatter } from "../util/frontmatter";
import { FeatureFrontmatter, FeatureTier, FeaturePhase, FeatureStatus } from "../types";

export const FEATURE_COVERAGE_VIEW_TYPE = "feature-coverage-view";

interface FeatureCoverageEntry {
	id: string;
	title: string;
	tier: FeatureTier;
	phase: FeaturePhase;
	status: FeatureStatus;
	implementedByCount: number;
	documentedByCount: number;
	decidedByCount: number;
	hasTests: boolean;
	file: TFile;
}

interface CoverageFilters {
	tier: FeatureTier | "all";
	phase: FeaturePhase | "all";
	status: FeatureStatus | "all";
	hasGaps: boolean;
}

export class FeatureCoverageView extends ItemView {
	private features: FeatureCoverageEntry[] = [];
	private filters: CoverageFilters = {
		tier: "all",
		phase: "all",
		status: "all",
		hasGaps: false,
	};

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return FEATURE_COVERAGE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Feature Coverage";
	}

	getIcon(): string {
		return "bar-chart-2";
	}

	async onOpen(): Promise<void> {
		await this.loadFeatures();
		this.render();
	}

	async onClose(): Promise<void> {}

	private async loadFeatures(): Promise<void> {
		this.features = [];
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			if (!file.basename.match(/^F-\d{3,}/)) continue;

			const content = await this.app.vault.read(file);
			const fm = parseAnyFrontmatter(content);
			if (!fm || fm.type !== "feature") continue;

			const f = fm as unknown as FeatureFrontmatter;
			this.features.push({
				id: f.id || file.basename,
				title: f.title || "Untitled",
				tier: f.tier || "OSS",
				phase: f.phase || "MVP",
				status: f.status || "Planned",
				implementedByCount: (f.implemented_by || []).length,
				documentedByCount: (f.documented_by || []).length,
				decidedByCount: (f.decided_by || []).length,
				hasTests: !!(f.test_refs && f.test_refs.length > 0),
				file,
			});
		}

		this.features.sort((a, b) => a.id.localeCompare(b.id));
	}

	private getFilteredFeatures(): FeatureCoverageEntry[] {
		return this.features.filter((f) => {
			if (this.filters.tier !== "all" && f.tier !== this.filters.tier) return false;
			if (this.filters.phase !== "all" && f.phase !== this.filters.phase) return false;
			if (this.filters.status !== "all" && f.status !== this.filters.status) return false;
			if (this.filters.hasGaps) {
				const hasGap = f.implementedByCount === 0 || f.documentedByCount === 0 || !f.hasTests;
				if (!hasGap) return false;
			}
			return true;
		});
	}

	private render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("feature-coverage-container");

		// Header
		container.createEl("h3", { text: "Feature Coverage Report" });

		// Filters
		this.renderFilters(container);

		// Summary
		this.renderSummary(container);

		// Table
		this.renderTable(container);
	}

	private renderFilters(container: HTMLElement): void {
		const filterRow = container.createDiv({ cls: "feature-coverage-filters" });

		// Tier filter
		const tierSelect = filterRow.createEl("select");
		tierSelect.createEl("option", { value: "all", text: "All Tiers" });
		tierSelect.createEl("option", { value: "OSS", text: "OSS" });
		tierSelect.createEl("option", { value: "Premium", text: "Premium" });
		tierSelect.value = this.filters.tier;
		tierSelect.addEventListener("change", () => {
			this.filters.tier = tierSelect.value as FeatureTier | "all";
			this.render();
		});

		// Phase filter
		const phaseSelect = filterRow.createEl("select");
		phaseSelect.createEl("option", { value: "all", text: "All Phases" });
		["MVP", "0", "1", "2", "3", "4", "5"].forEach((p) => {
			phaseSelect.createEl("option", { value: p, text: `Phase ${p}` });
		});
		phaseSelect.value = this.filters.phase;
		phaseSelect.addEventListener("change", () => {
			this.filters.phase = phaseSelect.value as FeaturePhase | "all";
			this.render();
		});

		// Status filter
		const statusSelect = filterRow.createEl("select");
		statusSelect.createEl("option", { value: "all", text: "All Statuses" });
		["Planned", "In Progress", "Complete", "Deferred"].forEach((s) => {
			statusSelect.createEl("option", { value: s, text: s });
		});
		statusSelect.value = this.filters.status;
		statusSelect.addEventListener("change", () => {
			this.filters.status = statusSelect.value as FeatureStatus | "all";
			this.render();
		});

		// Has gaps checkbox
		const gapsLabel = filterRow.createEl("label", { cls: "feature-coverage-gaps-filter" });
		const gapsCheckbox = gapsLabel.createEl("input", { type: "checkbox" });
		gapsCheckbox.checked = this.filters.hasGaps;
		gapsLabel.createSpan({ text: " Show only with gaps" });
		gapsCheckbox.addEventListener("change", () => {
			this.filters.hasGaps = gapsCheckbox.checked;
			this.render();
		});

		// Refresh button
		const refreshBtn = filterRow.createEl("button", { text: "Refresh" });
		refreshBtn.addEventListener("click", async () => {
			await this.loadFeatures();
			this.render();
		});
	}

	private renderSummary(container: HTMLElement): void {
		const filtered = this.getFilteredFeatures();
		const total = filtered.length;
		const withImpl = filtered.filter((f) => f.implementedByCount > 0).length;
		const withDocs = filtered.filter((f) => f.documentedByCount > 0).length;
		const withTests = filtered.filter((f) => f.hasTests).length;
		const complete = filtered.filter((f) => f.status === "Complete").length;

		const summary = container.createDiv({ cls: "feature-coverage-summary" });
		summary.createEl("span", { text: `Total: ${total}` });
		summary.createEl("span", { text: `With Implementation: ${withImpl} (${total ? Math.round((withImpl / total) * 100) : 0}%)` });
		summary.createEl("span", { text: `With Docs: ${withDocs} (${total ? Math.round((withDocs / total) * 100) : 0}%)` });
		summary.createEl("span", { text: `With Tests: ${withTests} (${total ? Math.round((withTests / total) * 100) : 0}%)` });
		summary.createEl("span", { text: `Complete: ${complete} (${total ? Math.round((complete / total) * 100) : 0}%)` });
	}

	private renderTable(container: HTMLElement): void {
		const filtered = this.getFilteredFeatures();

		const table = container.createEl("table", { cls: "feature-coverage-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		["ID", "Title", "Tier", "Phase", "Status", "Impl", "Docs", "Tests"].forEach((h) => {
			headerRow.createEl("th", { text: h });
		});

		const tbody = table.createEl("tbody");
		for (const f of filtered) {
			const row = tbody.createEl("tr");
			row.addClass(`status-${f.status.toLowerCase().replace(" ", "-")}`);

			// ID (clickable)
			const idCell = row.createEl("td");
			const idLink = idCell.createEl("a", { text: f.id, cls: "feature-id-link" });
			idLink.addEventListener("click", () => {
				this.app.workspace.getLeaf(false).openFile(f.file);
			});

			row.createEl("td", { text: f.title });
			row.createEl("td", { text: f.tier });
			row.createEl("td", { text: String(f.phase) });
			row.createEl("td", { text: f.status });
			row.createEl("td", { text: String(f.implementedByCount), cls: f.implementedByCount === 0 ? "gap" : "" });
			row.createEl("td", { text: String(f.documentedByCount), cls: f.documentedByCount === 0 ? "gap" : "" });
			row.createEl("td", { text: f.hasTests ? "✓" : "✗", cls: f.hasTests ? "" : "gap" });
		}

		if (filtered.length === 0) {
			const emptyRow = tbody.createEl("tr");
			emptyRow.createEl("td", { text: "No features match the current filters", attr: { colspan: "8" } });
		}
	}
}
