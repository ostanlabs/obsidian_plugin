import { App, Modal, Setting, Notice } from "obsidian";
import { FeatureTier, FeaturePhase, FeatureStatus, ItemPriority } from "../types";

export interface FeatureModalResult {
	title: string;
	user_story: string;
	tier: FeatureTier;
	phase: FeaturePhase;
	status: FeatureStatus;
	priority: ItemPriority;
	workstream: string;
	personas: string[];
	acceptance_criteria: string[];
	implemented_by?: string[];
}

export interface FeatureModalOptions {
	modalTitle: string;
	submitButtonText: string;
	defaultValues?: Partial<FeatureModalResult>;
	workstreamOptions?: string[];
}

export class FeatureModal extends Modal {
	private onSubmit: (result: FeatureModalResult) => void | Promise<void>;
	private result: FeatureModalResult;
	private options: FeatureModalOptions;
	private criteriaContainer: HTMLElement | null = null;

	constructor(
		app: App,
		options: FeatureModalOptions,
		onSubmit: (result: FeatureModalResult) => void | Promise<void>
	) {
		super(app);
		this.options = options;
		this.onSubmit = onSubmit;
		this.result = {
			title: options.defaultValues?.title || "",
			user_story: options.defaultValues?.user_story || "As a [user], I want to [action], so that [benefit]",
			tier: options.defaultValues?.tier || "OSS",
			phase: options.defaultValues?.phase || "MVP",
			status: options.defaultValues?.status || "Planned",
			priority: options.defaultValues?.priority || "Medium",
			workstream: options.defaultValues?.workstream || "engineering",
			personas: options.defaultValues?.personas || [],
			acceptance_criteria: options.defaultValues?.acceptance_criteria || [],
			implemented_by: options.defaultValues?.implemented_by || [],
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("feature-modal");
		new Setting(contentEl).setName(this.options.modalTitle).setHeading();
		this.addTitleInput(contentEl);
		this.addUserStoryInput(contentEl);
		this.addClassificationRow(contentEl);
		this.addWorkstreamInput(contentEl);
		this.addPersonasInput(contentEl);
		this.addAcceptanceCriteria(contentEl);
		this.addButtons(contentEl);
	}

	private addTitleInput(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("Title")
			.setDesc("Feature title")
			.addText((text) => {
				text.setValue(this.result.title)
					.setPlaceholder("Enter feature title")
					.onChange((value) => { this.result.title = value; });
				text.inputEl.focus();
			});
	}

	private addUserStoryInput(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("User Story")
			.setDesc("As a [user], I want to [action], so that [benefit]")
			.addTextArea((text) => {
				text.inputEl.rows = 3;
				text.inputEl.cols = 50;
				text.setValue(this.result.user_story)
					.onChange((value) => { this.result.user_story = value; });
			});
	}

	private addClassificationRow(contentEl: HTMLElement): void {
		const row = contentEl.createDiv({ cls: "feature-modal-row" });
		new Setting(row).setName("Tier").addDropdown((dropdown) => {
			dropdown.addOption("OSS", "OSS").addOption("Premium", "Premium");
			dropdown.setValue(this.result.tier).onChange((v: FeatureTier) => { this.result.tier = v; });
		});
		new Setting(row).setName("Phase").addDropdown((dropdown) => {
			["MVP", "0", "1", "2", "3", "4", "5"].forEach(p => dropdown.addOption(p, `Phase ${p}`));
			dropdown.setValue(this.result.phase).onChange((v: FeaturePhase) => { this.result.phase = v; });
		});
		new Setting(row).setName("Priority").addDropdown((dropdown) => {
			["Low", "Medium", "High", "Critical"].forEach(p => dropdown.addOption(p, p));
			dropdown.setValue(this.result.priority).onChange((v: ItemPriority) => { this.result.priority = v; });
		});
	}

	private addWorkstreamInput(contentEl: HTMLElement): void {
		new Setting(contentEl).setName("Workstream").addDropdown((dropdown) => {
			const ws = this.options.workstreamOptions || ["engineering", "product", "design", "docs"];
			ws.forEach(w => dropdown.addOption(w, w));
			dropdown.setValue(this.result.workstream).onChange((v) => { this.result.workstream = v; });
		});
	}

	private addPersonasInput(contentEl: HTMLElement): void {
		new Setting(contentEl)
			.setName("Personas")
			.setDesc("Comma-separated list of target personas")
			.addText((text) => {
				text.setValue(this.result.personas.join(", "))
					.setPlaceholder("Developer, Team Lead")
					.onChange((v) => { this.result.personas = v.split(",").map(s => s.trim()).filter(s => s); });
			});
	}

	private addAcceptanceCriteria(contentEl: HTMLElement): void {
		new Setting(contentEl).setName("Acceptance Criteria").setHeading();
		this.criteriaContainer = contentEl.createDiv({ cls: "feature-criteria-container" });
		this.renderCriteria();
	}

	private renderCriteria(): void {
		if (!this.criteriaContainer) return;
		this.criteriaContainer.empty();
		for (let i = 0; i < this.result.acceptance_criteria.length; i++) {
			const criterion = this.result.acceptance_criteria[i];
			const row = this.criteriaContainer.createDiv({ cls: "feature-criterion-row" });
			const input = row.createEl("input", { type: "text", value: criterion });
			input.addEventListener("change", (e) => {
				this.result.acceptance_criteria[i] = (e.target as HTMLInputElement).value;
			});
			const removeBtn = row.createEl("button", { text: "×", cls: "feature-criterion-remove" });
			removeBtn.addEventListener("click", () => {
				this.result.acceptance_criteria.splice(i, 1);
				this.renderCriteria();
			});
		}
		const addBtn = this.criteriaContainer.createEl("button", { text: "+ Add criterion", cls: "feature-add-criterion" });
		addBtn.addEventListener("click", () => {
			this.result.acceptance_criteria.push("");
			this.renderCriteria();
		});
	}

	private addButtons(contentEl: HTMLElement): void {
		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		const submitBtn = buttonContainer.createEl("button", { text: this.options.submitButtonText, cls: "mod-cta" });
		submitBtn.addEventListener("click", () => this.submit());
	}

	private submit(): void {
		if (!this.result.title.trim()) {
			new Notice("Title cannot be empty");
			return;
		}
		if (!this.result.user_story.trim()) {
			new Notice("User story cannot be empty");
			return;
		}
		this.result.acceptance_criteria = this.result.acceptance_criteria.filter(c => c.trim());
		void Promise.resolve(this.onSubmit(this.result));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

