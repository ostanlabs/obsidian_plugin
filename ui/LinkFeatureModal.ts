import { App, Modal, Setting, Notice, TFile } from "obsidian";
import { EntityType } from "../types";

export interface LinkFeatureModalResult {
	featureId: string;
	relationshipType: "implements" | "documents" | "affects";
}

export interface FeatureOption {
	id: string;
	title: string;
	tier: string;
	phase: string;
}

export interface LinkFeatureModalOptions {
	entityType: EntityType;
	entityId: string;
	entityTitle: string;
	availableFeatures: FeatureOption[];
}

export class LinkFeatureModal extends Modal {
	private onSubmit: (result: LinkFeatureModalResult) => void | Promise<void>;
	private options: LinkFeatureModalOptions;
	private selectedFeatureId: string = "";
	private relationshipType: "implements" | "documents" | "affects" = "implements";

	constructor(
		app: App,
		options: LinkFeatureModalOptions,
		onSubmit: (result: LinkFeatureModalResult) => void | Promise<void>
	) {
		super(app);
		this.options = options;
		this.onSubmit = onSubmit;
		
		// Set default relationship type based on entity type
		if (options.entityType === "document") {
			this.relationshipType = "documents";
		} else if (options.entityType === "decision") {
			this.relationshipType = "affects";
		} else {
			this.relationshipType = "implements";
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("link-feature-modal");

		new Setting(contentEl)
			.setName(`Link ${this.options.entityTitle} to Feature`)
			.setHeading();

		new Setting(contentEl)
			.setName("Entity")
			.setDesc(`${this.options.entityType}: ${this.options.entityId}`)
			.addText((text) => {
				text.setValue(this.options.entityTitle);
				text.inputEl.disabled = true;
			});

		// Relationship type dropdown
		new Setting(contentEl)
			.setName("Relationship Type")
			.setDesc("How this entity relates to the feature")
			.addDropdown((dropdown) => {
				if (this.options.entityType === "milestone" || this.options.entityType === "story") {
					dropdown.addOption("implements", "Implements");
				}
				if (this.options.entityType === "document") {
					dropdown.addOption("documents", "Documents");
				}
				if (this.options.entityType === "decision") {
					dropdown.addOption("affects", "Affects");
				}
				// Allow all types for flexibility
				if (this.options.entityType === "task") {
					dropdown.addOption("implements", "Implements");
				}
				dropdown.setValue(this.relationshipType);
				dropdown.onChange((value: "implements" | "documents" | "affects") => {
					this.relationshipType = value;
				});
			});

		// Feature selection
		new Setting(contentEl)
			.setName("Feature")
			.setDesc("Select the feature to link to")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "-- Select a feature --");
				for (const feature of this.options.availableFeatures) {
					const label = `${feature.id}: ${feature.title} (${feature.tier}/${feature.phase})`;
					dropdown.addOption(feature.id, label);
				}
				dropdown.onChange((value) => {
					this.selectedFeatureId = value;
				});
			});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
		
		const submitBtn = buttonContainer.createEl("button", { 
			text: "Link Feature", 
			cls: "mod-cta" 
		});
		submitBtn.addEventListener("click", () => this.submit());
	}

	private submit(): void {
		if (!this.selectedFeatureId) {
			new Notice("Please select a feature");
			return;
		}

		void Promise.resolve(this.onSubmit({
			featureId: this.selectedFeatureId,
			relationshipType: this.relationshipType,
		}));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

