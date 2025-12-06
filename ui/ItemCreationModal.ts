import { App, Modal, Setting, Notice, TFile } from "obsidian";
import { ItemType, CanvasItemFromTemplateSettings } from "../types";

export interface ItemCreationResult {
	type: ItemType;
	effort: string;
	title: string;
	parent?: string;
	templatePath?: string; // Selected template path
}

export class ItemCreationModal extends Modal {
	private settings: CanvasItemFromTemplateSettings;
	private onSubmit: (result: ItemCreationResult) => void;
	private result: ItemCreationResult;
	private defaultTitle: string;
	private availableTemplates: string[] = [];

	constructor(
		app: App,
		settings: CanvasItemFromTemplateSettings,
		defaultTitle: string,
		onSubmit: (result: ItemCreationResult) => void
	) {
		super(app);
		this.settings = settings;
		this.onSubmit = onSubmit;
		this.defaultTitle = defaultTitle;
		this.result = {
			type: "task",
			effort: settings.defaultEffort,
			title: defaultTitle,
		};
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Create Canvas Item" });

		// Load available templates if template folder is enabled
		if (this.settings.useTemplateFolder) {
			await this.loadTemplates();
		}

		// Type dropdown
		const typeSetting = new Setting(contentEl)
			.setName("Type")
			.setDesc("Select the type of item to create")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("task", "Task")
					.addOption("accomplishment", "Accomplishment")
					.setValue(this.result.type)
					.onChange(async (value) => {
						this.result.type = value as ItemType;
						// Reload templates when type changes
						if (this.settings.useTemplateFolder) {
							await this.loadTemplates();
							this.onOpen(); // Refresh modal to show new templates
						}
					});
			});

		// Template selector (if template folder is enabled)
		if (this.settings.useTemplateFolder && this.availableTemplates.length > 0) {
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

		// Title input
		new Setting(contentEl).setName("Title").setDesc("Enter the item title").addText((text) => {
			text.setValue(this.result.title).onChange((value) => {
				this.result.title = value;
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

		// Parent input (optional)
		new Setting(contentEl)
			.setName("Parent (optional)")
			.setDesc("Enter the parent ID for tasks (e.g., A001)")
			.addText((text) => {
				text.setPlaceholder("A001").onChange((value) => {
					this.result.parent = value || undefined;
				});
			});

		// Show Notion sync status if enabled
		if (this.settings.notionEnabled && this.settings.notionDatabaseId) {
			const notionInfo = contentEl.createEl("div", {
				cls: "notion-sync-info",
			});
			notionInfo.createEl("small", {
				text: "✓ Will sync to Notion on create",
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
			text: "Create",
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

		// Filter by type if needed (look for type in filename or frontmatter)
		for (const file of templateFiles) {
			const name = file.basename.toLowerCase();
			// Check if filename indicates type
			if (this.result.type === "task" && name.includes("task")) {
				this.availableTemplates.push(file.path);
			} else if (
				this.result.type === "accomplishment" &&
				(name.includes("accomplishment") || name.includes("goal"))
			) {
				this.availableTemplates.push(file.path);
			} else if (!name.includes("task") && !name.includes("accomplishment")) {
				// Include generic templates
				this.availableTemplates.push(file.path);
			}
		}
	}

	private submit(): void {
		if (!this.result.title.trim()) {
			new Notice("Title cannot be empty");
			return;
		}

		this.onSubmit(this.result);
		this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

