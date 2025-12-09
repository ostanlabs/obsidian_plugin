import { App, Modal, Setting, Notice } from "obsidian";
import { CanvasItemFromTemplateSettings, ItemType } from "../types";

export interface ConvertNoteResult {
	type: ItemType;
	effort: string;
	parent: string;
	keepOriginalName: boolean;
}

export class ConvertNoteModal extends Modal {
	private result: ConvertNoteResult;
	private onSubmit: (result: ConvertNoteResult) => void;
	private settings: CanvasItemFromTemplateSettings;
	private currentTitle: string;

	constructor(
		app: App,
		settings: CanvasItemFromTemplateSettings,
		currentTitle: string,
		onSubmit: (result: ConvertNoteResult) => void
	) {
		super(app);
		this.settings = settings;
		this.currentTitle = currentTitle;
		this.onSubmit = onSubmit;
		this.result = {
			type: "accomplishment",
			effort: settings.defaultEffort,
			parent: "",
			keepOriginalName: false,
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Convert to Accomplishment" });
		contentEl.createEl("p", {
			text: `Current note: ${this.currentTitle}`,
			cls: "mod-muted"
		});

		// Effort selection
		new Setting(contentEl)
			.setName("Effort")
			.setDesc("Estimated effort level")
			.addDropdown((dropdown) => {
				this.settings.effortOptions.forEach((option) => {
					dropdown.addOption(option, option);
				});
				return dropdown
					.setValue(this.result.effort)
					.onChange((value) => {
						this.result.effort = value;
					});
			});

		// Parent
		new Setting(contentEl)
			.setName("Parent")
			.setDesc("Parent item or epic (optional)")
			.addText((text) =>
				text
					.setPlaceholder("e.g., EPIC-001")
					.setValue(this.result.parent)
					.onChange((value) => {
						this.result.parent = value;
					})
			);

		// Keep original name option
		new Setting(contentEl)
			.setName("Keep original filename")
			.setDesc("If disabled, file will be renamed to snake_case with ID prefix")
			.addToggle((toggle) =>
				toggle
					.setValue(this.result.keepOriginalName)
					.onChange((value) => {
						this.result.keepOriginalName = value;
					})
			);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		
		const submitButton = buttonContainer.createEl("button", {
			text: "Convert",
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => {
			this.close();
			this.onSubmit(this.result);
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

