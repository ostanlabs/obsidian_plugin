import { App, Modal, Setting, Notice } from "obsidian";
import { ItemType, CanvasItemFromTemplateSettings } from "../types";

export interface StructuredItemModalOptions {
	showTitleInput: boolean;
	showAliasInput: boolean;
	showCollapsedToggle: boolean;
	showTemplateSelector: boolean;
	typeEditable: boolean;
	modalTitle: string;
	submitButtonText: string;
	defaultTitle?: string;
	currentTitle?: string; // For display context when title is not editable
	fixedType?: ItemType; // When typeEditable is false, show this type
}

export interface StructuredItemResult {
	type: ItemType;
	effort: string;
	title?: string; // Only set if showTitleInput is true
	alias?: string;
	collapsed?: boolean; // Only set if showCollapsedToggle is true
	templatePath?: string; // Only set if showTemplateSelector is true
}

export class StructuredItemModal extends Modal {
	private settings: CanvasItemFromTemplateSettings;
	private onSubmit: (result: StructuredItemResult) => void;
	private result: StructuredItemResult;
	private options: StructuredItemModalOptions;
	private availableTemplates: string[] = [];

	constructor(
		app: App,
		settings: CanvasItemFromTemplateSettings,
		options: StructuredItemModalOptions,
		onSubmit: (result: StructuredItemResult) => void
	) {
		super(app);
		this.settings = settings;
		this.options = options;
		this.onSubmit = onSubmit;
		
		const titleValue = options.defaultTitle || options.currentTitle || "";
		this.result = {
			type: options.fixedType || "accomplishment",
			effort: settings.defaultEffort,
			title: options.showTitleInput ? titleValue : undefined,
			alias: titleValue,
			collapsed: options.showCollapsedToggle ? settings.defaultCollapsed : undefined,
		};
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.options.modalTitle });

		// Show current title as context if not editable
		if (!this.options.showTitleInput && this.options.currentTitle) {
			contentEl.createEl("p", { 
				text: `Current note: ${this.options.currentTitle}`,
				cls: "mod-muted"
			});
		}

		// Load available templates if template folder is enabled
		if (this.options.showTemplateSelector && this.settings.useTemplateFolder) {
			await this.loadTemplates();
		}

		// Type is always "accomplishment" now - show as read-only
		new Setting(contentEl)
			.setName("Type")
			.setDesc("Item type")
			.addText((text) => {
				text.setValue("Accomplishment").setDisabled(true);
			});

		// Template selector (if enabled and templates are available)
		if (this.options.showTemplateSelector && this.settings.useTemplateFolder && this.availableTemplates.length > 0) {
			new Setting(contentEl)
				.setName("Template")
				.setDesc("Select a template to use")
				.addDropdown((dropdown) => {
					this.availableTemplates.forEach((path) => {
						const name = path.split("/").pop()?.replace(".md", "") || path;
						dropdown.addOption(path, name);
					});
					if (this.availableTemplates.length > 0) {
						dropdown.setValue(this.availableTemplates[0]);
						this.result.templatePath = this.availableTemplates[0];
					}
					dropdown.onChange((value) => {
						this.result.templatePath = value;
					});
				});
		}

		// Effort dropdown
		new Setting(contentEl)
			.setName("Effort")
			.setDesc("Select the effort avenue")
			.addDropdown((dropdown) => {
				this.settings.effortOptions.forEach((effort) => {
					dropdown.addOption(effort, effort);
				});
				dropdown.setValue(this.result.effort).onChange((value) => {
					this.result.effort = value;
				});
			});

		// Title input (conditional)
		if (this.options.showTitleInput) {
			new Setting(contentEl).setName("Title").setDesc("Enter the item title").addText((text) => {
				text.setValue(this.result.title || "").onChange((value) => {
					this.result.title = value;
					// If alias hasn't been customized, keep it in sync with title
					if (!this.result.alias || this.result.alias === (this.options.defaultTitle || "")) {
						this.result.alias = value;
					}
				});
				text.inputEl.focus();
				text.inputEl.select();

				// Submit on Enter
				text.inputEl.addEventListener("keypress", (e) => {
					if (e.key === "Enter") {
						this.submit();
					}
				});
			});
		}

		// Alias input (conditional - display label on canvas)
		if (this.options.showAliasInput) {
			new Setting(contentEl)
				.setName("Alias (display name)")
				.setDesc("Optional display name shown on the canvas node")
				.addText((text) => {
					const placeholder = this.options.currentTitle || this.options.defaultTitle || "";
					text.setPlaceholder(placeholder)
						.setValue(this.result.alias || placeholder)
						.onChange((value) => {
							this.result.alias = value || (this.result.title || placeholder);
						});
				});
		}

		// Collapse toggle (conditional)
		if (this.options.showCollapsedToggle) {
			new Setting(contentEl)
				.setName("Start collapsed")
				.setDesc("Collapsed nodes show only alias/title")
				.addToggle((toggle) =>
					toggle.setValue(this.result.collapsed ?? this.settings.defaultCollapsed).onChange((value) => {
						this.result.collapsed = value;
					})
				);
		}

		// Show Notion sync status if enabled
		if (this.settings.notionEnabled && this.settings.notionDatabaseId) {
			const notionInfo = contentEl.createEl("div", {
				cls: "notion-sync-info",
			});
			notionInfo.createEl("small", {
				text: "✓ Will sync to Notion",
				cls: "notion-sync-enabled",
			});
			notionInfo.style.marginTop = "1rem";
			notionInfo.style.padding = "0.5rem";
			notionInfo.style.backgroundColor = "var(--background-modifier-success)";
			notionInfo.style.borderRadius = "4px";
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "0.5rem";
		buttonContainer.style.marginTop = "1.5rem";

		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => {
			this.close();
		});

		const submitButton = buttonContainer.createEl("button", {
			text: this.options.submitButtonText,
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => {
			this.submit();
		});
	}

	/**
	 * Load available templates from the template folder
	 */
	private async loadTemplates(): Promise<void> {
		this.availableTemplates = [];

		const folder = this.app.vault.getAbstractFileByPath(
			this.settings.templateFolder
		);

		if (!folder || !(folder instanceof Object)) {
			return;
		}

		// Get all markdown files in the template folder
		const files = this.app.vault.getMarkdownFiles();
		const templateFiles = files.filter((file) =>
			file.path.startsWith(this.settings.templateFolder + "/")
		);

		// Include accomplishment templates and generic templates
		for (const file of templateFiles) {
			const name = file.basename.toLowerCase();
			if (name.includes("accomplishment") || name.includes("goal") || !name.includes("task")) {
				this.availableTemplates.push(file.path);
			}
		}
	}

	private submit(): void {
		// Validate title if it's shown
		if (this.options.showTitleInput && !this.result.title?.trim()) {
			new Notice("Title cannot be empty");
			return;
		}

		// Set defaults
		const titleValue = this.result.title || this.options.currentTitle || this.options.defaultTitle || "";
		this.result.alias = this.result.alias?.trim() || titleValue;
		
		if (this.options.showCollapsedToggle) {
			this.result.collapsed = this.result.collapsed ?? this.settings.defaultCollapsed;
		}

		this.onSubmit(this.result);
		this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

